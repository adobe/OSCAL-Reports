# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

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
  default     = "442277170733"
}

variable "environment" {
  description = "Environment name (e.g. dev, prod)"
  type        = string
  default     = "prod"
}

variable "project_name" {
  description = "Project name used in resource names"
  type        = string
  default     = "AMS-oscal-reports"
}

# Applied on all resources via provider default_tags (merge with common_tags).
variable "adobe_service_id_tag" {
  description = "Value for AWS default tag key \"Service ID\" (Adobe CMDB / chargeback). Propagates to resources created by this stack."
  type        = string
  default     = "602844"
}

# Networking
variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "oscal_app_port" {
  description = "TCP port for OSCAL Report Generator on Green and Blue EC2 instances (same port on both; matches backend PORT / deploy scripts)."
  type        = number
  default     = 3020
}

variable "default_allowed_cidr_blocks" {
  description = "Default CIDR ranges allowed for ingress (ALB HTTP testing, SSH, direct Green/Blue app port). Set in tfvars; do not use 0.0.0.0/0 (PCL custom-config-ec2-sg-port-check). In stage accounts, PCL may treat blocks larger than /32 as \"broad\" and revert the ALB SG; prefer /32 or smallest necessary."
  type        = list(string)
  default     = ["130.248.32.17/32", "203.191.182.150/32"]

  validation {
    condition     = !contains(var.default_allowed_cidr_blocks, "0.0.0.0/0")
    error_message = "default_allowed_cidr_blocks must not contain 0.0.0.0/0. PCL rule custom-config-ec2-sg-port-check auto-remediates. Use specific CIDRs (e.g. your IP/32 or VPN subnet) in terraform.tfvars."
  }
}

variable "alb_allow_http_for_testing" {
  description = "When true, ALB allows port 80 from default_allowed_cidr_blocks only (for testing service availability). When false, port 80 is closed. Port 443 is always open to all IPs."
  type        = bool
  default     = false
}

variable "alb_restrict_to_australia" {
  description = "When true, ALB HTTPS (443) is restricted to Australian IP ranges only (via prefix lists from IPdeny). When false, ALB 443 uses default_allowed_cidr_blocks unless alb_allow_443_from_all is true."
  type        = bool
  default     = true
}

variable "alb_allow_443_from_all" {
  description = "When true, ALB HTTPS (443) allows default_allowed_cidr_blocks (PCL-compliant; no 0.0.0.0/0). Set to false to use Australia-only or default_allowed_cidr_blocks per alb_restrict_to_australia."
  type        = bool
  default     = false
}

variable "instance_allow_app_ports_from_all" {
  description = "Deprecated: ingress for the OSCAL app port always uses default_allowed_cidr_blocks (no 0.0.0.0/0 per PCL). Kept for backward compatibility; has no effect."
  type        = bool
  default     = false
}

# EC2
variable "key_name" {
  description = "Name of existing EC2 key pair for SSH access (optional; omit or set null to launch without SSH key)"
  type        = string
  default     = null
}

# Image Factory best practices: docs/AWS_OPERATIONS.md#adobe-image-factory-ami-usage-for-terraform – prefer Image Factory, fallback to native Amazon Linux.
variable "oscal_ami_id" {
  description = "AMI ID for OSCAL instances. Leave null to use Image Factory (when use_image_factory_ami = true) or native Amazon Linux 2023 fallback. Override with explicit AMI if needed. See docs/AWS_OPERATIONS.md#adobe-image-factory-ami-usage-for-terraform."
  type        = string
  default     = null
}

variable "use_image_factory_ami" {
  description = "Prefer Adobe Image Factory images. true (default) = Image Factory Amazon Linux 2023 (use EMR flavor for AMS InfraSec, e.g. SSAAU-169) if resolved; else native Amazon Linux 2023. false = use only native Amazon Linux 2023. See docs/AWS_OPERATIONS.md#adobe-image-factory-ami-usage-for-terraform."
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
  description = "Optional: AMI name filter for dynamic lookup (e.g. '*Amazon*Linux*2023*EMR*' if names include EMR). Used with image_factory_owner_id when use_image_factory_ami = true. Leave null to use static map in image_factory_ami.tf."
  type        = string
  default     = null
}

# Optional: set Image Factory Amazon Linux 2023 AMI per region from tfvars (no need to edit image_factory_ami.tf).
variable "image_factory_amazon_linux_ami_us_east_1" {
  description = "Optional: Adobe Image Factory Amazon Linux 2023 **EMR** (or approved AL2023) AMI ID for us-east-1. When set, used for Green and Blue. Get latest from Image Factory UI EMR flavor; optional CLI: terraform/scripts/list-emr-candidate-amis.sh. Leave null to use static map in image_factory_ami.tf or native AL2023."
  type        = string
  default     = null
}

variable "use_rhel9" {
  description = "Deprecated; has no effect. Kept for backward compatibility (tfvars may still reference it)."
  type        = bool
  default     = true
}

variable "instance_architecture" {
  description = "EC2 architecture for Image Factory and native Amazon Linux 2023 fallback: arm64 (default for Graviton t4g) or x86_64 (for AMD t3a)."
  type        = string
  default     = "arm64"
}

variable "instance_type" {
  description = "EC2 instance type for OSCAL Green/Blue. Preferred: Graviton (t4g) then AMD (t3a). Default t4g.small (ARM); use instance_architecture = x86_64 for t3a.small."
  type        = string
  default     = "t4g.small"
}

# OSCAL run mode: false = direct run on EC2 with S3-mounted config/users; true = Docker/podman container (GHCR image)
variable "run_oscal_via_docker" {
  description = "If false (default), EC2 runs OSCAL directly with Node.js and mounts config/users from S3. If true, EC2 installs Docker/podman and runs the GHCR container."
  type        = bool
  default     = false
}

# Persistent EBS + ASG (see docs/AWS_OPERATIONS.md#aws-terraform-for-oscal-ai-via-bedrock): extra gp3 per Green/Blue, mounted at /opt/oscal when enabled (direct-run only).
variable "oscal_persistent_ebs_enabled" {
  description = "When true and run_oscal_via_docker is false, provision dedicated gp3 volumes and mount at /opt/oscal on boot (Auto Scaling launch template user_data). Ignored for Docker mode."
  type        = bool
  default     = true
}

variable "oscal_data_volume_size_gb" {
  description = "Size (GiB) of each OSCAL persistent data volume (Green and Blue)."
  type        = number
  default     = 50
}

variable "oscal_asg_health_check_grace_period" {
  description = "Seconds after instance launch before ELB health checks count for ASG (allow volume mount, Node install, service start)."
  type        = number
  default     = 420
}

variable "oscal_ssm_post_boot_association_enabled" {
  description = "When true, create an SSM State Manager association (periodic) to run a lightweight post-boot script on instances tagged OSCAL_SSM_TARGET=true."
  type        = bool
  default     = true
}

variable "oscal_ssm_release_s3_prefix" {
  description = "Optional object prefix inside s3_logs_bucket_name for SSM post-boot sync (e.g. releases/current). When set, instance role gains s3:GetObject on that prefix and the SSM document runs aws s3 sync into /opt/oscal/app (no --delete). Leave null to skip."
  type        = string
  default     = null
}

variable "oscal_os_patch_enabled" {
  description = "Enable SSM Patch Manager baseline, patch groups, and staggered Blue/Green maintenance windows. Adds Patch Group tag on launch templates."
  type        = bool
  default     = true
}

variable "oscal_os_patch_hour" {
  description = "UTC hour (0-23) for Monday OS patch maintenance windows."
  type        = number
  default     = 2

  validation {
    condition     = var.oscal_os_patch_hour >= 0 && var.oscal_os_patch_hour <= 23
    error_message = "oscal_os_patch_hour must be between 0 and 23 (UTC)."
  }
}

variable "oscal_os_patch_reboot_option" {
  description = "RebootOption for AWS-RunPatchBaseline maintenance tasks (RebootIfNeeded or NoReboot)."
  type        = string
  default     = "RebootIfNeeded"

  validation {
    condition     = contains(["RebootIfNeeded", "NoReboot"], var.oscal_os_patch_reboot_option)
    error_message = "oscal_os_patch_reboot_option must be RebootIfNeeded or NoReboot."
  }
}

variable "oscal_os_patch_approval_days" {
  description = "Auto-approve patches released within this many days (patch baseline approval rule)."
  type        = number
  default     = 7

  validation {
    condition     = var.oscal_os_patch_approval_days >= 0 && var.oscal_os_patch_approval_days <= 180
    error_message = "oscal_os_patch_approval_days must be between 0 and 180."
  }
}

# S3 (best practice: docs/AWS_OPERATIONS.md#adobe-image-factory-ami-usage-for-terraform – bucket names must be lowercase; AMS prefix ams-oscal-<account-id>)
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
  description = "Hostname for Blue deployment (e.g. blue.oscal.example.com). When set, ALB routes requests with this Host header to Blue. Create a CNAME pointing to the ALB DNS."
  type        = string
  default     = null
}

variable "alb_green_hostname" {
  description = "Hostname for Green deployment (e.g. green.oscal.example.com). When set, ALB routes requests with this Host header to Green. Create a CNAME pointing to the ALB DNS."
  type        = string
  default     = null
}

variable "alb_port_justification" {
  description = "Free-form description for Adobe:PortJustification tag on the ALB. Required for AMS PCL: resources with port exposure must have Adobe:PublicPorts and Adobe:PortJustification. ELB tag values allow only letters, numbers, spaces, and _.:/=+-@ (no parentheses). Example: \"OSCAL Report Generator production access for AMS Gov Cloud\"."
  type        = string
  default     = "OSCAL Report Generator web access HTTPS and HTTP"
}

# --- Optional RDS PostgreSQL (Database Integration) ---
variable "create_rds_postgres" {
  description = "When true, provisions Amazon RDS PostgreSQL in the VPC, enables IAM DB auth, and EC2 user_data bootstraps the app IAM user and OSCAL_DATABASE_* systemd environment variables."
  type        = bool
  default     = true
}

variable "rds_engine_version" {
  description = "PostgreSQL major.minor for RDS initial create (e.g. 16.13). After deploy, AWS auto minor upgrades may advance engine_version_actual; rds.tf ignores engine_version drift on update."
  type        = string
  default     = "16.13"
}

variable "rds_instance_class" {
  description = "RDS instance class (e.g. db.t4g.micro for Graviton)"
  type        = string
  default     = "db.t4g.micro"
}

variable "rds_allocated_storage" {
  description = "Initial allocated storage (GB) for RDS"
  type        = number
  default     = 20
}

variable "rds_max_allocated_storage" {
  description = "Max storage for autoscaling (GB); set 0 to disable autoscaling"
  type        = number
  default     = 100
}

variable "rds_database_name" {
  description = "Initial database name on RDS (used by OSCAL Database Integration)"
  type        = string
  default     = "oscal"

  validation {
    condition     = can(regex("^[a-zA-Z][a-zA-Z0-9_]{0,62}$", var.rds_database_name))
    error_message = "rds_database_name must start with a letter and be valid for PostgreSQL/RDS."
  }
}

variable "rds_admin_username" {
  description = "Admin username for RDS (Secrets Manager holds password). Not the IAM app user."
  type        = string
  default     = "oscalmaster"

  validation {
    condition     = can(regex("^[a-zA-Z][a-zA-Z0-9_]{0,15}$", var.rds_admin_username))
    error_message = "rds_admin_username must be 1–16 alphanumeric characters (RDS constraint)."
  }
}

variable "rds_iam_app_username" {
  description = "PostgreSQL role name for IAM database authentication (must match OSCAL_DATABASE_USER on EC2)"
  type        = string
  default     = "oscal_app"

  validation {
    condition     = can(regex("^[a-z][a-z0-9_]{0,62}$", var.rds_iam_app_username))
    error_message = "rds_iam_app_username must be a valid PostgreSQL identifier (lowercase recommended)."
  }
}

variable "rds_backup_retention_period" {
  description = "RDS backup retention in days"
  type        = number
  default     = 7
}

variable "rds_skip_final_snapshot" {
  description = "When true, no final snapshot on destroy (dev/stage). Set false for production."
  type        = bool
  default     = true
}

variable "rds_deletion_protection" {
  description = "Enable RDS deletion protection (recommended for production)"
  type        = bool
  default     = false
}

# Optional: extra IPv4 CIDR blocks allowed to connect to RDS on 5432 (in addition to the OSCAL EC2 security group).
# Use only for VPC-internal ranges (e.g. private subnets for a bastion or corporate CIDRs routed into the VPC).
# Do not set to broad public ranges; RDS is not publicly accessible and should not be exposed to the internet.
variable "rds_additional_ingress_ipv4_cidr_blocks" {
  description = "Additional IPv4 CIDR blocks permitted to reach RDS PostgreSQL (port 5432). Empty = OSCAL instances only (via security group). Each block must be reachable only inside your network design (typically RFC1918 inside the VPC)."
  type        = list(string)
  default     = []

  validation {
    condition     = !contains(var.rds_additional_ingress_ipv4_cidr_blocks, "0.0.0.0/0")
    error_message = "rds_additional_ingress_ipv4_cidr_blocks must not contain 0.0.0.0/0 (no open internet to RDS)."
  }
}

# Pass vault ↔ Secrets Manager (ec2_automation); single bundle secret + instance IAM
variable "oscal_pass_secrets_sync_enabled" {
  description = "When true, create aws_secretsmanager_secret for OSCAL Pass sync and grant EC2 instance role Get/Put/Describe on it. Set false to skip secret creation (e.g. account not ready)."
  type        = bool
  default     = true
}


# Cross-account Bedrock (Account B hosts models; Account A EC2 assumes role — docs/CROSS_ACCOUNT_BEDROCK_PHASE1.md)
variable "bedrock_cross_account_enabled" {
  description = "When true, grant OSCAL EC2 instance role sts:AssumeRole on the Bedrock account IAM role (requires bedrock_external_id and role ARN or bedrock_account_id)."
  type        = bool
  default     = false
}

variable "bedrock_account_id" {
  description = "AWS account ID where Bedrock is enabled (Account B). Used to build bedrock_assume_role_arn when bedrock_assume_role_arn is empty."
  type        = string
  default     = ""
}

variable "bedrock_assume_role_name" {
  description = "IAM role name in bedrock_account_id that OSCAL EC2 assumes (e.g. OSCAL-BedrockCrossAccount)."
  type        = string
  default     = "OSCAL-BedrockCrossAccount"
}

variable "bedrock_assume_role_arn" {
  description = "Full ARN of Bedrock cross-account role. If set, overrides bedrock_account_id + bedrock_assume_role_name."
  type        = string
  default     = ""
}

variable "bedrock_external_id" {
  description = "ExternalId for AssumeRole (must match Account B role trust policy). Set in terraform.tfvars only."
  type        = string
  default     = ""
  sensitive   = true
}

variable "bedrock_runtime_vpc_endpoint_enabled" {
  description = "Create interface VPC endpoint for com.amazonaws.<region>.bedrock-runtime (optional; public subnets usually use IGW)."
  type        = bool
  default     = false
}

variable "bedrock_inject_systemd_env" {
  description = "When cross-account Bedrock is configured, write BEDROCK_ASSUME_ROLE_ARN and BEDROCK_EXTERNAL_ID into oscal-reporter systemd drop-in (Phase 2 app)."
  type        = bool
  default     = true
}

# Tags
variable "common_tags" {
  description = "Tags applied to all resources"
  type        = map(string)
  default     = {}
}
