#!/bin/bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
#
# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.
#
# Copy a local file to an OSCAL EC2 instance (Green or Blue).
# Uses Pass for the SSH private key (temp file) and Terraform for the IP.
#
# Usage (from repo root):
#   ./scripts/debug/scp-to-ec2.sh green scripts/debug/pull-secrets-manager-to-pass.sh /tmp/
#   ./scripts/debug/scp-to-ec2.sh blue scripts/debug/backup-config-to-s3.sh /tmp/
#
# Env: SSH_USER, TERRAFORM_DIR, AWS_PASS_SSH_ENTRY (see scripts/lib/ec2-common.sh)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
export TERRAFORM_DIR="${TERRAFORM_DIR:-$REPO_ROOT/terraform/envs/aws4403}"
RUN_WITH_AWS_PASS="${RUN_WITH_AWS_PASS:-$REPO_ROOT/terraform/run-with-aws-pass.sh}"

# shellcheck source=../lib/ec2-common.sh disable=SC1091
source "$SCRIPT_DIR/../lib/ec2-common.sh"

usage() {
  sed -n '14,16p' "$0"
  echo ""
  echo "  $0 list"
  exit "${1:-0}"
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ] || [ -z "${1:-}" ]; then
  usage 0
fi

if [ "${1:-}" = "list" ]; then
  for role in green blue; do
    ip=$(get_terraform_oscal_ip "$role" | tr -d '\r\n')
    echo "  ${role}: ${ip:-<not set>}"
  done
  exit 0
fi

ROLE="${1:-}"
LOCAL_FILE="${2:-}"
REMOTE_PATH="${3:-}"

case "$ROLE" in
  green | blue) ;;
  *)
    echo "Error: role must be green or blue (got: ${ROLE})" >&2
    usage 1
    ;;
esac

if [ -z "$LOCAL_FILE" ] || [ -z "$REMOTE_PATH" ]; then
  echo "Error: missing local file or remote path" >&2
  usage 1
fi

if [ ! -f "$LOCAL_FILE" ]; then
  echo "Error: local file not found: $LOCAL_FILE" >&2
  exit 1
fi

[ -x "$RUN_WITH_AWS_PASS" ] || {
  echo "Error: $RUN_WITH_AWS_PASS not found or not executable" >&2
  exit 1
}

resolve_ssh_key
IP=$(get_terraform_oscal_ip "$ROLE" | tr -d '\r\n')
if [ -z "$IP" ]; then
  echo "Error: no Terraform IP for ${ROLE}. Run: $0 list" >&2
  exit 1
fi

echo "SCP to ${ROLE} (${IP}): ${LOCAL_FILE} -> ${SSH_USER}@${IP}:${REMOTE_PATH}"
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=25 \
  "$LOCAL_FILE" "${SSH_USER}@${IP}:${REMOTE_PATH}"
