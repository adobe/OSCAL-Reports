# Single JSON bundle for Pass vault sync (OSCAL/*) used by ec2_automation on EC2.
# Opt out per environment: oscal_pass_secrets_sync_enabled = false in tfvars.

resource "aws_secretsmanager_secret" "oscal_pass_sync" {
  count = var.oscal_pass_secrets_sync_enabled ? 1 : 0

  name                    = "${var.project_name}-oscal-pass-sync"
  recovery_window_in_days = 7

  tags = merge(var.common_tags, {
    Stack   = var.project_name
    Purpose = "oscal-pass-vault-sync"
  })
}

resource "aws_secretsmanager_secret_version" "oscal_pass_sync" {
  count = var.oscal_pass_secrets_sync_enabled ? 1 : 0

  secret_id     = aws_secretsmanager_secret.oscal_pass_sync[0].id
  secret_string = jsonencode({
    entries = {}
    _meta = {
      keys = {}
    }
  })
}

resource "aws_iam_role_policy" "oscal_pass_secrets_sync" {
  count = var.oscal_pass_secrets_sync_enabled ? 1 : 0

  name_prefix = "${var.project_name}-pass-sync-"
  role        = aws_iam_role.oscal_instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "PassSyncSecretReadWrite"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:PutSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = aws_secretsmanager_secret.oscal_pass_sync[0].arn
      }
    ]
  })
}
