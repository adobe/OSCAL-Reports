#!/usr/bin/env bash
# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# Print ALB Green/Blue target health (AWS describe-target-health) for the stack in TERRAFORM_DIR.
# Requires: aws CLI, jq; target group ARNs from terraform output or env (see below).
# AWS credentials: if AWS_ACCESS_KEY_ID is unset, loads from Pass (same shape as terraform/run-with-aws-pass.sh).
#   Override entry: AWS_PASS_ENTRY=AWS/YourEntry ./scripts/debug/alb-target-health.sh
# Usage: from repo root: ./scripts/debug/alb-target-health.sh
# Optional: TERRAFORM_DIR=/path ALB_TARGET_GROUP_GREEN_ARN=arn:... ALB_TARGET_GROUP_BLUE_ARN=arn:...
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TERRAFORM_DIR="${TERRAFORM_DIR:-$REPO_ROOT/terraform/envs/aws4403}"

GREEN_ARN="${ALB_TARGET_GROUP_GREEN_ARN:-}"
BLUE_ARN="${ALB_TARGET_GROUP_BLUE_ARN:-}"

if [ -z "$GREEN_ARN" ] || [ -z "$BLUE_ARN" ]; then
  if [ -f "$TERRAFORM_DIR/terraform.tfstate" ] || [ -d "$TERRAFORM_DIR/.terraform" ]; then
    GREEN_ARN=$(cd "$TERRAFORM_DIR" && terraform output -raw alb_target_group_green_arn 2>/dev/null) || true
    BLUE_ARN=$(cd "$TERRAFORM_DIR" && terraform output -raw alb_target_group_blue_arn 2>/dev/null) || true
  fi
fi

if [ -z "$GREEN_ARN" ] || [ -z "$BLUE_ARN" ]; then
  echo "Could not resolve target group ARNs. Set TERRAFORM_DIR with state or export ALB_TARGET_GROUP_GREEN_ARN and ALB_TARGET_GROUP_BLUE_ARN." >&2
  exit 1
fi

if ! command -v aws >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
  echo "Requires aws and jq on PATH." >&2
  exit 1
fi

PASS_ENTRY="${AWS_PASS_ENTRY:-AWS/AMS_4403-STG}"

load_aws_from_pass() {
  command -v pass >/dev/null 2>&1 || return 1
  pass show "$PASS_ENTRY" >/dev/null 2>&1 || return 1
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
  done < <(pass show "$PASS_ENTRY")
  return 0
}

if [ -z "${AWS_ACCESS_KEY_ID:-}" ]; then
  if ! load_aws_from_pass; then
    echo "No AWS credentials in the environment and could not load from Pass (${PASS_ENTRY})." >&2
    echo "  Install and unlock pass, ensure that entry has aws_access_key_id / aws_secret_access_key / aws_session_token lines," >&2
    echo "  or export AWS_ACCESS_KEY_ID (and AWS_SECRET_ACCESS_KEY, optional AWS_SESSION_TOKEN) before running." >&2
    exit 1
  fi
fi

if ! aws sts get-caller-identity >/dev/null 2>&1; then
  echo "AWS credentials failed sts get-caller-identity (expired session or wrong account?). Update Pass entry ${PASS_ENTRY} or env vars." >&2
  exit 1
fi

# Match Terraform stack region when AWS_REGION / AWS_DEFAULT_REGION are unset.
if [ -z "${AWS_DEFAULT_REGION:-}" ] && [ -z "${AWS_REGION:-}" ]; then
  _r=$(cd "$TERRAFORM_DIR" && terraform output -raw aws_region 2>/dev/null) || _r=""
  _r=$(printf '%s' "${_r:-}" | tr -d '\r\n')
  export AWS_DEFAULT_REGION="${_r:-us-east-1}"
else
  export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-${AWS_REGION:-us-east-1}}"
fi

print_target_health() {
  local arn="$1" role="$2"
  local out ec
  ec=0
  out=$(aws elbv2 describe-target-health --target-group-arn "$arn" --output json 2>&1) || ec=$?
  echo "=== ${role} (${arn}) ==="
  if [ "$ec" -ne 0 ]; then
    printf '%s\n' "$out" | head -c 800
    echo ""
    return 0
  fi
  printf '%s\n' "$out" | jq '.TargetHealthDescriptions[] | {id: .Target.Id, port: .Target.Port, state: .TargetHealth.State, reason: .TargetHealth.Reason}'
}

echo "Terraform dir: ${TERRAFORM_DIR}"
echo "AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION}"
print_target_health "$GREEN_ARN" "green"
echo ""
print_target_health "$BLUE_ARN" "blue"
echo ""
echo "Tip: weighted listeners skip unhealthy targets; host rules and stickiness (see terraform/alb.tf) can change which color you see."
