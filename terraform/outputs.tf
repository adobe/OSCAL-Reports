# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# Outputs for OSCAL deployment (AI via AWS Bedrock)

data "aws_instances" "oscal_green_members" {
  filter {
    name   = "tag:Stack"
    values = [var.project_name]
  }
  filter {
    name   = "tag:OSCAL_PERSISTENT_ROLE"
    values = ["green"]
  }
  filter {
    name   = "instance-state-name"
    values = ["pending", "running"]
  }

  depends_on = [aws_autoscaling_group.oscal_green]
}

data "aws_instances" "oscal_blue_members" {
  filter {
    name   = "tag:Stack"
    values = [var.project_name]
  }
  filter {
    name   = "tag:OSCAL_PERSISTENT_ROLE"
    values = ["blue"]
  }
  filter {
    name   = "instance-state-name"
    values = ["pending", "running"]
  }

  depends_on = [aws_autoscaling_group.oscal_blue]
}

output "aws_region" {
  description = "AWS region (for scripts that need region)"
  value       = var.aws_region
}

output "oscal_ec2_iam_role_name" {
  description = "IAM role attached to OSCAL EC2 (Green/Blue). Inline policies: S3, SSM, optional EBS/SSM-release; when RDS is enabled, Secrets Manager read for RDS admin + rds-db:connect for IAM DB auth."
  value       = aws_iam_role.oscal_instance.name
}

output "oscal_ec2_instance_profile_name" {
  description = "EC2 instance profile on OSCAL launch templates. In console: EC2 → Instances → select instance → Security → IAM role shows this profile’s role."
  value       = aws_iam_instance_profile.oscal.name
}

output "alb_arn" {
  description = "ARN of the Application Load Balancer (for scripts and import)"
  value       = aws_lb.main.arn
}

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "alb_url_http" {
  description = "URL to access the application (HTTP). When a certificate is configured (create_alb_certificate or alb_ssl_certificate_arn), requests redirect to HTTPS."
  value       = "http://${aws_lb.main.dns_name}"
}

output "alb_url_https" {
  description = "HTTPS URL for the ALB (when certificate is configured). Use for production; HTTP redirects here (301). With alb_domain_name, use https://<alb_domain_name>."
  value       = "https://${aws_lb.main.dns_name}"
}

output "alb_domain_url" {
  description = "HTTPS URL for the custom domain (when create_alb_certificate is true and alb_domain_name is set). Add an A/alias record in Route53 pointing this hostname to the ALB (alb_dns_name)."
  value       = var.alb_domain_name != null && local.alb_cert_arn != null ? "https://${var.alb_domain_name}" : null
}

# Debug: true when Terraform will create the HTTPS listener (plan should show aws_lb_listener.https[0] will be created)
output "alb_use_https" {
  description = "True when HTTPS listener will be created (create_alb_certificate && alb_domain_name && alb_certificate_ready, or alb_ssl_certificate_arn set). If false, plan will not show aws_lb_listener.https[0]."
  value       = (var.create_alb_certificate && var.alb_domain_name != null && var.alb_certificate_ready) || var.alb_ssl_certificate_arn != null
}

output "acm_certificate_validation_records" {
  description = "CNAME records to add manually in Route53 so ACM can validate the certificate. Empty when create_alb_certificate is false or cert not created. After adding these, the cert will issue; then add an A/alias record for alb_domain_name to alb_dns_name."
  value = var.create_alb_certificate && var.alb_domain_name != null && length(aws_acm_certificate.alb) > 0 ? [
    for dvo in aws_acm_certificate.alb[0].domain_validation_options : {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  ] : []
}

output "alb_url_blue" {
  description = "URL for Blue deployment via ALB (use alb_blue_hostname when set for host-based routing). Prefer HTTPS when certificate is configured."
  value       = var.alb_blue_hostname != null ? (local.alb_cert_arn != null ? "https://${var.alb_blue_hostname}" : "http://${var.alb_blue_hostname}") : (local.alb_cert_arn != null ? "https://${aws_lb.main.dns_name}" : "http://${aws_lb.main.dns_name}")
}

output "alb_url_green" {
  description = "URL for Green deployment via ALB (use alb_green_hostname when set for host-based routing). Prefer HTTPS when certificate is configured."
  value       = var.alb_green_hostname != null ? (local.alb_cert_arn != null ? "https://${var.alb_green_hostname}" : "http://${var.alb_green_hostname}") : (local.alb_cert_arn != null ? "https://${aws_lb.main.dns_name}" : "http://${aws_lb.main.dns_name}")
}

output "alb_target_group_green_arn" {
  description = "ARN of the Green target group (for health checks and 503 diagnostics)"
  value       = aws_lb_target_group.green.arn
}

output "alb_target_group_blue_arn" {
  description = "ARN of the Blue target group (for health checks and 503 diagnostics)"
  value       = aws_lb_target_group.blue.arn
}

output "oscal_app_port" {
  description = "TCP port for OSCAL on Green and Blue EC2 instances (same on both)"
  value       = var.oscal_app_port
}

output "oscal_green_instance_id" {
  description = "EC2 instance ID for OSCAL Green ASG member; null until the ASG launches an instance."
  value       = length(data.aws_instances.oscal_green_members.ids) > 0 ? data.aws_instances.oscal_green_members.ids[0] : null
}

output "oscal_green_private_ip" {
  description = "Private IP of OSCAL Green (current ASG instance)"
  value       = length(data.aws_instances.oscal_green_members.private_ips) > 0 ? data.aws_instances.oscal_green_members.private_ips[0] : null
}

output "oscal_green_public_ip" {
  description = "Public IP of OSCAL Green (for SSH/deploy when the instance has a public IP)"
  value       = length(data.aws_instances.oscal_green_members.public_ips) > 0 && data.aws_instances.oscal_green_members.public_ips[0] != "" ? data.aws_instances.oscal_green_members.public_ips[0] : null
}

output "oscal_blue_instance_id" {
  description = "EC2 instance ID for OSCAL Blue ASG member; null until the ASG launches an instance."
  value       = length(data.aws_instances.oscal_blue_members.ids) > 0 ? data.aws_instances.oscal_blue_members.ids[0] : null
}

output "oscal_blue_private_ip" {
  description = "Private IP of OSCAL Blue (current ASG instance)"
  value       = length(data.aws_instances.oscal_blue_members.private_ips) > 0 ? data.aws_instances.oscal_blue_members.private_ips[0] : null
}

output "oscal_blue_public_ip" {
  description = "Public IP of OSCAL Blue (for SSH/deploy when the instance has a public IP)"
  value       = length(data.aws_instances.oscal_blue_members.public_ips) > 0 && data.aws_instances.oscal_blue_members.public_ips[0] != "" ? data.aws_instances.oscal_blue_members.public_ips[0] : null
}

output "oscal_green_autoscaling_group_name" {
  description = "Auto Scaling Group name for OSCAL Green (steady state: one instance)"
  value       = aws_autoscaling_group.oscal_green.name
}

output "oscal_blue_autoscaling_group_name" {
  description = "Auto Scaling Group name for OSCAL Blue (steady state: one instance)"
  value       = aws_autoscaling_group.oscal_blue.name
}

output "oscal_traffic_mode" {
  description = "Blue/Green traffic mode: active_passive or active_active."
  value       = var.oscal_traffic_mode
}

output "oscal_active_role" {
  description = "Primary color when active_passive (production ALB weight)."
  value       = var.oscal_active_role
}

output "oscal_passive_role" {
  description = "Standby color when active_passive (scale-to-zero when idle)."
  value       = var.oscal_passive_role
}

output "oscal_active_autoscaling_group_name" {
  description = "ASG name for the active (primary) color when active_passive."
  value       = var.oscal_active_role == "blue" ? aws_autoscaling_group.oscal_blue.name : aws_autoscaling_group.oscal_green.name
}

output "oscal_passive_autoscaling_group_name" {
  description = "ASG name for the passive (standby) color when active_passive."
  value       = var.oscal_passive_role == "blue" ? aws_autoscaling_group.oscal_blue.name : aws_autoscaling_group.oscal_green.name
}

output "oscal_traffic_mode_parameter_name" {
  description = "SSM parameter storing traffic mode: steady, deploy_green, or failover."
  value       = local.oscal_standby_enabled ? aws_ssm_parameter.oscal_traffic_mode[0].name : null
}

output "oscal_passive_idle_shutdown_hours" {
  description = "Hours of no passive TG traffic before idle shutdown automation."
  value       = var.oscal_passive_idle_shutdown_hours
}

output "oscal_deploy_edge_canary_enabled" {
  description = "Whether deploy_green mode may route Edge User-Agent to passive Green."
  value       = var.oscal_deploy_edge_canary_enabled
}


output "oscal_os_patch_baseline_id" {
  description = "SSM patch baseline ID for OSCAL Amazon Linux 2023 (null when oscal_os_patch_enabled is false)"
  value       = var.oscal_os_patch_enabled ? aws_ssm_patch_baseline.oscal_al2023[0].id : null
}

output "oscal_os_patch_group_blue" {
  description = "Patch Group tag value for Blue instances (SSM Patch Manager)"
  value       = var.oscal_os_patch_enabled ? local.oscal_patch_group_blue : null
}

output "oscal_os_patch_group_green" {
  description = "Patch Group tag value for Green instances (SSM Patch Manager)"
  value       = var.oscal_os_patch_enabled ? local.oscal_patch_group_green : null
}

output "oscal_os_patch_maintenance_window_ids" {
  description = "SSM maintenance window IDs for staggered Blue/Green OS patching"
  value       = var.oscal_os_patch_enabled ? { for k, w in aws_ssm_maintenance_window.oscal_patch : k => w.id } : {}
}

output "oscal_resolved_ami_id" {
  description = "AMI ID resolved for OSCAL Green/Blue launch templates (Image Factory EMR dynamic lookup, pin, or fallback)"
  value       = local.oscal_ami_id
}

output "oscal_resolved_ami_name" {
  description = "AMI name for oscal_resolved_ami_id when available from Image Factory lookup"
  value       = coalesce(
    try(local.image_factory_ami_name, null),
    try(data.aws_ami.oscal_resolved[0].name, null),
  )
}

data "aws_ami" "oscal_resolved" {
  count = local.oscal_ami_id_ok ? 1 : 0

  filter {
    name   = "image-id"
    values = [local.oscal_ami_id]
  }
}

output "oscal_os_patch_weekly_scan_association_id" {
  description = "SSM association ID for weekly patch Scan (null when disabled)"
  value       = var.oscal_os_patch_enabled && var.oscal_os_patch_weekly_scan_enabled ? aws_ssm_association.oscal_patch_weekly_scan[0].association_id : null
}

output "oscal_os_patch_on_launch_rule_name" {
  description = "EventBridge rule name for patch-on-launch (null when disabled)"
  value       = var.oscal_os_patch_enabled && var.oscal_os_patch_on_launch_enabled ? aws_cloudwatch_event_rule.oscal_asg_launch_patch[0].name : null
}

output "oscal_post_boot_ssm_document_name" {
  description = "SSM Command document name for periodic post-boot checks (optional S3 sync when oscal_ssm_release_s3_prefix is set)"
  value       = aws_ssm_document.oscal_post_boot.name
}

output "s3_logs_bucket_name" {
  description = "S3 bucket for logs, config, and users"
  value       = aws_s3_bucket.logs.id
}

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "vpc_cidr" {
  description = "VPC CIDR"
  value       = var.vpc_cidr
}

output "public_subnet_id" {
  description = "First public subnet ID"
  value       = aws_subnet.public[0].id
}

# --- RDS PostgreSQL (when create_rds_postgres = true) ---
output "rds_endpoint" {
  description = "RDS PostgreSQL hostname (use in Database Integration host when not using EC2 env injection)"
  value       = var.create_rds_postgres ? aws_db_instance.oscal[0].address : null
}

output "rds_port" {
  description = "RDS PostgreSQL port"
  value       = var.create_rds_postgres ? aws_db_instance.oscal[0].port : null
}

output "rds_database_name" {
  description = "Initial database name on RDS"
  value       = var.create_rds_postgres ? var.rds_database_name : null
}

output "rds_iam_app_username" {
  description = "PostgreSQL IAM auth user (matches OSCAL_DATABASE_USER on EC2)"
  value       = var.create_rds_postgres ? var.rds_iam_app_username : null
}

output "rds_dbi_resource_id" {
  description = "RDS DBI resource id (must match rds-db:connect IAM policy; compare to RDS console Configuration → Resource ID)"
  value       = var.create_rds_postgres ? aws_db_instance.oscal[0].resource_id : null
}

output "rds_admin_secret_arn" {
  description = "Secrets Manager ARN for RDS admin password (bootstrap only; do not embed in app config)"
  value       = var.create_rds_postgres ? aws_db_instance.oscal[0].master_user_secret[0].secret_arn : null
  sensitive   = true
}

output "rds_admin_username" {
  description = "RDS admin PostgreSQL user (bootstrap psql -U; default oscalmaster)"
  value       = var.create_rds_postgres ? var.rds_admin_username : null
}

output "rds_private_subnet_cidrs" {
  description = "CIDR blocks of subnets where RDS runs (private; no IGW route). OSCAL EC2 egress to 5432 is limited to these."
  value       = var.create_rds_postgres ? aws_subnet.private_rds[*].cidr_block : []
}

output "oscal_pass_secrets_sync_secret_arn" {
  description = "Secrets Manager ARN for Pass vault bundle sync (ec2_automation). Null when oscal_pass_secrets_sync_enabled is false."
  value       = var.oscal_pass_secrets_sync_enabled ? aws_secretsmanager_secret.oscal_pass_sync[0].arn : null
}

output "oscal_ec2_iam_role_arn" {
  description = "ARN of OSCAL EC2 IAM role — put in Account B trust policy Principal.AWS"
  value       = aws_iam_role.oscal_instance.arn
}

output "bedrock_assume_role_arn" {
  description = "Cross-account Bedrock role ARN (Account B) when bedrock_cross_account_enabled and role ARN/account id are set"
  value       = local.bedrock_assume_configured ? local.bedrock_assume_role_arn : null
}

output "bedrock_account_id" {
  description = "Account B ID parsed from bedrock_assume_role_arn or bedrock_account_id variable"
  value = local.bedrock_assume_configured ? (
    var.bedrock_account_id != "" ? var.bedrock_account_id : try(regex("^arn:aws:iam::([0-9]+):role/", local.bedrock_assume_role_arn)[0], null)
  ) : null
}

output "bedrock_cross_account_configured" {
  description = "True when cross-account Bedrock is enabled with assume-role ARN (STS policy on EC2 role)"
  value       = nonsensitive(local.bedrock_assume_configured)
}

output "bedrock_systemd_env_configured" {
  description = "True when BEDROCK_ASSUME_ROLE_ARN (and optional BEDROCK_EXTERNAL_ID) are injected via user_data/systemd on new instances"
  value       = nonsensitive(local.bedrock_assume_configured && var.bedrock_inject_systemd_env)
}
