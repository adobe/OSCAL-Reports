# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# ACM certificate for ALB HTTPS (when create_alb_certificate = true)
# Terraform requests the certificate; you add the DNS validation CNAME records and the domain→ALB record manually in Route53.

resource "aws_acm_certificate" "alb" {
  count = var.create_alb_certificate && var.alb_domain_name != null ? 1 : 0

  domain_name       = var.alb_domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}
