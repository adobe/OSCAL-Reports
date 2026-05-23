#!/usr/bin/env bash
# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# Deploy OSCAL Report Generator to EC2 instances (direct run, no Docker).
# deploy_one runs dnf upgrade -y or yum update -y on the instance first, then application steps (S3 sync, npm build, etc.).
# Default / --blue / --both / --*-only: each instance runs aws s3 sync from s3://<bucket>/installer/ (no upload from this laptop).
# Use --update-s3 to upload this repo to installer/ (same excludes as legacy rsync), then exit without SSH. After that, a normal deploy
# pulls that snapshot into /opt/oscal/app, npm install/build, copies scripts from the synced tree to /opt/oscal/scripts, restarts oscal-reporter.
# Config and users live on EBS at /opt/oscal/data; ec2_automation backs up to S3 every 10 min (no S3 mount). logs/ in the bucket is for
# runtime log backup (logs/green, logs/blue), not application code—installer/ holds deployable bits.
# Reliability: On each instance, ec2-user runs aws s3 sync; files previously owned by svc_ams-oscal could not be overwritten without
# chown ec2-user:oscal on /opt/oscal/app first (see INSTALLERSYNC). Default deploy updates GREEN only—use --both or --blue so Blue pulls
# installer/ too (existing S3 objects only unless you ran --update-s3 first). Confirm bucket: terraform output -raw s3_logs_bucket_name.
# Application and cron run as service account svc_ams-oscal (not root). Pass is installed and initialized for that user for secrets.
#
# Green/Blue are Auto Scaling Group members: Terraform outputs oscal_*_public_ip / oscal_*_private_ip point at the current instance.
# After an ASG replacement, re-run this script (or use --green-only / --blue-only with the new IP from terraform output). Optional SSM
# (oscal_ssm_release_s3_prefix) can sync prebuilt artifacts from S3 on a schedule; it does not replace this script for full builds.
#
# Prerequisites: Terraform applied with run_oscal_via_docker = false; SSH key in Pass or file; Terraform outputs readable (run-with-aws-pass.sh).
# For --update-s3 only: AWS CLI + Pass (or env) with operator IAM s3:PutObject, s3:DeleteObject, s3:ListBucket on s3://<logs-bucket>/installer/*.
# Instances use their IAM role to read installer/* (no laptop upload on a normal deploy).
#
# Usage:
#   ./scripts/deploy-to-ec2.sh              # Deploy green only: EC2 pulls existing s3://<bucket>/installer/ (no laptop upload)
#   ./scripts/deploy-to-ec2.sh --update-s3  # Upload this repo to installer/ only; no SSH / no EC2 deploy (alias: -updateS3)
#   ./scripts/deploy-to-ec2.sh --both       # Deploy to both green and blue
#   ./scripts/deploy-to-ec2.sh --blue       # Deploy to blue only
#   ./scripts/deploy-to-ec2.sh --green-only 1.2.3.4   # Deploy to green at given IP
#   ./scripts/deploy-to-ec2.sh --blue-only 5.6.7.8    # Deploy to blue at given IP
#   SSH_KEY_FILE=/path/to/key.pem ./scripts/deploy-to-ec2.sh
#
# Blue vs Green: Only PORT differs (Blue=3020, Green=3019). Same unit file, S3 prefix (config/blue vs config/green),
# and ec2_automation.env DEPLOYMENT_ROLE. If Blue fails to start, check journalctl (shown on health failure);
# common causes: bad config/users, missing pass vault, or wrong PORT in unit (script now forces PORT per role).
#
# Terraform: All terraform commands (output, apply) use terraform/run-with-aws-pass.sh.
#
# Environment:
#   AWS_PASS_ENTRY       Pass entry for AWS credentials (default: AWS/AMS_4403-STG for aws4403).
#   AWS_PASS_SSH_ENTRY   Pass entry for SSH key (default: AWS/OSCAL-AWS4403-SSH).
#   SSH_KEY_FILE         If set, use this key file instead of Pass
#   SSH_USER             SSH user: ec2-user (RHEL). Default: ec2-user
#   TERRAFORM_DIR        Terraform env dir (default: terraform/envs/aws4403). Override if your state lives elsewhere.
#   DEPLOY_BLUE_AUTO_UPDATE  Default 1: Blue gets the same ec2_automation cron as Green (S3 backup + Pass/SM sync + optional S3 installer sync). Set 0 for Blue manual-only (no cron).
#   DEPLOY_ENABLE_S3_INSTALLER_UPDATE  Default 1: ec2_automation.env gets ENABLE_S3_INSTALLER_UPDATE=true so cron can sync app from s3://<bucket>/installer/ every S3_CODE_UPDATE_EVERY_N_CYCLES runs (default 100 ≈ 1000 min). Set 0 to disable scheduled code sync (S3 backup still runs).
#   PASS_SECRETS_SYNC_MIN_INTERVAL_SECONDS  Optional; default 21600 (4 runs/day) written to ec2_automation.env.
#   S3_CODE_UPDATE_EVERY_N_CYCLES  Optional; default 100 written to ec2_automation.env (installer sync every N ec2_automation cron runs).
#   DEPLOY_ENABLE_OS_PACKAGE_UPDATE  Set to 1 so ec2_automation.env gets ENABLE_OS_PACKAGE_UPDATE=true (dnf upgrade -y or yum update -y from configured repos, throttled). Default 0.
#   OS_PACKAGE_UPDATE_EVERY_N_CYCLES  Optional; default 144 written to ec2_automation.env (OS update at most once per N cron runs ≈ 24h at 10-min cron).
#   DEPLOY_RDS_BOOTSTRAP_SKIP   Set to 1 to skip copying/running scripts/lib/rds-bootstrap-on-instance.sh (default: run when Terraform has RDS).
#   DEPLOY_RDS_BOOTSTRAP_FORCE  Set to 1 to remove /opt/oscal/data/.rds-bootstrap-done on the instance and re-run SQL grants (use rarely).
#   DEPLOY_LOCAL_CONFIG_SEED    Set to 1 to allow copying config/app/*.json from the laptop when S3 config/<role>/ restore failed (default: off).

set -e

# Service account for OSCAL app and cron (not root). Pass vault at $SVC_HOME/.password-store for tokens/credentials.
# To add a secret on instance: sudo -u svc_ams-oscal pass insert OSCAL/entry-name
SVC_USER="svc_ams-oscal"
SVC_GROUP="oscal"
SVC_HOME="/var/lib/svc_ams-oscal"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC}  $1"; }
print_info() { echo -e "${CYAN}ℹ${NC}  $1"; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Default to aws4403.
TERRAFORM_DIR="${TERRAFORM_DIR:-$REPO_ROOT/terraform/envs/aws4403}"
export TERRAFORM_DIR
SSH_USER="${SSH_USER:-ec2-user}"
PASS_ENTRY="${AWS_PASS_SSH_ENTRY:-AWS/OSCAL-AWS4403-SSH}"
REMOTE_APP="/opt/oscal/app"
# S3 prefix for deployable repo snapshot (Terraform: aws_s3_object folder_installer; IAM: installer/* read on instances).
INSTALLER_PREFIX="installer"

# Excludes for aws s3 sync (local→installer/ when using --update-s3, and S3→EC2); align with former rsync excludes in deploy_one.
# Keep in sync with .deployignore where practical (AWS CLI has no negated patterns like !README.md).
DEPLOY_S3_SYNC_EXCLUDES=(
  'node_modules/**'
  '.git/**'
  '.cursor/**'
  '.githooks/**'
  '.validation/**'
  '.github/**'
  'config/**'
  'terraform/**'
  'test_cases/**'
  'docs/**'
  'credentials.txt'
  'logs/**'
  'data/debug-state/**'
  'data/jobs/**'
  'scripts/bump_version.sh'
  'docker-compose.yml'
  'docker-entrypoint.sh'
  'Dockerfile'
  'scripts/setup-git-hooks.sh'
  'scripts/switch-github-account.sh'
  'backend/node_modules/**'
  'frontend/node_modules/**'
  'frontend/dist/**'
  'backend/public/**'
  '*.log'
)

# Load AWS credentials from Pass (same entry shape as terraform/run-with-aws-pass.sh). For S3 upload from laptop.
load_deploy_aws_credentials() {
  local entry="${AWS_PASS_ENTRY:-AWS/AMS_4403-STG}"
  if ! command -v pass >/dev/null 2>&1; then
    print_error "pass(1) is required to read AWS credentials from $entry (same as terraform/run-with-aws-pass.sh)."
    return 1
  fi
  if ! pass show "$entry" >/dev/null 2>&1; then
    print_error "Cannot read Pass entry $entry for AWS credentials."
    return 1
  fi
  local line key val
  while IFS= read -r line; do
    if [[ $line =~ ^(aws_[a-z_]+)=(.*)$ ]]; then
      key="${BASH_REMATCH[1]}"
      val="${BASH_REMATCH[2]}"
      case "$key" in
        aws_access_key_id)     export AWS_ACCESS_KEY_ID="$val" ;;
        aws_secret_access_key) export AWS_SECRET_ACCESS_KEY="$val" ;;
        aws_session_token)     export AWS_SESSION_TOKEN="$val" ;;
      esac
    fi
  done < <(pass show "$entry")
  if ! command -v aws >/dev/null 2>&1; then
    print_error "AWS CLI (aws) is required for s3 sync."
    return 1
  fi
  if ! aws sts get-caller-identity >/dev/null 2>&1; then
    print_error "AWS credentials from Pass entry '$entry' failed STS check (see terraform/run-with-aws-pass.sh)."
    return 1
  fi
  return 0
}

# Upload repo root to s3://bucket/installer/ (requires load_deploy_aws_credentials and AWS CLI).
sync_repo_to_s3_installer() {
  local bucket="$1"
  local region="$2"
  local x
  local -a exargs=()
  print_info "Syncing repo to s3://${bucket}/${INSTALLER_PREFIX}/ (region ${region})..."
  for x in "${DEPLOY_S3_SYNC_EXCLUDES[@]}"; do
    exargs+=(--exclude "$x")
  done
  aws s3 sync "$REPO_ROOT/" "s3://${bucket}/${INSTALLER_PREFIX}/" --region "$region" --delete "${exargs[@]}"
  write_installer_manifest_to_s3 "$bucket" "$region"
  print_success "Uploaded repo to s3://${bucket}/${INSTALLER_PREFIX}/"
}

# Write s3://bucket/installer/.installer-build.json after laptop→S3 sync (git SHA, time, version) for post-sync verification on EC2.
write_installer_manifest_to_s3() {
  local bucket="$1"
  local region="$2"
  local tmp sha ts pkg_ver
  tmp=$(mktemp)
  sha=$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo "unknown")
  ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  pkg_ver="unknown"
  if [ -f "$REPO_ROOT/package.json" ] && command -v jq >/dev/null 2>&1; then
    pkg_ver=$(jq -r '.version // "unknown"' "$REPO_ROOT/package.json" 2>/dev/null || echo "unknown")
  elif [ -f "$REPO_ROOT/package.json" ]; then
    pkg_ver=$(grep -m1 '"version"' "$REPO_ROOT/package.json" | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' || echo "unknown")
  fi
  if command -v jq >/dev/null 2>&1; then
    jq -n \
      --arg sha "$sha" \
      --arg ts "$ts" \
      --arg ver "$pkg_ver" \
      '{git_sha: $sha, built_at: $ts, package_version: $ver, installer_schema: 1}' > "$tmp"
  else
    printf '{"git_sha":"%s","built_at":"%s","package_version":"%s","installer_schema":1}\n' "$sha" "$ts" "$pkg_ver" > "$tmp"
  fi
  aws s3 cp "$tmp" "s3://${bucket}/${INSTALLER_PREFIX}/.installer-build.json" --region "$region"
  rm -f "$tmp"
  print_info "Wrote s3://${bucket}/${INSTALLER_PREFIX}/.installer-build.json for instance-side verify after pull."
}

# Resolve SSH key into SSH_KEY (from file or from Pass). Call from main; do not use in subshell.
# When the key is a temp file from Pass, SSH_KEY_IS_TEMP=1 so EXIT cleanup can remove it (trap set after DEPLOY_RESULTS_FILE).
resolve_ssh_key() {
  SSH_KEY_IS_TEMP=0
  if [ -n "$SSH_KEY_FILE" ] && [ -f "$SSH_KEY_FILE" ]; then
    SSH_KEY="$SSH_KEY_FILE"
    return
  fi
  if command -v pass >/dev/null 2>&1 && pass show "$PASS_ENTRY" >/dev/null 2>&1; then
    SSH_KEY=$(mktemp)
    SSH_KEY_IS_TEMP=1
    pass show "$PASS_ENTRY" > "$SSH_KEY"
    chmod 600 "$SSH_KEY"
    return
  fi
  print_error "Set SSH_KEY_FILE or have Pass entry $PASS_ENTRY"
  exit 1
}

# Run Terraform via wrapper (loads AWS creds from Pass). Uses TERRAFORM_DIR so correct state is read.
tf_output() {
  [ -x "$REPO_ROOT/terraform/run-with-aws-pass.sh" ] || return 1
  TERRAFORM_DIR="$TERRAFORM_DIR" "$REPO_ROOT/terraform/run-with-aws-pass.sh" output "$@" 2>/dev/null
}

# Get S3 bucket name from Terraform output (for ec2_automation.env on instances)
get_s3_bucket() {
  local tfdir="$1"
  if [ ! -d "$tfdir" ] || [ ! -f "$tfdir/terraform.tfstate" ]; then
    return 1
  fi
  tf_output -raw s3_logs_bucket_name || return 1
}

# Secrets Manager ARN for Pass vault bundle sync (ec2_automation); empty if not in state or disabled in TF.
get_pass_sync_secret_arn() {
  local tfdir="$1"
  if [ ! -d "$tfdir" ] || [ ! -f "$tfdir/terraform.tfstate" ]; then
    return 1
  fi
  tf_output -raw oscal_pass_secrets_sync_secret_arn 2>/dev/null || return 1
}

# Get instance IPs from Terraform output (optional)
get_terraform_ips() {
  local tfdir="$1"
  if [ ! -d "$tfdir" ] || [ ! -f "$tfdir/terraform.tfstate" ]; then
    return 1
  fi
  local green blue
  green=$(tf_output -raw oscal_green_public_ip 2>/dev/null || tf_output -raw oscal_green_private_ip 2>/dev/null || true)
  blue=$(tf_output -raw oscal_blue_public_ip 2>/dev/null || tf_output -raw oscal_blue_private_ip 2>/dev/null || true)
  if [ -n "$green" ] && [ -n "$blue" ]; then
    echo "$green $blue"
    return 0
  fi
  return 1
}

# When Terraform defines RDS (rds_endpoint + rds_admin_secret_arn), ensure IAM DB user, marker, and systemd
# drop-in 50-oscal-rds-env.conf match current outputs. Fixes instances that predated RDS or missed user_data.
maybe_apply_rds_bootstrap() {
  local ip="$1"
  local key="$2"
  [ "${DEPLOY_RDS_BOOTSTRAP_SKIP:-0}" = "1" ] && return 0

  local rds_host rds_port rds_db admin_user secret_arn iam_user aws_reg force
  rds_host=$(tf_output -raw rds_endpoint 2>/dev/null || true)
  rds_host=$(printf '%s' "$rds_host" | tr -d '\r\n')
  secret_arn=$(tf_output -raw rds_admin_secret_arn 2>/dev/null || true)
  secret_arn=$(printf '%s' "$secret_arn" | tr -d '\r\n')
  if [ -z "$rds_host" ] || [ "$rds_host" = "null" ] || [ -z "$secret_arn" ] || [ "$secret_arn" = "null" ]; then
    return 0
  fi

  rds_port=$(tf_output -raw rds_port 2>/dev/null || true)
  rds_port=$(printf '%s' "$rds_port" | tr -d '\r\n')
  if [ -z "$rds_port" ] || [ "$rds_port" = "null" ]; then
    rds_port="5432"
  fi

  rds_db=$(tf_output -raw rds_database_name 2>/dev/null || true)
  rds_db=$(printf '%s' "$rds_db" | tr -d '\r\n')
  if [ -z "$rds_db" ] || [ "$rds_db" = "null" ]; then
    print_warning "RDS outputs present but rds_database_name is empty; skipping RDS bootstrap."
    return 0
  fi

  admin_user=$(tf_output -raw rds_admin_username 2>/dev/null || true)
  admin_user=$(printf '%s' "$admin_user" | tr -d '\r\n')
  if [ -z "$admin_user" ] || [ "$admin_user" = "null" ]; then
    admin_user="oscalmaster"
  fi

  iam_user=$(tf_output -raw rds_iam_app_username 2>/dev/null || true)
  iam_user=$(printf '%s' "$iam_user" | tr -d '\r\n')
  if [ -z "$iam_user" ] || [ "$iam_user" = "null" ]; then
    iam_user="oscal_app"
  fi

  aws_reg=$(tf_output -raw aws_region 2>/dev/null || true)
  aws_reg=$(printf '%s' "$aws_reg" | tr -d '\r\n')
  if [ -z "$aws_reg" ] || [ "$aws_reg" = "null" ]; then
    aws_reg="${AWS_DEFAULT_REGION:-us-east-1}"
  fi

  local script_local="$REPO_ROOT/scripts/lib/rds-bootstrap-on-instance.sh"
  if [ ! -f "$script_local" ]; then
    print_error "Missing $script_local"
    return 1
  fi

  force="false"
  if [ "${DEPLOY_RDS_BOOTSTRAP_FORCE:-0}" = "1" ]; then
    force="true"
  fi

  print_info "RDS in Terraform state: applying IAM DB user + systemd OSCAL_DATABASE_* on instance..."
  scp -i "$key" -o StrictHostKeyChecking=no -o ConnectTimeout=20 "$script_local" "${SSH_USER}@${ip}:/tmp/rds-bootstrap-on-instance.sh"

  q() { printf '%q' "$1"; }
  if ! ssh -i "$key" -o StrictHostKeyChecking=no -o ConnectTimeout=120 "${SSH_USER}@${ip}" \
    "sudo env AWS_DEFAULT_REGION=$(q "$aws_reg") RDS_HOST=$(q "$rds_host") RDS_PORT=$(q "$rds_port") DB_NAME=$(q "$rds_db") ADMIN_USER=$(q "$admin_user") SECRET_ARN=$(q "$secret_arn") IAM_USER=$(q "$iam_user") FORCE=$(q "$force") bash /tmp/rds-bootstrap-on-instance.sh"; then
    print_error "RDS bootstrap failed on ${ip}. Check IAM (Secrets Manager + rds-db:connect), SG RDS access, and terraform outputs."
    return 1
  fi
  ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "rm -f /tmp/rds-bootstrap-on-instance.sh" 2>/dev/null || true
  print_success "RDS bootstrap step completed (SQL idempotent via marker; drop-in refreshed)"
}

deploy_one() {
  local ip="$1"
  local role="$2"
  local key="$3"
  local s3_bucket="$4"
  local results_file="${5:-}"
  local port
  [ "$role" = "green" ] && port="3019" || port="3020"
  print_info "Deploying to $role at $ip (port $port)..."

  # Refresh installed OS packages from configured repos before app sync/build (AL2023: dnf; else yum). Deploy aborts if this fails.
  print_info "Updating OS packages on instance (dnf upgrade -y or yum update -y) before application deploy..."
  if ! ssh -i "$key" -o StrictHostKeyChecking=no -o ConnectTimeout=30 -o ServerAliveInterval=60 -o ServerAliveCountMax=120 "${SSH_USER}@${ip}" \
    'set -eo pipefail
     export PATH="/usr/local/bin:/usr/bin:/bin"
     if command -v dnf >/dev/null 2>&1; then
       sudo dnf upgrade -y
     elif command -v yum >/dev/null 2>&1; then
       sudo yum update -y
     else
       echo "Neither dnf nor yum found; cannot update OS packages." >&2
       exit 1
     fi'; then
    print_error "OS package update failed on ${role} at ${ip} (check repos, disk, and sudo). Application deploy was not started."
    return 1
  fi

  # Ensure service account svc_ams-oscal and group oscal exist; install and initialize Pass (inline in this deploy step).
  ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" bash -s "$SSH_USER" << 'REMOTEPASS' || true
set -e
REMOTE_SSH_USER="${1:-ec2-user}"
SVC_USER="svc_ams-oscal"
SVC_GROUP="oscal"
SVC_HOME="/var/lib/svc_ams-oscal"
export PATH="/usr/local/bin:$PATH"

if ! getent group "$SVC_GROUP" >/dev/null 2>&1; then sudo groupadd -r "$SVC_GROUP"; fi
if ! id "$SVC_USER" >/dev/null 2>&1; then
  sudo useradd -r -s /bin/bash -g "$SVC_GROUP" -d "$SVC_HOME" -m -c "OSCAL service account" "$SVC_USER"
  sudo chmod 700 "$SVC_HOME"
fi
sudo usermod -aG "$SVC_GROUP" "$REMOTE_SSH_USER" 2>/dev/null || true
command -v aws >/dev/null 2>&1 || sudo dnf install -y awscli 2>/dev/null || sudo yum install -y awscli 2>/dev/null || true

# --- Install dependencies (tree, pass, gnupg2, git, make) ---
sudo dnf install -y tree 2>/dev/null || sudo yum install -y tree 2>/dev/null || true
sudo dnf install -y --allowerasing gnupg2 2>/dev/null || sudo yum install -y gnupg2 2>/dev/null || true
command -v gpg >/dev/null 2>&1 || { echo "Failed to install gpg"; exit 1; }
command -v git >/dev/null 2>&1 || sudo dnf install -y git 2>/dev/null || sudo yum install -y git 2>/dev/null || true
command -v make >/dev/null 2>&1 || sudo dnf install -y make 2>/dev/null || sudo yum install -y make 2>/dev/null || true
# Pass: package first, then from source (Amazon Linux 2023 often has no pass package)
if ! command -v pass >/dev/null 2>&1; then
  sudo dnf install -y pass 2>/dev/null || sudo yum install -y pass 2>/dev/null || true
fi
if ! command -v pass >/dev/null 2>&1; then
  TMP_PASS=$(mktemp -d)
  if git clone --depth 1 https://github.com/zx2c4/password-store.git "$TMP_PASS" 2>/dev/null; then :; elif git clone --depth 1 https://git.zx2c4.com/password-store "$TMP_PASS" 2>/dev/null; then :; else rm -rf "$TMP_PASS"; exit 1; fi
  if [ -f "$TMP_PASS/Makefile" ]; then (cd "$TMP_PASS" && sudo make install PREFIX=/usr/local); fi
  rm -rf "$TMP_PASS"
fi
command -v pass >/dev/null 2>&1 || { echo "Failed to install pass"; exit 1; }

if [ ! -d "$SVC_HOME/.password-store" ]; then
  sudo -u "$SVC_USER" env HOME="$SVC_HOME" gpg-agent --daemon 2>/dev/null || true
  # GPG Name-Real is the identity shown for the store (avoid generic "Password Store" label)
  sudo -u "$SVC_USER" env PATH="/usr/local/bin:$PATH" HOME="$SVC_HOME" gpg --batch --no-tty --yes --generate-key 2>/dev/null << 'GPGEOF'
Key-Type: RSA
Key-Length: 2048
Name-Real: OSCAL_password_store
Name-Email: oscal-password-store@localhost
Expire-Date: 0
%no-protection
%commit
GPGEOF
  KEY_ID=$(sudo -u "$SVC_USER" env HOME="$SVC_HOME" gpg --list-keys --with-colons 2>/dev/null | awk -F: '/^pub/ {print $5; exit}')
  # Run pass init from SVC_HOME so any subprocess (e.g. find) restores cwd to a dir svc_ams-oscal can access; avoids "find: Failed to restore initial working directory: /home/ec2-user: Permission denied"
  if [ -n "$KEY_ID" ]; then sudo -u "$SVC_USER" env PATH="/usr/local/bin:$PATH" HOME="$SVC_HOME" sh -c "cd \"$SVC_HOME\" && pass init \"$KEY_ID\""; fi
fi
REMOTEPASS
  # Check if pass is usable by service user (store exists and pass runs)
  if ! ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "sudo -u $SVC_USER env PATH=/usr/local/bin:/usr/bin:/bin HOME=$SVC_HOME test -d $SVC_HOME/.password-store 2>/dev/null && sudo -u $SVC_USER env PATH=/usr/local/bin:/usr/bin:/bin HOME=$SVC_HOME pass ls >/dev/null 2>&1"; then
    PASS_MISSING_ANY=1
  fi
  print_success "Service account $SVC_USER and Pass vault ensured"

  # Directory layout: /opt/oscal/app = app code only; /opt/oscal/data = config.json + users.json (canonical on EC2); /opt/oscal/scripts = ec2_automation. Repo config/ is excluded from S3 installer sync so only /opt/oscal/data is used.
  ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "sudo mkdir -p /opt/oscal/app /opt/oscal/scripts /opt/oscal/data && sudo chown -R ${SSH_USER}:${SVC_GROUP} /opt/oscal && sudo chmod -R g+rX,g+w /opt/oscal" || true

  # Prefer last backed-up config/users from S3; optional local seed only when DEPLOY_LOCAL_CONFIG_SEED=1
  if [ -n "$s3_bucket" ]; then
    print_info "Copying config.json and users.json from s3://${s3_bucket}/config/${role}/ to /opt/oscal/data/..."
    if ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "command -v aws >/dev/null 2>&1 && aws s3 cp s3://${s3_bucket}/config/${role}/config.json /opt/oscal/data/config.json --quiet 2>/dev/null && aws s3 cp s3://${s3_bucket}/config/${role}/users.json /opt/oscal/data/users.json --quiet 2>/dev/null"; then
      print_success "Restored config.json and users.json from S3 (last backup)"
    else
      print_warning "S3 restore skipped or failed (bucket: $s3_bucket, role: $role). Set DEPLOY_LOCAL_CONFIG_SEED=1 to seed from laptop config/app/ if needed."
    fi
  fi
  need_seed=$(ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "[ -f /opt/oscal/data/config.json ] && [ -f /opt/oscal/data/users.json ] && echo no || echo yes" 2>/dev/null) || need_seed="yes"
  if [ "$need_seed" = "yes" ] && [ "${DEPLOY_LOCAL_CONFIG_SEED:-0}" = "1" ] && [ -f "$REPO_ROOT/config/app/config.json" ] && [ -f "$REPO_ROOT/config/app/users.json" ]; then
    scp -i "$key" -o StrictHostKeyChecking=no "$REPO_ROOT/config/app/config.json" "$REPO_ROOT/config/app/users.json" "${SSH_USER}@${ip}:/tmp/" 2>/dev/null && \
    ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "mv -f /tmp/config.json /tmp/users.json /opt/oscal/data/" 2>/dev/null && \
    print_success "Seeded /opt/oscal/data/config.json and users.json from repo (DEPLOY_LOCAL_CONFIG_SEED=1)"
  elif [ "$need_seed" = "yes" ]; then
    if [ -n "$s3_bucket" ]; then
      print_warning "config.json/users.json still missing on instance; upload to s3://${s3_bucket}/config/${role}/ or set DEPLOY_LOCAL_CONFIG_SEED=1 with local config/app files."
    else
      print_warning "config.json/users.json still missing on instance; set DEPLOY_LOCAL_CONFIG_SEED=1 with local config/app files or configure S3 restore."
    fi
  fi

  if [ -z "$s3_bucket" ]; then
    print_error "S3 bucket unknown (Terraform output s3_logs_bucket_name); cannot deploy from installer/."
    return 1
  fi

  print_info "Syncing s3://${s3_bucket}/${INSTALLER_PREFIX}/ to ${REMOTE_APP}/ on instance..."
  # ec2-user must own app tree before aws s3 sync: after prior deploy files are svc_ams-oscal:oscal (group often r-x only) and sync cannot overwrite (H1).
  _installer_sync_rc=0
  ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" bash -s "$s3_bucket" "${AWS_DEPLOY_REGION:-us-east-1}" "$REMOTE_APP" "$SSH_USER" "$SVC_GROUP" <<'INSTALLERSYNC' || _installer_sync_rc=$?
set -eo pipefail
BUCKET="$1"
REGION="$2"
APP="$3"
CHOWN_USER="$4"
CHOWN_GROUP="$5"
export AWS_DEFAULT_REGION="$REGION"
sudo chown -R "${CHOWN_USER}:${CHOWN_GROUP}" "${APP}"
sudo mkdir -p "${APP}/logs"
SYNC_LOG="${APP}/logs/deployment.log"
sudo touch "$SYNC_LOG" 2>/dev/null || true
sudo chown "${CHOWN_USER}:${CHOWN_GROUP}" "$SYNC_LOG" 2>/dev/null || sudo chmod 666 "$SYNC_LOG" 2>/dev/null || true
aws s3 sync "s3://${BUCKET}/installer/" "${APP}/" --delete --region "$REGION" \
  --exclude 'node_modules/**' \
  --exclude '.git/**' \
  --exclude '.cursor/**' \
  --exclude '.githooks/**' \
  --exclude '.validation/**' \
  --exclude '.github/**' \
  --exclude 'config/**' \
  --exclude 'terraform/**' \
  --exclude 'test_cases/**' \
  --exclude 'docs/**' \
  --exclude 'credentials.txt' \
  --exclude 'logs/**' \
  --exclude 'data/debug-state/**' \
  --exclude 'data/jobs/**' \
  --exclude 'scripts/bump_version.sh' \
  --exclude 'docker-compose.yml' \
  --exclude 'docker-entrypoint.sh' \
  --exclude 'Dockerfile' \
  --exclude 'scripts/setup-git-hooks.sh' \
  --exclude 'scripts/switch-github-account.sh' \
  --exclude 'backend/node_modules/**' \
  --exclude 'frontend/node_modules/**' \
  --exclude 'frontend/dist/**' \
  --exclude 'backend/public/**' \
  --exclude '*.log' \
  2>&1 | tee -a "$SYNC_LOG"
MANIFEST_KEY="installer/.installer-build.json"
MANIFEST_URI="s3://${BUCKET}/${MANIFEST_KEY}"
if aws s3api head-object --bucket "$BUCKET" --key "$MANIFEST_KEY" --region "$REGION" >/dev/null 2>&1; then
  MF="${APP}/.installer-build.json"
  # aws s3 sync can leave a stale .installer-build.json on disk (mtime/size heuristics vs S3, clock skew) while the
  # object in S3 was just replaced—sha256 then mismatched disk vs aws s3 cp. Always re-copy the manifest after sync.
  aws s3 cp "$MANIFEST_URI" "$MF" --region "$REGION"
  if [ ! -f "$MF" ]; then
    echo "installer verify failed: .installer-build.json missing on disk after sync (expected ${MANIFEST_URI})" >&2
    exit 1
  fi
  DISK_SHA=$(sha256sum "$MF" | awk '{print $1}')
  S3_SHA=$(aws s3 cp "$MANIFEST_URI" - --region "$REGION" | sha256sum | awk '{print $1}')
  if [ "$DISK_SHA" != "$S3_SHA" ]; then
    echo "installer verify failed: .installer-build.json sha256 mismatch (disk=${DISK_SHA} s3_pipe=${S3_SHA})" >&2
    exit 1
  fi
  {
    echo "=== $(date -Iseconds) installer manifest verify OK (sha256 ${DISK_SHA}) ==="
  } >>"$SYNC_LOG" 2>/dev/null || true
else
  {
    echo "=== $(date -Iseconds) installer manifest missing on S3 (${MANIFEST_URI}); skipping sha verify (re-upload from laptop with current deploy script) ==="
  } >>"$SYNC_LOG" 2>/dev/null || true
fi
INSTALLERSYNC
  if [ "${_installer_sync_rc}" -ne 0 ]; then
    print_error "S3 sync from installer/ failed on ${role} (exit ${_installer_sync_rc}). Check instance: sudo chown, aws CLI, IAM installer/*."
    return 1
  fi
  print_success "Application tree synced from S3 to ${REMOTE_APP}/ (manifest sha256 verified when installer/.installer-build.json exists on S3)"

  ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "rm -rf ${REMOTE_APP}/config" 2>/dev/null || true

  # Install /opt/oscal/scripts from synced app tree (no SCP from laptop for these).
  ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "set -e
    APP='${REMOTE_APP}'
    test -f \"\$APP/scripts/ec2_automation.sh\"
    sudo cp \"\$APP/scripts/ec2_automation.sh\" /opt/oscal/scripts/
    sudo chmod +x /opt/oscal/scripts/ec2_automation.sh
    if [ -f \"\$APP/scripts/lib/ec2-automation-pass-sync.sh\" ]; then
      sudo mkdir -p /opt/oscal/scripts/lib
      sudo cp \"\$APP/scripts/lib/ec2-automation-pass-sync.sh\" /opt/oscal/scripts/lib/
    fi
    if [ -f \"\$APP/scripts/debug/update-pass-credential.sh\" ]; then
      sudo mkdir -p /opt/oscal/scripts/debug
      sudo cp \"\$APP/scripts/debug/update-pass-credential.sh\" /opt/oscal/scripts/debug/
      sudo chmod +x /opt/oscal/scripts/debug/update-pass-credential.sh
    fi
    for f in sync-consolidation-script.sh consolidate-users.sh; do
      if [ -f \"\$APP/scripts/\$f\" ]; then
        sudo cp \"\$APP/scripts/\$f\" /opt/oscal/scripts/
        sudo chmod +x \"/opt/oscal/scripts/\$f\"
      fi
    done
    if [ -f \"\$APP/scripts/reactivate-admin.sh\" ]; then
      sudo cp \"\$APP/scripts/reactivate-admin.sh\" /opt/oscal/scripts/
      sudo chmod +x /opt/oscal/scripts/reactivate-admin.sh
    fi
    sudo chown -R ${SSH_USER}:${SVC_GROUP} /opt/oscal
  "

  # ec2_automation.env and cron (same as before; files on disk now come from installer/).
  if ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "test -f /opt/oscal/scripts/ec2_automation.sh"; then
    if [ -n "$s3_bucket" ]; then
      # Cron can sync application code from S3 installer/ every N runs (see ec2_automation.sh). Set DEPLOY_ENABLE_S3_INSTALLER_UPDATE=0 to turn off.
      s3_installer_update="true"
      if [ "${DEPLOY_ENABLE_S3_INSTALLER_UPDATE:-1}" != "1" ]; then
        s3_installer_update="false"
      fi
      if [ "$role" = "blue" ] && [ "${DEPLOY_BLUE_AUTO_UPDATE:-1}" != "1" ]; then
        s3_installer_update="false"
      fi
      os_pkg_update="false"
      if [ "${DEPLOY_ENABLE_OS_PACKAGE_UPDATE:-0}" = "1" ]; then
        os_pkg_update="true"
      fi
      ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "cat > /opt/oscal/scripts/ec2_automation.env << ENVEOF
S3_BUCKET=$s3_bucket
S3_CONFIG_PREFIX=config/$role
S3_LOGS_PREFIX=logs/$role
DEPLOYMENT_ROLE=$role
AWS_DEFAULT_REGION=${AWS_DEPLOY_REGION:-us-east-1}
S3_INSTALLER_PREFIX=${INSTALLER_PREFIX}
S3_CODE_UPDATE_EVERY_N_CYCLES=${S3_CODE_UPDATE_EVERY_N_CYCLES:-100}
ENABLE_S3_INSTALLER_UPDATE=$s3_installer_update
ENABLE_OS_PACKAGE_UPDATE=$os_pkg_update
OS_PACKAGE_UPDATE_EVERY_N_CYCLES=${OS_PACKAGE_UPDATE_EVERY_N_CYCLES:-144}
S3_SYNC_CHOWN_USER=${SSH_USER}
S3_SYNC_CHOWN_GROUP=${SVC_GROUP}
PASS_SECRETS_SYNC_ENABLED=${PASS_SECRETS_SYNC_ENABLED_ON_INSTANCE:-false}
PASS_SECRETS_SYNC_SECRET_ARN=${PASS_SYNC_SECRET_ARN:-}
PASS_SECRETS_SYNC_MIN_INTERVAL_SECONDS=${PASS_SECRETS_SYNC_MIN_INTERVAL_SECONDS:-21600}
ENVEOF"
      if [ "$role" = "blue" ] && [ "${DEPLOY_BLUE_AUTO_UPDATE:-1}" != "1" ]; then
        # Blue: remove ec2_automation cron (manual deploy only); ENABLE_S3_INSTALLER_UPDATE=false in env for consistency
        ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "
          remaining=\$(sudo crontab -u $SVC_USER -l 2>/dev/null | grep -v ec2_automation.sh || true)
          if [ -n \"\$remaining\" ]; then
            echo \"\$remaining\" | sudo crontab -u $SVC_USER -
          else
            sudo crontab -u $SVC_USER -r 2>/dev/null || true
          fi
        "
        print_success "ec2_automation.sh and env installed on Blue; cron removed (DEPLOY_BLUE_AUTO_UPDATE=0). Default is 1 for cron on both instances."
      else
        ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "
          command -v crontab >/dev/null 2>&1 || { sudo dnf install -y cronie 2>/dev/null || sudo yum install -y cronie 2>/dev/null; sudo systemctl enable crond --now 2>/dev/null; }
          CRONLINE='*/10 * * * * mkdir -p /opt/oscal/app/logs && /opt/oscal/scripts/ec2_automation.sh >> /opt/oscal/app/logs/ec2_automation.stdout 2>\&1'
          (sudo crontab -u $SVC_USER -l 2>/dev/null | grep -v ec2_automation.sh || true; echo \"\$CRONLINE\") | sudo crontab -u $SVC_USER -
        "
        print_success "ec2_automation.sh installed; cron every 10 min as $SVC_USER (S3 bucket: $s3_bucket)"
      fi
    else
      print_warning "S3 bucket not set; ec2_automation.sh installed but backup/cron skipped (no S3_BUCKET)."
    fi
  else
    print_error "ec2_automation.sh missing under ${REMOTE_APP}/scripts after S3 sync; upload with ./scripts/deploy-to-ec2.sh --update-s3"
    return 1
  fi

  maybe_apply_rds_bootstrap "$ip" "$key"

  # On instance: ensure Node/npm (Amazon Linux may not have it if user_data not run yet), then npm install, build, restart
  ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "set -e
    export PATH=\"/usr/bin:/usr/local/bin:\$PATH\"
    command -v npm >/dev/null 2>&1 || {
      curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
      sudo dnf install -y nodejs 2>/dev/null || sudo yum install -y nodejs 2>/dev/null
    }
    cd $REMOTE_APP
    npm install --no-audit --no-fund
    cd backend && npm install --no-audit --no-fund && cd ..
    cd frontend && npm install --no-audit --no-fund && npm run build && cd ..
    mkdir -p backend/public
    cp -r frontend/dist/* backend/public/
    if ! sudo systemctl restart oscal-reporter.service 2>/dev/null; then
      if [ ! -f /etc/systemd/system/oscal-reporter.service ]; then
        sudo tee /etc/systemd/system/oscal-reporter.service > /dev/null << 'SVCEOF'
[Unit]
Description=OSCAL Report Generator
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
Environment=CONFIG_PATH=/opt/oscal/data/config.json
Environment=USERS_PATH=/opt/oscal/data/users.json
Environment=HOME=SVC_HOME_PLACEHOLDER
Environment=PASSWORD_STORE_DIR=SVC_HOME_PLACEHOLDER/.password-store
Environment=PATH=/usr/local/bin:/usr/bin:/bin
# HOME and PASSWORD_STORE_DIR required so GUI save uses pass vault (not plaintext in config)

[Install]
WantedBy=multi-user.target
SVCEOF
        SVC_HOME=/var/lib/svc_ams-oscal
        sudo sed -i \"s/PORT_PLACEHOLDER/$port/g;s/SVC_USER_PLACEHOLDER/$SVC_USER/g;s/SVC_GROUP_PLACEHOLDER/$SVC_GROUP/g;s|SVC_HOME_PLACEHOLDER|$SVC_HOME|g\" /etc/systemd/system/oscal-reporter.service
        sudo systemctl daemon-reload
        sudo systemctl enable oscal-reporter.service
        sudo systemctl start oscal-reporter.service
      else
        echo '--- oscal-reporter.service failed. Last 15 lines: ---'
        sudo journalctl -u oscal-reporter.service -n 15 --no-pager 2>/dev/null || true
        exit 1
      fi
    fi
    sudo chown -R $SVC_USER:$SVC_GROUP /opt/oscal
    # Always ensure PORT matches this role (Blue=3020, Green=3019) so health check and ALB target use correct port
    sudo sed -i \"s/^Environment=PORT=.*/Environment=PORT=$port/\" /etc/systemd/system/oscal-reporter.service 2>/dev/null || true
    grep -q '^User=' /etc/systemd/system/oscal-reporter.service 2>/dev/null || { sudo sed -i '/^\[Service\]/a User=$SVC_USER' /etc/systemd/system/oscal-reporter.service; sudo sed -i '/^User=/a Group=$SVC_GROUP' /etc/systemd/system/oscal-reporter.service; sudo systemctl daemon-reload; sudo systemctl restart oscal-reporter.service 2>/dev/null; }
    grep -q 'Environment=PATH=' /etc/systemd/system/oscal-reporter.service 2>/dev/null || { sudo sed -i '/Environment=USERS_PATH=/a Environment=PATH=/usr/local/bin:/usr/bin:/bin' /etc/systemd/system/oscal-reporter.service; sudo systemctl daemon-reload; sudo systemctl restart oscal-reporter.service 2>/dev/null; }
    grep -q 'Environment=HOME=' /etc/systemd/system/oscal-reporter.service 2>/dev/null || { sudo sed -i '/Environment=USERS_PATH=/a Environment=HOME=/var/lib/svc_ams-oscal' /etc/systemd/system/oscal-reporter.service; sudo systemctl daemon-reload; sudo systemctl restart oscal-reporter.service 2>/dev/null; }
    grep -q 'Environment=PASSWORD_STORE_DIR=' /etc/systemd/system/oscal-reporter.service 2>/dev/null || { sudo sed -i '/Environment=HOME=/a Environment=PASSWORD_STORE_DIR=/var/lib/svc_ams-oscal/.password-store' /etc/systemd/system/oscal-reporter.service; sudo systemctl daemon-reload; sudo systemctl restart oscal-reporter.service 2>/dev/null; }
    sudo systemctl daemon-reload
    sudo systemctl restart oscal-reporter.service 2>/dev/null || true
    echo OK
  "

  print_success "Deployed to $role at $ip"
  # Restart so new code and env (HOME/PASSWORD_STORE_DIR) are active
  print_info "Restarting oscal-reporter.service..."
  ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "sudo systemctl restart oscal-reporter.service" 2>/dev/null || true
  # Verify app responds. Public curl often fails: SG allows only ALB/VPC/self on 3019/3020, not the internet.
  print_info "Waiting 20s then checking /health (retry up to 5 times)..."
  sleep 20
  health_ok=""
  health_via_ssh=""
  for attempt in 1 2 3 4 5; do
    if curl -sf --connect-timeout 5 "http://${ip}:${port}/health" >/dev/null 2>&1; then
      health_ok=1
      break
    fi
    [ "$attempt" -lt 5 ] && sleep 5
  done
  if [ -z "$health_ok" ]; then
    # Fallback: check from inside instance (SG does not affect localhost).
    if ssh -i "$key" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "${SSH_USER}@${ip}" \
      "curl -sf --connect-timeout 5 http://127.0.0.1:${port}/health >/dev/null" 2>/dev/null; then
      health_ok=1
      health_via_ssh=1
    fi
  fi
  if [ -n "$health_ok" ]; then
    if [ -n "$health_via_ssh" ]; then
      print_success "App /health OK on instance (localhost only). Direct http://${ip}:${port}/ is blocked by SG -- use ALB URL to reach the app."
      [ -n "$results_file" ] && [ -f "$results_file" ] && echo "$role $ip ok_ssh" >> "$results_file"
    else
      print_success "App is up at http://${ip}:${port}/health"
      [ -n "$results_file" ] && [ -f "$results_file" ] && echo "$role $ip ok" >> "$results_file"
    fi
  else
    print_warning "App /health not yet responding at http://${ip}:${port}/health (check: sudo systemctl status oscal-reporter.service; config/users on EBS at /opt/oscal/data)"
    [ -n "$results_file" ] && [ -f "$results_file" ] && echo "$role $ip fail" >> "$results_file"
    print_info "Recent oscal-reporter.service logs (for debugging):"
    ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "sudo journalctl -u oscal-reporter.service -n 30 --no-pager 2>/dev/null" 2>/dev/null || true
  fi
  # EC2-local deployment.log: binding (ss) + curl localhost + curl private IP on same host
  local priv_ip=""
  [ "$role" = "green" ] && priv_ip="${GREEN_PRIVATE:-}" || priv_ip="${BLUE_PRIVATE:-}"
  print_info "Appending local health/binding checks to ${DEPLOY_LOG_REMOTE} on $role..."
  ssh -i "$key" -o StrictHostKeyChecking=no -o ConnectTimeout=15 "${SSH_USER}@${ip}" bash -s "$port" "$role" "$priv_ip" << 'DEPLOYLOGLOCAL'
set +e
LOG=/opt/oscal/app/logs/deployment.log
sudo mkdir -p /opt/oscal/app/logs
sudo touch "$LOG"
sudo chown "$(whoami)":oscal "$LOG" 2>/dev/null || sudo chmod 666 "$LOG"
{
  echo "=== $(date -Iseconds) deploy_one local binding port=$1 role=$2 ==="
  echo "--- ss listening (3019/3020 or node) ---"
  ss -tlnp 2>/dev/null | grep -E ':3019|:3020' || ss -tlnp 2>/dev/null | grep node || echo "ss: no matching listener"
  echo "--- curl http://127.0.0.1:$1/health ---"
  curl -sS -w "\nhttp_code:%{http_code}\n" --connect-timeout 5 "http://127.0.0.1:$1/health" || echo "curl_127_fail"
  if [ -n "$3" ]; then
    echo "--- curl http://$3:$1/health (same host private IP) ---"
    curl -sS -w "\nhttp_code:%{http_code}\n" --connect-timeout 5 "http://$3:$1/health" || echo "curl_private_fail"
  else
    echo "--- skip private-IP curl (no private IP in tf output) ---"
  fi
} 2>&1 | sudo tee -a "$LOG" >/dev/null
DEPLOYLOGLOCAL
  print_info "ALB idle_timeout should be 300s (see terraform/alb.tf) to avoid 504 on long requests."
}

# --- main ---
# Deploy target: green (default), blue, or both. With --green-only/--blue-only IP we also set the IP.
UPDATE_S3_ONLY=0
DEPLOY_TARGET="green"
GREEN_ONLY_IP=""
BLUE_ONLY_IP=""
while [ $# -gt 0 ]; do
  case "$1" in
    --update-s3|-updateS3)
      UPDATE_S3_ONLY=1
      shift
      ;;
    --both)
      DEPLOY_TARGET="both"
      shift
      ;;
    --blue)
      DEPLOY_TARGET="blue"
      shift
      ;;
    --green-only)
      shift
      GREEN_ONLY_IP="${1:?Give IP after --green-only}"
      DEPLOY_TARGET="green"
      shift
      ;;
    --blue-only)
      shift
      BLUE_ONLY_IP="${1:?Give IP after --blue-only}"
      DEPLOY_TARGET="blue"
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--update-s3 | -updateS3] [--both | --blue | [--green-only IP] | [--blue-only IP]]"
      echo "  Default: EC2 pulls existing s3://<bucket>/installer/ with aws s3 sync (no upload from this laptop)."
      echo "  --update-s3 | -updateS3: upload this repo to installer/ (needs AWS_PASS_ENTRY + operator S3 write); no SSH / no EC2 deploy."
      echo "  --both:    deploy to both green and blue."
      echo "  --blue:    deploy to blue only."
      echo "  (default): deploy to green only (IPs from Terraform). Use --both or --blue when Blue must match installer/ too."
      echo "  --green-only IP: deploy to green at given IP."
      echo "  --blue-only IP:  deploy to blue at given IP."
      echo "  SSH key: Pass entry $PASS_ENTRY or SSH_KEY_FILE=/path/to/key.pem"
      echo "  --update-s3: operator IAM needs s3:PutObject/Delete/List on installer/*. Normal deploy: instances read installer/* via IAM only."
      echo "  Instance sync: chown ec2-user:oscal on app dir before s3 sync (so prior svc_ams-oscal files can be replaced). Verify bucket:"
      echo "    terraform output -raw s3_logs_bucket_name"
      exit 0
      ;;
    *)
      print_error "Unknown option: $1"; exit 1
      ;;
  esac
done

if [ "$UPDATE_S3_ONLY" = "1" ]; then
  S3_BUCKET=$(get_s3_bucket "$TERRAFORM_DIR" || true)
  if [ -z "$S3_BUCKET" ]; then
    print_error "Could not read s3_logs_bucket_name from Terraform (is ${TERRAFORM_DIR}/terraform.tfstate present?)."
    exit 1
  fi
  if ! load_deploy_aws_credentials; then
    exit 1
  fi
  AWS_DEPLOY_REGION=$(tf_output -raw aws_region 2>/dev/null || echo "us-east-1")
  AWS_DEPLOY_REGION=$(printf '%s' "$AWS_DEPLOY_REGION" | tr -d '\r\n')
  if [ -z "$AWS_DEPLOY_REGION" ] || [ "$AWS_DEPLOY_REGION" = "null" ]; then
    AWS_DEPLOY_REGION="us-east-1"
  fi
  sync_repo_to_s3_installer "$S3_BUCKET" "$AWS_DEPLOY_REGION"
  print_info "S3-only mode: no EC2 deploy. Run without --update-s3 to deploy instances from installer/."
  exit 0
fi

# Resolve IPs: from --green-only/--blue-only or from Terraform
if [ -n "$GREEN_ONLY_IP" ]; then
  GREEN_IP="$GREEN_ONLY_IP"
fi
if [ -n "$BLUE_ONLY_IP" ]; then
  BLUE_IP="$BLUE_ONLY_IP"
fi
if [ -z "$GREEN_IP" ] || [ -z "$BLUE_IP" ]; then
  IPS=$(get_terraform_ips "$TERRAFORM_DIR" || true)
  if [ -n "$IPS" ]; then
    [ -z "$GREEN_IP" ] && GREEN_IP=$(echo "$IPS" | awk '{print $1}')
    [ -z "$BLUE_IP" ] && BLUE_IP=$(echo "$IPS" | awk '{print $2}')
    print_info "Using Terraform dir: $TERRAFORM_DIR"
    print_info "Green: $GREEN_IP  Blue: $BLUE_IP"
  else
    print_error "Run from repo root after './terraform/run-with-aws-pass.sh apply' or use --green-only IP / --blue-only IP"
    echo "  Set TERRAFORM_DIR to the directory that contains terraform.tfstate for your stack."
    exit 1
  fi
fi

# Default: deploy green only. --both deploys both, --blue deploys blue only.
case "$DEPLOY_TARGET" in
  both)  DEPLOY_GREEN=1; DEPLOY_BLUE=1 ;;
  blue)  DEPLOY_GREEN=0; DEPLOY_BLUE=1 ;;
  green) DEPLOY_GREEN=1; DEPLOY_BLUE=0 ;;
  *)     DEPLOY_GREEN=1; DEPLOY_BLUE=0 ;;
esac
[ "$DEPLOY_TARGET" = "green" ] && print_info "Deploy target: green only (default). Use --both or --blue to change."
[ "$DEPLOY_TARGET" = "both" ] && print_info "Deploy target: both green and blue."
[ "$DEPLOY_TARGET" = "blue" ] && print_info "Deploy target: blue only."

[ -z "$GREEN_IP" ] && [ -z "$BLUE_IP" ] && { print_error "No instance IPs"; exit 1; }

resolve_ssh_key

# S3 bucket for ec2_automation.env on instances (backup target; config/users live on EBS)
S3_BUCKET=$(get_s3_bucket "$TERRAFORM_DIR" || true)

PASS_SYNC_SECRET_ARN=$(get_pass_sync_secret_arn "$TERRAFORM_DIR" || true)
PASS_SECRETS_SYNC_ENABLED_ON_INSTANCE=true
if [ -z "${PASS_SYNC_SECRET_ARN}" ] || [ "${PASS_SYNC_SECRET_ARN}" = "null" ]; then
  PASS_SYNC_SECRET_ARN=""
  PASS_SECRETS_SYNC_ENABLED_ON_INSTANCE=false
  print_warning "Terraform output oscal_pass_secrets_sync_secret_arn missing or null; ec2_automation.env sets PASS_SECRETS_SYNC_ENABLED=false (apply Terraform with oscal_pass_secrets_sync_enabled or check state)."
fi
export PASS_SYNC_SECRET_ARN PASS_SECRETS_SYNC_ENABLED_ON_INSTANCE

if [ -z "$S3_BUCKET" ]; then
  print_error "S3 bucket name missing (Terraform output s3_logs_bucket_name). Cannot deploy from installer/."
  exit 1
fi
print_info "S3 installer bucket (Terraform s3_logs_bucket_name): ${S3_BUCKET} — confirm with: terraform output -raw s3_logs_bucket_name"
print_info "Deploy uses existing s3://${S3_BUCKET}/${INSTALLER_PREFIX}/ on instances (no laptop upload). Run with --update-s3 first to refresh installer/ from this repo."
AWS_DEPLOY_REGION=$(tf_output -raw aws_region 2>/dev/null || echo "us-east-1")
AWS_DEPLOY_REGION=$(printf '%s' "$AWS_DEPLOY_REGION" | tr -d '\r\n')
if [ -z "$AWS_DEPLOY_REGION" ] || [ "$AWS_DEPLOY_REGION" = "null" ]; then
  AWS_DEPLOY_REGION="us-east-1"
fi
export AWS_DEPLOY_REGION

# IPs and ALB for EC2-local deployment.log, cross-instance curls, and ALB checks (Terraform outputs)
DEPLOY_LOG_REMOTE="/opt/oscal/app/logs/deployment.log"
# Trim tf outputs so unquoted heredocs never expand newlines/$(...) inside IPs (avoids stray local command execution).
tf_ip_trim() { printf '%s' "${1:-}" | tr -d '\r\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'; }
GREEN_PRIVATE=$(tf_ip_trim "$(tf_output -raw oscal_green_private_ip 2>/dev/null || true)")
BLUE_PRIVATE=$(tf_ip_trim "$(tf_output -raw oscal_blue_private_ip 2>/dev/null || true)")
GREEN_PUBLIC_TF=$(tf_ip_trim "$(tf_output -raw oscal_green_public_ip 2>/dev/null || true)")
BLUE_PUBLIC_TF=$(tf_ip_trim "$(tf_output -raw oscal_blue_public_ip 2>/dev/null || true)")
if [ -n "${GREEN_PUBLIC_TF:-}" ]; then
  GREEN_PUBLIC="$GREEN_PUBLIC_TF"
else
  GREEN_PUBLIC="${GREEN_IP:-}"
fi
if [ -n "${BLUE_PUBLIC_TF:-}" ]; then
  BLUE_PUBLIC="$BLUE_PUBLIC_TF"
else
  BLUE_PUBLIC="${BLUE_IP:-}"
fi
ALB_DNS=$(tf_output -raw alb_dns_name 2>/dev/null || true)
# ALB SG allows 443 only; use HTTPS when ALB exists
ALB_USE_HTTPS=$(tf_output -raw alb_use_https 2>/dev/null || echo "true")

# Results file for post-deploy summary and health status (option 2, 4)
DEPLOY_RESULTS_FILE=$(mktemp)
cleanup_deploy_exit() {
  rm -f "$DEPLOY_RESULTS_FILE" 2>/dev/null || true
  if [ "${SSH_KEY_IS_TEMP:-0}" = "1" ] && [ -n "${SSH_KEY:-}" ]; then
    rm -f "$SSH_KEY" 2>/dev/null || true
  fi
}
trap cleanup_deploy_exit EXIT

PASS_MISSING_ANY=0
if [ -n "$GREEN_IP" ] && [ "${DEPLOY_GREEN:-0}" = "1" ]; then
  deploy_one "$GREEN_IP" "green" "$SSH_KEY" "$S3_BUCKET" "$DEPLOY_RESULTS_FILE"
fi
if [ -n "$BLUE_IP" ] && [ "${DEPLOY_BLUE:-0}" = "1" ]; then
  deploy_one "$BLUE_IP" "blue" "$SSH_KEY" "$S3_BUCKET" "$DEPLOY_RESULTS_FILE"
fi

# Cross-instance curls: pass IPs via bash -s and quoted heredoc so terraform values are never locally expanded (no $(...) injection).
if [ -n "$GREEN_IP" ] && [ -n "$BLUE_IP" ]; then
  print_info "Cross-instance curl tests (append to deployment.log on each host)..."
  _cross_curl_any=0
  if [ -n "$GREEN_PRIVATE" ]; then
    _cross_curl_any=1
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=15 "${SSH_USER}@${BLUE_IP}" bash -s "$GREEN_PRIVATE" <<'CROSSCURL_B_TO_G_PRIV'
LOG=/opt/oscal/app/logs/deployment.log
sudo mkdir -p /opt/oscal/app/logs
GP="$1"
{
  echo "=== $(date -Iseconds) from-blue curl green-private:3019 ==="
  curl -sS -w "\nhttp_code:%{http_code}\n" --connect-timeout 5 "http://${GP}:3019/health" || echo curl_fail
} 2>&1 | sudo tee -a "$LOG" >/dev/null
CROSSCURL_B_TO_G_PRIV
  fi
  if [ -n "$GREEN_PUBLIC" ]; then
    _cross_curl_any=1
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=15 "${SSH_USER}@${BLUE_IP}" bash -s "$GREEN_PUBLIC" <<'CROSSCURL_B_TO_G_PUB'
LOG=/opt/oscal/app/logs/deployment.log
GP="$1"
{
  echo "=== $(date -Iseconds) from-blue curl green-public:3019 ==="
  curl -sS -w "\nhttp_code:%{http_code}\n" --connect-timeout 5 "http://${GP}:3019/health" || echo curl_fail
} 2>&1 | sudo tee -a "$LOG" >/dev/null
CROSSCURL_B_TO_G_PUB
  fi
  if [ -n "$BLUE_PRIVATE" ]; then
    _cross_curl_any=1
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=15 "${SSH_USER}@${GREEN_IP}" bash -s "$BLUE_PRIVATE" <<'CROSSCURL_G_TO_B_PRIV'
LOG=/opt/oscal/app/logs/deployment.log
BP="$1"
{
  echo "=== $(date -Iseconds) from-green curl blue-private:3020 ==="
  curl -sS -w "\nhttp_code:%{http_code}\n" --connect-timeout 5 "http://${BP}:3020/health" || echo curl_fail
} 2>&1 | sudo tee -a "$LOG" >/dev/null
CROSSCURL_G_TO_B_PRIV
  fi
  if [ -n "$BLUE_PUBLIC" ]; then
    _cross_curl_any=1
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=15 "${SSH_USER}@${GREEN_IP}" bash -s "$BLUE_PUBLIC" <<'CROSSCURL_G_TO_B_PUB'
LOG=/opt/oscal/app/logs/deployment.log
BP="$1"
{
  echo "=== $(date -Iseconds) from-green curl blue-public:3020 ==="
  curl -sS -w "\nhttp_code:%{http_code}\n" --connect-timeout 5 "http://${BP}:3020/health" || echo curl_fail
} 2>&1 | sudo tee -a "$LOG" >/dev/null
CROSSCURL_G_TO_B_PUB
  fi
  if [ "$_cross_curl_any" = "0" ]; then
    print_warning "Cross-instance curls skipped (terraform outputs for instance private/public IPs are empty)."
  fi
fi

# ALB /health from both hosts (HTTPS if ALB_USE_HTTPS true; ALB SG allows 443 only)
if [ -n "$ALB_DNS" ]; then
  print_info "ALB curl from Green and Blue to https://${ALB_DNS}/health ..."
  for _alb_role in green blue; do
    _alb_ip=""
    [ "$_alb_role" = "green" ] && _alb_ip="$GREEN_IP" || _alb_ip="$BLUE_IP"
    [ -z "$_alb_ip" ] && continue
    if [ "$ALB_USE_HTTPS" = "true" ]; then
      ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=15 "${SSH_USER}@${_alb_ip}" \
        "LOG=/opt/oscal/app/logs/deployment.log; { echo \"=== \$(date -Iseconds) ${_alb_role} curl ALB https://${ALB_DNS}/health ===\"; curl -sk --connect-timeout 10 -w \"\\nhttp_code:%{http_code}\\n\" \"https://${ALB_DNS}/health\"; } 2>&1 | sudo tee -a \"\$LOG\" >/dev/null" || true
    else
      ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=15 "${SSH_USER}@${_alb_ip}" \
        "LOG=/opt/oscal/app/logs/deployment.log; { echo \"=== \$(date -Iseconds) ${_alb_role} curl ALB http://${ALB_DNS}/health ===\"; curl -sS --connect-timeout 10 -w \"\\nhttp_code:%{http_code}\\n\" \"http://${ALB_DNS}/health\"; } 2>&1 | sudo tee -a \"\$LOG\" >/dev/null" || true
    fi
  done
fi

# Copy deployment.log from each deployed host to repo logs/ for local analysis
mkdir -p "$REPO_ROOT/logs"
if [ -n "$GREEN_IP" ] && [ "${DEPLOY_GREEN:-0}" = "1" ]; then
  if scp -i "$SSH_KEY" -o StrictHostKeyChecking=no "${SSH_USER}@${GREEN_IP}:${DEPLOY_LOG_REMOTE}" "$REPO_ROOT/logs/deployment-green.log" 2>/dev/null; then
    print_success "Fetched deployment.log from green -> logs/deployment-green.log"
  else
    print_warning "Could not scp deployment.log from green (check path/permissions)."
  fi
fi
if [ -n "$BLUE_IP" ] && [ "${DEPLOY_BLUE:-0}" = "1" ]; then
  if scp -i "$SSH_KEY" -o StrictHostKeyChecking=no "${SSH_USER}@${BLUE_IP}:${DEPLOY_LOG_REMOTE}" "$REPO_ROOT/logs/deployment-blue.log" 2>/dev/null; then
    print_success "Fetched deployment.log from blue -> logs/deployment-blue.log"
  else
    print_warning "Could not scp deployment.log from blue (check path/permissions)."
  fi
fi

# If Pass is not installed/initialized on any instance, warn and prompt
if [ "${PASS_MISSING_ANY:-0}" = "1" ]; then
  echo ""
  print_warning "Pass is not installed or not initialized for $SVC_USER on one or more instances."
  echo -e "  ${YELLOW}Secrets (e.g. Okta client secret) will be stored in plain text in config.json.${NC}"
  echo ""
  echo "  Would you like to continue with deployment anyway? [y/N]"
  if [ -t 0 ]; then
    read -r response
    case "${response:-n}" in
      [yY]|[yY][eE][sS]) ;;
      *) print_error "Deployment aborted. Install and initialize Pass first, then re-run deploy."
        echo "  Re-run ./scripts/deploy-to-ec2.sh after fixing Pass on the instance, or add secrets manually:"
        echo "  sudo -u $SVC_USER pass insert OSCAL/sso-oauth-okta-client-secret"
        exit 1
        ;;
    esac
  else
    print_error "Deployment completed but Pass is not available. Secrets will be stored in config.json."
    echo "  To use Pass for secrets, re-run deploy after fixing Pass on the instance (see docs/AWS_OPERATIONS.md#ec2-web-hosting-best-practices)."
  fi
fi

# Summary: deployed instances and health (option 4)
print_success "Deploy complete."
if [ -f "$DEPLOY_RESULTS_FILE" ] && [ -s "$DEPLOY_RESULTS_FILE" ]; then
  echo ""
  print_info "Summary:"
  while read -r role ip status; do
    [ -z "$role" ] && continue
    if [ "$status" = "ok" ]; then
      echo -e "  ${GREEN}✓${NC} $role ($ip): healthy"
    elif [ "$status" = "ok_ssh" ]; then
      echo -e "  ${GREEN}✓${NC} $role ($ip): healthy (localhost; use ALB -- SG blocks direct :3019/:3020)"
    else
      echo -e "  ${RED}✗${NC} $role ($ip): /health not responding"
    fi
  done < "$DEPLOY_RESULTS_FILE"
fi
echo ""
# Post-deploy: pass vault reminder (compare config _pass pointers vs vault on each instance)
print_info "Pass vault: on each instance run: sudo -u $SVC_USER env HOME=$SVC_HOME pass ls"
print_info "Ensure config.json _pass entries exist in the vault (see docs/AWS_OPERATIONS.md#ec2-web-hosting-best-practices)."
echo ""
# Fail script if any instance failed health check (ok_ssh counts as success -- SG blocks public app ports by design)
# Use wc -l so HEALTH_FAIL is always a single integer (grep -c in a subshell can yield newlines on some systems)
HEALTH_FAIL=0
if [ -f "$DEPLOY_RESULTS_FILE" ]; then
  # grep -c in subshell can yield newlines on some systems; wc -l gives a single integer (SC2126 disabled)
  # shellcheck disable=SC2126
  HEALTH_FAIL=$(grep ' fail$' "$DEPLOY_RESULTS_FILE" 2>/dev/null | wc -l | tr -d ' \n\r')
fi
HEALTH_FAIL=${HEALTH_FAIL:-0}
case "$HEALTH_FAIL" in (*[!0-9]*) HEALTH_FAIL=0 ;; esac
if [ "$HEALTH_FAIL" -gt 0 ] 2>/dev/null; then
  print_error "One or more instances failed health check. Fix and re-run deploy or check: sudo systemctl status oscal-reporter.service"
  exit 1
fi
print_info "ALB default listener uses weighted forward (Green 3019 / Blue 3020). Unhealthy targets get no traffic; host-header rules may bias one color; stickiness can pin your browser. If you see 502, wait for target health then retry."

# Apply Terraform so any drift (e.g. ALB idle_timeout) is applied. Does not destroy or replace Green/Blue instances.
print_info "Running terraform apply -auto-approve via run-with-aws-pass.sh..."
if [ -x "$REPO_ROOT/terraform/run-with-aws-pass.sh" ]; then
  if "$REPO_ROOT/terraform/run-with-aws-pass.sh" apply -auto-approve; then
    print_success "Terraform apply completed."
  else
    print_warning "Terraform apply failed or had errors (check output above). Instances were not modified."
  fi
else
  print_warning "terraform/run-with-aws-pass.sh not found or not executable; skipping terraform apply."
fi

# --- ACM HTTPS: validate CNAME records and guide next steps or raise-a-ticket ---
check_acm_validation_and_ticket() {
  local tfdir="${1:-$REPO_ROOT/terraform}"
  [ ! -d "$tfdir" ] || [ ! -f "$tfdir/terraform.tfstate" ] && return 0
  local json
  json=$(tf_output -json acm_certificate_validation_records 2>/dev/null) || return 0
  # Empty array or null => no cert workflow
  if [ -z "$json" ] || [ "$json" = "[]" ] || [ "$json" = "null" ]; then
    return 0
  fi
  local alb_dns
  alb_dns=$(tf_output -raw alb_dns_name 2>/dev/null) || alb_dns=""
  local domain_url
  domain_url=$(tf_output -raw alb_domain_url 2>/dev/null) || domain_url=""
  [ -z "$domain_url" ] && domain_url="https://oscal.amsgovcloud.com.au"

  if ! command -v jq >/dev/null 2>&1; then
    print_warning "jq not found; cannot validate ACM CNAMEs. Run: terraform output acm_certificate_validation_records and add those CNAMEs in Route53, then set alb_certificate_ready = true and terraform apply again."
    return 0
  fi

  local count missing
  count=$(echo "$json" | jq 'length')
  [ "$count" -eq 0 ] 2>/dev/null && return 0
  missing=""
  local i=0
  while [ "$i" -lt "$count" ]; do
    local name value
    name=$(echo "$json" | jq -r ".[$i].name" 2>/dev/null | sed 's/\.$//')
    value=$(echo "$json" | jq -r ".[$i].value" 2>/dev/null | sed 's/\.$//')
    [ -z "$name" ] || [ "$name" = "null" ] && { i=$((i+1)); continue; }
    local resolved
    resolved=""
    if command -v dig >/dev/null 2>&1; then
      resolved=$(dig +short CNAME "$name" 2>/dev/null | head -1 | sed 's/\.$//')
    elif command -v host >/dev/null 2>&1; then
      resolved=$(host -t CNAME "$name" 2>/dev/null | awk '{print $NF}' | sed 's/\.$//')
    fi
    if [ -z "$resolved" ] || [ "$resolved" != "$value" ]; then
      missing="${missing}  - Name: $name -> Value: $value (current DNS: ${resolved:-not found})\n"
    fi
    i=$((i+1))
  done

  if [ -n "$missing" ]; then
    echo ""
    print_warning "ACM certificate validation CNAME record(s) are missing or incorrect in DNS. Validate CNAME record first; then request the following via ticket."
    echo ""
    echo "--------- RAISE A TICKET (DNS team / Route53 in other account) ---------"
    echo "Subject: Add DNS records for oscal.amsgovcloud.com.au (ACM validation + ALB)"
    echo ""
    echo "1) Add these CNAME records so AWS ACM can validate the certificate:"
    echo "$json" | jq -r '.[] | "   Name: \(.name)\n   Type: \(.type)\n   Value: \(.value)\n"' 2>/dev/null || tf_output acm_certificate_validation_records 2>/dev/null
    echo "2) After the certificate shows 'Issued' in AWS ACM, add an A record (alias) or CNAME:"
    echo "   Hostname: oscal.amsgovcloud.com.au"
    echo "   Target:   ${alb_dns:-<run: terraform output alb_dns_name>}"
    echo ""
    echo "3) Then in this repo set in terraform.tfvars: alb_certificate_ready = true"
    echo "   and run: ./terraform/run-with-aws-pass.sh apply -auto-approve"
    echo "-----------------------------------------------------------------------"
    echo ""
    return 0
  fi

  print_success "ACM validation CNAME record(s) are present in DNS."
  print_info "Wait for the certificate to show 'Issued' in AWS Console → Certificate Manager, then:"
  echo "  1. Set in terraform.tfvars: alb_certificate_ready = true"
  echo "  2. Run: ./terraform/run-with-aws-pass.sh apply -auto-approve"
  echo "  Then https://oscal.amsgovcloud.com.au will work (once DNS A/alias points to the ALB)."
  echo ""
}

check_acm_validation_and_ticket "$TERRAFORM_DIR"