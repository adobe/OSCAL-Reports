#!/usr/bin/env bash
# ec2_automation.sh: Backup config/users/logs to S3 and update app from GitHub main; runs every 10 min via cron.
# Requires env (set by cron or deploy): S3_BUCKET, S3_CONFIG_PREFIX (e.g. config/green), S3_LOGS_PREFIX (e.g. logs/green), DEPLOYMENT_ROLE (green|blue).
# Logs in OpenTelemetry-style JSONL to OSCAL project log directory.

set -e

# Source env file if present (written by deploy-to-ec2.sh)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
[ -f "$SCRIPT_DIR/ec2_automation.env" ] && . "$SCRIPT_DIR/ec2_automation.env"

CONFIG_PATH="${CONFIG_PATH:-/opt/oscal/data/config.json}"
USERS_PATH="${USERS_PATH:-/opt/oscal/data/users.json}"
LOG_DIR="${LOG_DIR:-/opt/oscal/app/logs}"
APP_DIR="${APP_DIR:-/opt/oscal/app}"
GITHUB_BRANCH="${GITHUB_BRANCH:-main}"
LOG_FILE="${LOG_DIR}/ec2_automation.jsonl"

# Set to false to disable git pull / build / restart (e.g. Green: manual deploy only, no overwrite from GitHub)
# Override per instance via ec2_automation.env: ENABLE_GITHUB_UPDATE=false
ENABLE_GITHUB_UPDATE="${ENABLE_GITHUB_UPDATE:-true}"

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

# Ensure git is installed
ensure_git() {
  if command -v git >/dev/null 2>&1; then return 0; fi
  if command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y git 2>/dev/null || true
  elif command -v yum >/dev/null 2>&1; then
    sudo yum install -y git 2>/dev/null || true
  fi
  if ! command -v git >/dev/null 2>&1; then
    otel_log error "Git not found and could not install" "failure" "\"error.type\":\"MissingDependency\""
    return 1
  fi
  return 0
}

# Restore config and users from S3 when missing locally (use last backup as default)
restore_from_s3() {
  [ -z "$S3_BUCKET" ] && return 0
  local prefix="${S3_CONFIG_PREFIX:-config/${DEPLOYMENT_ROLE:-unknown}}"
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

# Backup config and users to S3
backup_to_s3() {
  [ -z "$S3_BUCKET" ] && return 0
  local prefix="${S3_CONFIG_PREFIX:-config/${DEPLOYMENT_ROLE:-unknown}}"
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

# Update app from GitHub main; if changed, build and restart
update_and_restart() {
  [ ! -d "$APP_DIR" ] && return 0
  cd "$APP_DIR"
  if [ ! -d .git ]; then return 0; fi
  ensure_git || return 0
  git fetch origin "$GITHUB_BRANCH" 2>/dev/null || return 0
  if git diff --quiet "HEAD" "origin/${GITHUB_BRANCH}" 2>/dev/null; then
    return 0
  fi
  git pull origin "$GITHUB_BRANCH" 2>/dev/null || return 1
  # Rebuild so running app uses updated code
  (cd "$APP_DIR" && npm install --no-audit --no-fund 2>/dev/null) || true
  (cd "$APP_DIR/backend" && npm install --no-audit --no-fund 2>/dev/null) || true
  (cd "$APP_DIR/frontend" && npm install --no-audit --no-fund 2>/dev/null && npm run build 2>/dev/null) || true
  if [ -d "$APP_DIR/frontend/dist" ]; then
    mkdir -p "$APP_DIR/backend/public"
    cp -r "$APP_DIR/frontend/dist"/* "$APP_DIR/backend/public/" 2>/dev/null || true
  fi
  if sudo systemctl is-active --quiet oscal-reporter.service 2>/dev/null; then
    sudo systemctl restart oscal-reporter.service 2>/dev/null || true
    # Brief wait then verify /health so ALB target stays healthy (avoids 502/504)
    app_port="3019"
    [ "$DEPLOYMENT_ROLE" = "blue" ] && app_port="3020"
    sleep 3
    curl -sf --connect-timeout 3 "http://127.0.0.1:${app_port}/health" >/dev/null 2>&1 || true
  fi
  return 0
}

# --- main ---
OUTCOME="success"
EXTRA=""

if ! ensure_aws_cli; then
  OUTCOME="failure"
  EXTRA="\"error.type\":\"MissingDependency\""
fi

if [ "$OUTCOME" = "success" ] && [ -n "$S3_BUCKET" ]; then
  restore_from_s3 || true
  backup_to_s3 || { OUTCOME="failure"; EXTRA="\"error.type\":\"BackupFailed\""; }
fi

case "$(echo "${ENABLE_GITHUB_UPDATE:-true}" | tr '[:upper:]' '[:lower:]')" in
  false|no|0) ;;
  *)
    if [ "$OUTCOME" = "success" ]; then
      update_and_restart || { OUTCOME="failure"; EXTRA="\"error.type\":\"UpdateOrRestartFailed\""; }
    fi
    ;;
esac

otel_log "info" "ec2_automation completed" "$OUTCOME" "$EXTRA"
