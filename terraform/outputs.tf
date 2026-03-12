# Outputs for OSCAL deployment (AI via AWS Bedrock)

output "aws_region" {
  description = "AWS region (for scripts that need region)"
  value       = var.aws_region
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

output "oscal_green_instance_id" {
  description = "EC2 instance ID for OSCAL Green (port 3019)"
  value       = aws_instance.oscal_green.id
}

output "oscal_green_private_ip" {
  description = "Private IP of OSCAL Green"
  value       = aws_instance.oscal_green.private_ip
}

output "oscal_green_public_ip" {
  description = "Public IP of OSCAL Green (for SSH/deploy from laptop)"
  value       = aws_instance.oscal_green.public_ip
}

output "oscal_blue_instance_id" {
  description = "EC2 instance ID for OSCAL Blue (port 3020)"
  value       = aws_instance.oscal_blue.id
}

output "oscal_blue_private_ip" {
  description = "Private IP of OSCAL Blue"
  value       = aws_instance.oscal_blue.private_ip
}

output "oscal_blue_public_ip" {
  description = "Public IP of OSCAL Blue (for SSH/deploy from laptop)"
  value       = aws_instance.oscal_blue.public_ip
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
