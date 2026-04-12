# Optional Amazon RDS for PostgreSQL — Database Integration (extended_data, adobe_teams).
# RDS lives in private subnets only (no route to IGW), publicly_accessible = false, private DNS → private IP.
# Ingress: OSCAL EC2 security group only, plus optional rds_additional_ingress_ipv4_cidr_blocks (VPC-internal use).
# IAM database authentication for the app user; master password in Secrets Manager (RDS-managed).
# Default create_rds_postgres = true; set false in tfvars to omit RDS. EC2 user_data bootstraps the IAM DB user and injects OSCAL_DATABASE_* env vars when RDS is enabled.

resource "aws_db_subnet_group" "oscal" {
  count = var.create_rds_postgres ? 1 : 0

  name       = "${var.project_name}-rds-subnets"
  subnet_ids = aws_subnet.private_rds[*].id

  tags = {
    Name = "${var.project_name}-rds-subnet-group"
  }
}

resource "aws_security_group" "rds" {
  count = var.create_rds_postgres ? 1 : 0

  name_prefix            = "${var.project_name}-rds-"
  description            = "PostgreSQL for OSCAL Database Integration (private subnets; no public access)"
  vpc_id                 = aws_vpc.main.id
  revoke_rules_on_delete = true

  ingress {
    description     = "PostgreSQL from OSCAL EC2 instances (private IP; same VPC)"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.oscal.id]
  }

  dynamic "ingress" {
    for_each = var.rds_additional_ingress_ipv4_cidr_blocks
    content {
      description = "PostgreSQL from allowed CIDR (optional; VPC-internal or routed corporate range)"
      from_port   = 5432
      to_port     = 5432
      protocol    = "tcp"
      cidr_blocks = [ingress.value]
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow outbound (RDS maintenance / updates)"
  }

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${var.project_name}-rds-sg"
  }
}

resource "aws_db_instance" "oscal" {
  count = var.create_rds_postgres ? 1 : 0

  identifier     = "${replace(var.project_name, "_", "-")}-pg"
  engine         = "postgres"
  engine_version = var.rds_engine_version

  instance_class        = var.rds_instance_class
  allocated_storage     = var.rds_allocated_storage
  max_allocated_storage = var.rds_max_allocated_storage > 0 ? var.rds_max_allocated_storage : null
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.rds_database_name
  username = var.rds_master_username

  manage_master_user_password          = true
  iam_database_authentication_enabled  = true

  db_subnet_group_name   = aws_db_subnet_group.oscal[0].name
  vpc_security_group_ids = [aws_security_group.rds[0].id]
  publicly_accessible    = false

  backup_retention_period = var.rds_backup_retention_period
  skip_final_snapshot     = var.rds_skip_final_snapshot
  final_snapshot_identifier = var.rds_skip_final_snapshot ? null : "${replace(var.project_name, "_", "-")}-pg-final"

  deletion_protection = var.rds_deletion_protection

  tags = {
    Name = "${var.project_name}-postgresql"
  }

  lifecycle {
    prevent_destroy = false
  }
}
