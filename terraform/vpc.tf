# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# VPC and networking for OSCAL
# Public subnets for ALB and EC2 (diagram does not require private subnets)

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
}

# Public subnets (2 AZs for ALB and EC2)
resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Private subnets for RDS only (no IGW route). RDS is not internet-reachable; EC2 reaches RDS via private IP in-VPC.
resource "aws_subnet" "private_rds" {
  count = var.create_rds_postgres ? 2 : 0

  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, 10 + count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = false

  tags = {
    Name = "${var.project_name}-private-rds-${count.index + 1}"
  }
}

resource "aws_route_table" "private_rds" {
  count = var.create_rds_postgres ? 1 : 0

  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${var.project_name}-private-rds-rt"
  }
}

resource "aws_route_table_association" "private_rds" {
  count = var.create_rds_postgres ? 2 : 0

  subnet_id      = aws_subnet.private_rds[count.index].id
  route_table_id = aws_route_table.private_rds[0].id
}
