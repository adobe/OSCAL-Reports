#!/usr/bin/env bash
# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# ec2_automation.sh: Backup config/users/logs to S3; optional sync of app code from s3://<bucket>/<installer-prefix>/ (not Git);
# optional OS package updates (dnf upgrade -y or yum update -y from configured repos).
# EC2 app secrets are managed in-process via AWS Secrets Manager (OSCAL_SECRETS_MODE=aws-sm); no pass sync on cron.
# Runs every 10 min via cron (svc_ams-oscal).
# Requires env: S3_BUCKET, S3_CONFIG_PREFIX (config/active), S3_LOGS_PREFIX, DEPLOYMENT_ROLE (green|blue).
# Config/users: both colors share s3://<bucket>/config/active/; cron pulls newest among active/green/blue (last writer wins).
# Code sync: ENABLE_S3_INSTALLER_UPDATE (default false unless set in ec2_automation.env); when true, pulls installer/ from S3
# every S3_CODE_UPDATE_EVERY_N_CYCLES cron runs (default 100 → ~1000 min at 10-min cron). Excludes align with deploy-to-ec2.sh INSTALLERSYNC.
# Pass sync (deprecated): app reads/writes SM bundle directly; cron does not sync pass.
# Logs in OpenTelemetry-style JSONL to OSCAL project log directory.

set -e

# Source env file if present (written by deploy-to-ec2.sh)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
[ -f "$SCRIPT_DIR/ec2_automation.env" ] && . "$SCRIPT_DIR/ec2_automation.env"

OSCAL_APP_PORT="${OSCAL_APP_PORT:-3020}"

CONFIG_PATH="${CONFIG_PATH:-/opt/oscal/data/config.json}"
DATA_DIR="$(dirname "$CONFIG_PATH")"
USERS_PATH="${USERS_PATH:-/opt/oscal/data/users.json}"
LOG_DIR="${LOG_DIR:-/opt/oscal/app/logs}"
APP_DIR="${APP_DIR:-/opt/oscal/app}"
LOG_FILE="${LOG_DIR}/ec2_automation.jsonl"

# S3 installer sync (replaces historical GitHub pull on cron). Default false unless ec2_automation.env sets true (deploy sets DEPLOY_ENABLE_S3_INSTALLER_UPDATE=1 by default).
ENABLE_S3_INSTALLER_UPDATE="${ENABLE_S3_INSTALLER_UPDATE:-false}"
S3_INSTALLER_PREFIX="${S3_INSTALLER_PREFIX:-installer}"
S3_CODE_UPDATE_EVERY_N_CYCLES="${S3_CODE_UPDATE_EVERY_N_CYCLES:-100}"
# Owner for app tree during aws s3 sync (must match deploy INSTALLERSYNC: ec2-user can overwrite prior deploy files).
S3_SYNC_CHOWN_USER="${S3_SYNC_CHOWN_USER:-ec2-user}"
S3_SYNC_CHOWN_GROUP="${S3_SYNC_CHOWN_GROUP:-oscal}"
INSTALLER_CYCLE_FILE="${INSTALLER_CYCLE_FILE:-${DATA_DIR}/.ec2_automation_installer_cycle}"

# OS updates: Amazon Linux 2023 uses dnf (yum is a compatibility shim). When enabled, runs at most once per N cron invocations.
ENABLE_OS_PACKAGE_UPDATE="${ENABLE_OS_PACKAGE_UPDATE:-false}"
OS_PACKAGE_UPDATE_EVERY_N_CYCLES="${OS_PACKAGE_UPDATE_EVERY_N_CYCLES:-144}"
OS_UPDATE_CYCLE_FILE="${OS_UPDATE_CYCLE_FILE:-${DATA_DIR}/.ec2_automation_os_update_cycle}"

# Pass ↔ Secrets Manager: when ARN is set, default sync on unless explicitly disabled in env.
PASS_SECRETS_SYNC_SECRET_ARN="${PASS_SECRETS_SYNC_SECRET_ARN:-}"
if [ -z "${PASS_SECRETS_SYNC_SECRET_ARN}" ]; then
  PASS_SECRETS_SYNC_ENABLED=false
elif [ -z "${PASS_SECRETS_SYNC_ENABLED:-}" ]; then
  PASS_SECRETS_SYNC_ENABLED=true
else
  case "$(echo "${PASS_SECRETS_SYNC_ENABLED}" | tr '[:upper:]' '[:lower:]')" in
    false|no|0) PASS_SECRETS_SYNC_ENABLED=false ;;
    *) PASS_SECRETS_SYNC_ENABLED=true ;;
  esac
fi
PASS_SECRETS_SYNC_MIN_INTERVAL_SECONDS="${PASS_SECRETS_SYNC_MIN_INTERVAL_SECONDS:-21600}"

# Excludes: keep aligned with scripts/deploy-to-ec2.sh INSTALLERSYNC
INSTALLER_S3_EXCLUDES=(
  'node_modules/**'
  '.git/**'
  '.cursor/**'
  '.githooks/**'
  '.validation/**'
  '.github/**'
  'config/**'
  'terraform/**'
  'test_cases/**'
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

# OpenTelemetry-style log: severityNumber 9=INFO, 17=ERROR; event.outcome success|failure
otel_log() {
  local severity="${1:-info}"
  local message="$2"
  shift 2
  local outcome="${1:-}"
  local extra="${2:-}"
  local severity_num=9
  [ "$severity" = "error" ] && severity_num=17
  [ "$severity" = "warn" ] && severity_num=13
  local ts
  ts=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%SZ")
  mkdir -p "$LOG_DIR"
  local attrs="\"service.name\":\"ec2-automation\",\"service.version\":\"1.0\",\"event.outcome\":\"${outcome:-}\""
  [ -n "$DEPLOYMENT_ROLE" ] && attrs="$attrs,\"deployment.role\":\"$DEPLOYMENT_ROLE\""
  [ -n "$extra" ] && attrs="$attrs,$extra"
  echo "{\"timestamp\":\"$ts\",\"severityNumber\":$severity_num,\"body\":\"${message//\"/\\\"}\",\"attributes\":{$attrs}}" >> "$LOG_FILE"
}

# --- Pass ↔ SM sync removed (1.7.19): secrets in AWS SM via Node app; keep stub for older ec2_automation.env ---
pass_secrets_sync_run() {
  return 0
}

# Ensure AWS CLI is installed
ensure_aws_cli() {
  if command -v aws >/dev/null 2>&1; then return 0; fi
  if command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y awscli 2>/dev/null || true
  elif command -v yum >/dev/null 2>&1; then
    sudo yum install -y awscli 2>/dev/null || true
  fi
  if ! command -v aws >/dev/null 2>&1; then
    otel_log error "AWS CLI not found and could not install" "failure" "\"error.type\":\"MissingDependency\""
    return 1
  fi
  return 0
}

# shellcheck source=./lib/config-s3-sync.sh disable=SC1091
[ -f "$SCRIPT_DIR/lib/config-s3-sync.sh" ] && . "$SCRIPT_DIR/lib/config-s3-sync.sh"

# Pull shared config/users from S3 when a peer or active copy is newer (sync state file, not local mtime).
sync_shared_config_from_s3() {
  [ -z "$S3_BUCKET" ] && return 0
  local region="${AWS_DEFAULT_REGION:-us-east-1}"
  if [ -f "$SCRIPT_DIR/lib/config-s3-sync.sh" ]; then
    config_s3_set_search_prefixes_for_role "${DEPLOYMENT_ROLE:-}"
    config_s3_sync_shared_to_local "$S3_BUCKET" "$CONFIG_PATH" "$USERS_PATH" "$region" 0
    if [ "${CONFIG_S3_SYNC_CHANGED:-0}" = "1" ]; then
      otel_log "info" "Applied newer shared config/users from S3" "success" "\"event.action\":\"config_s3_sync\""
      sudo systemctl restart oscal-reporter.service 2>/dev/null || true
    fi
    return 0
  fi
  # Fallback when lib not installed yet
  restore_from_s3_legacy
}

# Legacy: only when file missing (pre-1.7.20 instances)
restore_from_s3_legacy() {
  [ -z "$S3_BUCKET" ] && return 0
  local prefix="${S3_CONFIG_PREFIX:-config/active}"
  local data_dir
  data_dir="$(dirname "$CONFIG_PATH")"
  mkdir -p "$data_dir"
  if [ ! -f "$CONFIG_PATH" ]; then
    if aws s3 cp "s3://${S3_BUCKET}/${prefix}/config.json" "$CONFIG_PATH" --quiet 2>/dev/null; then
      otel_log "info" "Restored config.json from S3 (${S3_BUCKET}/${prefix}/)" "success" "\"restore.source\":\"s3\""
    fi
  fi
  if [ ! -f "$USERS_PATH" ]; then
    if aws s3 cp "s3://${S3_BUCKET}/${prefix}/users.json" "$USERS_PATH" --quiet 2>/dev/null; then
      otel_log "info" "Restored users.json from S3 (${S3_BUCKET}/${prefix}/)" "success" "\"restore.source\":\"s3\""
    fi
  fi
}

# Backup config and users to shared S3 prefix (config/active)
backup_to_s3() {
  [ -z "$S3_BUCKET" ] && return 0
  local region="${AWS_DEFAULT_REGION:-us-east-1}"
  if [ -f "$SCRIPT_DIR/lib/config-s3-sync.sh" ]; then
    config_s3_backup_to_active "$S3_BUCKET" "$CONFIG_PATH" "$USERS_PATH" "$region"
    return 0
  fi
  local prefix="${S3_CONFIG_PREFIX:-config/active}"
  if [ ! -f "$CONFIG_PATH" ]; then
    otel_log warn "S3 backup skipped: config.json not found at $CONFIG_PATH" "failure" "\"backup.skipped\":\"config_missing\""
  else
    aws s3 cp "$CONFIG_PATH" "s3://${S3_BUCKET}/${prefix}/config.json" --quiet 2>/dev/null || true
  fi
  if [ ! -f "$USERS_PATH" ]; then
    otel_log warn "S3 backup skipped: users.json not found at $USERS_PATH" "failure" "\"backup.skipped\":\"users_missing\""
  else
    aws s3 cp "$USERS_PATH" "s3://${S3_BUCKET}/${prefix}/users.json" --quiet 2>/dev/null || true
  fi
  local logs_prefix="${S3_LOGS_PREFIX:-logs/${DEPLOYMENT_ROLE:-unknown}}"
  if [ -d "$LOG_DIR" ]; then
    aws s3 sync "$LOG_DIR" "s3://${S3_BUCKET}/${logs_prefix}/" --exclude "ec2_automation.stdout" --quiet 2>/dev/null || true
  fi
}

# Deprecated name — kept for callers; logs still use role prefix below.
restore_from_s3() {
  sync_shared_config_from_s3
}

_backup_logs_to_s3() {
  [ -z "$S3_BUCKET" ] && return 0
  local logs_prefix="${S3_LOGS_PREFIX:-logs/${DEPLOYMENT_ROLE:-unknown}}"
  if [ -d "$LOG_DIR" ]; then
    aws s3 sync "$LOG_DIR" "s3://${S3_BUCKET}/${logs_prefix}/" --exclude "ec2_automation.stdout" --quiet 2>/dev/null || true
  fi
}

verify_installer_manifest_optional() {
  local bucket="$1"
  local region="$2"
  local app="$3"
  local prefix="$4"
  local key="${prefix}/.installer-build.json"
  export AWS_DEFAULT_REGION="${region}"
  if ! aws s3api head-object --bucket "$bucket" --key "$key" --region "$region" >/dev/null 2>&1; then
    otel_log "info" "installer manifest absent on S3; skipping sha verify" "success" "\"event.action\":\"installer_verify\",\"verify.skipped\":\"no_manifest\""
    return 0
  fi
  local mf="${app}/.installer-build.json"
  if [ ! -f "$mf" ]; then
    otel_log error "installer verify failed: .installer-build.json missing on disk after sync" "failure" "\"event.action\":\"installer_verify\""
    return 1
  fi
  local disk_sha s3_sha
  disk_sha=$(sha256sum "$mf" | awk '{print $1}')
  s3_sha=$(aws s3 cp "s3://${bucket}/${key}" - --region "$region" | sha256sum | awk '{print $1}')
  if [ "$disk_sha" != "$s3_sha" ]; then
    otel_log error "installer verify failed: .installer-build.json sha256 mismatch" "failure" "\"event.action\":\"installer_verify\""
    return 1
  fi
  otel_log "info" "installer manifest sha256 verify OK" "success" "\"event.action\":\"installer_verify\""
  return 0
}

# Sync from S3 installer prefix; rebuild frontend; restart unit (same flow as after a full deploy).
sync_from_s3_installer_and_restart() {
  [ ! -d "$APP_DIR" ] && return 0
  [ -z "$S3_BUCKET" ] && return 0

  local region="${AWS_DEFAULT_REGION:-us-east-1}"
  export AWS_DEFAULT_REGION="$region"

  local exargs=()
  local x
  for x in "${INSTALLER_S3_EXCLUDES[@]}"; do
    exargs+=(--exclude "$x")
  done

  if ! sudo chown -R "${S3_SYNC_CHOWN_USER}:${S3_SYNC_CHOWN_GROUP}" "$APP_DIR" 2>/dev/null; then
    otel_log error "chown before S3 sync failed (sudo?)" "failure" "\"event.action\":\"s3_installer_sync\""
    return 1
  fi

  if ! sudo -u "$S3_SYNC_CHOWN_USER" env AWS_DEFAULT_REGION="$region" aws s3 sync \
    "s3://${S3_BUCKET}/${S3_INSTALLER_PREFIX}/" "${APP_DIR}/" --delete --region "$region" \
    "${exargs[@]}"; then
    otel_log error "aws s3 sync from installer failed" "failure" "\"event.action\":\"s3_installer_sync\",\"s3.prefix\":\"${S3_INSTALLER_PREFIX}\""
    return 1
  fi

  verify_installer_manifest_optional "$S3_BUCKET" "$region" "$APP_DIR" "$S3_INSTALLER_PREFIX" || return 1

  # shellcheck source=./lib/installer-s3-reconcile.sh disable=SC1091
  _reconcile_lib="${APP_DIR}/scripts/lib/installer-s3-reconcile.sh"
  if [ -f "$_reconcile_lib" ]; then
    # shellcheck source=./lib/installer-s3-reconcile.sh disable=SC1091
    source "$_reconcile_lib"
    reconcile_installer_package_versions "$S3_BUCKET" "$region" "$APP_DIR" "$S3_INSTALLER_PREFIX" || return 1
  fi

  if [ -f "${APP_DIR}/scripts/ec2_automation.sh" ]; then
    sudo cp "${APP_DIR}/scripts/ec2_automation.sh" /opt/oscal/scripts/
    sudo chmod +x /opt/oscal/scripts/ec2_automation.sh
  fi
  if [ -f "${APP_DIR}/scripts/lib/ec2-automation-pass-sync.sh" ]; then
    sudo mkdir -p /opt/oscal/scripts/lib
    sudo cp "${APP_DIR}/scripts/lib/ec2-automation-pass-sync.sh" /opt/oscal/scripts/lib/
  fi

  sudo rm -rf "${APP_DIR}/config" 2>/dev/null || true

  if ! sudo -u "$S3_SYNC_CHOWN_USER" bash -c "set -e
    export PATH=\"/usr/bin:/usr/local/bin:\$PATH\"
    cd \"$APP_DIR\"
    npm install --no-audit --no-fund
    (cd backend && npm install --no-audit --no-fund)
    (cd frontend && npm install --no-audit --no-fund && npm run build)
    mkdir -p backend/public
    cp -r frontend/dist/* backend/public/ 2>/dev/null || true
  "; then
    otel_log error "npm install/build after S3 sync failed" "failure" "\"event.action\":\"s3_installer_build\""
    return 1
  fi

  if sudo systemctl is-active --quiet oscal-reporter.service 2>/dev/null; then
    sudo systemctl restart oscal-reporter.service 2>/dev/null || true
    app_port="${OSCAL_APP_PORT}"
    sleep 3
    curl -sf --connect-timeout 3 "http://127.0.0.1:${app_port}/health" >/dev/null 2>&1 || true
  fi
  otel_log "info" "S3 installer sync and restart completed" "success" "\"event.action\":\"s3_installer_sync\""
  return 0
}

# Increment cycle counter each cron run; on every Nth run, sync from S3 installer/ and rebuild.
maybe_s3_installer_update() {
  case "$(echo "${ENABLE_S3_INSTALLER_UPDATE:-false}" | tr '[:upper:]' '[:lower:]')" in
    false|no|0) return 0 ;;
  esac

  [ -z "$S3_BUCKET" ] && return 0
  [ ! -d "$APP_DIR" ] && return 0

  local n="${S3_CODE_UPDATE_EVERY_N_CYCLES:-100}"
  if ! [[ "$n" =~ ^[1-9][0-9]*$ ]]; then
    otel_log warn "S3_CODE_UPDATE_EVERY_N_CYCLES invalid; using 100" "failure" "\"event.action\":\"s3_installer_throttle\""
    n=100
  fi

  mkdir -p "$DATA_DIR" 2>/dev/null || true
  local c=0
  if [ -f "$INSTALLER_CYCLE_FILE" ]; then
    c=$(tr -dc '0-9' <"$INSTALLER_CYCLE_FILE" | head -c 12)
    [ -z "$c" ] && c=0
  fi
  c=$((c + 1))

  if [ "$c" -lt "$n" ]; then
    echo "$c" >"$INSTALLER_CYCLE_FILE" 2>/dev/null || true
    otel_log "info" "S3 installer sync deferred (cron cycle ${c}/${n})" "success" "\"event.action\":\"s3_installer_throttle\",\"installer.cycle\":$c,\"installer.threshold\":$n"
    return 0
  fi

  if sync_from_s3_installer_and_restart; then
    echo 0 >"$INSTALLER_CYCLE_FILE" 2>/dev/null || true
  else
    local retry=$((n - 1))
    [ "$retry" -lt 1 ] && retry=1
    echo "$retry" >"$INSTALLER_CYCLE_FILE" 2>/dev/null || true
    return 1
  fi
  return 0
}

# Optional: upgrade installed packages from configured repos (dnf preferred, else yum). Throttled; does not fail the whole cron on error.
maybe_os_package_update() {
  case "$(echo "${ENABLE_OS_PACKAGE_UPDATE:-false}" | tr '[:upper:]' '[:lower:]')" in
    false|no|0) return 0 ;;
  esac

  local n="${OS_PACKAGE_UPDATE_EVERY_N_CYCLES:-144}"
  if ! [[ "$n" =~ ^[1-9][0-9]*$ ]]; then
    otel_log "warn" "OS_PACKAGE_UPDATE_EVERY_N_CYCLES invalid; using 144" "failure" "\"event.action\":\"os_pkg_throttle\""
    n=144
  fi

  mkdir -p "$DATA_DIR" 2>/dev/null || true
  local c=0
  if [ -f "$OS_UPDATE_CYCLE_FILE" ]; then
    c=$(tr -dc '0-9' <"$OS_UPDATE_CYCLE_FILE" | head -c 12)
    [ -z "$c" ] && c=0
  fi
  c=$((c + 1))

  if [ "$c" -lt "$n" ]; then
    echo "$c" >"$OS_UPDATE_CYCLE_FILE" 2>/dev/null || true
    otel_log "info" "OS package update deferred (cron cycle ${c}/${n})" "success" "\"event.action\":\"os_pkg_throttle\",\"os.cycle\":$c,\"os.threshold\":$n"
    return 0
  fi

  local update_ok=0
  if command -v dnf >/dev/null 2>&1; then
    if sudo dnf upgrade -y; then
      update_ok=1
      otel_log "info" "OS package update completed (dnf upgrade -y)" "success" "\"event.action\":\"os_package_update\",\"os.pkg_manager\":\"dnf\""
    else
      otel_log "warn" "OS package update failed (dnf upgrade -y)" "failure" "\"event.action\":\"os_package_update\",\"os.pkg_manager\":\"dnf\""
    fi
  elif command -v yum >/dev/null 2>&1; then
    if sudo yum update -y; then
      update_ok=1
      otel_log "info" "OS package update completed (yum update -y)" "success" "\"event.action\":\"os_package_update\",\"os.pkg_manager\":\"yum\""
    else
      otel_log "warn" "OS package update failed (yum update -y)" "failure" "\"event.action\":\"os_package_update\",\"os.pkg_manager\":\"yum\""
    fi
  else
    otel_log "warn" "OS package update skipped: neither dnf nor yum found" "failure" "\"event.action\":\"os_package_update\""
    echo 0 >"$OS_UPDATE_CYCLE_FILE" 2>/dev/null || true
    return 0
  fi

  if [ "$update_ok" = "1" ]; then
    echo 0 >"$OS_UPDATE_CYCLE_FILE" 2>/dev/null || true
  else
    local retry=$((n - 1))
    [ "$retry" -lt 1 ] && retry=1
    echo "$retry" >"$OS_UPDATE_CYCLE_FILE" 2>/dev/null || true
  fi
  return 0
}

# Skip disruptive work while deploy-to-ec2.sh holds maintenance (ASG/ALB protection on laptop).
DEPLOY_MAINTENANCE_FLAG="${DEPLOY_MAINTENANCE_FLAG:-/opt/oscal/data/.deploy_maintenance}"

# --- main ---
OUTCOME="success"
EXTRA=""

if [ -f "$DEPLOY_MAINTENANCE_FLAG" ]; then
  otel_log "info" "deploy maintenance flag present; skipping S3 installer sync and OS package update" "success" "\"event.action\":\"deploy_maintenance_skip\""
  pass_secrets_sync_run || true
  otel_log "info" "ec2_automation completed" "success" "\"event.action\":\"deploy_maintenance_skip\""
  exit 0
fi

if ! ensure_aws_cli; then
  OUTCOME="failure"
  EXTRA="\"error.type\":\"MissingDependency\""
fi

if [ "$OUTCOME" = "success" ] && [ -n "$S3_BUCKET" ]; then
  sync_shared_config_from_s3 || true
  backup_to_s3 || { OUTCOME="failure"; EXTRA="\"error.type\":\"BackupFailed\""; }
  _backup_logs_to_s3 || true
fi

if [ "$OUTCOME" = "success" ]; then
  maybe_os_package_update || true
  maybe_s3_installer_update || { OUTCOME="failure"; EXTRA="\"error.type\":\"S3InstallerUpdateFailed\""; }
fi

pass_secrets_sync_run || true

otel_log "info" "ec2_automation completed" "$OUTCOME" "$EXTRA"
