# Ollama AI server: Auto Scaling Group (default min 0, max 1, desired 1; 1 hr idle -> scale to 0)
# AMI order: 1) var.ollama_ami_id, 2) Image Factory RHEL9 only if use_image_factory_ami = true, 3) Amazon Linux 2023 (default when Image Factory not available).
# Each instance writes boot time to ollama-activity/last.json; Lambda shuts down after 1 hr no activity.

locals {
  ollama_ami_id = var.ollama_ami_id != null ? var.ollama_ami_id : (var.use_image_factory_ami && local.image_factory_ami_id != null ? local.image_factory_ami_id : local.default_fallback_ami_id)
  s3_activity_bucket = aws_s3_bucket.logs.id
  # Fail at plan if no AMI could be resolved (e.g. unsupported region for Amazon Linux).
  ollama_ami_id_ok = local.ollama_ami_id != null && local.ollama_ami_id != ""
  s3_activity_key     = "ollama-activity/last.json"
  ollama_user_data   = templatefile("${path.module}/templates/ollama_user_data_rhel9.sh", {
    s3_bucket = local.s3_activity_bucket
    s3_key    = local.s3_activity_key
  })
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

  vpc_security_group_ids = [aws_security_group.ollama.id]

  block_device_mappings {
    device_name = "/dev/sda1"
    ebs {
      volume_size           = 100
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
  min_size            = var.ollama_min_size
  max_size            = var.ollama_max_size
  desired_capacity    = var.ollama_desired_capacity
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
