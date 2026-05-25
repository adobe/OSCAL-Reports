# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# Cross-account Amazon Bedrock: OSCAL EC2 (Account A) assumes IAM role in Bedrock account (Account B).
# See docs/CROSS_ACCOUNT_BEDROCK_PHASE1.md

locals {
  bedrock_assume_role_arn = var.bedrock_assume_role_arn != "" ? var.bedrock_assume_role_arn : (
    var.bedrock_account_id != "" ? "arn:aws:iam::${var.bedrock_account_id}:role/${var.bedrock_assume_role_name}" : ""
  )
  bedrock_cross_account_ready = var.bedrock_cross_account_enabled && local.bedrock_assume_role_arn != "" && var.bedrock_external_id != ""
}

resource "aws_iam_role_policy" "oscal_bedrock_assume" {
  count = local.bedrock_cross_account_ready ? 1 : 0

  name_prefix = "${var.project_name}-bedrock-assume-"
  role        = aws_iam_role.oscal_instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "AssumeBedrockRoleInOtherAccount"
        Effect   = "Allow"
        Action   = "sts:AssumeRole"
        Resource = local.bedrock_assume_role_arn
      }
    ]
  })
}

locals {
  bedrock_bootstrap_fragment = local.bedrock_cross_account_ready && var.bedrock_inject_systemd_env ? templatefile("${path.module}/templates/oscal-bedrock-bootstrap.sh.tftpl", {
    bedrock_assume_role_arn = local.bedrock_assume_role_arn
    bedrock_external_id     = var.bedrock_external_id
  }) : ""
}
