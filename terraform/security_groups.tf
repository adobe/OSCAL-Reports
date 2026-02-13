# Security groups: ALB, OSCAL instances, Ollama

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

  # Ollama / VPC → Blue/Green: allow instances in VPC (e.g. Ollama) to reach OSCAL on private IP (avoids SG cycle)
  ingress {
    from_port   = 3019
    to_port     = 3020
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
    description = "Ollama and VPC to OSCAL (private IP)"
  }

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
  }

  # Direct access from internet (e.g. laptop): Green :3019, Blue :3020 (same CIDR as SSH)
  ingress {
    from_port   = 3019
    to_port     = 3019
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
    description = "Green app from internet (e.g. laptop)"
  }
  ingress {
    from_port   = 3020
    to_port     = 3020
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
    description = "Blue app from internet (e.g. laptop)"
  }

  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Egress to Ollama (port 11434) within VPC; use CIDR to avoid cycle with ollama SG
  egress {
    from_port   = 11434
    to_port     = 11434
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
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

resource "aws_security_group" "ollama" {
  name_prefix = "${var.project_name}-ollama-"
  description = "Ollama AI server (auto-scaling)"
  vpc_id      = aws_vpc.main.id

  # OSCAL (Blue/Green) on port 11434
  ingress {
    from_port       = 11434
    to_port         = 11434
    protocol        = "tcp"
    security_groups = [aws_security_group.oscal.id]
  }

  # NLB health checks: NLB has no SG; health checks come from NLB node IPs (in VPC)
  ingress {
    from_port   = 11434
    to_port     = 11434
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
    description = "NLB health checks and VPC access to Ollama"
  }

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
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
