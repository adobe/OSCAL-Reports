# ------------------------------------------------------------------------------
# Adobe Image Factory – AMI best practices (docs/IMAGE_FACTORY.md)
# ------------------------------------------------------------------------------
# - AMS InfraSec tickets (e.g. SSAAU-169) expect the Image Factory flavor **Amazon Linux 2023 EMR**,
#   not only generic AL2023 or the public Amazon-owned al2023-ami-* fallback.
# - Default: Adobe Image Factory Amazon Linux 2023 / EMR (add AMI IDs below or use dynamic lookup).
#   When not in map and no dynamic lookup, use native Amazon Linux 2023 (may not satisfy EMR tickets).
# - use_image_factory_ami = true (default): Image Factory AMI if resolved; else native AL2023.
# - use_image_factory_ami = false: native Amazon Linux 2023 only.
# - Optional overrides: oscal_ami_id in terraform.tfvars.
# - Discover candidates: terraform/scripts/list-emr-candidate-amis.sh (with AWS creds).
# - S3 bucket naming (AMS): lowercase, e.g. ams-oscal-<account-id> (see s3.tf).
# - References: Image Factory Wiki, UI (imagefactory.corp.adobe.com).
# ------------------------------------------------------------------------------

# First choice: Adobe Image Factory Amazon Linux 2023 (prefer **EMR** flavor per AMS security) by region.
# Set image_factory_amazon_linux_ami_us_east_1 in terraform.tfvars, or add entries below; when an entry exists for aws_region, it is used; else native Amazon Linux 2023.
locals {
  image_factory_amazon_linux_by_region = merge(
    {
      # Add more regions here if needed (same AMI for Green and Blue).
      # Example: "eu-west-1" = "ami-xxxxxxxx"
    },
    var.image_factory_amazon_linux_ami_us_east_1 != null ? { "us-east-1" = var.image_factory_amazon_linux_ami_us_east_1 } : {}
  )
  image_factory_ami_id_amazon_linux = lookup(local.image_factory_amazon_linux_by_region, var.aws_region, null)
  image_factory_ami_id_static      = local.image_factory_ami_id_amazon_linux
}

# Optional: dynamic lookup like automation_framework – use latest Image Factory AMI by owner + name pattern (when AMIs are shared with this account).
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

locals {
  # Use dynamic lookup when configured; else Image Factory Amazon Linux 2023 from static map; null → native AL2023.
  image_factory_ami_id = var.use_image_factory_ami ? (
    length(data.aws_ami.image_factory) > 0 ? data.aws_ami.image_factory[0].id : local.image_factory_ami_id_static
  ) : null
}

# Fallback only when Image Factory is not used or not available: native Amazon Linux 2023 (maintained by Amazon).
data "aws_ami" "amazon_linux" {
  most_recent  = true
  owners       = ["amazon"]

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
  # Fallback AMI when Image Factory is not available: native Amazon Linux 2023.
  default_fallback_ami_id = data.aws_ami.amazon_linux.id
}
