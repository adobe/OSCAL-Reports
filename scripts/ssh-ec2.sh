#!/usr/bin/env bash
# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# SSH wrapper to connect to OSCAL EC2 instances (Green, Blue).
# Uses: Pass for SSH key (default AWS/OSCAL-AWS4403-SSH via ec2-common); Terraform run-with-aws-pass.sh for IPs.
#
# Usage from your laptop (run from repo root):
#   ./scripts/ssh-ec2.sh green     # SSH to OSCAL Green (app port 3020)
#   ./scripts/ssh-ec2.sh blue      # SSH to OSCAL Blue (app port 3020)
#   ./scripts/ssh-ec2.sh blue svc  # Interactive shell as svc_ams-oscal (pass, app user)
#   ./scripts/ssh-ec2.sh list      # Show IPs and example ssh commands (no connect)
#   ./scripts/ssh-ec2.sh            # Show usage and list
#
# Env: SSH_USER=ec2-user (default), AWS_PASS_SSH_ENTRY (default AWS/OSCAL-AWS4403-SSH), TERRAFORM_DIR

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Prefer AWS4403 state for Terraform IPs unless TERRAFORM_DIR is already set (matches deploy-to-ec2 default).
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
export TERRAFORM_DIR="${TERRAFORM_DIR:-$REPO_ROOT/terraform/envs/aws4403}"
RUN_WITH_AWS_PASS="${RUN_WITH_AWS_PASS:-$REPO_ROOT/terraform/run-with-aws-pass.sh}"
SVC_USER="${OSCAL_SVC_USER:-svc_ams-oscal}"
# shellcheck source=./lib/ec2-common.sh disable=SC1091
source "$SCRIPT_DIR/lib/ec2-common.sh"
SSH_USER="${SSH_USER:-ec2-user}"

resolve_ssh_key
[ ! -x "$RUN_WITH_AWS_PASS" ] && {
  echo "Error: $RUN_WITH_AWS_PASS not found or not executable (chmod +x terraform/run-with-aws-pass.sh)." >&2
  exit 1
}

do_list() {
  local green blue
  green=$(get_terraform_oscal_ip green)
  blue=$(get_terraform_oscal_ip blue)
  echo "EC2 instances (from Terraform):"
  echo "  Green (OSCAL, port ${OSCAL_APP_PORT:-3020}): ${green:-<not set>}"
  echo "  Blue  (OSCAL, port ${OSCAL_APP_PORT:-3020}): ${blue:-<not set>}"
  echo ""
  echo "SSH from this wrapper:"
  echo "  $0 green"
  echo "  $0 blue"
  echo "  $0 green svc   # login shell as $SVC_USER (pass vault)"
  echo "  $0 blue svc"
  echo ""
  echo "Raw ssh (with key from Pass):"
  [ -n "$green" ] && echo "  ssh -i \$(pass show $PASS_ENTRY) -o StrictHostKeyChecking=accept-new ${SSH_USER}@${green}"
  [ -n "$blue"  ] && echo "  ssh -i \$(pass show $PASS_ENTRY) -o StrictHostKeyChecking=accept-new ${SSH_USER}@${blue}"
}

do_ssh() {
  local name=$1
  local ip=$2
  if [ -z "$ip" ]; then
    echo "Error: No IP for $name. Run: $0 list" >&2
    exit 1
  fi
  echo "Connecting to $name at $ip (user: $SSH_USER)..."
  exec ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 "${SSH_USER}@${ip}" "${@:3}"
}

do_ssh_svc() {
  local name=$1
  local ip=$2
  if [ -z "$ip" ]; then
    echo "Error: No IP for $name. Run: $0 list" >&2
    exit 1
  fi
  echo "Connecting to $name at $ip → interactive shell as $SVC_USER (home: $SVC_HOME)..."
  exec ssh -t -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 "${SSH_USER}@${ip}" \
    "exec sudo -u ${SVC_USER} env HOME=${SVC_HOME} PASSWORD_STORE_DIR=${SVC_HOME}/.password-store PATH=/usr/local/bin:/usr/bin:/bin bash -l"
}

case "${1:-}" in
  green)
    if [ "${2:-}" = "svc" ]; then
      do_ssh_svc "Green (OSCAL)" "$(get_terraform_oscal_ip green)"
    else
      do_ssh "Green (OSCAL)" "$(get_terraform_oscal_ip green)" "${@:2}"
    fi
    ;;
  blue)
    if [ "${2:-}" = "svc" ]; then
      do_ssh_svc "Blue (OSCAL)" "$(get_terraform_oscal_ip blue)"
    else
      do_ssh "Blue (OSCAL)" "$(get_terraform_oscal_ip blue)" "${@:2}"
    fi
    ;;
  list)
    do_list
    ;;
  -h|--help|"")
    echo "Usage: $0 <green|blue> [ssh-args...]"
    echo "       $0 <green|blue> svc   # interactive shell as $SVC_USER"
    echo "       $0 list   # show IPs and ssh commands"
    echo ""
    echo "SSH to the OSCAL EC2 hosts (Green, Blue). AI is via AWS Bedrock."
    echo "Requires: pass ($PASS_ENTRY), terraform/run-with-aws-pass.sh (for IPs)."
    echo ""
    do_list
    ;;
  *)
    echo "Error: Unknown target '${1}'. Use: green, blue, or list" >&2
    exit 1
    ;;
esac
