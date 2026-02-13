# Ollama AI server: Auto Scaling Group (default min 0, max 1, desired 1; 1 hr idle -> scale to 0)
# Only lookup Ubuntu AMI when not using RHEL9 (use_rhel9 + Image Factory AMI = RHEL9; no Ubuntu lookup).
# Each instance writes boot time to ollama-activity/last.json; Lambda shuts down after 1 hr no activity.

data "aws_ami" "ollama" {
  count       = var.ollama_ami_id == null && (!var.use_rhel9 || local.image_factory_ami_id == null) ? 1 : 0
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "state"
    values = ["available"]
  }
}

locals {
  ollama_ami_id = var.ollama_ami_id != null ? var.ollama_ami_id : (var.use_rhel9 && local.image_factory_ami_id != null ? local.image_factory_ami_id : data.aws_ami.ollama[0].id)
  s3_activity_bucket = aws_s3_bucket.logs.id
  s3_activity_key     = "ollama-activity/last.json"
  # User data: install Ollama, start serve, then write boot time to S3 (per diagram) so idle timer runs from latest activity
  ollama_user_data_ubuntu = templatefile("${path.module}/templates/ollama_user_data_ubuntu.sh", {
    s3_bucket = local.s3_activity_bucket
    s3_key    = local.s3_activity_key
  })
  ollama_user_data_rhel9 = templatefile("${path.module}/templates/ollama_user_data_rhel9.sh", {
    s3_bucket = local.s3_activity_bucket
    s3_key    = local.s3_activity_key
  })
  ollama_user_data = var.use_rhel9 ? local.ollama_user_data_rhel9 : local.ollama_user_data_ubuntu
}

resource "aws_launch_template" "ollama" {
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
