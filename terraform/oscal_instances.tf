# OSCAL Green and Blue instances (always on), ports 3019 and 3020
# AMI order: 1) var.oscal_ami_id, 2) Image Factory RHEL9 only if use_image_factory_ami = true, 3) Amazon Linux 2023 (default when Image Factory not available).

locals {
  oscal_ami_id     = var.oscal_ami_id != null ? var.oscal_ami_id : (var.use_image_factory_ami && local.image_factory_ami_id != null ? local.image_factory_ami_id : local.default_fallback_ami_id)
  oscal_ami_id_ok  = local.oscal_ami_id != null && local.oscal_ami_id != ""
}

# User data: either Docker/podman (run_oscal_via_docker = true) or direct run with local EBS data (default). RHEL only.
# Direct run: Node 20, config/users on EBS at /opt/oscal/data; ec2_automation backs up to S3 every 10 min (no S3 mount).
locals {
  # --- Docker/podman user_data (when run_oscal_via_docker = true) ---
  oscal_user_data_green_rhel9 = <<-EOT
#!/bin/bash
set -e
dnf install -y curl podman
systemctl enable --now podman.socket
podman pull ghcr.io/adobemanagedservices/oscal-report-generator:latest
podman run -d --name oscal --restart unless-stopped -p 3019:3020 -e NODE_ENV=production ghcr.io/adobemanagedservices/oscal-report-generator:latest
EOT
  oscal_user_data_blue_rhel9 = <<-EOT
#!/bin/bash
set -e
dnf install -y curl podman
systemctl enable --now podman.socket
podman pull ghcr.io/adobemanagedservices/oscal-report-generator:latest
podman run -d --name oscal --restart unless-stopped -p 3020:3020 -e NODE_ENV=production ghcr.io/adobemanagedservices/oscal-report-generator:latest
EOT
  # --- Direct-run user_data (when run_oscal_via_docker = false): Node 20, local EBS data, systemd (RHEL) ---
  oscal_direct_user_data_green_rhel9 = <<-EOT
#!/bin/bash
set -e
PORT="3019"
DATA_DIR="/opt/oscal/data"

# Start SSM agent so Session Manager works (instance role has AmazonSSMManagedInstanceCore)
systemctl start amazon-ssm-agent 2>/dev/null || true
systemctl enable amazon-ssm-agent 2>/dev/null || true

dnf install -y curl git cronie rsync
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs

systemctl enable crond --now 2>/dev/null || true

mkdir -p /opt/oscal /opt/oscal/app $DATA_DIR
chown -R ec2-user:ec2-user /opt/oscal

cat > /etc/systemd/system/oscal-reporter.service << 'SVC'
[Unit]
Description=OSCAL Report Generator (Green)
After=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/oscal/app/backend
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=PORT_PLACEHOLDER
Environment=CONFIG_PATH=DATA_DIR_PLACEHOLDER/config.json
Environment=USERS_PATH=DATA_DIR_PLACEHOLDER/users.json

[Install]
WantedBy=multi-user.target
SVC
sed -i "s|PORT_PLACEHOLDER|$PORT|g; s|DATA_DIR_PLACEHOLDER|$DATA_DIR|g" /etc/systemd/system/oscal-reporter.service

systemctl daemon-reload
systemctl enable oscal-reporter.service
systemctl start oscal-reporter.service
# Allow outbound to Ollama NLB (port 11434) if firewalld is active (RHEL)
firewall-cmd --add-rich-rule='rule family=ipv4 direction=out destination port port=11434 protocol=tcp accept' --permanent 2>/dev/null && firewall-cmd --reload 2>/dev/null || true
EOT

  oscal_direct_user_data_blue_rhel9 = <<-EOT
#!/bin/bash
set -e
PORT="3020"
DATA_DIR="/opt/oscal/data"

# Start SSM agent so Session Manager works (instance role has AmazonSSMManagedInstanceCore)
systemctl start amazon-ssm-agent 2>/dev/null || true
systemctl enable amazon-ssm-agent 2>/dev/null || true

dnf install -y curl git cronie rsync
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs
dnf install -y epel-release || true

systemctl enable crond --now 2>/dev/null || true

mkdir -p /opt/oscal /opt/oscal/app $DATA_DIR
chown -R ec2-user:ec2-user /opt/oscal

cat > /etc/systemd/system/oscal-reporter.service << 'SVC'
[Unit]
Description=OSCAL Report Generator (Blue)
After=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/oscal/app/backend
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=PORT_PLACEHOLDER
Environment=CONFIG_PATH=DATA_DIR_PLACEHOLDER/config.json
Environment=USERS_PATH=DATA_DIR_PLACEHOLDER/users.json

[Install]
WantedBy=multi-user.target
SVC
sed -i "s|PORT_PLACEHOLDER|$PORT|g; s|DATA_DIR_PLACEHOLDER|$DATA_DIR|g" /etc/systemd/system/oscal-reporter.service

systemctl daemon-reload
systemctl enable oscal-reporter.service
systemctl start oscal-reporter.service
# Allow outbound to Ollama NLB (port 11434) if firewalld is active (RHEL)
firewall-cmd --add-rich-rule='rule family=ipv4 direction=out destination port port=11434 protocol=tcp accept' --permanent 2>/dev/null && firewall-cmd --reload 2>/dev/null || true
EOT

  # RHEL only (dnf/podman)
  oscal_user_data_green = var.run_oscal_via_docker ? local.oscal_user_data_green_rhel9 : local.oscal_direct_user_data_green_rhel9
  oscal_user_data_blue  = var.run_oscal_via_docker ? local.oscal_user_data_blue_rhel9 : local.oscal_direct_user_data_blue_rhel9
}

resource "aws_instance" "oscal_green" {
  lifecycle {
    precondition {
      condition     = local.oscal_ami_id_ok
      error_message = "OSCAL AMI could not be resolved. Set oscal_ami_id, or use_image_factory_ami = true with Image Factory access, or use a supported region for Amazon Linux (see image_factory_ami.tf)."
    }
    # Avoid "collecting instance settings: empty result" when replacing (create new before destroying old)
    create_before_destroy = true
  }
  ami                    = local.oscal_ami_id
  instance_type          = "t3.small"
  key_name               = var.key_name
  subnet_id              = aws_subnet.public[0].id
  vpc_security_group_ids = [aws_security_group.oscal.id]
  iam_instance_profile   = aws_iam_instance_profile.oscal.name

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
  }

  user_data = base64encode(local.oscal_user_data_green)

  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  tags = {
    Name   = "${var.project_name}-oscal-green"
    Port   = "3019"
  }

  depends_on = [aws_iam_instance_profile.oscal]
}

resource "aws_instance" "oscal_blue" {
  lifecycle {
    precondition {
      condition     = local.oscal_ami_id_ok
      error_message = "OSCAL AMI could not be resolved. Set oscal_ami_id, or use_image_factory_ami = true with Image Factory access, or use a supported region for Amazon Linux (see image_factory_ami.tf)."
    }
    create_before_destroy = true
  }
  ami                    = local.oscal_ami_id
  instance_type          = "t3.small"
  key_name               = var.key_name
  subnet_id              = aws_subnet.public[1].id
  vpc_security_group_ids = [aws_security_group.oscal.id]
  iam_instance_profile   = aws_iam_instance_profile.oscal.name

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
  }

  user_data = base64encode(local.oscal_user_data_blue)

  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  tags = {
    Name   = "${var.project_name}-oscal-blue"
    Port   = "3020"
  }

  depends_on = [aws_iam_instance_profile.oscal]
}

resource "aws_lb_target_group_attachment" "green" {
  target_group_arn = aws_lb_target_group.green.arn
  target_id       = aws_instance.oscal_green.id
  port            = 3019
}

resource "aws_lb_target_group_attachment" "blue" {
  target_group_arn = aws_lb_target_group.blue.arn
  target_id       = aws_instance.oscal_blue.id
  port            = 3020
}
