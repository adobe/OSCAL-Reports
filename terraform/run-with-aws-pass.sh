#!/usr/bin/env bash
# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# Load AWS credentials from Pass and run Terraform (or import EC2 key from Pass).
# For apply: use ./run-with-aws-pass.sh apply (not raw terraform apply) so existing ALB
# port 80/443 listeners are removed automatically if Terraform will create the HTTPS listener.
#
# Usage:
#   ./run-with-aws-pass.sh apply [options]       apply (removes orphan ALB listeners first if needed)
#   ./run-with-aws-pass.sh [terraform args...]   e.g. ./run-with-aws-pass.sh plan
#   ./run-with-aws-pass.sh import-key [region]   import EC2 key from Pass (region defaults to us-east-1)
#   ./run-with-aws-pass.sh remove-stale-ollama-state   remove Ollama-related entries from state (use same account as tfvars)
#
# Default: AWS4403 (account 442277170733).
# Optional: AWS_PASS_ENTRY – Pass entry for AWS credentials (default: AWS/AMS_4403-STG for aws4403).
# Optional: TERRAFORM_DIR – Terraform working dir (default: terraform/envs/aws4403).
# Optional: SKIP_CURRENT_IP_ADD=1 – skip auto-adding current IP to default_allowed_cidr_blocks (e.g. in CI).
# If plan/apply fails with ExpiredToken, refresh aws_session_token (and keys if needed) in the Pass entry, then retry.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Default to aws4403 (single documented env).
if [ -z "${TERRAFORM_DIR:-}" ]; then
  TERRAFORM_DIR="$(cd "$SCRIPT_DIR/envs/aws4403" && pwd)"
fi
export TERRAFORM_DIR
ENTRY="${AWS_PASS_ENTRY:-AWS/AMS_4403-STG}"
cd "$TERRAFORM_DIR"

load_aws_credentials() {
  while IFS= read -r line; do
    if [[ $line =~ ^(aws_[a-z_]+)=(.*)$ ]]; then
      key="${BASH_REMATCH[1]}"
      val="${BASH_REMATCH[2]}"
      case "$key" in
        aws_access_key_id)     export AWS_ACCESS_KEY_ID="$val" ;;
        aws_secret_access_key) export AWS_SECRET_ACCESS_KEY="$val" ;;
        aws_session_token)    export AWS_SESSION_TOKEN="$val" ;;
      esac
    fi
  done < <(pass show "$ENTRY")
}

# Fail fast before mutating terraform.tfvars (e.g. ensure_current_ip_in_tfvars) when Pass holds expired STS creds.
verify_aws_credentials() {
  command -v aws >/dev/null 2>&1 || {
    echo "Error: AWS CLI (aws) is required. Install: brew install awscli" >&2
    exit 1
  }
  local out
  out=$(aws sts get-caller-identity 2>&1) || {
    echo "$out" >&2
    echo "Error: AWS credentials from Pass entry '$ENTRY' failed STS validation (see above). For ExpiredToken, update that Pass entry with a fresh session token, then retry." >&2
    exit 1
  }
}

import_ec2_key() {
  local region="${1:-us-east-1}"
  local ssh_entry="${AWS_PASS_SSH_ENTRY:-AWS/OSCAL-AWS4403-SSH}"
  local key_name="${EC2_KEY_NAME:-oscal-aws4403}"
  command -v aws >/dev/null 2>&1 || { echo "Error: AWS CLI (aws) is required. Install: brew install awscli" >&2; exit 1; }
  load_aws_credentials
  verify_aws_credentials
  local tmpkey
  tmpkey=$(mktemp)
  trap 'rm -f "$tmpkey"' EXIT
  pass show "$ssh_entry" > "$tmpkey" || {
    echo "Error: Could not read '$ssh_entry' from Pass." >&2
    exit 1
  }
  local pubkey
  pubkey=$(ssh-keygen -y -f "$tmpkey" 2>/dev/null) || {
    echo "Error: Could not derive public key (is '$ssh_entry' a valid RSA/ECDSA private key?)." >&2
    exit 1
  }
  local pubkey_b64
  pubkey_b64=$(echo -n "$pubkey" | base64)
  aws ec2 import-key-pair \
    --key-name "$key_name" \
    --public-key-material "$pubkey_b64" \
    --region "$region" \
    --output text
  echo "Imported EC2 key pair '$key_name' in $region. Set key_name = \"$key_name\" in terraform.tfvars and run: ./run-with-aws-pass.sh apply"
}

# Before apply: only remove orphan ALB listeners when Terraform manages HTTPS (state has https[0]).
# When using HTTP-only (no cert), state has http_forward[0] only — do NOT delete listeners or port 80 is removed and ALB becomes unreachable.
remove_orphan_alb_listeners_if_needed() {
  command -v aws >/dev/null 2>&1 || return 0
  # Skip when Terraform does not manage HTTPS listener (HTTP-only mode); otherwise we would delete the port 80 listener.
  if ! terraform state list 2>/dev/null | grep -q 'aws_lb_listener\.https\[0\]'; then
    return 0
  fi
  alb_arn=$(terraform state show -no-color aws_lb.main 2>/dev/null | grep -E '^\s*arn\s*=' | sed -E 's/.*=\s*"(.*)"/\1/' | tr -d ' ')
  [ -z "$alb_arn" ] && return 0
  region=$(terraform output -raw aws_region 2>/dev/null) || region="us-east-1"
  export AWS_DEFAULT_REGION="$region"
  # Get all listeners; filter to port 80 and 443 in bash (reliable across CLI versions)
  list=$(aws elbv2 describe-listeners --load-balancer-arn "$alb_arn" --query 'Listeners[].[Port,ListenerArn]' --output text 2>/dev/null) || return 0
  while read -r port arn; do
    [ -z "$arn" ] && continue
    case "$port" in
      80|443)
        echo "Removing existing listener port $port (so Terraform can create it): $arn"
        aws elbv2 delete-listener --listener-arn "$arn" || { echo "Error: failed to delete listener $arn" >&2; exit 1; }
        ;;
    esac
  done <<< "$list"
}

# Ensure current public IP is in default_allowed_cidr_blocks so plan/apply do not lock out the operator.
# Skips if SKIP_CURRENT_IP_ADD=1, terraform.tfvars missing, curl fails, or IP already in list.
ensure_current_ip_in_tfvars() {
  [[ -n "${SKIP_CURRENT_IP_ADD:-}" ]] && return 0
  local tfvars="$TERRAFORM_DIR/terraform.tfvars"
  [[ -f "$tfvars" ]] || return 0
  local cur_ip
  cur_ip=$(curl -s --connect-timeout 5 --max-time 10 ifconfig.me 2>/dev/null | tr -d '\r\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  [[ -n "$cur_ip" && "$cur_ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || return 0
  grep -q "\"$cur_ip/32\"" "$tfvars" 2>/dev/null && return 0
  local tmp
  tmp=$(mktemp)
  awk -v ip="$cur_ip" '
    /\]  # Add more/ && !added {
      if (prev != "" && prev !~ /,\s*$/) { print prev ","; } else if (prev != "") { print prev; }
      print "  \"" ip "/32\",   # Added by run-with-aws-pass.sh (current IP)";
      print;
      added=1;
      prev="";
      next;
    }
    { if (prev != "") print prev; prev=$0; }
    END { if (prev != "") print prev; }
  ' "$tfvars" > "$tmp" && mv "$tmp" "$tfvars"
  echo "Added $cur_ip/32 to default_allowed_cidr_blocks in terraform.tfvars (current IP)." >&2
}

case "${1:-}" in
  import-key)
    import_ec2_key "${2:-us-east-1}"
    ;;
  remove-stale-ollama-state)
    load_aws_credentials
    verify_aws_credentials
    exec "$SCRIPT_DIR/../scripts/debug/remove-stale-ollama-state.sh"
    ;;
  apply)
    load_aws_credentials
    verify_aws_credentials
    ensure_current_ip_in_tfvars
    remove_orphan_alb_listeners_if_needed
    exec terraform "$@"
    ;;
  *)
    load_aws_credentials
    verify_aws_credentials
    ensure_current_ip_in_tfvars
    exec terraform "$@"
    ;;
esac
