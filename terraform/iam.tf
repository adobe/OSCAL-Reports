# IAM: OSCAL instance profile (S3 config/users/logs/installer read, SSM)

# OSCAL instance profile: S3 read/write for config, users, logs; read-only installer/* (deploy-to-ec2 S3-first app sync)
resource "aws_iam_role" "oscal_instance" {
  name_prefix = "${var.project_name}-oscal-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })
}

# OSCAL instance: S3 read/write for config, users, and logs (ec2_automation backup to config/green|blue, logs/green|blue);
# read-only on installer/* (deploy-to-ec2.sh S3-first app sync; instances must not Put/Delete golden installer objects).
resource "aws_iam_role_policy" "oscal_s3_config" {
  name_prefix = "${var.project_name}-oscal-"
  role        = aws_iam_role.oscal_instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "s3:ListBucket"
        Resource = aws_s3_bucket.logs.arn
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = [
          "${aws_s3_bucket.logs.arn}/config/*",
          "${aws_s3_bucket.logs.arn}/users/*",
          "${aws_s3_bucket.logs.arn}/logs/*"
        ]
      },
      {
        Sid    = "InstallerReadOnly"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:GetObjectVersion"
        ]
        Resource = "${aws_s3_bucket.logs.arn}/installer/*"
      }
    ]
  })
}

# SSM Session Manager: so you can connect to Green/Blue instances without SSH key
resource "aws_iam_role_policy_attachment" "oscal_ssm" {
  role       = aws_iam_role.oscal_instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# Persistent gp3 attach from user_data (DescribeVolumes + AttachVolume on Stack-tagged volumes/instances)
resource "aws_iam_role_policy" "oscal_ebs_attach" {
  count = local.oscal_persistent_ebs ? 1 : 0

  name_prefix = "${var.project_name}-ebs-attach-"
  role        = aws_iam_role.oscal_instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DescribeForPersistentMount"
        Effect = "Allow"
        Action = [
          "ec2:DescribeVolumes",
          "ec2:DescribeVolumeStatus",
          "ec2:DescribeInstances"
        ]
        Resource = "*"
      },
      {
        Sid    = "AttachStackTaggedVolumes"
        Effect = "Allow"
        Action = [
          "ec2:AttachVolume"
        ]
        Resource = [
          "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:volume/*",
          "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:instance/*"
        ]
        Condition = {
          StringEquals = {
            "ec2:ResourceTag/Stack" = var.project_name
          }
        }
      }
    ]
  })
}

# Optional: SSM post-boot document syncs application bits from this prefix inside the logs bucket (no delete)
resource "aws_iam_role_policy" "oscal_ssm_release_s3_read" {
  count = local.oscal_ssm_release_s3_read ? 1 : 0

  name_prefix = "${var.project_name}-ssm-release-s3-"
  role        = aws_iam_role.oscal_instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "s3:ListBucket"
        Resource = aws_s3_bucket.logs.arn
        Condition = {
          StringLike = {
            "s3:prefix" = ["${local.oscal_ssm_release_s3_prefix_trimmed}/*"]
          }
        }
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:GetObjectVersion"
        ]
        Resource = "${aws_s3_bucket.logs.arn}/${local.oscal_ssm_release_s3_prefix_trimmed}/*"
      }
    ]
  })
}

resource "aws_iam_instance_profile" "oscal" {
  name_prefix = "${var.project_name}-oscal-"
  role        = aws_iam_role.oscal_instance.name
}

# RDS: read master secret for EC2 bootstrap; IAM DB auth token for application connections
resource "aws_iam_role_policy" "oscal_rds" {
  count = var.create_rds_postgres ? 1 : 0

  name_prefix = "${var.project_name}-rds-"
  role        = aws_iam_role.oscal_instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "RdsMasterSecretBootstrap"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = aws_db_instance.oscal[0].master_user_secret[0].secret_arn
      },
      {
        Sid    = "RdsIamDbAuthConnect"
        Effect = "Allow"
        Action = [
          "rds-db:connect"
        ]
        # Scoped to this DB instance only. DbUserName may be wildcard per AWS IAM (covers oscal_app and avoids
        # subtle username mismatch between policy and Signer/bootstrap).
        Resource = "arn:${data.aws_partition.current.partition}:rds-db:${var.aws_region}:${data.aws_caller_identity.current.account_id}:dbuser:${aws_db_instance.oscal[0].resource_id}/*"
      }
    ]
  })
}
