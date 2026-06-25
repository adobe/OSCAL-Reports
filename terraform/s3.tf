# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# S3 bucket for logs, config, and users
# Best practice (docs/AWS_OPERATIONS.md#adobe-image-factory-ami-usage-for-terraform): bucket names must be lowercase; AMS prefix ams-oscal-<account-id>.
# Terraform forces lowercase to satisfy S3 and avoid InvalidBucketName.
# Security: Every S3 bucket in this project MUST have aws_s3_bucket_public_access_block (PCL rule custom-s3-pab-check).

resource "aws_s3_bucket" "logs" {
  bucket = lower(var.s3_logs_bucket_name)
}

resource "aws_s3_bucket_versioning" "logs" {
  bucket = aws_s3_bucket.logs.id

  versioning_configuration {
    status = "Suspended"
  }
}

# PCL compliance: custom-s3-pab-check requires Public Access Block on all S3 buckets.
# Do not remove; PCL will auto-remediate if missing (NoSuchPublicAccessBlockConfiguration).
resource "aws_s3_bucket_public_access_block" "logs" {
  bucket = aws_s3_bucket.logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Folder placeholders so the bucket has subfolders: logs, config, users (S3 uses key prefixes; empty object with trailing / creates folder in console)
resource "aws_s3_object" "folder_logs" {
  bucket       = aws_s3_bucket.logs.id
  key          = "logs/"
  content_type = "application/x-directory"
  content      = ""
  etag         = md5("")
}

resource "aws_s3_object" "folder_config" {
  bucket       = aws_s3_bucket.logs.id
  key          = "config/"
  content_type = "application/x-directory"
  content      = ""
  etag         = md5("")
}

resource "aws_s3_object" "folder_users" {
  bucket       = aws_s3_bucket.logs.id
  key          = "users/"
  content_type = "application/x-directory"
  content      = ""
  etag         = md5("")
}

# Per-instance config prefixes: ec2_automation backs up config/users to config/green and config/blue
resource "aws_s3_object" "folder_config_green" {
  bucket       = aws_s3_bucket.logs.id
  key          = "config/green/"
  content_type = "application/x-directory"
  content      = ""
  etag         = md5("")
}

resource "aws_s3_object" "folder_config_blue" {
  bucket       = aws_s3_bucket.logs.id
  key          = "config/blue/"
  content_type = "application/x-directory"
  content      = ""
  etag         = md5("")
}

# Operator golden restore point (config.default); populated by publish-config-default-to-s3.sh — not cron.
resource "aws_s3_object" "folder_config_default" {
  bucket       = aws_s3_bucket.logs.id
  key          = "config/default/"
  content_type = "application/x-directory"
  content      = ""
  etag         = md5("")
}

# deploy-to-ec2.sh uploads application bits to installer/; EC2 pulls with aws s3 sync (see iam.tf).
resource "aws_s3_object" "folder_installer" {
  bucket       = aws_s3_bucket.logs.id
  key          = "installer/"
  content_type = "application/x-directory"
  content      = ""
  etag         = md5("")
}

# On destroy: if the bucket is not empty, Terraform may fail with BucketNotEmpty. Empty the bucket in the AWS console (or use aws s3 rm) then run destroy again. Config/users/logs are backed up to S3 every 10 min by ec2_automation on the instances.
