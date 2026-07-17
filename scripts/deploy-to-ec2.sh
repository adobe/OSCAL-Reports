#!/usr/bin/env bash
# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# Deploy OSCAL Report Generator to EC2 instances (direct run, no Docker).
# deploy_one runs application steps (S3 sync, npm build, etc.). OS package update is skipped by default during deploy
# (DEPLOY_SKIP_OS_PACKAGE_UPDATE=1) to avoid kernel reboot and ASG instance replacement mid-deploy.
# Default / --blue / --both / --*-only: each instance runs aws s3 sync from s3://<bucket>/installer/ (no upload from this laptop).
# Use --update-s3 to upload this repo to installer/ (same excludes as legacy rsync), then exit without SSH. Also writes
# s3://<bucket>/installer/.oscal-bedrock-cross-account.json when cross-account Bedrock is configured in Terraform.
# pulls that snapshot into /opt/oscal/app, npm install/build, copies scripts from the synced tree to /opt/oscal/scripts, restarts oscal-reporter.
# Config and users live on EBS at /opt/oscal/data; ec2_automation backs up to S3 every 10 min (no S3 mount). Golden restore: s3://<bucket>/config/default/ (config.default) via publish-config-default-to-s3.sh / restore-config-from-s3-default.sh. logs/ in the bucket is for
# runtime log backup (logs/green, logs/blue), not application code—installer/ holds deployable bits.
# Reliability: On each instance, ec2-user runs aws s3 sync; files previously owned by svc_ams-oscal could not be overwritten without
# chown ec2-user:oscal on /opt/oscal/app first (see INSTALLERSYNC). active_passive default: passive-first both
# (passive → ALB cutover → active). Use --green-only/--blue-only or DEPLOY_PASSIVE_FIRST=0 to override.
# Application and cron run as service account svc_ams-oscal (not root). Pass is installed and initialized for that user for secrets.
#
# Green/Blue are Auto Scaling Group members. By default IPs resolve from the live ASG InService instance (not stale Terraform output).
# Maintenance mode (default DEPLOY_MAINTENANCE_MODE=1): before deploying a color, ALB routes 100% traffic to the peer color and the
# target ASG is suspended (no HealthCheck/ReplaceUnhealthy/Launch/Terminate) with scale-in protection on the in-service instance.
# After a successful deploy and ALB target health check, weighted browser routing is restored. Optional SSM
# (oscal_ssm_release_s3_prefix) can sync prebuilt artifacts from S3 on a schedule; it does not replace this script for full builds.
#
# Prerequisites: Terraform applied with run_oscal_via_docker = false; SSH key in Pass or file; Terraform outputs readable (run-with-aws-pass.sh).
# For --update-s3 only: AWS CLI + Pass (or env) with operator IAM s3:PutObject, s3:DeleteObject, s3:ListBucket on s3://<logs-bucket>/installer/*.
# Instances use their IAM role to read installer/* (no laptop upload on a normal deploy).
#
# Usage:
#   ./scripts/deploy-to-ec2.sh              # active_passive: passive-first both; else green only
#   ./scripts/deploy-to-ec2.sh --update-s3  # Upload this repo to installer/ only; no SSH / no EC2 deploy (alias: -updateS3)
#   ./scripts/deploy-to-ec2.sh --both       # Deploy both colors (passive-first when active_passive)
#   ./scripts/deploy-to-ec2.sh --blue       # Deploy to blue only
#   ./scripts/deploy-to-ec2.sh --green-only 1.2.3.4   # Deploy to green at given IP
#   ./scripts/deploy-to-ec2.sh --blue-only 5.6.7.8    # Deploy to blue at given IP
#   SSH_KEY_FILE=/path/to/key.pem ./scripts/deploy-to-ec2.sh
#
# Green and Blue EC2 instances use the same app port (OSCAL_APP_PORT, default 3020). Config/users are shared via s3://<bucket>/config/active/ (newest among active/green/blue wins).
# DEPLOYMENT_ROLE in ec2_automation.env distinguishes green vs blue for logs and deploy targeting only.
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
#   DEPLOY_RDS_BOOTSTRAP_TIMEOUT_SEC  Max seconds for remote RDS bootstrap SSH (default: 600). Set 0 to disable timeout wrapper.
#   DEPLOY_LOCAL_CONFIG_SEED    Set to 1 to allow copying config/app/*.json from the laptop when S3 config/<role>/ restore failed (default: off).
#   DEPLOY_CONFIG_S3_SKIP       Set to 1 to skip pulling config/users from S3 during deploy (keeps local EBS files).
#   DEPLOY_CONFIG_S3_FORCE      Set to 1 to force-pull newest S3 backup even when local is newer (default: 0; only pull if missing or S3 newer).
#   DEPLOY_MIGRATE_CONFIG_SM    Set to 1 to run migrate-config-to-sm.mjs during deploy (default: 0; run manually when rotating secrets).
# Golden restore: s3://<bucket>/config/default/ (config.default). Publish: scripts/debug/publish-config-default-to-s3.sh. Restore: restore-config-from-s3-default.sh.
#   DEPLOY_MAINTENANCE_MODE     Default 1: ALB drain to peer color + ASG suspend/protect during deploy; restore after success.
#   DEPLOY_PASSIVE_FIRST        Default 1 in active_passive: deploy passive color, cutover ALB, then deploy active (both colors).
#   DEPLOY_USE_ASG_IP           Default 1: resolve Green/Blue public IP from live ASG (fallback: Terraform output).
#   DEPLOY_SKIP_OS_PACKAGE_UPDATE  Default 1: skip dnf/yum upgrade during deploy (prevents kernel reboot / ASG recycle).
#   DEPLOY_TERRAFORM_APPLY      Default 0: skip terraform apply at end of deploy (run separately when infra changes are intended).

set -e

# Service account for OSCAL app and cron (not root). EC2 secrets via AWS Secrets Manager (OSCAL_SECRETS_MODE=aws-sm).
SVC_USER="svc_ams-oscal"
SVC_GROUP="oscal"

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
# shellcheck source=./lib/ec2-common.sh disable=SC1091
source "$REPO_ROOT/scripts/lib/ec2-common.sh"
# shellcheck source=./lib/deploy-maintenance.sh disable=SC1091
source "$REPO_ROOT/scripts/lib/deploy-maintenance.sh"
# shellcheck source=./lib/session-secret-systemd.sh disable=SC1091
source "$REPO_ROOT/scripts/lib/session-secret-systemd.sh"
# shellcheck source=./lib/generic-oidc-tls-systemd.sh disable=SC1091
source "$REPO_ROOT/scripts/lib/generic-oidc-tls-systemd.sh"

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
# Re-include paths needed for frontend build (config/** is excluded above).
DEPLOY_S3_SYNC_INCLUDES=(
  'config/catalogues/**'
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
  for x in "${DEPLOY_S3_SYNC_INCLUDES[@]}"; do
    exargs+=(--include "$x")
  done
  aws s3 sync "$REPO_ROOT/" "s3://${bucket}/${INSTALLER_PREFIX}/" --region "$region" --delete "${exargs[@]}"
  write_installer_manifest_to_s3 "$bucket" "$region"
  write_bedrock_cross_account_manifest_to_s3 "$bucket" "$region"
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

# Write s3://bucket/installer/.oscal-bedrock-cross-account.json for ASG first-boot / cron self-heal.
write_bedrock_cross_account_manifest_to_s3() {
  local bucket="$1"
  local region="$2"
  local tmp ts
  tmp=$(mktemp)
  ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  load_bedrock_deploy_env
  if [ -z "${BEDROCK_ASSUME_ROLE_ARN:-}" ]; then
    if command -v jq >/dev/null 2>&1; then
      jq -n \
        --arg ts "$ts" \
        '{schema: 1, enabled: false, bedrock_auth_mode: "iam-role", assume_role_arn: "", external_id: "", published_at: $ts}' > "$tmp"
    else
      printf '{"schema":1,"enabled":false,"bedrock_auth_mode":"iam-role","assume_role_arn":"","external_id":"","published_at":"%s"}\n' "$ts" > "$tmp"
    fi
    aws s3 cp "$tmp" "s3://${bucket}/${INSTALLER_PREFIX}/.oscal-bedrock-cross-account.json" --region "$region"
    rm -f "$tmp"
    print_info "Wrote disabled Bedrock manifest to s3://${bucket}/${INSTALLER_PREFIX}/.oscal-bedrock-cross-account.json (cross-account not configured in Terraform)."
    return 0
  fi
  if command -v jq >/dev/null 2>&1; then
    jq -n \
      --arg ts "$ts" \
      --arg arn "$BEDROCK_ASSUME_ROLE_ARN" \
      --arg eid "${BEDROCK_EXTERNAL_ID:-}" \
      '{schema: 1, enabled: true, bedrock_auth_mode: "iam-role", assume_role_arn: $arn, external_id: $eid, published_at: $ts}' > "$tmp"
  else
    printf '{"schema":1,"enabled":true,"bedrock_auth_mode":"iam-role","assume_role_arn":"%s","external_id":"%s","published_at":"%s"}\n' \
      "$BEDROCK_ASSUME_ROLE_ARN" "${BEDROCK_EXTERNAL_ID:-}" "$ts" > "$tmp"
  fi
  aws s3 cp "$tmp" "s3://${bucket}/${INSTALLER_PREFIX}/.oscal-bedrock-cross-account.json" --region "$region"
  rm -f "$tmp"
  print_success "Wrote Bedrock cross-account manifest to s3://${bucket}/${INSTALLER_PREFIX}/.oscal-bedrock-cross-account.json"
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

# Cross-account Bedrock: ARN from Terraform output; ExternalId from terraform.tfvars (if set).
load_bedrock_deploy_env() {
  BEDROCK_ASSUME_ROLE_ARN=""
  BEDROCK_EXTERNAL_ID=""
  local configured
  configured=$(tf_output -raw bedrock_cross_account_configured 2>/dev/null || echo "false")
  configured=$(printf '%s' "$configured" | tr -d '\r\n')
  if [ "$configured" != "true" ]; then
    export BEDROCK_ASSUME_ROLE_ARN BEDROCK_EXTERNAL_ID
    return 0
  fi
  BEDROCK_ASSUME_ROLE_ARN=$(tf_output -raw bedrock_assume_role_arn 2>/dev/null || true)
  BEDROCK_ASSUME_ROLE_ARN=$(printf '%s' "$BEDROCK_ASSUME_ROLE_ARN" | tr -d '\r\n')
  local tfvars="${TERRAFORM_DIR}/terraform.tfvars"
  if [ -f "$tfvars" ]; then
    local line
    line=$(grep -E '^[[:space:]]*bedrock_external_id[[:space:]]*=' "$tfvars" 2>/dev/null | head -1 || true)
    if [ -n "$line" ]; then
      BEDROCK_EXTERNAL_ID=$(echo "$line" | sed -E 's/^[^=]*=[[:space:]]*//; s/^"//; s/"$//; s/[[:space:]]*#.*//; s/^[[:space:]]+//; s/[[:space:]]+$//')
      case "$BEDROCK_EXTERNAL_ID" in
        ""|"<"*) BEDROCK_EXTERNAL_ID="" ;;
      esac
    fi
  fi
  export BEDROCK_ASSUME_ROLE_ARN BEDROCK_EXTERNAL_ID
}

# Systemd BEDROCK_* + config.json aiConfig (iam-role) so deploy does not rely on manual Settings.
maybe_apply_bedrock_cross_account() {
  local ip="$1"
  local key="$2"
  load_bedrock_deploy_env
  if [ -z "${BEDROCK_ASSUME_ROLE_ARN:-}" ]; then
    return 0
  fi
  local lib_local="$REPO_ROOT/scripts/lib/oscal-bedrock-dropin.sh"
  if [ ! -f "$lib_local" ]; then
    print_warning "Missing $lib_local; skipping Bedrock env apply."
    return 0
  fi
  print_info "Cross-account Bedrock: applying assume-role ARN on instance (config + systemd)..."
  scp -i "$key" -o StrictHostKeyChecking=no -o ConnectTimeout=20 "$lib_local" "${SSH_USER}@${ip}:/tmp/oscal-bedrock-dropin.sh"
  q() { printf '%q' "$1"; }
  if ! ssh -i "$key" -o StrictHostKeyChecking=no -o ConnectTimeout=60 "${SSH_USER}@${ip}" \
    "sudo env BEDROCK_ASSUME_ROLE_ARN=$(q "$BEDROCK_ASSUME_ROLE_ARN") BEDROCK_EXTERNAL_ID=$(q "$BEDROCK_EXTERNAL_ID") S3_SYNC_CHOWN_USER=$(q "${SSH_USER}") S3_SYNC_CHOWN_GROUP=$(q "${SVC_GROUP}") bash /tmp/oscal-bedrock-dropin.sh && rm -f /tmp/oscal-bedrock-dropin.sh"; then
    print_error "Bedrock env apply failed on ${ip}"
    return 1
  fi
  print_success "Bedrock assume-role configured: ${BEDROCK_ASSUME_ROLE_ARN}"
  if [ -z "${BEDROCK_EXTERNAL_ID:-}" ]; then
    print_warning "bedrock_external_id not set in terraform.tfvars — add it if Account B trust policy requires ExternalId"
  fi
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

  local rds_timeout="${DEPLOY_RDS_BOOTSTRAP_TIMEOUT_SEC:-600}"
  print_info "Running RDS bootstrap on instance (logs stream below; timeout ${rds_timeout}s)..."
  q() { printf '%q' "$1"; }
  local remote_cmd
  remote_cmd="sudo env AWS_DEFAULT_REGION=$(q "$aws_reg") RDS_HOST=$(q "$rds_host") RDS_PORT=$(q "$rds_port") DB_NAME=$(q "$rds_db") ADMIN_USER=$(q "$admin_user") SECRET_ARN=$(q "$secret_arn") IAM_USER=$(q "$iam_user") FORCE=$(q "$force") RESTART_OSCAL_SERVICE=0 bash /tmp/rds-bootstrap-on-instance.sh"
  if [ "$rds_timeout" = "0" ]; then
    if ! ssh -i "$key" -o StrictHostKeyChecking=no -o ConnectTimeout=120 \
      -o ServerAliveInterval=15 -o ServerAliveCountMax=40 \
      "${SSH_USER}@${ip}" "$remote_cmd"; then
      print_error "RDS bootstrap failed on ${ip}. Check IAM (Secrets Manager + rds-db:connect), SG RDS access, and terraform outputs."
      return 1
    fi
  elif ! ssh -i "$key" -o StrictHostKeyChecking=no -o ConnectTimeout=120 \
    -o ServerAliveInterval=15 -o ServerAliveCountMax=40 \
    "${SSH_USER}@${ip}" "timeout ${rds_timeout} ${remote_cmd}"; then
    print_error "RDS bootstrap failed or timed out after ${rds_timeout}s on ${ip}. Set DEPLOY_RDS_BOOTSTRAP_SKIP=1 to skip on repeat deploys, or check /opt/oscal/app/logs and dnf lock (ec2_automation OS updates)."
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
  local sm_arn
  sm_arn="${PASS_SYNC_SECRET_ARN:-}"
  sm_arn=$(printf '%s' "$sm_arn" | tr -d '\r\n')
  port="${OSCAL_APP_PORT:-3020}"
  print_info "Deploying to $role at $ip (port $port)..."

  deploy_one__set_instance_maintenance_flag "$ip" "$key" on
  # shellcheck disable=SC2064
  trap "deploy_one__set_instance_maintenance_flag '$ip' '$key' off" RETURN

  if [ "${DEPLOY_SKIP_OS_PACKAGE_UPDATE:-1}" = "1" ]; then
    print_info "Skipping OS package update during deploy (DEPLOY_SKIP_OS_PACKAGE_UPDATE=1; avoids kernel reboot and ASG instance replacement)."
  else
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
  fi

  # Ensure service account svc_ams-oscal and group oscal exist (no pass vault on EC2 — secrets in AWS SM).
  ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" bash -s "$SSH_USER" << 'REMOTESVC' || true
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
REMOTESVC
  print_success "Service account $SVC_USER ensured"

  # Directory layout: /opt/oscal/app = app code only; /opt/oscal/data = config.json + users.json (canonical on EC2); /opt/oscal/scripts = ec2_automation. Repo config/ is excluded from S3 installer sync so only /opt/oscal/data is used.
  ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "sudo mkdir -p /opt/oscal/app /opt/oscal/scripts /opt/oscal/data && sudo chown -R ${SSH_USER}:${SVC_GROUP} /opt/oscal && sudo chmod -R g+rX,g+w /opt/oscal" || true

  # Shared config/users: optional S3 restore (never overwrites good local config unless DEPLOY_CONFIG_S3_FORCE=1).
  if [ -n "$s3_bucket" ] && [ "${DEPLOY_CONFIG_S3_SKIP:-0}" != "1" ]; then
    local sync_lib="$REPO_ROOT/scripts/lib/config-s3-sync.sh"
    if [ -f "$sync_lib" ]; then
      scp -i "$key" -o StrictHostKeyChecking=no "$sync_lib" "${SSH_USER}@${ip}:/tmp/config-s3-sync.sh" 2>/dev/null || true
      local config_s3_force=0
      [ "${DEPLOY_CONFIG_S3_FORCE:-0}" = "1" ] && config_s3_force=1
      print_info "Syncing config.json/users.json from S3 (force=${config_s3_force}; local EBS kept when newer)..."
      if ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" bash -s "$s3_bucket" "${AWS_DEPLOY_REGION:-us-east-1}" "$role" "$config_s3_force" <<'CONFIGSYNC'
set -euo pipefail
BUCKET="$1"
REGION="$2"
ROLE="$3"
FORCE="$4"
export AWS_DEFAULT_REGION="$REGION"
# shellcheck source=/dev/null disable=SC1091
. /tmp/config-s3-sync.sh
config_s3_set_search_prefixes_for_role "$ROLE"
sudo mkdir -p /opt/oscal/data
sudo chown -R "${S3_SYNC_CHOWN_USER:-ec2-user}:${S3_SYNC_CHOWN_GROUP:-oscal}" /opt/oscal/data 2>/dev/null || \
  sudo chown -R ec2-user:oscal /opt/oscal/data 2>/dev/null || true
if [ -f /opt/oscal/data/config.json ] && [ "$(wc -c </opt/oscal/data/config.json | tr -d ' ')" -ge 256 ]; then
  config_s3_backup_to_active "$BUCKET" /opt/oscal/data/config.json /opt/oscal/data/users.json "$REGION" || true
fi
if [ "$FORCE" = "1" ]; then
  rm -f /opt/oscal/data/.config-s3-sync.json
fi
need_config=0
need_users=0
[ ! -f /opt/oscal/data/config.json ] && need_config=1
[ ! -s /opt/oscal/data/config.json ] && need_config=1
[ ! -f /opt/oscal/data/users.json ] && need_users=1
if [ "$FORCE" = "1" ] || [ "$need_config" = "1" ] || [ "$need_users" = "1" ]; then
  config_s3_sync_shared_to_local "$BUCKET" /opt/oscal/data/config.json /opt/oscal/data/users.json "$REGION" "$FORCE"
fi
cfg_bytes=0
if [ -f /opt/oscal/data/config.json ]; then
  cfg_bytes=$(wc -c </opt/oscal/data/config.json | tr -d ' ')
fi
if [ "${cfg_bytes:-0}" -lt 256 ]; then
  if config_s3_restore_from_default "$BUCKET" /opt/oscal/data/config.json /opt/oscal/data/users.json "$REGION"; then
    echo "[config] Restored missing/invalid config from s3://${BUCKET}/config/default/ (config.default)"
  fi
fi
rm -f /tmp/config-s3-sync.sh
CONFIGSYNC
      then
        print_success "Shared config/users S3 sync step complete"
      else
        print_warning "Shared S3 config sync failed or no backup found on S3 yet."
      fi
    else
      print_warning "Missing scripts/lib/config-s3-sync.sh; skipping shared config restore."
    fi
  fi
  need_seed=$(ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "[ -f /opt/oscal/data/config.json ] && [ -f /opt/oscal/data/users.json ] && echo no || echo yes" 2>/dev/null) || need_seed="yes"
  if [ "$need_seed" = "yes" ] && [ "${DEPLOY_LOCAL_CONFIG_SEED:-0}" = "1" ] && [ -f "$REPO_ROOT/config/app/config.json" ] && [ -f "$REPO_ROOT/config/app/users.json" ]; then
    scp -i "$key" -o StrictHostKeyChecking=no "$REPO_ROOT/config/app/config.json" "$REPO_ROOT/config/app/users.json" "${SSH_USER}@${ip}:/tmp/" 2>/dev/null && \
    ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "mv -f /tmp/config.json /tmp/users.json /opt/oscal/data/" 2>/dev/null && \
    print_success "Seeded /opt/oscal/data/config.json and users.json from repo (DEPLOY_LOCAL_CONFIG_SEED=1)"
  elif [ "$need_seed" = "yes" ]; then
    if [ -n "$s3_bucket" ]; then
      print_warning "config.json/users.json still missing on instance; ensure Green has backed up to s3://${s3_bucket}/config/active/ (or config/green/), or set DEPLOY_LOCAL_CONFIG_SEED=1."
    else
      print_warning "config.json/users.json still missing on instance; set DEPLOY_LOCAL_CONFIG_SEED=1 with local config/app files or configure S3 restore."
    fi
  fi

  if [ -z "$s3_bucket" ]; then
    print_error "S3 bucket unknown (Terraform output s3_logs_bucket_name); cannot deploy from installer/."
    return 1
  fi

  print_info "S3 golden config (config.default): s3://${s3_bucket}/config/default/ — restore: scripts/debug/restore-config-from-s3-default.sh"

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
  --include 'config/catalogues/**' \
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
  # aws s3 sync may skip same-size package.json (1.7.24 vs 1.7.25); reconcile all package.json copies from manifest.
  if command -v jq >/dev/null 2>&1; then
    MANIFEST_VER=$(jq -r '.package_version // empty' "$MF" 2>/dev/null)
    needs_reconcile=0
    for REL in package.json frontend/package.json backend/package.json; do
      [ -f "${APP}/${REL}" ] || continue
      DISK_VER=$(jq -r '.version // empty' "${APP}/${REL}" 2>/dev/null)
      if [ -n "$MANIFEST_VER" ] && [ -n "$DISK_VER" ] && [ "$MANIFEST_VER" != "$DISK_VER" ]; then
        needs_reconcile=1
        break
      fi
    done
    if [ "$needs_reconcile" = "1" ]; then
      echo "=== $(date -Iseconds) installer version drift manifest=${MANIFEST_VER}; forcing package.json files from S3 ===" | tee -a "$SYNC_LOG"
      for REL in package.json frontend/package.json backend/package.json; do
        if aws s3api head-object --bucket "$BUCKET" --key "installer/${REL}" --region "$REGION" >/dev/null 2>&1; then
          aws s3 cp "s3://${BUCKET}/installer/${REL}" "${APP}/${REL}" --region "$REGION"
        fi
      done
      DISK_VER=$(jq -r '.version // empty' "${APP}/frontend/package.json" 2>/dev/null)
      if [ -z "$DISK_VER" ]; then
        DISK_VER=$(jq -r '.version // empty' "${APP}/package.json" 2>/dev/null)
      fi
      if [ -n "$MANIFEST_VER" ] && [ "$MANIFEST_VER" != "$DISK_VER" ]; then
        echo "installer verify failed: frontend/package.json still ${DISK_VER} after reconcile (expected ${MANIFEST_VER})" >&2
        exit 1
      fi
      echo "=== $(date -Iseconds) installer version reconcile OK (${DISK_VER}) ===" | tee -a "$SYNC_LOG"
    fi
  fi
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

  # Keep config/catalogues/ for frontend build; app config.json lives on EBS (/opt/oscal/data), not in the installer tree.
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
    if [ -f \"\$APP/scripts/lib/config-s3-sync.sh\" ]; then
      sudo mkdir -p /opt/oscal/scripts/lib
      sudo cp \"\$APP/scripts/lib/config-s3-sync.sh\" /opt/oscal/scripts/lib/
    fi
    if [ -d \"\$APP/scripts/debug\" ]; then
      sudo mkdir -p /opt/oscal/scripts/debug
      for _dbg in update-pass-credential.sh backup-config-to-s3.sh sync-config-from-s3-newest.sh push-pass-to-secrets-manager.sh pull-secrets-manager-to-pass.sh; do
        if [ -f \"\$APP/scripts/debug/\$_dbg\" ]; then
          sudo cp \"\$APP/scripts/debug/\$_dbg\" /opt/oscal/scripts/debug/
          sudo chmod +x \"/opt/oscal/scripts/debug/\$_dbg\"
        fi
      done
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
S3_CONFIG_PREFIX=config/active
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
OSCAL_APP_PORT=${OSCAL_APP_PORT:-3020}
PASS_SECRETS_SYNC_ENABLED=false
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

  # After lib is installed: optional S3 config pull (same rules as pre-install; default keeps local EBS).
  if [ -n "$s3_bucket" ] && [ "${DEPLOY_CONFIG_S3_SKIP:-0}" != "1" ]; then
    local post_config_force=0
    [ "${DEPLOY_CONFIG_S3_FORCE:-0}" = "1" ] && post_config_force=1
    print_info "Post-install config/users S3 sync (force=${post_config_force})..."
    if ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" bash -s "$s3_bucket" "${AWS_DEPLOY_REGION:-us-east-1}" "$role" "$post_config_force" <<'POSTCONFIGSYNC'
set -euo pipefail
BUCKET="$1"
REGION="$2"
ROLE="$3"
FORCE="$4"
export AWS_DEFAULT_REGION="$REGION"
LIB=/opt/oscal/scripts/lib/config-s3-sync.sh
if [ ! -f "$LIB" ]; then
  exit 0
fi
# shellcheck source=/dev/null disable=SC1091
. "$LIB"
config_s3_set_search_prefixes_for_role "$ROLE"
if [ -f /opt/oscal/data/config.json ] && [ "$(wc -c </opt/oscal/data/config.json | tr -d ' ')" -ge 256 ]; then
  config_s3_backup_to_active "$BUCKET" /opt/oscal/data/config.json /opt/oscal/data/users.json "$REGION" || true
fi
if [ "$FORCE" = "1" ]; then
  rm -f /opt/oscal/data/.config-s3-sync.json
  config_s3_sync_shared_to_local "$BUCKET" /opt/oscal/data/config.json /opt/oscal/data/users.json "$REGION" 1
elif [ ! -s /opt/oscal/data/config.json ] || [ ! -f /opt/oscal/data/users.json ]; then
  config_s3_sync_shared_to_local "$BUCKET" /opt/oscal/data/config.json /opt/oscal/data/users.json "$REGION" 0
fi
cfg_bytes=0
if [ -f /opt/oscal/data/config.json ]; then
  cfg_bytes=$(wc -c </opt/oscal/data/config.json | tr -d ' ')
fi
if [ "${cfg_bytes:-0}" -lt 256 ]; then
  if config_s3_restore_from_default "$BUCKET" /opt/oscal/data/config.json /opt/oscal/data/users.json "$REGION"; then
    echo "[config] Post-install: restored from s3://${BUCKET}/config/default/ (config.default)"
  fi
fi
if [ "${CONFIG_S3_SYNC_CHANGED:-0}" = "1" ]; then
  sudo systemctl restart oscal-reporter.service 2>/dev/null || true
fi
POSTCONFIGSYNC
    then
      print_success "Shared config/users sync complete"
    else
      print_warning "Post-install shared config sync failed (check S3 backups under config/active/, config/green/, config/blue/)"
    fi
  fi

  maybe_apply_rds_bootstrap "$ip" "$key"
  maybe_apply_bedrock_cross_account "$ip" "$key"

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
    rm -rf backend/public
    mkdir -p backend/public
    cp -r frontend/dist/* backend/public/
    test -s backend/public/index.html
    if [ -n \"${sm_arn}\" ] && [ \"${DEPLOY_MIGRATE_CONFIG_SM:-0}\" = \"1\" ] && [ -f backend/scripts/migrate-config-to-sm.mjs ]; then
      sudo -u $SVC_USER env OSCAL_SECRETS_MODE=aws-sm OSCAL_SECRETS_MANAGER_ARN='${sm_arn}' CONFIG_PATH=/opt/oscal/data/config.json AWS_DEFAULT_REGION=${AWS_DEPLOY_REGION:-us-east-1} node backend/scripts/migrate-config-to-sm.mjs 2>/dev/null || echo 'Secret migration skipped or already complete'
    fi
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
Environment=OSCAL_SECRETS_MODE=aws-sm
Environment=OSCAL_SECRETS_MANAGER_ARN=SM_ARN_PLACEHOLDER
Environment=PATH=/usr/local/bin:/usr/bin:/bin
# Secrets resolved from AWS SM in-memory cache (GUI save writes bundle + _sm pointers in config)

[Install]
WantedBy=multi-user.target
SVCEOF
        SVC_HOME=/var/lib/svc_ams-oscal
        sudo sed -i \"s/PORT_PLACEHOLDER/$port/g;s/SVC_USER_PLACEHOLDER/$SVC_USER/g;s/SVC_GROUP_PLACEHOLDER/$SVC_GROUP/g;s|SM_ARN_PLACEHOLDER|${sm_arn}|g\" /etc/systemd/system/oscal-reporter.service
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
    # Ensure PORT matches OSCAL_APP_PORT (default 3020) so health check and ALB target use correct port
    sudo sed -i \"s/^Environment=PORT=.*/Environment=PORT=$port/\" /etc/systemd/system/oscal-reporter.service 2>/dev/null || true
    grep -q '^User=' /etc/systemd/system/oscal-reporter.service 2>/dev/null || { sudo sed -i '/^\[Service\]/a User=$SVC_USER' /etc/systemd/system/oscal-reporter.service; sudo sed -i '/^User=/a Group=$SVC_GROUP' /etc/systemd/system/oscal-reporter.service; sudo systemctl daemon-reload; sudo systemctl restart oscal-reporter.service 2>/dev/null; }
    grep -q 'Environment=PATH=' /etc/systemd/system/oscal-reporter.service 2>/dev/null || { sudo sed -i '/Environment=USERS_PATH=/a Environment=PATH=/usr/local/bin:/usr/bin:/bin' /etc/systemd/system/oscal-reporter.service; sudo systemctl daemon-reload; sudo systemctl restart oscal-reporter.service 2>/dev/null; }
    grep -q 'Environment=OSCAL_SECRETS_MODE=' /etc/systemd/system/oscal-reporter.service 2>/dev/null || { sudo sed -i '/Environment=USERS_PATH=/a Environment=OSCAL_SECRETS_MODE=aws-sm' /etc/systemd/system/oscal-reporter.service; sudo systemctl daemon-reload; sudo systemctl restart oscal-reporter.service 2>/dev/null; }
    if [ -n \"${sm_arn}\" ]; then
      if grep -q 'Environment=OSCAL_SECRETS_MANAGER_ARN=' /etc/systemd/system/oscal-reporter.service 2>/dev/null; then
        sudo sed -i \"s|^Environment=OSCAL_SECRETS_MANAGER_ARN=.*|Environment=OSCAL_SECRETS_MANAGER_ARN=${sm_arn}|\" /etc/systemd/system/oscal-reporter.service 2>/dev/null || true
      else
        sudo sed -i \"/Environment=OSCAL_SECRETS_MODE=/a Environment=OSCAL_SECRETS_MANAGER_ARN=${sm_arn}\" /etc/systemd/system/oscal-reporter.service 2>/dev/null || true
      fi
      sudo systemctl daemon-reload
      sudo systemctl restart oscal-reporter.service 2>/dev/null || true
    fi
    sudo sed -i '/Environment=PASSWORD_STORE_DIR=/d' /etc/systemd/system/oscal-reporter.service 2>/dev/null || true
    sudo systemctl daemon-reload
    sudo systemctl restart oscal-reporter.service 2>/dev/null || true
    echo OK
  " || {
    print_error "npm install/build or service setup failed on $role ($ip). Check frontend build and backend/public/index.html."
    [ -n "$results_file" ] && [ -f "$results_file" ] && echo "$role $ip fail" >> "$results_file"
    return 1
  }

  print_success "Deployed to $role at $ip"
  if [ -n "$sm_arn" ]; then
    print_info "Ensuring SESSION_SECRET systemd drop-in from Secrets Manager bundle..."
    if ! ensure_oscal_session_secret_systemd "$ip" "$key" "$SSH_USER" "$sm_arn" "${AWS_DEPLOY_REGION:-us-east-1}"; then
      print_warning "SESSION_SECRET bootstrap failed; config screen may fail until SESSION_SECRET is set"
    fi
  fi
  print_info "Ensuring Generic OIDC TLS relaxed env for Authentik/homelab IdPs (DEPLOY_GENERIC_OIDC_TLS_RELAXED=${DEPLOY_GENERIC_OIDC_TLS_RELAXED:-1})..."
  if ! ensure_generic_oidc_tls_relaxed_systemd "$ip" "$key" "$SSH_USER"; then
    print_warning "Generic OIDC TLS drop-in failed; set tlsRelaxed:true in config or OSCAL_GENERIC_OIDC_TLS_RELAXED=1"
  fi
  # Restart so new code and env (HOME/PASSWORD_STORE_DIR) are active
  print_info "Restarting oscal-reporter.service..."
  ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "sudo systemctl restart oscal-reporter.service" 2>/dev/null || true
  # Verify app responds. Public curl often fails: SG allows only ALB/VPC/self on OSCAL_APP_PORT, not the internet.
  print_info "Waiting 20s then checking /health/ready (retry up to 5 times)..."
  sleep 20
  health_ok=""
  health_via_ssh=""
  for attempt in 1 2 3 4 5; do
    if curl -sf --connect-timeout 5 "http://${ip}:${port}/health/ready" >/dev/null 2>&1; then
      health_ok=1
      break
    fi
    [ "$attempt" -lt 5 ] && sleep 5
  done
  if [ -z "$health_ok" ]; then
    # Fallback: check from inside instance (SG does not affect localhost).
    if ssh -i "$key" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "${SSH_USER}@${ip}" \
      "curl -sf --connect-timeout 5 http://127.0.0.1:${port}/health/ready >/dev/null && curl -sf --connect-timeout 5 -o /dev/null http://127.0.0.1:${port}/" 2>/dev/null; then
      health_ok=1
      health_via_ssh=1
    fi
  fi
  if [ -n "$health_ok" ]; then
    if [ -n "$health_via_ssh" ]; then
      print_success "App /health/ready OK on instance (localhost only). Direct http://${ip}:${port}/ is blocked by SG -- use ALB URL to reach the app."
      [ -n "$results_file" ] && [ -f "$results_file" ] && echo "$role $ip ok_ssh" >> "$results_file"
    else
      print_success "App is up at http://${ip}:${port}/health/ready"
      [ -n "$results_file" ] && [ -f "$results_file" ] && echo "$role $ip ok" >> "$results_file"
    fi
    if [ -x "$REPO_ROOT/scripts/ci/post-deploy-smoke.sh" ]; then
      smoke_host="ssh:${ip}"
      if SSH_USER="$SSH_USER" SSH_KEY="$key" "$REPO_ROOT/scripts/ci/post-deploy-smoke.sh" "$smoke_host" "$port"; then
        print_success "Post-deploy smoke checks passed on $role"
      else
        print_error "Post-deploy smoke checks failed on $role"
        [ -n "$results_file" ] && [ -f "$results_file" ] && echo "$role $ip fail" >> "$results_file"
      fi
    fi
  else
    print_warning "App /health/ready not yet responding at http://${ip}:${port}/health/ready (check: sudo systemctl status oscal-reporter.service; backend/public/index.html; config on EBS at /opt/oscal/data)"
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
  echo "--- ss listening (${OSCAL_APP_PORT:-3020} or node) ---"
  ss -tlnp 2>/dev/null | grep -E ":${OSCAL_APP_PORT:-3020}\\b" || ss -tlnp 2>/dev/null | grep node || echo "ss: no matching listener"
  echo "--- curl http://127.0.0.1:$1/health/ready ---"
  curl -sS -w "\nhttp_code:%{http_code}\n" --connect-timeout 5 "http://127.0.0.1:$1/health/ready" || echo "curl_127_ready_fail"
  echo "--- curl http://127.0.0.1:$1/ (SPA) ---"
  curl -sS -w "\nhttp_code:%{http_code}\n" --connect-timeout 5 -o /dev/null "http://127.0.0.1:$1/" || echo "curl_127_root_fail"
  if [ -n "$3" ]; then
    echo "--- curl http://$3:$1/health/ready (same host private IP) ---"
    curl -sS -w "\nhttp_code:%{http_code}\n" --connect-timeout 5 "http://$3:$1/health/ready" || echo "curl_private_fail"
  else
    echo "--- skip private-IP curl (no private IP in tf output) ---"
  fi
} 2>&1 | sudo tee -a "$LOG" >/dev/null
DEPLOYLOGLOCAL
  print_info "ALB idle_timeout should be 300s (see terraform/alb.tf) to avoid 504 on long requests."
}

# Set/clear on-instance flag so ec2_automation skips S3 installer sync and OS updates during deploy.
deploy_one__set_instance_maintenance_flag() {
  local ip="$1"
  local key="$2"
  local action="$3"
  case "$action" in
    on)
      ssh -i "$key" -o StrictHostKeyChecking=no -o ConnectTimeout=15 "${SSH_USER}@${ip}" \
        'sudo mkdir -p /opt/oscal/data && sudo touch /opt/oscal/data/.deploy_maintenance && sudo chown svc_ams-oscal:oscal /opt/oscal/data/.deploy_maintenance 2>/dev/null || true' \
        2>/dev/null || true
      ;;
    off)
      ssh -i "$key" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "${SSH_USER}@${ip}" \
        'sudo rm -f /opt/oscal/data/.deploy_maintenance' 2>/dev/null || true
      ;;
  esac
}

# Enter ALB/ASG maintenance, deploy, wait for target health, restore routing.
get_oscal_active_role() {
  local role
  role=$(tf_output -raw oscal_active_role 2>/dev/null | tr -d '\r\n' || true)
  [ -n "$role" ] && [ "$role" != "null" ] && printf '%s' "$role" || printf '%s' "blue"
}

get_oscal_passive_role() {
  local role
  role=$(tf_output -raw oscal_passive_role 2>/dev/null | tr -d '\r\n' || true)
  [ -n "$role" ] && [ "$role" != "null" ] && printf '%s' "$role" || printf '%s' "green"
}

resolve_oscal_role_ip() {
  local role="$1"
  case "$role" in
    green) printf '%s' "${GREEN_IP:-}" ;;
    blue) printf '%s' "${BLUE_IP:-}" ;;
    *) return 1 ;;
  esac
}

# active_passive: deploy passive, cutover ALB, deploy active, restore steady primary weights.
deploy_passive_first_both() {
  local passive active passive_ip active_ip
  passive=$(get_oscal_passive_role)
  active=$(get_oscal_active_role)
  passive_ip=$(resolve_oscal_role_ip "$passive")
  active_ip=$(resolve_oscal_role_ip "$active")
  [ -z "$passive_ip" ] || [ -z "$active_ip" ] && {
    print_error "Could not resolve IPs for passive ($passive) and active ($active) roles."
    return 1
  }

  print_info "Passive-first deploy: passive=$passive ($passive_ip) → ALB cutover → active=$active ($active_ip) → steady ($active)."

  print_info "Step 1/4: deploy passive color ($passive)..."
  deploy_role_with_maintenance "$passive" "$passive_ip" || return 1

  print_info "Step 2/4: cutover ALB to passive ($passive) before touching active ($active)..."
  if declare -F oscal_traffic_mode_enter >/dev/null 2>&1; then
    oscal_traffic_mode_enter failover || {
      print_error "ALB cutover to passive failed; aborting before active deploy."
      return 1
    }
  else
    print_error "oscal_traffic_mode_enter unavailable; cannot cutover safely."
    return 1
  fi

  print_info "Step 3/4: deploy active color ($active) while traffic is on passive..."
  deploy_role_with_maintenance "$active" "$active_ip" || {
    print_error "Active deploy failed while traffic is on passive ($passive). Fix and re-run; do not restore steady until active is healthy."
    return 1
  }

  print_info "Step 4/4: restore steady ALB weights to primary ($active)..."
  if declare -F oscal_traffic_mode_enter >/dev/null 2>&1; then
    oscal_traffic_mode_enter steady || print_warning "Could not restore steady traffic mode; run: oscal_traffic_mode_enter steady"
  fi
  return 0
}

deploy_role_with_maintenance() {
  local role="$1"
  local ip="$2"
  local maintenance_enabled=0
  local deploy_rc=0
  local live_ip=""

  if [ "${DEPLOY_MAINTENANCE_MODE:-1}" = "1" ]; then
    print_info "Entering deploy maintenance for $role (ALB → peer color only; ASG suspend + scale-in protection)..."
    if deploy_maintenance_enter "$role"; then
      maintenance_enabled=1
    else
      print_warning "Maintenance enter failed; deploy may be interrupted by ASG/ALB fault tolerance."
    fi
  fi

  if [ "${DEPLOY_USE_ASG_IP:-1}" = "1" ]; then
    if [ "$role" = "green" ] && [ -z "${GREEN_ONLY_IP:-}" ]; then
      live_ip=$(get_asg_oscal_ip green 2>/dev/null || true)
      [ -n "$live_ip" ] && ip="$live_ip"
    elif [ "$role" = "blue" ] && [ -z "${BLUE_ONLY_IP:-}" ]; then
      live_ip=$(get_asg_oscal_ip blue 2>/dev/null || true)
      [ -n "$live_ip" ] && ip="$live_ip"
    fi
    print_info "Deploy target IP ($role): $ip"
  fi

  deploy_one "$ip" "$role" "$SSH_KEY" "$S3_BUCKET" "$DEPLOY_RESULTS_FILE" || deploy_rc=$?

  if [ "$maintenance_enabled" = "1" ]; then
    if [ "$deploy_rc" -eq 0 ]; then
      print_info "Waiting for ALB target health on $role before restoring weighted routing..."
      ready_for_traffic=0
      if deploy_maintenance_wait_target_healthy "$role"; then
        print_success "ALB target $role is healthy."
        if deploy_maintenance_verify_instance_ready "$ip" "$SSH_KEY" "${OSCAL_APP_PORT:-3020}" "$SSH_USER"; then
          ready_for_traffic=1
        else
          print_error "Instance $role failed SPA/readiness checks; keeping peer color at 100% until fixed."
          deploy_rc=1
        fi
      else
        print_error "ALB target $role not healthy; not restoring weighted routing."
        deploy_rc=1
      fi
      if [ "$ready_for_traffic" = "1" ]; then
        print_info "Exiting deploy maintenance for $role..."
        deploy_maintenance_exit "$role" || true
      else
        print_warning "Leaving deploy maintenance active for $role (peer carries traffic). Re-run deploy or fix manually, then: deploy_maintenance_exit $role"
        return "$deploy_rc"
      fi
      return "$deploy_rc"
    else
      print_warning "Deploy failed for $role; restoring ALB/ASG maintenance state."
    fi
    print_info "Exiting deploy maintenance for $role..."
    deploy_maintenance_exit "$role" || true
  fi

  return "$deploy_rc"
}

# --- main ---
# Deploy target: green (default), blue, or both. With --green-only/--blue-only IP we also set the IP.
UPDATE_S3_ONLY=0
DEPLOY_TARGET="green"
DEPLOY_SINGLE_COLOR=0
DEPLOY_PASSIVE_FIRST_FLOW=0
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
      DEPLOY_SINGLE_COLOR=1
      shift
      ;;
    --blue-only)
      shift
      BLUE_ONLY_IP="${1:?Give IP after --blue-only}"
      DEPLOY_TARGET="blue"
      DEPLOY_SINGLE_COLOR=1
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--update-s3 | -updateS3] [--both | --blue | [--green-only IP] | [--blue-only IP]]"
      echo "  Default: EC2 pulls existing s3://<bucket>/installer/ with aws s3 sync (no upload from this laptop)."
      echo "  --update-s3 | -updateS3: upload this repo to installer/ (needs AWS_PASS_ENTRY + operator S3 write); no SSH / no EC2 deploy."
      echo "  --both:    deploy both colors (passive-first when active_passive)."
      echo "  --blue:    deploy to blue only (active color; risky in active_passive)."
      echo "  (default): active_passive → passive-first both; else green only. DEPLOY_PASSIVE_FIRST=0 for green-only."
      echo "  --green-only IP: deploy to green at given IP."
      echo "  --blue-only IP:  deploy to blue at given IP."
      echo "  Maintenance: DEPLOY_MAINTENANCE_MODE=1 (default) drains ALB to peer color and suspends target ASG during deploy."
      echo "  IPs: DEPLOY_USE_ASG_IP=1 (default) uses live ASG InService instance; falls back to Terraform output."
      echo "  OS updates: DEPLOY_SKIP_OS_PACKAGE_UPDATE=1 (default) during deploy; set 0 to run dnf/yum upgrade first."
      echo "  Terraform: DEPLOY_TERRAFORM_APPLY=0 (default); set 1 to run terraform apply after deploy."
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

# Resolve IPs: explicit --*-only, else live ASG (preferred), else Terraform output
if [ -n "$GREEN_ONLY_IP" ]; then
  GREEN_IP="$GREEN_ONLY_IP"
fi
if [ -n "$BLUE_ONLY_IP" ]; then
  BLUE_IP="$BLUE_ONLY_IP"
fi
if [ "${DEPLOY_USE_ASG_IP:-1}" = "1" ] && { [ -z "${GREEN_IP:-}" ] || [ -z "${BLUE_IP:-}" ]; }; then
  load_deploy_aws_credentials || print_warning "Could not load AWS credentials for ASG IP lookup; using Terraform output if available."
fi
if [ -z "${GREEN_IP:-}" ] || [ -z "${BLUE_IP:-}" ]; then
  if [ "${DEPLOY_USE_ASG_IP:-1}" = "1" ]; then
    [ -z "${GREEN_IP:-}" ] && GREEN_IP=$(get_asg_oscal_ip green 2>/dev/null || true)
    [ -z "${BLUE_IP:-}" ] && BLUE_IP=$(get_asg_oscal_ip blue 2>/dev/null || true)
  fi
fi
if [ -z "${GREEN_IP:-}" ] || [ -z "${BLUE_IP:-}" ]; then
  IPS=$(get_terraform_ips "$TERRAFORM_DIR" || true)
  if [ -n "$IPS" ]; then
    [ -z "${GREEN_IP:-}" ] && GREEN_IP=$(echo "$IPS" | awk '{print $1}')
    [ -z "${BLUE_IP:-}" ] && BLUE_IP=$(echo "$IPS" | awk '{print $2}')
  fi
fi
if [ -n "${GREEN_IP:-}" ] || [ -n "${BLUE_IP:-}" ]; then
  print_info "Using Terraform dir: $TERRAFORM_DIR"
  print_info "Green: ${GREEN_IP:-n/a}  Blue: ${BLUE_IP:-n/a}"
else
  print_error "Could not resolve instance IPs (ASG or Terraform). Run after apply or use --green-only IP / --blue-only IP"
  echo "  Set TERRAFORM_DIR to the directory that contains terraform.tfstate for your stack."
  exit 1
fi

# Default: green only unless active_passive upgrades to passive-first both.
case "$DEPLOY_TARGET" in
  both)  DEPLOY_GREEN=1; DEPLOY_BLUE=1 ;;
  blue)  DEPLOY_GREEN=0; DEPLOY_BLUE=1 ;;
  green) DEPLOY_GREEN=1; DEPLOY_BLUE=0 ;;
  *)     DEPLOY_GREEN=1; DEPLOY_BLUE=0 ;;
esac

if [ "${DEPLOY_SINGLE_COLOR:-0}" != "1" ] \
  && [ "${DEPLOY_PASSIVE_FIRST:-1}" = "1" ] \
  && declare -F oscal_traffic_mode_is_active_passive >/dev/null 2>&1 \
  && oscal_traffic_mode_is_active_passive \
  && { [ "$DEPLOY_TARGET" = "green" ] || [ "$DEPLOY_TARGET" = "both" ]; }; then
  DEPLOY_TARGET="both"
  DEPLOY_GREEN=1
  DEPLOY_BLUE=1
  DEPLOY_PASSIVE_FIRST_FLOW=1
  print_info "Deploy target: passive-first both (active_passive default)."
elif [ "$DEPLOY_TARGET" = "green" ]; then
  print_info "Deploy target: green only. Use --both or set DEPLOY_PASSIVE_FIRST=1 in active_passive."
elif [ "$DEPLOY_TARGET" = "both" ]; then
  print_info "Deploy target: both green and blue (active color first unless DEPLOY_PASSIVE_FIRST=1)."
elif [ "$DEPLOY_TARGET" = "blue" ]; then
  print_warning "Deploy target: blue only (production color in active_passive). Prefer default passive-first both."
fi

[ -z "$GREEN_IP" ] && [ -z "$BLUE_IP" ] && { print_error "No instance IPs"; exit 1; }

resolve_ssh_key

# S3 bucket for ec2_automation.env on instances (backup target; config/users live on EBS)
S3_BUCKET=$(get_s3_bucket "$TERRAFORM_DIR" || true)

PASS_SYNC_SECRET_ARN=$(get_pass_sync_secret_arn "$TERRAFORM_DIR" || true)
PASS_SECRETS_SYNC_ENABLED_ON_INSTANCE=false
if [ -z "${PASS_SYNC_SECRET_ARN}" ] || [ "${PASS_SYNC_SECRET_ARN}" = "null" ]; then
  PASS_SYNC_SECRET_ARN=""
  print_warning "Terraform output oscal_pass_secrets_sync_secret_arn missing or null; systemd OSCAL_SECRETS_MANAGER_ARN will be empty until Terraform is applied."
else
  print_info "EC2 secrets: AWS Secrets Manager bundle ARN configured for systemd (OSCAL_SECRETS_MODE=aws-sm)."
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
  deploy_maintenance_trap_cleanup 2>/dev/null || true
  rm -f "$DEPLOY_RESULTS_FILE" 2>/dev/null || true
  if [ "${SSH_KEY_IS_TEMP:-0}" = "1" ] && [ -n "${SSH_KEY:-}" ]; then
    rm -f "$SSH_KEY" 2>/dev/null || true
  fi
}
trap cleanup_deploy_exit EXIT

# Passive-first both (active_passive) or legacy order (active first when both without passive-first).
if [ "${DEPLOY_PASSIVE_FIRST_FLOW:-0}" = "1" ]; then
  deploy_passive_first_both || exit 1
elif [ -n "$BLUE_IP" ] && [ "${DEPLOY_BLUE:-0}" = "1" ]; then
  deploy_role_with_maintenance "blue" "$BLUE_IP" || exit 1
fi
if [ "${DEPLOY_PASSIVE_FIRST_FLOW:-0}" != "1" ] && [ -n "$GREEN_IP" ] && [ "${DEPLOY_GREEN:-0}" = "1" ]; then
  deploy_role_with_maintenance "green" "$GREEN_IP" || exit 1
fi

# Cross-instance curls: pass IPs via bash -s and quoted heredoc so terraform values are never locally expanded (no $(...) injection).
if [ -n "$GREEN_IP" ] && [ -n "$BLUE_IP" ]; then
  print_info "Cross-instance curl tests (append to deployment.log on each host)..."
  _cross_curl_any=0
  if [ -n "$GREEN_PRIVATE" ]; then
    _cross_curl_any=1
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=15 "${SSH_USER}@${BLUE_IP}" bash -s "$GREEN_PRIVATE" "${OSCAL_APP_PORT:-3020}" <<'CROSSCURL_B_TO_G_PRIV'
LOG=/opt/oscal/app/logs/deployment.log
sudo mkdir -p /opt/oscal/app/logs
GP="$1"
APP_PORT="$2"
{
  echo "=== $(date -Iseconds) from-blue curl green-private:${APP_PORT} ==="
  curl -sS -w "\nhttp_code:%{http_code}\n" --connect-timeout 5 "http://${GP}:${APP_PORT}/health" || echo curl_fail
} 2>&1 | sudo tee -a "$LOG" >/dev/null
CROSSCURL_B_TO_G_PRIV
  fi
  if [ -n "$GREEN_PUBLIC" ]; then
    _cross_curl_any=1
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=15 "${SSH_USER}@${BLUE_IP}" bash -s "$GREEN_PUBLIC" "${OSCAL_APP_PORT:-3020}" <<'CROSSCURL_B_TO_G_PUB'
LOG=/opt/oscal/app/logs/deployment.log
GP="$1"
APP_PORT="$2"
{
  echo "=== $(date -Iseconds) from-blue curl green-public:${APP_PORT} ==="
  curl -sS -w "\nhttp_code:%{http_code}\n" --connect-timeout 5 "http://${GP}:${APP_PORT}/health" || echo curl_fail
} 2>&1 | sudo tee -a "$LOG" >/dev/null
CROSSCURL_B_TO_G_PUB
  fi
  if [ -n "$BLUE_PRIVATE" ]; then
    _cross_curl_any=1
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=15 "${SSH_USER}@${GREEN_IP}" bash -s "$BLUE_PRIVATE" "${OSCAL_APP_PORT:-3020}" <<'CROSSCURL_G_TO_B_PRIV'
LOG=/opt/oscal/app/logs/deployment.log
BP="$1"
APP_PORT="$2"
{
  echo "=== $(date -Iseconds) from-green curl blue-private:${APP_PORT} ==="
  curl -sS -w "\nhttp_code:%{http_code}\n" --connect-timeout 5 "http://${BP}:${APP_PORT}/health" || echo curl_fail
} 2>&1 | sudo tee -a "$LOG" >/dev/null
CROSSCURL_G_TO_B_PRIV
  fi
  if [ -n "$BLUE_PUBLIC" ]; then
    _cross_curl_any=1
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=15 "${SSH_USER}@${GREEN_IP}" bash -s "$BLUE_PUBLIC" "${OSCAL_APP_PORT:-3020}" <<'CROSSCURL_G_TO_B_PUB'
LOG=/opt/oscal/app/logs/deployment.log
BP="$1"
APP_PORT="$2"
{
  echo "=== $(date -Iseconds) from-green curl blue-public:${APP_PORT} ==="
  curl -sS -w "\nhttp_code:%{http_code}\n" --connect-timeout 5 "http://${BP}:${APP_PORT}/health" || echo curl_fail
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

# Summary: deployed instances and health
print_success "Deploy complete."
if [ -f "$DEPLOY_RESULTS_FILE" ] && [ -s "$DEPLOY_RESULTS_FILE" ]; then
  echo ""
  print_info "Summary:"
  while read -r role ip status; do
    [ -z "$role" ] && continue
    if [ "$status" = "ok" ]; then
      echo -e "  ${GREEN}✓${NC} $role ($ip): healthy"
    elif [ "$status" = "ok_ssh" ]; then
      echo -e "  ${GREEN}✓${NC} $role ($ip): healthy (localhost; use ALB -- SG blocks direct :${OSCAL_APP_PORT:-3020})"
    else
      echo -e "  ${RED}✗${NC} $role ($ip): /health/ready not responding"
    fi
  done < "$DEPLOY_RESULTS_FILE"
fi
echo ""
# Post-deploy: secrets migration reminder
print_info "EC2 secrets: config.json should use { \"_sm\": \"OSCAL/...\" } pointers only (see docs/AWS_OPERATIONS.md)."
print_info "If plaintext remains after deploy, run: ./scripts/debug/migrate-config-secrets-to-sm.sh green|blue"
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
print_info "ALB default listener uses weighted forward (Green / Blue on port ${OSCAL_APP_PORT:-3020}). Maintenance mode drains the deploy target color until deploy succeeds and the target is healthy."

# Optional Terraform apply (off by default — avoids launch-template refresh triggering ASG replacement during deploy).
if [ "${DEPLOY_TERRAFORM_APPLY:-0}" = "1" ]; then
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
else
  print_info "Skipping terraform apply (DEPLOY_TERRAFORM_APPLY=0). Run ./terraform/run-with-aws-pass.sh apply separately when infra changes are intended."
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