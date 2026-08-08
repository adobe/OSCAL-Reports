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
  # IAM AssumeRole on EC2 role only when ExternalId is set (matches Account B trust policy).
  bedrock_assume_configured = var.bedrock_cross_account_enabled && local.bedrock_assume_role_arn != ""
  # Systemd BEDROCK_* injection and sts:AssumeRole policy both require ExternalId.
  bedrock_cross_account_ready = local.bedrock_assume_configured && var.bedrock_external_id != ""
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
  # Inject BEDROCK_* on first boot whenever cross-account AssumeRole is configured.
  # ExternalId is optional (empty when Account B trust policy does not require it).
  bedrock_bootstrap_fragment = local.bedrock_assume_configured && var.bedrock_inject_systemd_env ? templatefile("${path.module}/templates/oscal-bedrock-bootstrap.sh.tftpl", {
    bedrock_assume_role_arn = local.bedrock_assume_role_arn
    bedrock_external_id     = var.bedrock_external_id
  }) : ""

  bedrock_apply_from_s3_fragment = local.bedrock_assume_configured ? templatefile("${path.module}/templates/oscal-bedrock-apply-from-s3.sh.tftpl", {
    s3_bucket        = aws_s3_bucket.logs.id
    installer_prefix = "installer"
    aws_region       = var.aws_region
  }) : ""
}
