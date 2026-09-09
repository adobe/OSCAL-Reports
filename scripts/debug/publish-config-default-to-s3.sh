#!/usr/bin/env bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
#
# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.
#
# Publish a golden config/users snapshot to s3://<bucket>/config/default/ (config.default).
# Cron and routine deploy do NOT overwrite this prefix — refresh only when operators run this script.
#
# On EC2 (after verifying SSO/SMTP in the UI):
#   sudo bash /opt/oscal/scripts/debug/publish-config-default-to-s3.sh
#
# From laptop (bucket from Terraform):
#   S3_BUCKET=$(./terraform/run-with-aws-pass.sh output -raw s3_logs_bucket_name)
#   ./scripts/debug/publish-config-default-to-s3.sh --bucket "$S3_BUCKET" --via-green

set -euo pipefail

CONFIG_PATH="${CONFIG_PATH:-/opt/oscal/data/config.json}"
USERS_PATH="${USERS_PATH:-/opt/oscal/data/users.json}"
ENV_FILE="${ENV_FILE:-/opt/oscal/scripts/ec2_automation.env}"
S3_BUCKET="${S3_BUCKET:-}"
VIA_GREEN=0
DRY_RUN=0
SOURCE_NOTE="operator publish-config-default-to-s3.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SYNC_LIB="${SYNC_LIB:-$SCRIPT_DIR/../lib/config-s3-sync.sh}"

info() { echo "[INFO] $*" >&2; }
ok() { echo "[OK] $*" >&2; }
fail() { echo "[ERROR] $*" >&2; exit 1; }

usage() {
  sed -n '10,18p' "$0"
  echo ""
  echo "Options:"
  echo "  --bucket NAME     S3 logs bucket (required off-EC2 unless --via-green)"
  echo "  --via-green       SSH to Green and publish from /opt/oscal/data there"
  echo "  --dry-run         Show intent only"
  echo "  --source-note STR Manifest source field (default: script name)"
  exit 0
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --bucket)
      S3_BUCKET="${2:-}"
      shift 2
      ;;
    --via-green)
      VIA_GREEN=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --source-note)
      SOURCE_NOTE="${2:-}"
      shift 2
      ;;
    -h | --help)
      usage
      ;;
    *)
      fail "Unknown option: $1"
      ;;
  esac
done

if [ "$VIA_GREEN" = "1" ]; then
  [ -f "$REPO_ROOT/scripts/lib/ec2-common.sh" ] || fail "Missing scripts/lib/ec2-common.sh"
  # shellcheck source=../lib/ec2-common.sh disable=SC1091
  . "$REPO_ROOT/scripts/lib/ec2-common.sh"
  resolve_ssh_key
  GREEN_IP=$(get_terraform_oscal_ip green | tr -d '\r\n')
  [ -n "$GREEN_IP" ] || fail "Could not resolve Green IP"
  REMOTE="sudo bash /opt/oscal/scripts/debug/publish-config-default-to-s3.sh --source-note $(printf '%q' "$SOURCE_NOTE")"
  if [ "$DRY_RUN" = "1" ]; then
    info "[dry-run] Would SSH to Green ($GREEN_IP) and run publish-config-default-to-s3.sh"
    exit 0
  fi
  scp -i "$SSH_KEY" -o StrictHostKeyChecking=no "$0" "${SSH_USER:-ec2-user}@${GREEN_IP}:/tmp/publish-config-default-to-s3.sh"
  scp -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SYNC_LIB" "${SSH_USER:-ec2-user}@${GREEN_IP}:/tmp/config-s3-sync.sh"
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "${SSH_USER:-ec2-user}@${GREEN_IP}" \
    "sudo cp /tmp/publish-config-default-to-s3.sh /opt/oscal/scripts/debug/ 2>/dev/null || sudo mkdir -p /opt/oscal/scripts/debug && sudo cp /tmp/publish-config-default-to-s3.sh /opt/oscal/scripts/debug/ && sudo cp /tmp/config-s3-sync.sh /opt/oscal/scripts/lib/config-s3-sync.sh && $REMOTE"
  ok "Published config.default from Green via SSH"
  exit 0
fi

if [ -z "$S3_BUCKET" ] && [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

[ -n "${S3_BUCKET:-}" ] || fail "Set S3_BUCKET or run on EC2 with $ENV_FILE"

REGION="${AWS_DEFAULT_REGION:-us-east-1}"
command -v aws >/dev/null 2>&1 || fail "aws CLI required"
command -v jq >/dev/null 2>&1 || fail "jq required"
[ -f "$SYNC_LIB" ] || SYNC_LIB="/opt/oscal/scripts/lib/config-s3-sync.sh"
[ -f "$SYNC_LIB" ] || fail "Missing $SYNC_LIB"

DEFAULT_URI="s3://${S3_BUCKET}/${CONFIG_S3_DEFAULT_PREFIX:-config/default}/"
info "Golden restore target: ${DEFAULT_URI} (config.default)"
info "Config: $CONFIG_PATH"

if [ "$DRY_RUN" = "1" ]; then
  info "[dry-run] Would upload config.json (+ users.json if present) and manifest.json"
  exit 0
fi

# shellcheck source=/dev/null disable=SC1091
. "$SYNC_LIB"
if config_s3_backup_to_default "$S3_BUCKET" "$CONFIG_PATH" "$USERS_PATH" "$REGION" "$SOURCE_NOTE"; then
  ok "Published config.default to ${DEFAULT_URI}"
  info "Restore on any instance: sudo bash /opt/oscal/scripts/debug/restore-config-from-s3-default.sh"
  info "Manifest: ${DEFAULT_URI}manifest.json"
else
  fail "Publish failed (check config size, JSON shape, and IAM s3:PutObject on ${S3_BUCKET}/config/default/*)"
fi
