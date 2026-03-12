# Security groups: ALB, OSCAL instances
#
# PCL / Stage-account mandate: Do not allow ingress from public IP (no 0.0.0.0/0). All ingress uses
# default_allowed_cidr_blocks (or Australia prefix lists where configured). Outbound (egress) 0.0.0.0/0 is allowed.
#
# ALB: HTTPS (443) from default_allowed_cidr_blocks or Australia prefix lists (alb_restrict_to_australia); HTTP (80) optional from allowed CIDRs when alb_allow_http_for_testing = true.
# PCL-friendly pattern: explicit TCP 443/80 only; no 0.0.0.0/0; for stage, prefer /32 in default_allowed_cidr_blocks to avoid "broad CIDR" quarantine (per AMS PCL / FluffyJaws).
resource "aws_security_group" "alb" {
  name_prefix               = "${var.project_name}-alb-"
  description               = "ALB for OSCAL Blue/Green"
  vpc_id                    = aws_vpc.main.id
  revoke_rules_on_delete    = true

  # HTTPS 443: alb_allow_443_from_all = from default_allowed_cidr_blocks; else Australia prefix lists or default_allowed_cidr_blocks. No 0.0.0.0/0 (PCL).
  dynamic "ingress" {
    for_each = var.alb_allow_443_from_all ? [1] : []
    content {
      from_port   = 443
      to_port     = 443
      protocol    = "tcp"
      cidr_blocks = var.default_allowed_cidr_blocks
      description = "HTTPS; allowed CIDRs (PCL-compliant)"
    }
  }

  dynamic "ingress" {
    for_each = !var.alb_allow_443_from_all && !var.alb_restrict_to_australia ? [1] : []
    content {
      from_port   = 443
      to_port     = 443
      protocol    = "tcp"
      cidr_blocks = var.default_allowed_cidr_blocks
      description = "HTTPS; allowed CIDRs only"
    }
  }

  dynamic "ingress" {
    for_each = !var.alb_allow_443_from_all && var.alb_restrict_to_australia ? aws_ec2_managed_prefix_list.au : {}
    content {
      from_port       = 443
      to_port         = 443
      protocol        = "tcp"
      prefix_list_ids = [ingress.value.id]
      description     = "HTTPS; Australia only"
    }
  }

  # Port 80 only when HTTPS is not in use and testing is allowed. When HTTPS is on, ALB SG must be 443-only for PCL custom-elb-restricted-ports-check.
  dynamic "ingress" {
    for_each = !local.alb_use_https && var.alb_allow_http_for_testing ? [1] : []
    content {
      from_port   = 80
      to_port     = 80
      protocol    = "tcp"
      cidr_blocks = var.default_allowed_cidr_blocks
      description = "HTTP for testing (allowed CIDRs only); HTTPS mode keeps SG 443-only for PCL"
    }
  }

  # Egress: outbound to internet (PCL restricts ingress 0.0.0.0/0; egress to 0.0.0.0/0 is standard for ALB).
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group" "oscal" {
  name_prefix            = "${var.project_name}-oscal-"
  description            = "OSCAL Green/Blue instances"
  vpc_id                 = aws_vpc.main.id
  revoke_rules_on_delete = true

  ingress {
    from_port       = 3019
    to_port         = 3019
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    from_port       = 3020
    to_port         = 3020
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  # Blue ↔ Green: allow OSCAL instances to reach each other on private IP (app ports)
  ingress {
    from_port   = 3019
    to_port     = 3019
    protocol    = "tcp"
    self        = true
    description = "Green/Blue inter-instance (private IP)"
  }
  ingress {
    from_port   = 3020
    to_port     = 3020
    protocol    = "tcp"
    self        = true
    description = "Green/Blue inter-instance (private IP)"
  }

  # VPC → Blue/Green: allow instances in VPC to reach OSCAL on 80, 443, 3019, 3020
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
    description = "VPC to OSCAL (HTTP)"
  }
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
    description = "VPC to OSCAL (HTTPS)"
  }
  ingress {
    from_port   = 3019
    to_port     = 3020
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
    description = "VPC to OSCAL (app ports 3019, 3020)"
  }

  # SSH: from allowed CIDRs only. Do not use 0.0.0.0/0 — PCL custom-config-ec2-sg-port-check will auto-remediate.
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.default_allowed_cidr_blocks
    description = "SSH from allowed CIDRs"
  }

  # Direct access to Green (3019) and Blue (3020) from default_allowed_cidr_blocks only (no 0.0.0.0/0 per PCL).
  ingress {
    from_port   = 3019
    to_port     = 3019
    protocol    = "tcp"
    cidr_blocks = var.default_allowed_cidr_blocks
    description = "Green app port from allowed CIDRs"
  }
  ingress {
    from_port   = 3020
    to_port     = 3020
    protocol    = "tcp"
    cidr_blocks = var.default_allowed_cidr_blocks
    description = "Blue app port from allowed CIDRs"
  }

  # Access also via ALB (security_groups above), VPC CIDR (above), or self (Green↔Blue).
  # Use the ALB URL (e.g. https://oscal.amsgovcloud.com.au) for browser access.

  # Egress: outbound only (PCL restricts ingress 0.0.0.0/0; egress to internet uses 0.0.0.0/0 by design).
  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # SMTP: allow Green/Blue to reach smtp.gmail.com (and other SMTP servers) for email
  egress {
    from_port   = 25
    to_port     = 25
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "SMTP (e.g. smtp.gmail.com)"
  }
  egress {
    from_port   = 465
    to_port     = 465
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "SMTPS (e.g. smtp.gmail.com)"
  }
  egress {
    from_port   = 587
    to_port     = 587
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "SMTP submission / STARTTLS (e.g. smtp.gmail.com)"
  }

  # Egress to VPC: app ports (3019, 3020), HTTP/HTTPS (80, 443) for cross-system talk
  egress {
    from_port   = 3019
    to_port     = 3020
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
    description = "OSCAL to VPC (app ports)"
  }
  egress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  lifecycle {
    create_before_destroy = true
  }
}
