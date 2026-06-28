#!/usr/bin/env bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
#
# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.
#
# Restore config.json and users.json from the golden S3 prefix config/default/ (config.default).
# Use when deploy or a bad sync wiped /opt/oscal/data — faster than rebuilding SSO by hand.
#
# On EC2:
#   sudo bash /opt/oscal/scripts/debug/restore-config-from-s3-default.sh
#   sudo bash /opt/oscal/scripts/debug/restore-config-from-s3-default.sh --no-restart

set -euo pipefail

CONFIG_PATH="${CONFIG_PATH:-/opt/oscal/data/config.json}"
USERS_PATH="${USERS_PATH:-/opt/oscal/data/users.json}"
ENV_FILE="${ENV_FILE:-/opt/oscal/scripts/ec2_automation.env}"
RESTART=1
DRY_RUN=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYNC_LIB="${SYNC_LIB:-$SCRIPT_DIR/../lib/config-s3-sync.sh}"

info() { echo "[INFO] $*" >&2; }
ok() { echo "[OK] $*" >&2; }
fail() { echo "[ERROR] $*" >&2; exit 1; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-restart)
      RESTART=0
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h | --help)
      sed -n '10,16p' "$0"
      exit 0
      ;;
    *)
      fail "Unknown option: $1"
      ;;
  esac
done

[ -f "$ENV_FILE" ] || fail "Missing $ENV_FILE (run deploy first)"
# shellcheck disable=SC1090
source "$ENV_FILE"
[ -n "${S3_BUCKET:-}" ] || fail "S3_BUCKET not set in $ENV_FILE"

REGION="${AWS_DEFAULT_REGION:-us-east-1}"
command -v aws >/dev/null 2>&1 || fail "aws CLI required"
[ -f "$SYNC_LIB" ] || SYNC_LIB="/opt/oscal/scripts/lib/config-s3-sync.sh"
[ -f "$SYNC_LIB" ] || fail "Missing $SYNC_LIB"

# shellcheck source=/dev/null disable=SC1091
. "$SYNC_LIB"
DEFAULT_URI="$(config_s3_default_s3_uri "$S3_BUCKET")"

if ! config_s3_default_available "$S3_BUCKET" "$REGION"; then
  fail "No valid config.default at ${DEFAULT_URI}config.json — publish first: publish-config-default-to-s3.sh"
fi

if [ "$DRY_RUN" = "1" ]; then
  info "[dry-run] Would restore from ${DEFAULT_URI} to $CONFIG_PATH and $USERS_PATH"
  aws s3 cp "s3://${S3_BUCKET}/${CONFIG_S3_DEFAULT_PREFIX:-config/default}/manifest.json" - --region "$REGION" 2>/dev/null | jq . || true
  exit 0
fi

if [ -f "$CONFIG_PATH" ]; then
  cp -a "$CONFIG_PATH" "${CONFIG_PATH}.pre-default-restore.$(date +%Y%m%d-%H%M%S)" 2>/dev/null || \
    sudo cp -a "$CONFIG_PATH" "${CONFIG_PATH}.pre-default-restore.$(date +%Y%m%d-%H%M%S)"
  info "Saved pre-restore copy of config.json"
fi

mkdir -p "$(dirname "$CONFIG_PATH")" 2>/dev/null || sudo mkdir -p "$(dirname "$CONFIG_PATH")"

if config_s3_restore_from_default "$S3_BUCKET" "$CONFIG_PATH" "$USERS_PATH" "$REGION"; then
  ok "Restored from config.default (${DEFAULT_URI})"
  aws s3 cp "s3://${S3_BUCKET}/${CONFIG_S3_DEFAULT_PREFIX:-config/default}/manifest.json" - --region "$REGION" 2>/dev/null | jq -r '"Published: \(.publishedAt // "unknown") source=\(.source // "unknown")"' || true
else
  fail "Restore from config.default failed"
fi

if [ "$RESTART" = "1" ]; then
  if sudo systemctl restart oscal-reporter.service 2>/dev/null; then
    ok "Restarted oscal-reporter.service"
  else
    info "Could not restart oscal-reporter.service (run manually)"
  fi
fi
