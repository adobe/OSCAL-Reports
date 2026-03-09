# IAM: OSCAL instance profile (S3 config/users/logs, SSM)

# OSCAL instance profile: S3 read/write for config, users, and logs (ec2_automation backup to config/green|blue, logs/green|blue)
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

# OSCAL instance: S3 read/write for config, users, and logs (ec2_automation backup to config/green|blue, logs/green|blue)
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
      }
    ]
  })
}

# SSM Session Manager: so you can connect to Green/Blue instances without SSH key
resource "aws_iam_role_policy_attachment" "oscal_ssm" {
  role       = aws_iam_role.oscal_instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "oscal" {
  name_prefix = "${var.project_name}-oscal-"
  role        = aws_iam_role.oscal_instance.name
}
