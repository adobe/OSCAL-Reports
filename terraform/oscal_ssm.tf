# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# SSM Command document + periodic association (mount/service check, optional S3 app sync).
# Targets instances tagged OSCAL_SSM_TARGET=true and Stack=<project_name>.

locals {
  oscal_ssm_bedrock_self_heal_lines = local.bedrock_assume_configured ? [
    "if [ -n \"${aws_s3_bucket.logs.id}\" ] && [ -f /opt/oscal/app/scripts/lib/oscal-bedrock-apply-from-s3.sh ]; then",
    "  export S3_BUCKET=\"${aws_s3_bucket.logs.id}\" AWS_DEFAULT_REGION=\"${var.aws_region}\" INSTALLER_PREFIX=\"installer\" APP_DIR=\"/opt/oscal/app\"",
    "  # shellcheck source=/dev/null",
    "  . /opt/oscal/app/scripts/lib/oscal-bedrock-apply-from-s3.sh",
    "  oscal_bedrock_apply_from_s3 || echo \"oscal-ssm: bedrock self-heal failed (non-fatal)\" >&2",
    "fi",
  ] : []

  oscal_ssm_post_boot_shell_lines = concat(
    [
      "#!/bin/bash",
      "set -e",
      "if findmnt -n /opt/oscal >/dev/null 2>&1; then echo \"oscal-ssm: /opt/oscal mounted\"; else echo \"oscal-ssm: /opt/oscal not mounted (ok for Docker mode)\"; fi",
      "if curl -sf --connect-timeout 5 \"http://127.0.0.1:${var.oscal_app_port}/health/ready\" >/dev/null 2>&1; then echo \"oscal-ssm: /health/ready OK\"; else echo \"oscal-ssm: WARNING /health/ready failed (SPA, config, or secrets)\" >&2; fi",
      "if [ -f /opt/oscal/app/scripts/debug/probe-sso-secrets.mjs ]; then",
      "  sudo -u svc_ams-oscal env PATH=/usr/bin:/usr/local/bin:$$PATH node /opt/oscal/app/scripts/debug/probe-sso-secrets.mjs 2>&1 | tail -20 || echo \"oscal-ssm: SSO probe failed\" >&2",
      "fi",
    ],
    local.oscal_ssm_bedrock_self_heal_lines,
    local.oscal_ssm_splunk_bootstrap_lines,
    var.oscal_splunk_uf_upgrade_enabled ? [
      "if command -v splunk >/dev/null 2>&1; then",
      "  UF_VER=\"$(splunk version 2>/dev/null | head -1 | tr -d '\\r' || true)\"",
      "  echo \"oscal-ssm: universal_forwarder version $${UF_VER:-unknown} (min ${var.oscal_splunk_uf_min_version})\"",
      "  if [ -x /opt/splunkforwarder/bin/splunk ]; then",
      "    MIN=\"${var.oscal_splunk_uf_min_version}\"",
      "    CUR=\"$(/opt/splunkforwarder/bin/splunk version 2>/dev/null | awk '{print $$3}' | tr -d '\\r' || true)\"",
      "    if [ -n \"$$CUR\" ] && [ \"$$(printf '%s\\n' \"$$MIN\" \"$$CUR\" | sort -V | head -1)\" != \"$$MIN\" ]; then",
      "      echo \"oscal-ssm: WARNING Splunk UF $$CUR is below minimum $$MIN — upgrade via platform team or SSM automation (SSAAU-209)\" >&2",
      "    fi",
      "  fi",
      "fi",
    ] : [],
    [
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
    description   = "OSCAL: verify /opt/oscal mount, optional S3 sync into /opt/oscal/app, restart oscal-reporter if unit exists"
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

  # Durable, queryable record of each periodic run (health, Splunk UF handshake/btool/errno-104)
  # without opening a Session Manager shell — reuses the bucket already used for patch output
  # (see terraform/oscal_ssm_patch.tf). SSAAU-212 visibility.
  output_location {
    s3_bucket_name = aws_s3_bucket.logs.id
    s3_key_prefix  = "ssm/oscal-post-boot/"
  }

  depends_on = [aws_ssm_document.oscal_post_boot]
}
