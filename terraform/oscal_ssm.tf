# SSM Command document + periodic association (mount/service check, optional S3 app sync).
# Targets instances tagged OSCAL_SSM_TARGET=true and Stack=<project_name>.

locals {
  oscal_ssm_post_boot_shell_lines = concat(
    [
      "#!/bin/bash",
      "set -e",
      "if findmnt -n /opt/oscal >/dev/null 2>&1; then echo \"oscal-ssm: /opt/oscal mounted\"; else echo \"oscal-ssm: /opt/oscal not mounted (ok for Docker mode)\"; fi",
      "if systemctl list-unit-files 2>/dev/null | grep -q '^oscal-reporter.service'; then",
      "  systemctl restart oscal-reporter 2>/dev/null || systemctl start oscal-reporter 2>/dev/null || true",
      "fi",
    ],
    local.oscal_ssm_release_s3_read ? [
      "if command -v aws >/dev/null 2>&1; then mkdir -p /opt/oscal/app; aws s3 sync \"s3://${aws_s3_bucket.logs.id}/${local.oscal_ssm_release_s3_prefix_trimmed}/\" /opt/oscal/app/ || true; fi",
    ] : []
  )
}

resource "aws_ssm_document" "oscal_post_boot" {
  name          = "${var.project_name}-post-boot"
  document_type = "Command"

  content = jsonencode({
    schemaVersion = "2.2"
    description = "OSCAL: verify /opt/oscal mount, optional S3 sync into /opt/oscal/app, restart oscal-reporter if unit exists"
    mainSteps = [
      {
        action = "aws:runShellScript"
        name   = "PostBoot"
        inputs = {
          runCommand = [join("\n", local.oscal_ssm_post_boot_shell_lines)]
        }
      }
    ]
  })
}

resource "aws_ssm_association" "oscal_post_boot" {
  count = var.oscal_ssm_post_boot_association_enabled ? 1 : 0

  name             = aws_ssm_document.oscal_post_boot.name
  association_name = "${var.project_name}-oscal-post-boot"

  schedule_expression         = "rate(30 minutes)"
  apply_only_at_cron_interval = false
  compliance_severity         = "LOW"

  targets {
    key    = "tag:OSCAL_SSM_TARGET"
    values = ["true"]
  }
  targets {
    key    = "tag:Stack"
    values = [var.project_name]
  }

  depends_on = [aws_ssm_document.oscal_post_boot]
}
