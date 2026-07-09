# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# EventBridge: patch OSCAL color when ASG launches a new instance (complements bi-weekly windows).
# Command-type SSM documents require run_command_targets (not input_transformer).

resource "aws_iam_role" "eventbridge_ssm_patch_on_launch" {
  count = var.oscal_os_patch_enabled && var.oscal_os_patch_on_launch_enabled ? 1 : 0

  name_prefix = "${var.project_name}-eb-ssm-patch-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "events.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Stack = var.project_name
  }
}

resource "aws_iam_role_policy" "eventbridge_ssm_patch_on_launch" {
  count = var.oscal_os_patch_enabled && var.oscal_os_patch_on_launch_enabled ? 1 : 0

  name_prefix = "${var.project_name}-eb-ssm-patch-"
  role        = aws_iam_role.eventbridge_ssm_patch_on_launch[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SendPatchBaselineToInstances"
        Effect = "Allow"
        Action = [
          "ssm:SendCommand"
        ]
        Resource = [
          "arn:${data.aws_partition.current.partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:document/AWS-RunPatchBaseline",
          "arn:${data.aws_partition.current.partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:instance/*"
        ]
      },
      {
        Sid    = "GetCommandInvocation"
        Effect = "Allow"
        Action = [
          "ssm:ListCommands",
          "ssm:ListCommandInvocations"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_cloudwatch_event_rule" "oscal_asg_launch_patch" {
  count = var.oscal_os_patch_enabled && var.oscal_os_patch_on_launch_enabled ? 1 : 0

  name        = "${var.project_name}-oscal-asg-launch-patch"
  description = "Trigger SSM patch baseline install when OSCAL ASG launches an instance"

  event_pattern = jsonencode({
    source      = ["aws.autoscaling"]
    detail-type = ["EC2 Instance Launch Successful"]
    detail = {
      AutoScalingGroupName = [
        aws_autoscaling_group.oscal_green.name,
        aws_autoscaling_group.oscal_blue.name,
      ]
    }
  })

  tags = {
    Stack = var.project_name
  }
}

resource "aws_cloudwatch_event_target" "oscal_patch_on_launch" {
  count = var.oscal_os_patch_enabled && var.oscal_os_patch_on_launch_enabled ? 1 : 0

  rule      = aws_cloudwatch_event_rule.oscal_asg_launch_patch[0].name
  target_id = "oscal-ssm-patch-on-launch"
  arn       = "arn:${data.aws_partition.current.partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:document/AWS-RunPatchBaseline"
  role_arn  = aws_iam_role.eventbridge_ssm_patch_on_launch[0].arn

  input = jsonencode({
    Operation    = ["Install"]
    RebootOption = [var.oscal_os_patch_reboot_option]
  })

  run_command_targets {
    key    = "tag:Stack"
    values = [var.project_name]
  }

  retry_policy {
    maximum_event_age_in_seconds = 3600
    maximum_retry_attempts       = 2
  }
}
