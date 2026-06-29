# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# OSCAL Green and Blue instances (always on), same app port on both (var.oscal_app_port, default 3020)
# AMI order: 1) var.oscal_ami_id, 2) Image Factory Amazon Linux 2023 / EMR (when resolved), 3) native Amazon Linux 2023 fallback.

locals {
  oscal_ami_id    = var.oscal_ami_id != null ? var.oscal_ami_id : (var.use_image_factory_ami && local.image_factory_ami_id != null ? local.image_factory_ami_id : local.default_fallback_ami_id)
  oscal_ami_id_ok = local.oscal_ami_id != null && local.oscal_ami_id != ""

  # Extra gp3 volumes + /opt/oscal mount (direct-run only); Docker mode uses root only.
  oscal_persistent_ebs = !var.run_oscal_via_docker && var.oscal_persistent_ebs_enabled

  oscal_mount_snippet_green = local.oscal_persistent_ebs ? templatefile("${path.module}/templates/oscal-persistent-volume-mount.sh.tftpl", {
    oscal_role = "green"
    stack_name = var.project_name
    aws_region = var.aws_region
  }) : ""

  oscal_mount_snippet_blue = local.oscal_persistent_ebs ? templatefile("${path.module}/templates/oscal-persistent-volume-mount.sh.tftpl", {
    oscal_role = "blue"
    stack_name = var.project_name
    aws_region = var.aws_region
  }) : ""

  # SSM optional release sync (prefix inside logs bucket; trimmed for IAM and scripts)
  oscal_ssm_release_s3_prefix_trimmed = var.oscal_ssm_release_s3_prefix != null ? trimsuffix(trimprefix(var.oscal_ssm_release_s3_prefix, "/"), "/") : ""
  oscal_ssm_release_s3_read           = local.oscal_ssm_release_s3_prefix_trimmed != ""

  secrets_bootstrap_fragment = var.oscal_pass_secrets_sync_enabled ? templatefile("${path.module}/templates/oscal-secrets-bootstrap.sh.tftpl", {
    sm_arn     = aws_secretsmanager_secret.oscal_pass_sync[0].arn
    aws_region = var.aws_region
  }) : ""

  first_boot_install_fragment = !var.run_oscal_via_docker ? templatefile("${path.module}/templates/oscal-first-boot-install.sh.tftpl", {
    s3_bucket        = aws_s3_bucket.logs.id
    installer_prefix = "installer"
    aws_region       = var.aws_region
  }) : ""
}

locals {
  rds_bootstrap_fragment = var.create_rds_postgres ? templatefile("${path.module}/templates/oscal-rds-bootstrap.sh.tftpl", {
    aws_region        = var.aws_region
    rds_address       = aws_db_instance.oscal[0].address
    rds_port          = tostring(aws_db_instance.oscal[0].port)
    db_name           = var.rds_database_name
    admin_username   = var.rds_admin_username
    iam_db_username   = var.rds_iam_app_username
    master_secret_arn = aws_db_instance.oscal[0].master_user_secret[0].secret_arn
  }) : ""
}

# User data: either Docker/podman (run_oscal_via_docker = true) or direct run with local EBS data (default). RHEL only.
# Direct run: Node 20, config/users on EBS at /opt/oscal/data; ec2_automation backs up to S3 every 10 min (no S3 mount).
locals {
  # --- Docker/podman user_data (when run_oscal_via_docker = true) ---
  oscal_user_data_green_docker = <<-EOT
#!/bin/bash
set -e
dnf install -y curl podman
systemctl enable --now podman.socket
podman pull ghcr.io/adobemanagedservices/oscal-report-generator:latest
podman run -d --name oscal --restart unless-stopped -p ${var.oscal_app_port}:3020 -e NODE_ENV=production ghcr.io/adobemanagedservices/oscal-report-generator:latest
EOT
  oscal_user_data_blue_docker  = <<-EOT
#!/bin/bash
set -e
dnf install -y curl podman
systemctl enable --now podman.socket
podman pull ghcr.io/adobemanagedservices/oscal-report-generator:latest
podman run -d --name oscal --restart unless-stopped -p ${var.oscal_app_port}:3020 -e NODE_ENV=production ghcr.io/adobemanagedservices/oscal-report-generator:latest
EOT
  # --- Direct-run user_data (when run_oscal_via_docker = false): Node 20, local EBS data, systemd (RHEL), service account svc_ams-oscal ---
  oscal_direct_user_data_green = <<-EOT
#!/bin/bash
set -e
${local.oscal_mount_snippet_green}
PORT="${var.oscal_app_port}"
DATA_DIR="/opt/oscal/data"
SVC_USER="svc_ams-oscal"
SVC_GROUP="oscal"
SVC_HOME="/var/lib/svc_ams-oscal"

# Start SSM agent so Session Manager works (instance role has AmazonSSMManagedInstanceCore)
systemctl start amazon-ssm-agent 2>/dev/null || true
systemctl enable amazon-ssm-agent 2>/dev/null || true

# Service account for OSCAL (app and cron run as this user, not root)
getent group $SVC_GROUP >/dev/null 2>&1 || groupadd -r $SVC_GROUP
id $SVC_USER >/dev/null 2>&1 || useradd -r -s /bin/bash -g $SVC_GROUP -d $SVC_HOME -m -c "OSCAL service account" $SVC_USER
chmod 700 $SVC_HOME 2>/dev/null || true
usermod -aG $SVC_GROUP ec2-user 2>/dev/null || true

dnf install -y --allowerasing curl git cronie rsync
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs

systemctl enable crond --now 2>/dev/null || true

mkdir -p /opt/oscal /opt/oscal/app $DATA_DIR
chown -R ec2-user:$SVC_GROUP /opt/oscal
chmod -R g+rX,g+w /opt/oscal

cat > /etc/systemd/system/oscal-reporter.service << 'SVC'
[Unit]
Description=OSCAL Report Generator (Green)
After=network-online.target

[Service]
Type=simple
User=SVC_USER_PLACEHOLDER
Group=SVC_GROUP_PLACEHOLDER
WorkingDirectory=/opt/oscal/app/backend
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=PORT_PLACEHOLDER
Environment=CONFIG_PATH=DATA_DIR_PLACEHOLDER/config.json
Environment=USERS_PATH=DATA_DIR_PLACEHOLDER/users.json
SM_ENV_PLACEHOLDER

[Install]
WantedBy=multi-user.target
SVC
sed -i "s|PORT_PLACEHOLDER|$PORT|g; s|DATA_DIR_PLACEHOLDER|$DATA_DIR|g; s|SVC_USER_PLACEHOLDER|$SVC_USER|g; s|SVC_GROUP_PLACEHOLDER|$SVC_GROUP|g" /etc/systemd/system/oscal-reporter.service
sed -i "/Environment=USERS_PATH=/a Environment=AWS_REGION=${var.aws_region}" /etc/systemd/system/oscal-reporter.service
sed -i '/^SM_ENV_PLACEHOLDER$/d' /etc/systemd/system/oscal-reporter.service 2>/dev/null || true
${var.oscal_pass_secrets_sync_enabled ? "sed -i \"/Environment=USERS_PATH=/a Environment=OSCAL_SECRETS_MODE=aws-sm\" /etc/systemd/system/oscal-reporter.service\nsed -i \"/Environment=OSCAL_SECRETS_MODE=/a Environment=OSCAL_SECRETS_MANAGER_ARN=${aws_secretsmanager_secret.oscal_pass_sync[0].arn}\" /etc/systemd/system/oscal-reporter.service" : "# SM env skipped (oscal_pass_secrets_sync_enabled=false)"}

${local.secrets_bootstrap_fragment}

${local.rds_bootstrap_fragment}

${local.bedrock_bootstrap_fragment}

${local.first_boot_install_fragment}

systemctl daemon-reload
systemctl enable oscal-reporter.service
systemctl start oscal-reporter.service
EOT

  oscal_direct_user_data_blue = <<-EOT
#!/bin/bash
set -e
${local.oscal_mount_snippet_blue}
PORT="${var.oscal_app_port}"
DATA_DIR="/opt/oscal/data"
SVC_USER="svc_ams-oscal"
SVC_GROUP="oscal"
SVC_HOME="/var/lib/svc_ams-oscal"

# Start SSM agent so Session Manager works (instance role has AmazonSSMManagedInstanceCore)
systemctl start amazon-ssm-agent 2>/dev/null || true
systemctl enable amazon-ssm-agent 2>/dev/null || true

# Service account for OSCAL (app and cron run as this user, not root)
getent group $SVC_GROUP >/dev/null 2>&1 || groupadd -r $SVC_GROUP
id $SVC_USER >/dev/null 2>&1 || useradd -r -s /bin/bash -g $SVC_GROUP -d $SVC_HOME -m -c "OSCAL service account" $SVC_USER
chmod 700 $SVC_HOME 2>/dev/null || true
usermod -aG $SVC_GROUP ec2-user 2>/dev/null || true

dnf install -y --allowerasing curl git cronie rsync
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs
dnf install -y epel-release || true

systemctl enable crond --now 2>/dev/null || true

mkdir -p /opt/oscal /opt/oscal/app $DATA_DIR
chown -R ec2-user:$SVC_GROUP /opt/oscal
chmod -R g+rX,g+w /opt/oscal

cat > /etc/systemd/system/oscal-reporter.service << 'SVC'
[Unit]
Description=OSCAL Report Generator (Blue)
After=network-online.target

[Service]
Type=simple
User=SVC_USER_PLACEHOLDER
Group=SVC_GROUP_PLACEHOLDER
WorkingDirectory=/opt/oscal/app/backend
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=PORT_PLACEHOLDER
Environment=CONFIG_PATH=DATA_DIR_PLACEHOLDER/config.json
Environment=USERS_PATH=DATA_DIR_PLACEHOLDER/users.json
SM_ENV_PLACEHOLDER

[Install]
WantedBy=multi-user.target
SVC
sed -i "s|PORT_PLACEHOLDER|$PORT|g; s|DATA_DIR_PLACEHOLDER|$DATA_DIR|g; s|SVC_USER_PLACEHOLDER|$SVC_USER|g; s|SVC_GROUP_PLACEHOLDER|$SVC_GROUP|g" /etc/systemd/system/oscal-reporter.service
sed -i "/Environment=USERS_PATH=/a Environment=AWS_REGION=${var.aws_region}" /etc/systemd/system/oscal-reporter.service
sed -i '/^SM_ENV_PLACEHOLDER$/d' /etc/systemd/system/oscal-reporter.service 2>/dev/null || true
${var.oscal_pass_secrets_sync_enabled ? "sed -i \"/Environment=USERS_PATH=/a Environment=OSCAL_SECRETS_MODE=aws-sm\" /etc/systemd/system/oscal-reporter.service\nsed -i \"/Environment=OSCAL_SECRETS_MODE=/a Environment=OSCAL_SECRETS_MANAGER_ARN=${aws_secretsmanager_secret.oscal_pass_sync[0].arn}\" /etc/systemd/system/oscal-reporter.service" : "# SM env skipped (oscal_pass_secrets_sync_enabled=false)"}

${local.secrets_bootstrap_fragment}

${local.rds_bootstrap_fragment}

${local.bedrock_bootstrap_fragment}

${local.first_boot_install_fragment}

systemctl daemon-reload
systemctl enable oscal-reporter.service
systemctl start oscal-reporter.service
EOT

  # RHEL only (dnf/podman)
  oscal_user_data_green = var.run_oscal_via_docker ? local.oscal_user_data_green_docker : local.oscal_direct_user_data_green
  oscal_user_data_blue  = var.run_oscal_via_docker ? local.oscal_user_data_blue_docker : local.oscal_direct_user_data_blue
}

# EC2 instances and ALB attachments are defined in oscal_asg_ebs.tf (Auto Scaling + Launch Template + persistent EBS).
