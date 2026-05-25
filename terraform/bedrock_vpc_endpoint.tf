# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# Optional interface VPC endpoint for Bedrock Runtime (private DNS inside VPC).

resource "aws_security_group" "bedrock_runtime_vpce" {
  count = var.bedrock_runtime_vpc_endpoint_enabled ? 1 : 0

  name_prefix            = "${var.project_name}-bedrock-vpce-"
  description            = "Allow HTTPS from OSCAL instances to Bedrock Runtime VPC endpoint"
  vpc_id                 = aws_vpc.main.id
  revoke_rules_on_delete = true

  ingress {
    description     = "HTTPS from OSCAL EC2"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.oscal.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_vpc_endpoint" "bedrock_runtime" {
  count = var.bedrock_runtime_vpc_endpoint_enabled ? 1 : 0

  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.bedrock-runtime"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.public[*].id
  security_group_ids  = [aws_security_group.bedrock_runtime_vpce[0].id]
  private_dns_enabled = true
}
