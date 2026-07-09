# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# Staggered ASG instance refresh when launch template AMI changes (SSAAU-209 remediation).
# Green refreshes first, then Blue — see scripts/oscal-staggered-ami-refresh.sh.

resource "terraform_data" "oscal_ami_refresh_trigger" {
  count = var.oscal_ami_auto_refresh_on_change ? 1 : 0

  input = local.oscal_ami_id
}

resource "null_resource" "oscal_staggered_ami_refresh" {
  count = var.oscal_ami_auto_refresh_on_change ? 1 : 0

  triggers = {
    ami_id = local.oscal_ami_id
  }

  provisioner "local-exec" {
    command     = "bash \"${abspath("${path.module}/../../../scripts/oscal-staggered-ami-refresh.sh")}\""
    working_dir = path.module
    environment = {
      TERRAFORM_DIR = path.module
    }
  }

  depends_on = [
    terraform_data.oscal_ami_refresh_trigger,
    aws_autoscaling_group.oscal_green,
    aws_autoscaling_group.oscal_blue,
    aws_launch_template.oscal_green,
    aws_launch_template.oscal_blue,
  ]
}
