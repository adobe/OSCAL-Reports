# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# ------------------------------------------------------------------------------
# Adobe Image Factory – AMI best practices (docs/AWS_OPERATIONS.md#adobe-image-factory-ami-usage-for-terraform)
# ------------------------------------------------------------------------------
# Resolution order when use_image_factory_ami = true:
#   1) Owner + name pattern (image_factory_owner_id + image_factory_ami_name_pattern)
#   2) Dynamic EMR lookup via executable-users self (image_factory_dynamic_emr_lookup_enabled)
#   3) Static pin (image_factory_amazon_linux_ami_us_east_1) when prefer_dynamic is false
#   4) Static region map in this file
#   5) Native Amazon Linux 2023 fallback (oscal_instances.tf)
# ------------------------------------------------------------------------------

locals {
  image_factory_amazon_linux_by_region = merge(
    {
      # Add more regions here if needed (same AMI for Green and Blue).
    },
    var.image_factory_amazon_linux_ami_us_east_1 != null ? { "us-east-1" = var.image_factory_amazon_linux_ami_us_east_1 } : {}
  )
  image_factory_ami_id_amazon_linux = lookup(local.image_factory_amazon_linux_by_region, var.aws_region, null)
  image_factory_ami_id_static         = local.image_factory_ami_id_amazon_linux

  resolve_emr_ami_script = abspath("${path.module}/../../scripts/resolve-latest-emr-ami.sh")
}

# Dynamic lookup by Image Factory owner account + AMI name pattern.
data "aws_ami" "image_factory" {
  count = var.use_image_factory_ami && var.image_factory_owner_id != null && var.image_factory_ami_name_pattern != null ? 1 : 0

  most_recent = true
  owners      = [var.image_factory_owner_id]

  filter {
    name   = "name"
    values = [var.image_factory_ami_name_pattern]
  }

  filter {
    name   = "state"
    values = ["available"]
  }

  filter {
    name   = "architecture"
    values = [var.instance_architecture]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "root-device-type"
    values = ["ebs"]
  }
}

# Dynamic lookup: newest EMR AMI launchable in this account (shared Image Factory images).
data "external" "image_factory_emr" {
  count = var.use_image_factory_ami && var.image_factory_dynamic_emr_lookup_enabled ? 1 : 0

  program = ["bash", local.resolve_emr_ami_script]

  query = {
    region       = var.aws_region
    architecture = var.instance_architecture
  }
}

locals {
  image_factory_emr_executable_ami_id = (
    var.image_factory_dynamic_emr_lookup_enabled &&
    length(data.external.image_factory_emr) > 0 &&
    try(data.external.image_factory_emr[0].result.error, "") == "" &&
    try(data.external.image_factory_emr[0].result.ami_id, "") != ""
  ) ? data.external.image_factory_emr[0].result.ami_id : null

  image_factory_emr_executable_ami_name = (
    var.image_factory_dynamic_emr_lookup_enabled &&
    length(data.external.image_factory_emr) > 0 &&
    try(data.external.image_factory_emr[0].result.error, "") == "" &&
    try(data.external.image_factory_emr[0].result.ami_name, "") != ""
  ) ? data.external.image_factory_emr[0].result.ami_name : null

  image_factory_ami_from_owner = length(data.aws_ami.image_factory) > 0 ? data.aws_ami.image_factory[0].id : null
  image_factory_name_from_owner = length(data.aws_ami.image_factory) > 0 ? data.aws_ami.image_factory[0].name : null

  image_factory_ami_id = var.use_image_factory_ami ? coalesce(
    local.image_factory_ami_from_owner,
    local.image_factory_emr_executable_ami_id,
    var.image_factory_prefer_dynamic_emr_lookup ? null : local.image_factory_ami_id_static,
    local.image_factory_ami_id_static,
  ) : null

  image_factory_ami_name = var.use_image_factory_ami ? coalesce(
    local.image_factory_name_from_owner,
    local.image_factory_emr_executable_ami_name,
  ) : null
}

# Fallback only when Image Factory is not used or not available: native Amazon Linux 2023.
data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*"]
  }

  filter {
    name   = "state"
    values = ["available"]
  }

  filter {
    name   = "architecture"
    values = [var.instance_architecture]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "root-device-type"
    values = ["ebs"]
  }
}

locals {
  default_fallback_ami_id = data.aws_ami.amazon_linux.id
}
