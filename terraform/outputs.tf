# Outputs for OSCAL + Ollama deployment

output "aws_region" {
  description = "AWS region (for scripts that need region, e.g. check-ollama-connectivity.sh)"
  value       = var.aws_region
}

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "alb_url_http" {
  description = "URL to access the application (HTTP); same as Blue deployment"
  value       = "http://${aws_lb.main.dns_name}"
}

output "alb_url_blue" {
  description = "URL for Blue deployment via ALB (use alb_blue_hostname when set for host-based routing)"
  value       = var.alb_blue_hostname != null ? "http://${var.alb_blue_hostname}" : "http://${aws_lb.main.dns_name}"
}

output "alb_url_green" {
  description = "URL for Green deployment via ALB (use alb_green_hostname when set for host-based routing)"
  value       = var.alb_green_hostname != null ? "http://${var.alb_green_hostname}" : "http://${aws_lb.main.dns_name}"
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
  description = "S3 bucket for logs and ollama-activity state"
  value       = aws_s3_bucket.logs.id
}

output "s3_activity_key" {
  description = "S3 key for Ollama last activity (for Lambda env)"
  value       = "ollama-activity/last.json"
}

output "lambda_ollama_controller_name" {
  description = "Lambda function name for OSCAL backend config (wake Ollama)"
  value       = aws_lambda_function.ollama_controller.function_name
}

output "ollama_asg_name" {
  description = "Auto Scaling Group name for Ollama"
  value       = aws_autoscaling_group.ollama.name
}

output "ollama_nlb_dns_name" {
  description = "Internal DNS name of the Ollama Network Load Balancer (use with port 11434)"
  value       = aws_lb.ollama.dns_name
}

output "ollama_url" {
  description = "URL to use for OLLAMA_URL when system is in same VPC; Lambda can start ASG when scaled to 0"
  value       = "http://${aws_lb.ollama.dns_name}:11434"
}

output "ollama_target_group_arn" {
  description = "ARN of the Ollama NLB target group (for manual target registration if needed)"
  value       = aws_lb_target_group.ollama.arn
}

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}
