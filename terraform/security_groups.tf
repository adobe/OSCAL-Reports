# Security groups: ALB, OSCAL instances

resource "aws_security_group" "alb" {
  name_prefix = "${var.project_name}-alb-"
  description = "ALB for OSCAL Blue/Green"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

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
  name_prefix = "${var.project_name}-oscal-"
  description = "OSCAL Green/Blue instances"
  vpc_id      = aws_vpc.main.id

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

  # SSH: from allowed CIDRs only (e.g. admin IPs, VPN subnets; avoid 0.0.0.0/0 in production)
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.allowed_ssh_cidr
    description = "SSH from allowed CIDRs"
  }

  # App ports 3019 (Green) and 3020 (Blue) are NOT open to the internet.
  # Access only via: ALB (security_groups above), VPC CIDR (above), or self (Green↔Blue).
  # Use the ALB URL (e.g. https://oscal.amsgovcloud.com.au) for browser access.

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
