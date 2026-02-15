#!/usr/bin/env bash
# Run scripts/install-ollama-and-models.sh on the Ollama EC2 instance.
# Loads AWS credentials from Pass (if not set) so Ollama instance IP can be discovered from ASG.
# Uses same SSH key as check-ollama-connectivity.sh (SSH_KEY_FILE or Pass AWS/OSCAL-AWS4379-SSH).
#
# Usage (from repo root):
#   ./scripts/run-install-ollama-on-instance.sh
#   OLLAMA_INSTANCE_IP=1.2.3.4 ./scripts/run-install-ollama-on-instance.sh
#
# Environment: SSH_KEY_FILE or Pass entry AWS/OSCAL-AWS4379-SSH;
#   AWS credentials in env or Pass entry AWS/AWS4379 Sandbox (for instance discovery);
#   TERRAFORM_DIR (default: repo/terraform).

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TERRAFORM_DIR="${TERRAFORM_DIR:-$REPO_ROOT/terraform}"
SSH_USER="${SSH_USER:-ec2-user}"
INSTALL_SCRIPT="$REPO_ROOT/scripts/install-ollama-and-models.sh"

# Load AWS credentials from Pass if not already set (same entry as run-with-aws-pass.sh)
load_aws_if_needed() {
  if [ -n "$AWS_ACCESS_KEY_ID" ] && [ -n "$AWS_SECRET_ACCESS_KEY" ]; then
    return 0
  fi
  local entry="${AWS_PASS_ENTRY:-AWS/AWS4379 Sandbox}"
  if ! command -v pass >/dev/null 2>&1; then
    return 0
  fi
  while IFS= read -r line; do
    if [[ $line =~ ^aws_access_key_id=(.*)$ ]]; then export AWS_ACCESS_KEY_ID="${BASH_REMATCH[1]}"; fi
    if [[ $line =~ ^aws_secret_access_key=(.*)$ ]]; then export AWS_SECRET_ACCESS_KEY="${BASH_REMATCH[1]}"; fi
    if [[ $line =~ ^aws_session_token=(.*)$ ]]; then export AWS_SESSION_TOKEN="${BASH_REMATCH[1]}"; fi
  done < <(pass show "$entry" 2>/dev/null)
}

# Resolve SSH key (same as check-ollama-connectivity.sh)
resolve_ssh() {
  if [ -n "$SSH_KEY_FILE" ] && [ -f "$SSH_KEY_FILE" ]; then
    SSH_KEY="$SSH_KEY_FILE"
    return
  fi
  if command -v pass >/dev/null 2>&1 && pass show "${AWS_PASS_SSH_ENTRY:-AWS/OSCAL-AWS4379-SSH}" >/dev/null 2>&1; then
    SSH_KEY=$(mktemp)
    trap 'rm -f "$SSH_KEY"' EXIT
    pass show "${AWS_PASS_SSH_ENTRY:-AWS/OSCAL-AWS4379-SSH}" > "$SSH_KEY"
    chmod 600 "$SSH_KEY"
    return
  fi
  echo "ERROR: Set SSH_KEY_FILE or have Pass entry AWS/OSCAL-AWS4379-SSH" >&2
  return 1
}

get_ollama_instance_ip() {
  if [ -n "$OLLAMA_INSTANCE_IP" ]; then
    echo "$OLLAMA_INSTANCE_IP"
    return
  fi
  if ! command -v aws >/dev/null 2>&1; then
    return 1
  fi
  local asg_name region
  if [ -d "$TERRAFORM_DIR" ] && [ -f "$TERRAFORM_DIR/terraform.tfstate" ]; then
    asg_name=$(cd "$TERRAFORM_DIR" && terraform output -raw ollama_asg_name 2>/dev/null) || true
  fi
  [ -z "$asg_name" ] && return 1
  region="${AWS_REGION:-$AWS_DEFAULT_REGION}"
  if [ -z "$region" ] && [ -d "$TERRAFORM_DIR" ] && [ -f "$TERRAFORM_DIR/terraform.tfstate" ]; then
    region=$(cd "$TERRAFORM_DIR" && terraform output -raw aws_region 2>/dev/null) || true
  fi
  [ -z "$region" ] && return 1
  local ip
  ip=$(aws ec2 describe-instances \
    --region "$region" \
    --filters \
      "Name=tag:aws:autoscaling:groupName,Values=$asg_name" \
      "Name=instance-state-name,Values=running" \
    --query 'Reservations[*].Instances[*].PublicIpAddress' \
    --output text 2>/dev/null | head -1)
  [ -z "$ip" ] && return 1
  echo "$ip"
}

# --- main ---
[ ! -f "$INSTALL_SCRIPT" ] && { echo "ERROR: Install script not found: $INSTALL_SCRIPT" >&2; exit 1; }

load_aws_if_needed
resolve_ssh || exit 1

OLLAMA_IP=$(get_ollama_instance_ip) || true
if [ -z "$OLLAMA_IP" ]; then
  echo "No running Ollama instance found. Set OLLAMA_INSTANCE_IP or ensure ASG has desired capacity 1 and AWS credentials are set."
  exit 1
fi

echo "Ollama instance IP: $OLLAMA_IP"
echo "Running install-ollama-and-models.sh on instance (with sudo for dnf/systemctl)..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "${SSH_USER}@${OLLAMA_IP}" "sudo bash -s" < "$INSTALL_SCRIPT"
echo "Done."
