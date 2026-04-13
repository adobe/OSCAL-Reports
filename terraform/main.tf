# OSCAL on AWS - Terraform (AI via AWS Bedrock)
# See docs/diagrams/generate-diagram.html and docs/AWS_COST_ESTIMATE.md

terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
    http = {
      source  = "hashicorp/http"
      version = "~> 3.0"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }

  # Optional: uncomment and set variables for remote state
  # backend "s3" {
  #   bucket         = "your-terraform-state-bucket"
  #   key            = "oscal-reports/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "terraform-state-lock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = merge(var.common_tags, {
      Project       = var.project_name
      Environment   = var.environment
      ManagedBy     = "terraform"
      Stack           = var.project_name # Single tag to filter all stack resources in any account
      "Service ID"    = var.adobe_service_id_tag # Adobe CMDB / cost allocation (e.g. 602844)
    })
  }
}

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}
data "aws_availability_zones" "available" { state = "available" }
