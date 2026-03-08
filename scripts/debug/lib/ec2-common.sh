#!/usr/bin/env bash
# Shared EC2 debug utilities: SSH key resolution, Terraform IP lookup, AWS credentials from Pass.
# Source this from scripts in scripts/debug/:
#   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
#   source "$SCRIPT_DIR/lib/ec2-common.sh"
#
# Or when sourced from scripts/debug/foo.sh:
#   source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/ec2-common.sh"

# Prevent double sourcing
[ -n "${_EC2_COMMON_LOADED:-}" ] && return 0
_EC2_COMMON_LOADED=1

_ec2_common_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# scripts/debug/lib -> ../ = debug, ../ = scripts, ../ = repo root
_ec2_common_repo_root="$(cd "$_ec2_common_script_dir/../../.." && pwd)"
REPO_ROOT="${REPO_ROOT:-$_ec2_common_repo_root}"
TERRAFORM_DIR="${TERRAFORM_DIR:-$REPO_ROOT/terraform}"
SSH_USER="${SSH_USER:-ec2-user}"
PASS_ENTRY="${AWS_PASS_SSH_ENTRY:-AWS/OSCAL-AWS4379-SSH}"
AWS_PASS_ENTRY="${AWS_PASS_ENTRY:-AWS/AWS4379 Sandbox}"

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
get_terraform_oscal_ip() {
  local which="${1:-green}"
  [ ! -x "$TERRAFORM_DIR/run-with-aws-pass.sh" ] && return 1
  "$TERRAFORM_DIR/run-with-aws-pass.sh" output -raw "oscal_${which}_public_ip" 2>/dev/null || \
  "$TERRAFORM_DIR/run-with-aws-pass.sh" output -raw "oscal_${which}_private_ip" 2>/dev/null || true
}

# Get Ollama instance IP from Terraform.
get_terraform_ollama_ip() {
  [ ! -x "$TERRAFORM_DIR/run-with-aws-pass.sh" ] && return 1
  "$TERRAFORM_DIR/run-with-aws-pass.sh" output -raw ollama_public_ip 2>/dev/null || true
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
