# Copyright 2026 Adobe. All rights reserved.
# Copyright (c) 2026 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# GitHub Actions OIDC: lets the ami-drift-check.yml workflow assume an AWS role
# without any long-lived/expiring secrets (replaces the static
# AWS4403_ACCESS_KEY_ID / AWS4403_SECRET_ACCESS_KEY / AWS4403_SESSION_TOKEN
# repo secrets, which were missing/expired and had no rotation story).
#
# NOTE: an OIDC provider for a given issuer URL is unique per AWS account. If
# `terraform apply` fails with EntityAlreadyExists, another stack already
# registered token.actions.githubusercontent.com here — `terraform import
# aws_iam_openid_connect_provider.github_actions <existing-arn>` instead of
# creating a second one.
resource "aws_iam_openid_connect_provider" "github_actions" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = [
    "sts.amazonaws.com"
  ]

  # SHA1 fingerprints of the intermediate/root CA certs actually served by
  # token.actions.githubusercontent.com (fetched directly via `openssl
  # s_client`, not a hardcoded/memorized value — GitHub has rotated CAs
  # before). AWS validates this issuer's TLS chain against its own trusted CA
  # store for publicly-trusted issuers like this one regardless of this
  # field's contents, so it's kept only to satisfy the provider schema, not
  # treated as a rotating secret. Re-fetch if `terraform apply` ever fails
  # here: `openssl s_client -connect token.actions.githubusercontent.com:443
  # -showcerts </dev/null | openssl x509 -noout -fingerprint -sha1` (repeat
  # up the chain with -showcerts output).
  thumbprint_list = [
    "2d74d6dfd96eea55ad7baafa0d3c6552b2dadc37", # Let's Encrypt YR2 (intermediate)
    "ab9d0263244dd0326eb67015705a667e79cfe998"  # ISRG Root YR
  ]
}

# Trust policy: only ami-drift-check.yml runs (scheduled or workflow_dispatch)
# on the Main branch of adobe/OSCAL-Reports may assume this role.
resource "aws_iam_role" "github_actions_ami_drift" {
  name_prefix = "${var.project_name}-gha-ami-drift-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github_actions.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:adobe/OSCAL-Reports:ref:refs/heads/Main"
          }
        }
      }
    ]
  })
}

# Read-only: scripts/check-ami-drift.sh only calls ec2:DescribeImages.
resource "aws_iam_role_policy" "github_actions_ami_drift" {
  name_prefix = "${var.project_name}-gha-ami-drift-"
  role        = aws_iam_role.github_actions_ami_drift.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "DescribeImagesForDriftCheck"
        Effect   = "Allow"
        Action   = "ec2:DescribeImages"
        Resource = "*"
      }
    ]
  })
}

output "github_actions_ami_drift_role_arn" {
  description = "Paste into ami-drift-check.yml's configure-aws-credentials role-to-assume input"
  value       = aws_iam_role.github_actions_ami_drift.arn
}
