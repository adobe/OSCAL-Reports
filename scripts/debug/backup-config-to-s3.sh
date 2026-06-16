#!/usr/bin/env bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
#
# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.
#
# Upload config.json and users.json to shared S3 prefix (config/active/) so Green and Blue stay in sync.
#
# On EC2:
#   sudo bash /opt/oscal/scripts/debug/backup-config-to-s3.sh
#   sudo bash /opt/oscal/scripts/debug/backup-config-to-s3.sh --dry-run

set -euo pipefail

CONFIG_PATH="${CONFIG_PATH:-/opt/oscal/data/config.json}"
USERS_PATH="${USERS_PATH:-/opt/oscal/data/users.json}"
ENV_FILE="${ENV_FILE:-/opt/oscal/scripts/ec2_automation.env}"
DRY_RUN=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h | --help)
      sed -n '12,15p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

info() { echo "[INFO] $*" >&2; }
ok() { echo "[OK] $*" >&2; }
fail() { echo "[ERROR] $*" >&2; exit 1; }

if [ ! -f "$ENV_FILE" ]; then
  fail "Missing $ENV_FILE (run deploy first)"
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

if [ -z "${S3_BUCKET:-}" ]; then
  fail "S3_BUCKET not set in $ENV_FILE"
fi

PREFIX="${CONFIG_S3_ACTIVE_PREFIX:-config/active}"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYNC_LIB="${SYNC_LIB:-$SCRIPT_DIR/../lib/config-s3-sync.sh}"
if [ ! -f "$SYNC_LIB" ]; then
  SYNC_LIB="/opt/oscal/scripts/lib/config-s3-sync.sh"
fi

command -v aws >/dev/null 2>&1 || fail "aws CLI required"

if [ ! -f "$CONFIG_PATH" ]; then
  fail "Missing $CONFIG_PATH"
fi

info "Bucket: s3://${S3_BUCKET}/${PREFIX}/ (shared Green/Blue)"
info "Role: ${DEPLOYMENT_ROLE:-unknown}"

if [ "$DRY_RUN" = "1" ]; then
  info "[dry-run] Would upload:"
  info "  $CONFIG_PATH -> s3://${S3_BUCKET}/${PREFIX}/config.json"
  if [ -f "$USERS_PATH" ]; then
    info "  $USERS_PATH -> s3://${S3_BUCKET}/${PREFIX}/users.json"
  else
    info "  (users.json not found, would skip)"
  fi
  exit 0
fi

if [ -f "$SYNC_LIB" ]; then
  # shellcheck source=/dev/null disable=SC1091
  . "$SYNC_LIB"
  config_s3_backup_to_active "$S3_BUCKET" "$CONFIG_PATH" "$USERS_PATH" "$REGION"
  ok "Backup complete (config/active/). Peers pull newest among active/green/blue on cron or deploy."
else
  aws s3 cp "$CONFIG_PATH" "s3://${S3_BUCKET}/${PREFIX}/config.json" --region "$REGION"
  ok "Uploaded config.json"
  if [ -f "$USERS_PATH" ]; then
    aws s3 cp "$USERS_PATH" "s3://${S3_BUCKET}/${PREFIX}/users.json" --region "$REGION"
    ok "Uploaded users.json"
  else
    info "Skipped users.json (not found)"
  fi
  ok "Backup complete. Deploy will restore from s3://${S3_BUCKET}/${PREFIX}/"
fi
