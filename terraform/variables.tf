# Terraform variables for OSCAL on AWS (AI via AWS Bedrock)
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
  default     = "oscal-reports"
}

# Networking
variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "allowed_ssh_cidr" {
  description = "List of CIDRs allowed for SSH to OSCAL instances. App ports 3019/3020 are not open to the internet; use ALB or VPC. Example: [\"1.2.3.4/32\", \"10.0.0.0/8\"] or [\"0.0.0.0/0\"] for testing only."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

# EC2
variable "key_name" {
  description = "Name of existing EC2 key pair for SSH access (optional; omit or set null to launch without SSH key)"
  type        = string
  default     = null
}

# Image Factory best practices: docs/IMAGE_FACTORY.md – prefer Image Factory, fallback to native Amazon Linux.
variable "oscal_ami_id" {
  description = "AMI ID for OSCAL instances. Leave null to use Image Factory (when use_image_factory_ami = true) or native Amazon Linux 2023 fallback. Override with explicit AMI if needed. See docs/IMAGE_FACTORY.md."
  type        = string
  default     = null
}

variable "use_image_factory_ami" {
  description = "Prefer Adobe Image Factory images. true (default) = Image Factory Amazon Linux 2023 if in map; else native Amazon Linux 2023. false = use only native Amazon Linux 2023. See docs/IMAGE_FACTORY.md."
  type        = bool
  default     = true
}

# Optional: dynamic lookup (like automation_framework) – when set, use latest Image Factory AMI by owner + name pattern instead of static map.
variable "image_factory_owner_id" {
  description = "Optional: AWS account ID that owns the Image Factory AMIs (e.g. from automation_framework). When set with image_factory_ami_name_pattern, Terraform looks up the most recent AMI by name instead of using the static region map."
  type        = string
  default     = null
}

variable "image_factory_ami_name_pattern" {
  description = "Optional: AMI name filter for dynamic lookup (e.g. 'Adobe*Amazon*Linux*'). Used with image_factory_owner_id when use_image_factory_ami = true. Leave null to use static map in image_factory_ami.tf."
  type        = string
  default     = null
}

# Optional: set Image Factory Amazon Linux 2023 AMI per region from tfvars (no need to edit image_factory_ami.tf).
variable "image_factory_amazon_linux_ami_us_east_1" {
  description = "Optional: Adobe Image Factory Amazon Linux 2023 AMI ID for us-east-1. When set, used for Green and Blue. Get from Image Factory UI. Leave null to use static map in image_factory_ami.tf or native AL2023."
  type        = string
  default     = null
}

variable "use_rhel9" {
  description = "Deprecated; has no effect. Kept for backward compatibility (tfvars may still reference it)."
  type        = bool
  default     = true
}

variable "instance_architecture" {
  description = "EC2 architecture for Image Factory and native Amazon Linux 2023 fallback: x86_64 (default) or arm64."
  type        = string
  default     = "x86_64"
}

# OSCAL run mode: false = direct run on EC2 with S3-mounted config/users; true = Docker/podman container (GHCR image)
variable "run_oscal_via_docker" {
  description = "If false (default), EC2 runs OSCAL directly with Node.js and mounts config/users from S3. If true, EC2 installs Docker/podman and runs the GHCR container."
  type        = bool
  default     = false
}

# S3 (best practice: docs/IMAGE_FACTORY.md – bucket names must be lowercase; AMS prefix ams-oscal-<account-id>)
variable "s3_logs_bucket_name" {
  description = "Globally unique S3 bucket name. Best practice (AMS): lowercase, e.g. ams-oscal-<account-id>. Terraform lowercases the value. Subfolders: logs, config, users."
  type        = string
}

# ALB / HTTPS
variable "alb_ssl_certificate_arn" {
  description = "Existing ACM certificate ARN for HTTPS listener (optional). Ignored when create_alb_certificate is true."
  type        = string
  default     = null
}

variable "create_alb_certificate" {
  description = "When true, Terraform requests an ACM certificate for alb_domain_name and attaches it to the ALB. You add DNS validation CNAMEs and the domain→ALB record manually in Route53."
  type        = bool
  default     = false

  validation {
    condition     = !var.create_alb_certificate || (var.alb_domain_name != null && var.alb_domain_name != "")
    error_message = "When create_alb_certificate is true, alb_domain_name must be set."
  }
}

variable "alb_domain_name" {
  description = "Primary domain for the ALB (e.g. oscal.amsgovcloud.com.au). Required when create_alb_certificate is true. Add DNS validation CNAMEs and an A/alias to ALB manually in Route53."
  type        = string
  default     = null
}

variable "alb_certificate_ready" {
  description = "Set to true only after the ACM cert is Issued (after you add the CNAMEs from acm_certificate_validation_records in Route53). Until then, ALB keeps HTTP listener so the site stays up. Then run apply again to switch to HTTPS."
  type        = bool
  default     = false
}

variable "alb_ssl_policy" {
  description = "ALB HTTPS listener SSL policy (Secure listener settings). Default: Post-quantum TLS — ELBSecurityPolicy-TLS13-1-2-Res-PQ-2025-09 (Recommended). Must match any existing HTTPS listener on the same ALB. See: aws elbv2 describe-ssl-policies --load-balancer-type application"
  type        = string
  default     = "ELBSecurityPolicy-TLS13-1-2-Res-PQ-2025-09"
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

# Tags
variable "common_tags" {
  description = "Tags applied to all resources"
  type        = map(string)
  default     = {}
}
