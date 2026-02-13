# OSCAL Green and Blue instances (always on), ports 3019 and 3020
# Only lookup Ubuntu AMI when not using RHEL9 (use_rhel9 + Image Factory AMI = RHEL9; no Ubuntu lookup)

data "aws_ami" "oscal" {
  count       = var.oscal_ami_id == null && (!var.use_rhel9 || local.image_factory_ami_id == null) ? 1 : 0
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
  oscal_ami_id = var.oscal_ami_id != null ? var.oscal_ami_id : (var.use_rhel9 && local.image_factory_ami_id != null ? local.image_factory_ami_id : data.aws_ami.oscal[0].id)
}

# User data: either Docker/podman (run_oscal_via_docker = true) or direct run + S3 mount (default)
# Direct run: Node 20, s3fs mount of config/green or config/blue to /opt/oscal/data, systemd app unit
locals {
  s3_bucket_name = aws_s3_bucket.logs.id

  # --- Docker user_data (when run_oscal_via_docker = true) ---
  oscal_user_data_green_ubuntu = <<-EOT
#!/bin/bash
set -e
apt-get update && apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io
docker pull ghcr.io/adobemanagedservices/oscal-report-generator:latest
docker run -d --name oscal --restart unless-stopped -p 3019:3020 -e NODE_ENV=production ghcr.io/adobemanagedservices/oscal-report-generator:latest
EOT
  oscal_user_data_blue_ubuntu = <<-EOT
#!/bin/bash
set -e
apt-get update && apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io
docker pull ghcr.io/adobemanagedservices/oscal-report-generator:latest
docker run -d --name oscal --restart unless-stopped -p 3020:3020 -e NODE_ENV=production ghcr.io/adobemanagedservices/oscal-report-generator:latest
EOT
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
  # --- Direct-run user_data (when run_oscal_via_docker = false): Node 20, s3fs, systemd ---
  oscal_direct_user_data_green_ubuntu = <<-EOT
#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive
BUCKET="${local.s3_bucket_name}"
PREFIX="/config/green"
PORT="3019"
MOUNT_POINT="/opt/oscal/data"
APP_USER="ubuntu"

apt-get update
apt-get install -y ca-certificates curl git

# Node.js 20 (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# s3fs for S3 mount
apt-get install -y s3fs
sed -i 's/^#*user_allow_other/user_allow_other/' /etc/fuse.conf || echo 'user_allow_other' >> /etc/fuse.conf

mkdir -p /opt/oscal
mkdir -p /opt/oscal/app
mkdir -p $MOUNT_POINT
chown -R ubuntu:ubuntu /opt/oscal

# Systemd oneshot: mount S3 config prefix to /opt/oscal/data (IAM instance profile)
cat > /etc/systemd/system/oscal-data-mount.service << 'SVC'
[Unit]
Description=Mount S3 config/users for OSCAL (Green)
After=network-online.target
Before=oscal-reporter.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/bin/s3fs BUCKET_PLACEHOLDER:PREFIX_PLACEHOLDER MOUNT_POINT_PLACEHOLDER -o use_cache=/tmp/s3fs,iam_role=auto,allow_other,uid=1000,gid=1000
ExecStop=/bin/umount MOUNT_POINT_PLACEHOLDER

[Install]
WantedBy=multi-user.target
SVC
sed -i "s|BUCKET_PLACEHOLDER|$BUCKET|g; s|PREFIX_PLACEHOLDER|$PREFIX|g; s|MOUNT_POINT_PLACEHOLDER|$MOUNT_POINT|g" /etc/systemd/system/oscal-data-mount.service

# Systemd app service (starts after deploy script populates /opt/oscal/app)
cat > /etc/systemd/system/oscal-reporter.service << SVC
[Unit]
Description=OSCAL Report Generator (Green)
After=network-online.target oscal-data-mount.service
Requires=oscal-data-mount.service

[Service]
Type=simple
WorkingDirectory=/opt/oscal/app/backend
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=$PORT
Environment=CONFIG_PATH=$MOUNT_POINT/config.json
Environment=USERS_PATH=$MOUNT_POINT/users.json

[Install]
WantedBy=multi-user.target
SVC

systemctl daemon-reload
systemctl enable oscal-data-mount.service
systemctl enable oscal-reporter.service
systemctl start oscal-data-mount.service
EOT

  oscal_direct_user_data_blue_ubuntu = <<-EOT
#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive
BUCKET="${local.s3_bucket_name}"
PREFIX="/config/blue"
PORT="3020"
MOUNT_POINT="/opt/oscal/data"

apt-get update
apt-get install -y ca-certificates curl git

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
apt-get install -y s3fs
sed -i 's/^#*user_allow_other/user_allow_other/' /etc/fuse.conf || echo 'user_allow_other' >> /etc/fuse.conf

mkdir -p /opt/oscal
mkdir -p /opt/oscal/app
mkdir -p $MOUNT_POINT
chown -R ubuntu:ubuntu /opt/oscal

cat > /etc/systemd/system/oscal-data-mount.service << 'SVC'
[Unit]
Description=Mount S3 config/users for OSCAL (Blue)
After=network-online.target
Before=oscal-reporter.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/bin/s3fs BUCKET_PLACEHOLDER:PREFIX_PLACEHOLDER MOUNT_POINT_PLACEHOLDER -o use_cache=/tmp/s3fs,iam_role=auto,allow_other,uid=1000,gid=1000
ExecStop=/bin/umount MOUNT_POINT_PLACEHOLDER

[Install]
WantedBy=multi-user.target
SVC
sed -i "s|BUCKET_PLACEHOLDER|$BUCKET|g; s|PREFIX_PLACEHOLDER|$PREFIX|g; s|MOUNT_POINT_PLACEHOLDER|$MOUNT_POINT|g" /etc/systemd/system/oscal-data-mount.service

cat > /etc/systemd/system/oscal-reporter.service << SVC
[Unit]
Description=OSCAL Report Generator (Blue)
After=network-online.target oscal-data-mount.service
Requires=oscal-data-mount.service

[Service]
Type=simple
WorkingDirectory=/opt/oscal/app/backend
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=$PORT
Environment=CONFIG_PATH=$MOUNT_POINT/config.json
Environment=USERS_PATH=$MOUNT_POINT/users.json

[Install]
WantedBy=multi-user.target
SVC

systemctl daemon-reload
systemctl enable oscal-data-mount.service
systemctl enable oscal-reporter.service
systemctl start oscal-data-mount.service
EOT

  # RHEL9 direct-run (dnf, node from NodeSource or dnf, s3fs from EPEL or build)
  oscal_direct_user_data_green_rhel9 = <<-EOT
#!/bin/bash
set -e
BUCKET="${local.s3_bucket_name}"
PREFIX="/config/green"
PORT="3019"
MOUNT_POINT="/opt/oscal/data"

dnf install -y curl git
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs

# s3fs: EPEL or build from source
dnf install -y epel-release || true
dnf install -y s3fs-fuse || yum install -y s3fs-fuse || (dnf install -y gcc-c++ fuse fuse-devel libcurl-devel libxml2-devel openssl-devel && cd /tmp && git clone https://github.com/s3fs-fuse/s3fs-fuse.git && cd s3fs-fuse && ./autogen.sh && ./configure && make && make install)
# Required for s3fs allow_other so app can read mount
grep -q '^user_allow_other' /etc/fuse.conf || echo 'user_allow_other' >> /etc/fuse.conf

mkdir -p /opt/oscal /opt/oscal/app $MOUNT_POINT
chown -R ec2-user:ec2-user /opt/oscal

cat > /etc/systemd/system/oscal-data-mount.service << 'SVC'
[Unit]
Description=Mount S3 config/users for OSCAL (Green)
After=network-online.target
Before=oscal-reporter.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/bin/s3fs BUCKET_PLACEHOLDER:PREFIX_PLACEHOLDER MOUNT_POINT_PLACEHOLDER -o use_cache=/tmp/s3fs,iam_role=auto,allow_other,uid=1000,gid=1000
ExecStop=/bin/umount MOUNT_POINT_PLACEHOLDER

[Install]
WantedBy=multi-user.target
SVC
sed -i "s|BUCKET_PLACEHOLDER|$BUCKET|g; s|PREFIX_PLACEHOLDER|$PREFIX|g; s|MOUNT_POINT_PLACEHOLDER|$MOUNT_POINT|g" /etc/systemd/system/oscal-data-mount.service

cat > /etc/systemd/system/oscal-reporter.service << SVC
[Unit]
Description=OSCAL Report Generator (Green)
After=network-online.target oscal-data-mount.service
Requires=oscal-data-mount.service

[Service]
Type=simple
WorkingDirectory=/opt/oscal/app/backend
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=$PORT
Environment=CONFIG_PATH=$MOUNT_POINT/config.json
Environment=USERS_PATH=$MOUNT_POINT/users.json

[Install]
WantedBy=multi-user.target
SVC

systemctl daemon-reload
systemctl enable oscal-data-mount.service
systemctl enable oscal-reporter.service
systemctl start oscal-data-mount.service
EOT

  oscal_direct_user_data_blue_rhel9 = <<-EOT
#!/bin/bash
set -e
BUCKET="${local.s3_bucket_name}"
PREFIX="/config/blue"
PORT="3020"
MOUNT_POINT="/opt/oscal/data"

dnf install -y curl git
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs
dnf install -y epel-release || true
dnf install -y s3fs-fuse || true
# Required for s3fs allow_other so app can read mount
grep -q '^user_allow_other' /etc/fuse.conf || echo 'user_allow_other' >> /etc/fuse.conf

mkdir -p /opt/oscal /opt/oscal/app $MOUNT_POINT
chown -R ec2-user:ec2-user /opt/oscal

cat > /etc/systemd/system/oscal-data-mount.service << 'SVC'
[Unit]
Description=Mount S3 config/users for OSCAL (Blue)
After=network-online.target
Before=oscal-reporter.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/bin/s3fs BUCKET_PLACEHOLDER:PREFIX_PLACEHOLDER MOUNT_POINT_PLACEHOLDER -o use_cache=/tmp/s3fs,iam_role=auto,allow_other,uid=1000,gid=1000
ExecStop=/bin/umount MOUNT_POINT_PLACEHOLDER

[Install]
WantedBy=multi-user.target
SVC
sed -i "s|BUCKET_PLACEHOLDER|$BUCKET|g; s|PREFIX_PLACEHOLDER|$PREFIX|g; s|MOUNT_POINT_PLACEHOLDER|$MOUNT_POINT|g" /etc/systemd/system/oscal-data-mount.service

cat > /etc/systemd/system/oscal-reporter.service << SVC
[Unit]
Description=OSCAL Report Generator (Blue)
After=network-online.target oscal-data-mount.service
Requires=oscal-data-mount.service

[Service]
Type=simple
WorkingDirectory=/opt/oscal/app/backend
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=$PORT
Environment=CONFIG_PATH=$MOUNT_POINT/config.json
Environment=USERS_PATH=$MOUNT_POINT/users.json

[Install]
WantedBy=multi-user.target
SVC

systemctl daemon-reload
systemctl enable oscal-data-mount.service
systemctl enable oscal-reporter.service
systemctl start oscal-data-mount.service
EOT

  # Select Docker vs direct by variable
  oscal_user_data_green = var.run_oscal_via_docker ? (var.use_rhel9 ? local.oscal_user_data_green_rhel9 : local.oscal_user_data_green_ubuntu) : (var.use_rhel9 ? local.oscal_direct_user_data_green_rhel9 : local.oscal_direct_user_data_green_ubuntu)
  oscal_user_data_blue  = var.run_oscal_via_docker ? (var.use_rhel9 ? local.oscal_user_data_blue_rhel9 : local.oscal_user_data_blue_ubuntu) : (var.use_rhel9 ? local.oscal_direct_user_data_blue_rhel9 : local.oscal_direct_user_data_blue_ubuntu)
}

resource "aws_instance" "oscal_green" {
  ami                    = local.oscal_ami_id
  instance_type          = "t3.small"
  key_name               = var.key_name
  subnet_id              = aws_subnet.public[0].id
  vpc_security_group_ids = [aws_security_group.oscal.id]
  iam_instance_profile   = aws_iam_instance_profile.oscal.name

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
  }

  user_data = base64encode(local.oscal_user_data_green)

  tags = {
    Name   = "${var.project_name}-oscal-green"
    Port   = "3019"
  }

  # Avoid "collecting instance settings: empty result" when replacing (create new before destroying old)
  lifecycle {
    create_before_destroy = true
  }

  depends_on = [aws_iam_instance_profile.oscal]
}

resource "aws_instance" "oscal_blue" {
  ami                    = local.oscal_ami_id
  instance_type          = "t3.small"
  key_name               = var.key_name
  subnet_id              = aws_subnet.public[1].id
  vpc_security_group_ids = [aws_security_group.oscal.id]
  iam_instance_profile   = aws_iam_instance_profile.oscal.name

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
  }

  user_data = base64encode(local.oscal_user_data_blue)

  tags = {
    Name   = "${var.project_name}-oscal-blue"
    Port   = "3020"
  }

  lifecycle {
    create_before_destroy = true
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
