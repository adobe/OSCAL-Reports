# IAM: Lambda execution role and OSCAL instance profile (Lambda invoke)

# Lambda execution role (basic logging + ASG/S3 permissions)
resource "aws_iam_role" "lambda_ollama_controller" {
  name_prefix = "${var.project_name}-lambda-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_ollama_controller.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_ollama_controller" {
  name_prefix = "${var.project_name}-lambda-"
  role        = aws_iam_role.lambda_ollama_controller.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "autoscaling:SetDesiredCapacity",
          "autoscaling:DescribeAutoScalingGroups",
          "autoscaling:DescribeAutoScalingInstances",
          "autoscaling:DetachInstances",
          "autoscaling:AttachInstances"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ec2:DescribeInstances",
          "ec2:DescribeInstanceStatus",
          "ec2:StopInstances",
          "ec2:StartInstances"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject"
        ]
        Resource = "${aws_s3_bucket.logs.arn}/ollama-activity/*"
      }
    ]
  })
}

# OSCAL instance profile: allows invoking Lambda (wake Ollama)
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

resource "aws_iam_role_policy" "oscal_invoke_lambda" {
  name_prefix = "${var.project_name}-oscal-"
  role        = aws_iam_role.oscal_instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "lambda:InvokeFunction"
        Resource = aws_lambda_function.ollama_controller.arn
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

# Ollama instance profile: write boot time to S3 ollama-activity/last.json (per diagram)
resource "aws_iam_role" "ollama_instance" {
  name_prefix = "${var.project_name}-ollama-"

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

resource "aws_iam_role_policy" "ollama_s3_activity" {
  name_prefix = "${var.project_name}-ollama-"
  role        = aws_iam_role.ollama_instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject"
        ]
        Resource = "${aws_s3_bucket.logs.arn}/ollama-activity/*"
      }
    ]
  })
}

# SSM Session Manager: so you can connect to Ollama instances without SSH key
resource "aws_iam_role_policy_attachment" "ollama_ssm" {
  role       = aws_iam_role.ollama_instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ollama" {
  name_prefix = "${var.project_name}-ollama-"
  role        = aws_iam_role.ollama_instance.name
}
