# OSCAL Green/Blue: Auto Scaling Groups + Launch Templates + optional persistent gp3 volumes.
# Replaces standalone aws_instance (resilience: ASG replaces terminated/unhealthy instances).
# See docs/AWS_OPERATIONS.md#aws-terraform-for-oscal-ai-via-bedrock.

# -----------------------------------------------------------------------------
# Persistent data volumes (same AZ as each ASG subnet)
# -----------------------------------------------------------------------------
resource "aws_ebs_volume" "oscal_green_data" {
  count = local.oscal_persistent_ebs ? 1 : 0

  availability_zone = aws_subnet.public[0].availability_zone
  size              = var.oscal_data_volume_size_gb
  type              = "gp3"
  encrypted         = true

  tags = {
    Name                  = "${var.project_name}-oscal-data-green"
    OSCAL_PERSISTENT_ROLE = "green"
    Stack                 = var.project_name
  }
}

resource "aws_ebs_volume" "oscal_blue_data" {
  count = local.oscal_persistent_ebs ? 1 : 0

  availability_zone = aws_subnet.public[1].availability_zone
  size              = var.oscal_data_volume_size_gb
  type              = "gp3"
  encrypted         = true

  tags = {
    Name                  = "${var.project_name}-oscal-data-blue"
    OSCAL_PERSISTENT_ROLE = "blue"
    Stack                 = var.project_name
  }
}

# -----------------------------------------------------------------------------
# Launch templates
# -----------------------------------------------------------------------------
resource "aws_launch_template" "oscal_green" {
  lifecycle {
    precondition {
      condition     = local.oscal_ami_id_ok
      error_message = "OSCAL AMI could not be resolved. Set oscal_ami_id, or use_image_factory_ami = true with Image Factory access, or use a supported region for Amazon Linux (see image_factory_ami.tf)."
    }
    create_before_destroy = true
  }

  name_prefix   = "${var.project_name}-oscal-green-"
  image_id      = local.oscal_ami_id
  instance_type = var.instance_type
  key_name      = var.key_name

  vpc_security_group_ids = [aws_security_group.oscal.id]

  iam_instance_profile {
    name = aws_iam_instance_profile.oscal.name
  }

  user_data = base64encode(local.oscal_user_data_green)

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = 30
      volume_type           = "gp3"
      delete_on_termination = true
      encrypted             = true
    }
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name                  = "${var.project_name}-oscal-green"
      Port                  = "3019"
      Stack                 = var.project_name
      OSCAL_PERSISTENT_ROLE = "green"
      OSCAL_SSM_TARGET      = "true"
    }
  }

  tag_specifications {
    resource_type = "volume"
    tags = {
      Name  = "${var.project_name}-oscal-green-root"
      Stack = var.project_name
    }
  }

  depends_on = [aws_iam_instance_profile.oscal]
}

resource "aws_launch_template" "oscal_blue" {
  lifecycle {
    precondition {
      condition     = local.oscal_ami_id_ok
      error_message = "OSCAL AMI could not be resolved. Set oscal_ami_id, or use_image_factory_ami = true with Image Factory access, or use a supported region for Amazon Linux (see image_factory_ami.tf)."
    }
    create_before_destroy = true
  }

  name_prefix   = "${var.project_name}-oscal-blue-"
  image_id      = local.oscal_ami_id
  instance_type = var.instance_type
  key_name      = var.key_name

  vpc_security_group_ids = [aws_security_group.oscal.id]

  iam_instance_profile {
    name = aws_iam_instance_profile.oscal.name
  }

  user_data = base64encode(local.oscal_user_data_blue)

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = 30
      volume_type           = "gp3"
      delete_on_termination = true
      encrypted             = true
    }
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name                  = "${var.project_name}-oscal-blue"
      Port                  = "3020"
      Stack                 = var.project_name
      OSCAL_PERSISTENT_ROLE = "blue"
      OSCAL_SSM_TARGET      = "true"
    }
  }

  tag_specifications {
    resource_type = "volume"
    tags = {
      Name  = "${var.project_name}-oscal-blue-root"
      Stack = var.project_name
    }
  }

  depends_on = [aws_iam_instance_profile.oscal]
}

# -----------------------------------------------------------------------------
# Auto Scaling Groups (self-healing: replace missing/unhealthy instance)
# -----------------------------------------------------------------------------
resource "aws_autoscaling_group" "oscal_green" {
  name                      = "${var.project_name}-oscal-green-asg"
  vpc_zone_identifier       = [aws_subnet.public[0].id]
  desired_capacity          = 1
  max_size                  = 1
  min_size                  = 1
  health_check_type         = "ELB"
  health_check_grace_period = var.oscal_asg_health_check_grace_period
  wait_for_capacity_timeout = "10m"
  force_delete              = true

  launch_template {
    id      = aws_launch_template.oscal_green.id
    version = "$Latest"
  }

  tag {
    key                 = "Name"
    value               = "${var.project_name}-oscal-green-asg"
    propagate_at_launch = false
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [aws_launch_template.oscal_green]
}

resource "aws_autoscaling_group" "oscal_blue" {
  name                      = "${var.project_name}-oscal-blue-asg"
  vpc_zone_identifier       = [aws_subnet.public[1].id]
  desired_capacity          = 1
  max_size                  = 1
  min_size                  = 1
  health_check_type         = "ELB"
  health_check_grace_period = var.oscal_asg_health_check_grace_period
  wait_for_capacity_timeout = "10m"
  force_delete              = true

  launch_template {
    id      = aws_launch_template.oscal_blue.id
    version = "$Latest"
  }

  tag {
    key                 = "Name"
    value               = "${var.project_name}-oscal-blue-asg"
    propagate_at_launch = false
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [aws_launch_template.oscal_blue]
}

# -----------------------------------------------------------------------------
# Register ASGs with ALB target groups
# -----------------------------------------------------------------------------
resource "aws_autoscaling_attachment" "oscal_green" {
  autoscaling_group_name = aws_autoscaling_group.oscal_green.name
  lb_target_group_arn    = aws_lb_target_group.green.arn
}

resource "aws_autoscaling_attachment" "oscal_blue" {
  autoscaling_group_name = aws_autoscaling_group.oscal_blue.name
  lb_target_group_arn    = aws_lb_target_group.blue.arn
}
