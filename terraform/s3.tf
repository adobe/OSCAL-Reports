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

# Per-instance config prefixes for direct-run (S3 mount): Green and Blue each get config.json + users.json in S3
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

# On destroy: do not delete the S3 bucket; rename it to 2beDeleted_{Date-Time} (create copy, then delete original).
# This null_resource runs first on destroy; it removes S3 resources from state, creates the renamed bucket, syncs, and deletes the original.
resource "null_resource" "s3_rename_on_destroy" {
  triggers = {
    bucket_id = aws_s3_bucket.logs.id
    region    = var.aws_region
  }

  depends_on = [
    aws_s3_bucket_versioning.logs,
    aws_s3_bucket_public_access_block.logs,
    aws_s3_object.folder_logs,
    aws_s3_object.folder_ollama_activity,
    aws_s3_object.folder_config,
    aws_s3_object.folder_users,
    aws_s3_object.folder_config_green,
    aws_s3_object.folder_config_blue,
    aws_s3_object.ollama_activity_initial,
  ]

  provisioner "local-exec" {
    when    = destroy
    command = <<-EOT
      set -e
      BUCKET="${self.triggers.bucket_id}"
      REGION="${self.triggers.region}"
      echo "S3 rename-on-destroy: removing S3 resources from state."
      # Remove S3 resources from state so Terraform will not try to delete the bucket
      terraform state rm 'aws_s3_object.ollama_activity_initial' 2>/dev/null || true
      terraform state rm 'aws_s3_object.folder_config_blue' 2>/dev/null || true
      terraform state rm 'aws_s3_object.folder_config_green' 2>/dev/null || true
      terraform state rm 'aws_s3_object.folder_users' 2>/dev/null || true
      terraform state rm 'aws_s3_object.folder_config' 2>/dev/null || true
      terraform state rm 'aws_s3_object.folder_ollama_activity' 2>/dev/null || true
      terraform state rm 'aws_s3_object.folder_logs' 2>/dev/null || true
      terraform state rm 'aws_s3_bucket_public_access_block.logs' 2>/dev/null || true
      terraform state rm 'aws_s3_bucket_versioning.logs' 2>/dev/null || true
      terraform state rm 'aws_s3_bucket.logs' 2>/dev/null || true
      # Only rename (copy + delete) if source bucket exists (e.g. skip when provisioner runs during replace and bucket not yet created)
      if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
        NEW_NAME="2bedeleted-$(date -u +%Y-%m-%d-%H-%M-%S)"
        echo "S3 rename-on-destroy: copying $BUCKET to $NEW_NAME then deleting original."
        if [ "$REGION" = "us-east-1" ]; then
          aws s3api create-bucket --bucket "$NEW_NAME" --region "$REGION"
        else
          aws s3api create-bucket --bucket "$NEW_NAME" --region "$REGION" --create-bucket-configuration LocationConstraint="$REGION"
        fi
        aws s3 sync "s3://$BUCKET" "s3://$NEW_NAME" --region "$REGION"
        aws s3 rb "s3://$BUCKET" --force --region "$REGION"
        echo "S3 rename-on-destroy done: bucket is now $NEW_NAME"
      else
        echo "S3 rename-on-destroy: source bucket $BUCKET does not exist; state rm only."
      fi
    EOT
    environment = {
      TF_CLI_ARGS = "-no-color"
    }
  }
}
