# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# SSM Patch Manager: baseline, patch groups, and staggered Blue/Green maintenance windows.
# Instances receive Patch Group tags from launch templates (oscal_asg_ebs.tf).
# See docs/DEPLOYMENT_AND_OPERATIONS.md — OS patching (SSM Patch Manager).

locals {
  oscal_patch_group_blue  = "${var.project_name}-blue"
  oscal_patch_group_green = "${var.project_name}-green"

  oscal_patch_windows = var.oscal_os_patch_enabled ? {
    blue_1st_mon = {
      patch_group = local.oscal_patch_group_blue
      schedule    = "cron(0 ${var.oscal_os_patch_hour} ? * 2#1 *)"
      s3_prefix   = "ssm-patch/blue/"
      description = "OSCAL Blue 1st Monday OS patch"
    }
    blue_3rd_mon = {
      patch_group = local.oscal_patch_group_blue
      schedule    = "cron(0 ${var.oscal_os_patch_hour} ? * 2#3 *)"
      s3_prefix   = "ssm-patch/blue/"
      description = "OSCAL Blue 3rd Monday OS patch"
    }
    green_2nd_mon = {
      patch_group = local.oscal_patch_group_green
      schedule    = "cron(0 ${var.oscal_os_patch_hour} ? * 2#2 *)"
      s3_prefix   = "ssm-patch/green/"
      description = "OSCAL Green 2nd Monday OS patch"
    }
    green_4th_mon = {
      patch_group = local.oscal_patch_group_green
      schedule    = "cron(0 ${var.oscal_os_patch_hour} ? * 2#4 *)"
      s3_prefix   = "ssm-patch/green/"
      description = "OSCAL Green 4th Monday OS patch"
    }
  } : {}
}

resource "aws_ssm_patch_baseline" "oscal_al2023" {
  count = var.oscal_os_patch_enabled ? 1 : 0

  name             = "${var.project_name}-oscal-al2023-patch-baseline"
  description      = "OSCAL Green/Blue Amazon Linux 2023 security and bugfix patches"
  operating_system = "AMAZON_LINUX_2023"

  approval_rule {
    approve_after_days  = var.oscal_os_patch_approval_days
    enable_non_security = false

    patch_filter {
      key    = "CLASSIFICATION"
      values = ["Security", "Bugfix"]
    }
  }

  approved_patches_compliance_level = "CRITICAL"

  tags = {
    Stack = var.project_name
  }
}

resource "aws_ssm_patch_group" "oscal_blue" {
  count = var.oscal_os_patch_enabled ? 1 : 0

  baseline_id = aws_ssm_patch_baseline.oscal_al2023[0].id
  patch_group = local.oscal_patch_group_blue
}

resource "aws_ssm_patch_group" "oscal_green" {
  count = var.oscal_os_patch_enabled ? 1 : 0

  baseline_id = aws_ssm_patch_baseline.oscal_al2023[0].id
  patch_group = local.oscal_patch_group_green
}

resource "aws_iam_role" "ssm_maintenance" {
  count = var.oscal_os_patch_enabled ? 1 : 0

  name_prefix = "${var.project_name}-ssm-mw-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ssm.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Stack = var.project_name
  }
}

resource "aws_iam_role_policy_attachment" "ssm_maintenance" {
  count = var.oscal_os_patch_enabled ? 1 : 0

  role       = aws_iam_role.ssm_maintenance[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonSSMMaintenanceWindowRole"
}

resource "aws_iam_role_policy" "ssm_maintenance_s3_output" {
  count = var.oscal_os_patch_enabled ? 1 : 0

  name_prefix = "${var.project_name}-ssm-mw-s3-"
  role        = aws_iam_role.ssm_maintenance[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "PatchRunCommandOutput"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl",
          "s3:GetObject",
          "s3:GetEncryptionConfiguration"
        ]
        Resource = "${aws_s3_bucket.logs.arn}/ssm-patch/*"
      },
      {
        Sid      = "PatchRunCommandOutputList"
        Effect   = "Allow"
        Action   = "s3:ListBucket"
        Resource = aws_s3_bucket.logs.arn
        Condition = {
          StringLike = {
            "s3:prefix" = ["ssm-patch/*"]
          }
        }
      }
    ]
  })
}

resource "aws_ssm_maintenance_window" "oscal_patch" {
  for_each = local.oscal_patch_windows

  name     = "${var.project_name}-oscal-patch-${each.key}"
  schedule = each.value.schedule
  duration = 3
  cutoff   = 1

  tags = {
    Stack = var.project_name
  }
}

resource "aws_ssm_maintenance_window_target" "oscal_patch" {
  for_each = local.oscal_patch_windows

  window_id     = aws_ssm_maintenance_window.oscal_patch[each.key].id
  name          = "${var.project_name}-patch-${each.key}-target"
  description   = each.value.description
  resource_type = "INSTANCE"

  targets {
    key    = "tag:Patch Group"
    values = [each.value.patch_group]
  }
}

resource "aws_ssm_maintenance_window_task" "oscal_patch" {
  for_each = local.oscal_patch_windows

  window_id        = aws_ssm_maintenance_window.oscal_patch[each.key].id
  task_type        = "RUN_COMMAND"
  task_arn         = "AWS-RunPatchBaseline"
  priority         = 1
  service_role_arn = aws_iam_role.ssm_maintenance[0].arn
  max_concurrency  = "1"
  max_errors       = "1"

  targets {
    key    = "WindowTargetIds"
    values = [aws_ssm_maintenance_window_target.oscal_patch[each.key].id]
  }

  task_invocation_parameters {
    run_command_parameters {
      timeout_seconds      = 600
      output_s3_bucket     = aws_s3_bucket.logs.id
      output_s3_key_prefix = each.value.s3_prefix

      parameter {
        name   = "Operation"
        values = ["Install"]
      }

      parameter {
        name   = "RebootOption"
        values = [var.oscal_os_patch_reboot_option]
      }
    }
  }
}

# Weekly Scan (Sunday UTC) — detect CVE drift between Install maintenance windows.
resource "aws_ssm_association" "oscal_patch_weekly_scan" {
  count = var.oscal_os_patch_enabled && var.oscal_os_patch_weekly_scan_enabled ? 1 : 0

  association_name = "${var.project_name}-oscal-patch-weekly-scan"
  name             = "AWS-RunPatchBaseline"

  schedule_expression         = "cron(0 ${var.oscal_os_patch_hour} ? * SUN *)"
  apply_only_at_cron_interval = true
  compliance_severity         = "MEDIUM"

  parameters = {
    Operation = "Scan"
  }

  targets {
    key    = "tag:Stack"
    values = [var.project_name]
  }

  depends_on = [
    aws_ssm_patch_baseline.oscal_al2023,
    aws_ssm_patch_group.oscal_blue,
    aws_ssm_patch_group.oscal_green,
  ]
}
