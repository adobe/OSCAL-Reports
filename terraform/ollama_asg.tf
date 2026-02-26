# Ollama AI server: Auto Scaling Group (default min 0, max 1, desired 1; 1 hr idle -> scale to 0)
# AMI: same chain as OSCAL (Green/Blue). 1) var.ollama_ami_id, 2) Image Factory Amazon Linux 2023 (when in map), 3) native Amazon Linux 2023 fallback.
# Add Image Factory Amazon Linux 2023 AMI IDs in image_factory_ami.tf so Ollama and OSCAL use the same base image.
# Each instance writes boot time to ollama-activity/last.json; Lambda shuts down after 1 hr no activity.

locals {
  ollama_ami_id = var.ollama_ami_id != null ? var.ollama_ami_id : (var.use_image_factory_ami && local.image_factory_ami_id != null ? local.image_factory_ami_id : local.default_fallback_ami_id)
  s3_activity_bucket = aws_s3_bucket.logs.id
  # Fail at plan if no AMI could be resolved (e.g. unsupported region for Amazon Linux).
  ollama_ami_id_ok = local.ollama_ami_id != null && local.ollama_ami_id != ""
  s3_activity_key     = "ollama-activity/last.json"
  # Single source of truth: scripts/install-ollama-and-models.sh (bootstrap + manual via run-install-ollama-on-instance.sh)
  ollama_install_script_b64 = base64encode(file("${path.module}/../scripts/install-ollama-and-models.sh"))
  ollama_user_data   = templatefile("${path.module}/templates/ollama_user_data.sh", {
    s3_bucket           = local.s3_activity_bucket
    s3_key              = local.s3_activity_key
    install_script_b64  = local.ollama_install_script_b64
    vpc_cidr            = var.vpc_cidr
  })
}

# Use the AMI's root device name so our 150 GB EBS mapping overrides the root volume (not a secondary disk).
# AMIs can use /dev/sda1 (Amazon Linux 2023) or /dev/xvda (e.g. some RHEL); wrong device = small root + unused 150 GB.
data "aws_ami" "ollama_root_device" {
  filter {
    name   = "image-id"
    values = [local.ollama_ami_id]
  }
}

resource "aws_launch_template" "ollama" {
  lifecycle {
    precondition {
      condition     = local.ollama_ami_id_ok
      error_message = "Ollama AMI could not be resolved. Set ollama_ami_id, or use_image_factory_ami = true with Image Factory access, or use a supported region for Amazon Linux (see image_factory_ami.tf)."
    }
  }
  name_prefix = "${var.project_name}-ollama-"
  image_id     = local.ollama_ami_id
  instance_type = "t3.2xlarge"
  key_name      = var.key_name
  iam_instance_profile {
    name = aws_iam_instance_profile.ollama.name
  }

  # Security groups must be on the network interface when network_interfaces is set (required for ASG attach).
  # Ensure public IP so EC2 Instance Connect (AWS console "Connect") and SSH from laptop work.
  network_interfaces {
    associate_public_ip_address = true
    security_groups             = [aws_security_group.ollama.id]
  }

  # Root volume 150 GB: use AMI's root device name so this overrides the root (avoids 2 GB root when AMI uses /dev/xvda).
  block_device_mappings {
    device_name = data.aws_ami.ollama_root_device.root_device_name
    ebs {
      volume_size           = 150
      volume_type           = "gp3"
      delete_on_termination = true
    }
  }

  user_data = base64encode(local.ollama_user_data)

  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name    = "${var.project_name}-ollama"
      Purpose = "AI-Inference"
    }
  }
}

resource "aws_autoscaling_group" "ollama" {
  name                = "${var.project_name}-ollama-asg"
  min_size            = var.ollama_always_on ? 1 : var.ollama_min_size
  max_size            = var.ollama_max_size
  desired_capacity    = var.ollama_always_on ? 1 : var.ollama_desired_capacity
  vpc_zone_identifier = aws_subnet.public[*].id
  health_check_type   = "EC2"
  health_check_grace_period = 300

  launch_template {
    id      = aws_launch_template.ollama.id
    version = "$Latest"
  }

  tag {
    key                 = "Name"
    value               = "${var.project_name}-ollama"
    propagate_at_launch = true
  }
}

# Look up running Ollama instance(s) in the ASG so we can output public IP for SSH (use public IP from laptop, not private).
data "aws_instances" "ollama" {
  filter {
    name   = "tag:aws:autoscaling:groupName"
    values = [aws_autoscaling_group.ollama.name]
  }
  filter {
    name   = "instance-state-name"
    values = ["running"]
  }
}
