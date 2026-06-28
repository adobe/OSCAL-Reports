#!/usr/bin/env bash
# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# Shared EC2 utilities: SSH key resolution, Terraform IP lookup, AWS credentials from Pass.
# Source from scripts under scripts/ or scripts/debug/:
#   source "$SCRIPT_DIR/lib/ec2-common.sh"                    # when SCRIPT_DIR is scripts/
#   source "$SCRIPT_DIR/../lib/ec2-common.sh"               # when SCRIPT_DIR is scripts/debug/

# Prevent double sourcing
[ -n "${_EC2_COMMON_LOADED:-}" ] && return 0
_EC2_COMMON_LOADED=1

_ec2_common_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# scripts/lib -> parent = scripts, parent.parent = repo root
_ec2_common_repo_root="$(cd "$_ec2_common_script_dir/../.." && pwd)"
REPO_ROOT="${REPO_ROOT:-$_ec2_common_repo_root}"
TERRAFORM_DIR="${TERRAFORM_DIR:-$REPO_ROOT/terraform/envs/aws4403}"
# Wrapper script lives under terraform/; TERRAFORM_DIR is the env dir (state) for run-with-aws-pass.sh.
RUN_WITH_AWS_PASS="${RUN_WITH_AWS_PASS:-$REPO_ROOT/terraform/run-with-aws-pass.sh}"
SSH_USER="${SSH_USER:-ec2-user}"
# OSCAL app port on EC2 Green/Blue (same on both; matches terraform var.oscal_app_port and backend default).
OSCAL_APP_PORT="${OSCAL_APP_PORT:-3020}"
# Defaults match scripts/deploy-to-ec2.sh (AWS4403). Override AWS_PASS_SSH_ENTRY / AWS_PASS_ENTRY when sourcing if needed.
PASS_ENTRY="${AWS_PASS_SSH_ENTRY:-AWS/OSCAL-AWS4403-SSH}"
AWS_PASS_ENTRY="${AWS_PASS_ENTRY:-AWS/AMS_4403-STG}"

# Resolve SSH key: sets SSH_KEY (or uses SSH_KEY_FILE). Call before SSH.
# Uses: SSH_KEY_FILE or pass show $PASS_ENTRY. Exits on failure unless optional.
resolve_ssh_key() {
  if [ -n "${SSH_KEY_FILE:-}" ] && [ -f "$SSH_KEY_FILE" ]; then
    SSH_KEY="$SSH_KEY_FILE"
    return 0
  fi
  if ! command -v pass >/dev/null 2>&1; then
    echo "Error: pass not found. Install: brew install pass" >&2
    exit 1
  fi
  if ! pass show "$PASS_ENTRY" >/dev/null 2>&1; then
    echo "Error: Pass entry '$PASS_ENTRY' not found. Store your PEM with: pass insert -m $PASS_ENTRY" >&2
    exit 1
  fi
  SSH_KEY=$(mktemp)
  trap 'rm -f "$SSH_KEY"' EXIT
  pass show "$PASS_ENTRY" > "$SSH_KEY" 2>/dev/null || { echo "Error: Failed to read $PASS_ENTRY" >&2; exit 1; }
  chmod 600 "$SSH_KEY"
}

# Get OSCAL Green or Blue IP from Terraform. Usage: get_terraform_oscal_ip green|blue
# Requires: RUN_WITH_AWS_PASS (default repo terraform/run-with-aws-pass.sh), TERRAFORM_DIR (env with .tfstate).
get_terraform_oscal_ip() {
  local which="${1:-green}"
  [ ! -x "$RUN_WITH_AWS_PASS" ] && return 1
  "$RUN_WITH_AWS_PASS" output -raw "oscal_${which}_public_ip" 2>/dev/null || \
  "$RUN_WITH_AWS_PASS" output -raw "oscal_${which}_private_ip" 2>/dev/null || true
}

# Live InService instance public IP from Auto Scaling Group (preferred over stale Terraform output).
# Usage: get_asg_oscal_ip green|blue
# Requires: aws CLI, load_aws_from_pass (or env AWS_*), terraform output oscal_*_autoscaling_group_name.
get_asg_oscal_ip() {
  local which="${1:-green}"
  local asg_name instance_id pub_ip
  case "$which" in
    green|blue) ;;
    *) return 1 ;;
  esac
  command -v aws >/dev/null 2>&1 || return 1
  load_aws_from_pass || {
    [ -n "${AWS_ACCESS_KEY_ID:-}" ] && [ -n "${AWS_SECRET_ACCESS_KEY:-}" ] || return 1
  }
  if [ -z "${AWS_DEFAULT_REGION:-}" ] && [ -z "${AWS_REGION:-}" ]; then
    export AWS_DEFAULT_REGION="us-east-1"
  else
    export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-${AWS_REGION:-us-east-1}}"
  fi
  if [ -x "$RUN_WITH_AWS_PASS" ]; then
    asg_name=$("$RUN_WITH_AWS_PASS" output -raw "oscal_${which}_autoscaling_group_name" 2>/dev/null | tr -d '\r\n') || true
  fi
  [ -z "$asg_name" ] && return 1
  # JMESPath backticks in --query are literals, not command substitution (SC2016).
  # shellcheck disable=SC2016
  instance_id=$(aws autoscaling describe-auto-scaling-groups \
    --auto-scaling-group-names "$asg_name" \
    --query 'AutoScalingGroups[0].Instances[?LifecycleState==`InService`].InstanceId | [0]' \
    --output text 2>/dev/null | tr -d '\r\n')
  [ -z "$instance_id" ] || [ "$instance_id" = "None" ] && return 1
  pub_ip=$(aws ec2 describe-instances --instance-ids "$instance_id" \
    --query 'Reservations[0].Instances[0].PublicIpAddress' \
    --output text 2>/dev/null | tr -d '\r\n')
  [ -z "$pub_ip" ] || [ "$pub_ip" = "None" ] && return 1
  printf '%s' "$pub_ip"
}

# Load AWS credentials from Pass (AWS_PASS_ENTRY). Exports AWS_ACCESS_KEY_ID, etc.
# Returns 0 if already set or loaded; 1 if failed.
load_aws_from_pass() {
  [ -n "${AWS_ACCESS_KEY_ID:-}" ] && [ -n "${AWS_SECRET_ACCESS_KEY:-}" ] && return 0
  command -v pass >/dev/null 2>&1 || return 1
  pass show "$AWS_PASS_ENTRY" >/dev/null 2>&1 || return 1
  while IFS= read -r line; do
    if [[ $line =~ ^[aA]ws_access_key_id=(.*)$ ]]; then export AWS_ACCESS_KEY_ID="${BASH_REMATCH[1]}"; fi
    if [[ $line =~ ^[aA]ws_secret_access_key=(.*)$ ]]; then export AWS_SECRET_ACCESS_KEY="${BASH_REMATCH[1]}"; fi
    if [[ $line =~ ^[aA]ws_session_token=(.*)$ ]]; then export AWS_SESSION_TOKEN="${BASH_REMATCH[1]}"; fi
  done < <(pass show "$AWS_PASS_ENTRY" 2>/dev/null)
  return 0
}
