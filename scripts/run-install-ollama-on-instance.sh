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
FIX_LISTEN_SCRIPT="$REPO_ROOT/scripts/debug/fix-ollama-listen-address.sh"

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

# Minimum free space on root (MB). Cleanup runs when below this; install is skipped if still below after cleanup. Default 2G.
OLLAMA_MIN_FREE_MB="${OLLAMA_MIN_FREE_MB:-2048}"

# Check free space on instance; if below threshold, run dnf/yum/journal/tmp cleanup. Exit 1 if still below after cleanup.
check_and_free_ollama_disk_space() {
  local key="$1"
  local ip="$2"
  ssh -i "$key" -o StrictHostKeyChecking=accept-new "${SSH_USER}@${ip}" "sudo bash -s" << REMOTE_SPACE
set -e
avail_mb=\$(df -m / | awk 'NR==2{print \$4}')
if [ "\$avail_mb" -lt ${OLLAMA_MIN_FREE_MB} ]; then
  echo "Low disk space (\${avail_mb} MB free). Freeing dnf/yum cache, journal, /tmp..."
  dnf clean all 2>/dev/null || yum clean all 2>/dev/null || true
  rm -rf /var/cache/dnf 2>/dev/null || rm -rf /var/cache/yum 2>/dev/null || true
  journalctl --vacuum-time=1d 2>/dev/null || true
  journalctl --vacuum-size=100M 2>/dev/null || true
  find /tmp -maxdepth 1 -type f -mtime +1 -delete 2>/dev/null || true
  echo "After cleanup: \$(df -h / | awk 'NR==2{print \$4}') free"
  avail_mb=\$(df -m / | awk 'NR==2{print \$4}')
  if [ "\$avail_mb" -lt ${OLLAMA_MIN_FREE_MB} ]; then
    echo "ERROR: Still only \${avail_mb} MB free. Free more space (e.g. remove an Ollama model: ollama rm <name>) or replace the instance (scripts/debug/replace-ollama-instance-ami.sh)." >&2
    exit 1
  fi
else
  echo "Disk space OK (\${avail_mb} MB free)."
fi
REMOTE_SPACE
}

# --- main ---
[ ! -f "$INSTALL_SCRIPT" ] && { echo "ERROR: Install script not found: $INSTALL_SCRIPT" >&2; exit 1; }
[ ! -f "$FIX_LISTEN_SCRIPT" ] && { echo "ERROR: Fix listen script not found: $FIX_LISTEN_SCRIPT" >&2; exit 1; }

load_aws_if_needed
resolve_ssh || exit 1

OLLAMA_IP=$(get_ollama_instance_ip) || true
if [ -z "$OLLAMA_IP" ]; then
  echo "No running Ollama instance found. Set OLLAMA_INSTANCE_IP or ensure ASG has desired capacity 1 and AWS credentials are set."
  exit 1
fi

echo "Ollama instance IP: $OLLAMA_IP"
echo "Checking disk space on instance (cleanup if below ${OLLAMA_MIN_FREE_MB} MB free)..."
check_and_free_ollama_disk_space "$SSH_KEY" "$OLLAMA_IP"
echo "Running install-ollama-and-models.sh on instance (with sudo for dnf/systemctl)..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "${SSH_USER}@${OLLAMA_IP}" "sudo bash -s" < "$INSTALL_SCRIPT"
echo "Applying fix-ollama-listen-address.sh so NLB and Green/Blue can reach Ollama on 0.0.0.0:11434..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "${SSH_USER}@${OLLAMA_IP}" "sudo bash -s" < "$FIX_LISTEN_SCRIPT"
echo "Done. Wait 1–2 min for NLB target health, then test from Green/Blue: curl http://<ollama_nlb_dns>:11434/api/tags"
