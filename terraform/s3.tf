# S3 bucket for logs and Ollama activity state (last.json)
# Bucket name must be lowercase (S3 requirement); we force lowercase to avoid InvalidBucketName.

resource "aws_s3_bucket" "logs" {
  bucket = lower(var.s3_logs_bucket_name)
}

resource "aws_s3_bucket_versioning" "logs" {
  bucket = aws_s3_bucket.logs.id

  versioning_configuration {
    status = "Suspended"
  }
}

resource "aws_s3_bucket_public_access_block" "logs" {
  bucket = aws_s3_bucket.logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Folder placeholders so the bucket has subfolders: logs, ollama-activity, config, users (S3 uses key prefixes; empty object with trailing / creates folder in console)
resource "aws_s3_object" "folder_logs" {
  bucket       = aws_s3_bucket.logs.id
  key          = "logs/"
  content_type = "application/x-directory"
  content      = ""
  etag         = md5("")
}

resource "aws_s3_object" "folder_ollama_activity" {
  bucket       = aws_s3_bucket.logs.id
  key          = "ollama-activity/"
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

# Initial activity object so Lambda does not fail on first read
resource "aws_s3_object" "ollama_activity_initial" {
  bucket  = aws_s3_bucket.logs.id
  key     = "ollama-activity/last.json"
  content = "{\"last_activity\": \"\"}"
  etag    = md5("{\"last_activity\": \"\"}")
}

# On destroy: if the bucket is not empty, Terraform may fail with BucketNotEmpty. Empty the bucket in the AWS console (or use aws s3 rm) then run destroy again. Config/users/logs are backed up to S3 every 10 min by ec2_automation on the instances.
