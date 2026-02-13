#!/usr/bin/env bash
# Load AWS credentials from Pass and run Terraform (or import EC2 key from Pass).
#
# Usage:
#   ./run-with-aws-pass.sh [terraform args...]   e.g. ./run-with-aws-pass.sh plan
#   ./run-with-aws-pass.sh import-key [region]   import EC2 key from Pass (region defaults to us-east-1)

set -e
ENTRY="${AWS_PASS_ENTRY:-AWS/AWS4379 Sandbox}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

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

case "${1:-}" in
  import-key)
    import_ec2_key "${2:-us-east-1}"
    ;;
  *)
    load_aws_credentials
    exec terraform "$@"
    ;;
esac
