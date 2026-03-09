#!/usr/bin/env bash
# Load AWS credentials from Pass and run Terraform (or import EC2 key from Pass).
# For apply: use ./run-with-aws-pass.sh apply (not raw terraform apply) so existing ALB
# port 80/443 listeners are removed automatically if Terraform will create the HTTPS listener.
#
# Usage:
#   ./run-with-aws-pass.sh apply [options]       apply (removes orphan ALB listeners first if needed)
#   ./run-with-aws-pass.sh [terraform args...]   e.g. ./run-with-aws-pass.sh plan
#   ./run-with-aws-pass.sh import-key [region]   import EC2 key from Pass (region defaults to us-east-1)
#
# Optional: TERRAFORM_DIR – when set, run terraform from this directory (e.g. terraform/envs/aws4403).
#   Enables multiple accounts: AWS_PASS_ENTRY=AWS/AMS_4403-STG TERRAFORM_DIR=$PWD/terraform/envs/aws4403 ./run-with-aws-pass.sh plan

set -e
ENTRY="${AWS_PASS_ENTRY:-AWS/AWS4379 Sandbox}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
if [ -n "${TERRAFORM_DIR:-}" ]; then
  TF_WORK_DIR="$(cd "$TERRAFORM_DIR" && pwd)"
  cd "$TF_WORK_DIR"
fi

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

import_ec2_key() {
  local region="${1:-us-east-1}"
  local ssh_entry="${AWS_PASS_SSH_ENTRY:-AWS/OSCAL-AWS4379-SSH}"
  local key_name="${EC2_KEY_NAME:-oscal-aws4379}"
  command -v aws >/dev/null 2>&1 || { echo "Error: AWS CLI (aws) is required. Install: brew install awscli" >&2; exit 1; }
  load_aws_credentials
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

# Before apply: if Terraform will create ALB HTTPS listener but port 80/443 listeners already exist
# (e.g. created manually), delete them so apply does not fail with DuplicateListener.
remove_orphan_alb_listeners_if_needed() {
  command -v aws >/dev/null 2>&1 || return 0
  if terraform state list 2>/dev/null | grep -q 'aws_lb_listener\.https\[0\]'; then
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

case "${1:-}" in
  import-key)
    import_ec2_key "${2:-us-east-1}"
    ;;
  apply)
    load_aws_credentials
    remove_orphan_alb_listeners_if_needed
    exec terraform "$@"
    ;;
  *)
    load_aws_credentials
    exec terraform "$@"
    ;;
esac
