# Terraform variables for OSCAL + Ollama AWS architecture
# No credentials or secrets; use environment or terraform.tfvars (gitignored)

variable "aws_region" {
  description = "AWS region (e.g. us-east-1)"
  type        = string
  default     = "us-east-1"
}

variable "aws_account_id" {
  description = "AWS account ID (e.g. for ARNs); set via variable, not hardcoded secrets"
  type        = string
  default     = "432417415905"
}

variable "environment" {
  description = "Environment name (e.g. dev, prod)"
  type        = string
  default     = "prod"
}

variable "project_name" {
  description = "Project name used in resource names"
  type        = string
  default     = "oscal-ollama"
}

# Networking
variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "allowed_ssh_cidr" {
  description = "CIDR allowed for SSH (e.g. your IP); use 0.0.0.0/0 only for testing"
  type        = string
  default     = "0.0.0.0/0"
}

# EC2
variable "key_name" {
  description = "Name of existing EC2 key pair for SSH access (optional; omit or set null to launch without SSH key)"
  type        = string
  default     = null
}

variable "oscal_ami_id" {
  description = "AMI ID for OSCAL instances. For Adobe/AMS: use Adobe Image Factory RHEL9 AMI (see docs/IMAGE_FACTORY.md). Leave null to use Image Factory or Amazon Linux 2023 fallback."
  type        = string
  default     = null
}

variable "ollama_ami_id" {
  description = "AMI ID for Ollama instance. For Adobe/AMS: use Adobe Image Factory RHEL9 AMI (see docs/IMAGE_FACTORY.md). Leave null to use Image Factory (if use_image_factory_ami = true) or Amazon Linux 2023 (default)."
  type        = string
  default     = null
}

variable "use_image_factory_ami" {
  description = "When true, use Adobe Image Factory RHEL9 AMI from the built-in region map (requires account access to those AMIs). When false (default), use Amazon Linux 2023 to avoid AccessDenied. Set to true only if your account is authorized for Image Factory images."
  type        = bool
  default     = false
}

variable "use_rhel9" {
  description = "Deprecated: AMI fallback is now Amazon Linux 2023 (or Image Factory RHEL9 when enabled). Kept for backward compatibility; has no effect."
  type        = bool
  default     = true
}

variable "instance_architecture" {
  description = "EC2 architecture for Amazon Linux 2023 fallback when Image Factory is not available: x86_64 (default) or arm64."
  type        = string
  default     = "x86_64"
}

# OSCAL run mode: false = direct run on EC2 with S3-mounted config/users; true = Docker/podman container (GHCR image)
variable "run_oscal_via_docker" {
  description = "If false (default), EC2 runs OSCAL directly with Node.js and mounts config/users from S3. If true, EC2 installs Docker/podman and runs the GHCR container."
  type        = bool
  default     = false
}

# S3
variable "s3_logs_bucket_name" {
  description = "Name for S3 bucket (e.g. ams-oscal-432417415905); Terraform creates subfolders: logs, ollama-activity, config, users; must be globally unique"
  type        = string
}

# ALB
variable "alb_ssl_certificate_arn" {
  description = "ACM certificate ARN for HTTPS listener (optional; omit for HTTP only)"
  type        = string
  default     = null
}

variable "alb_blue_hostname" {
  description = "Hostname for Blue deployment (e.g. blue.oscal.example.com). When set, ALB routes requests with this Host header to Blue (port 3020). Create a CNAME pointing to the ALB DNS."
  type        = string
  default     = null
}

variable "alb_green_hostname" {
  description = "Hostname for Green deployment (e.g. green.oscal.example.com). When set, ALB routes requests with this Host header to Green (port 3019). Create a CNAME pointing to the ALB DNS."
  type        = string
  default     = null
}

# Lambda / Ollama ASG
variable "ollama_idle_timeout_hours" {
  description = "Hours of idle time before scaling Ollama ASG to 0 (no activity); per diagram, 1 hr idle then shut down"
  type        = number
  default     = 1
}

variable "ollama_min_size" {
  description = "Ollama ASG minimum size; default 0 so ASG can scale to 0 when idle (1 hr no activity)"
  type        = number
  default     = 0
}

variable "ollama_max_size" {
  description = "Ollama ASG maximum size; expansion stops at this cap (default 1)"
  type        = number
  default     = 1
}

variable "ollama_desired_capacity" {
  description = "Ollama ASG desired capacity at startup and when Lambda wakes; default 1 (never exceeds ollama_max_size)"
  type        = number
  default     = 1

  validation {
    condition     = var.ollama_desired_capacity >= 0 && var.ollama_desired_capacity <= var.ollama_max_size
    error_message = "ollama_desired_capacity must be between 0 and ollama_max_size (inclusive)."
  }
}

# Tags
variable "common_tags" {
  description = "Tags applied to all resources"
  type        = map(string)
  default     = {}
}
