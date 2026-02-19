#!/usr/bin/env bash
# Scale Ollama ASG to 1, wait for instance to be running, then run install + fix on the instance.
# Uses AWS credentials and SSH key from Pass (same entries as run-install-ollama-on-instance.sh).
#
# Usage (from repo root):
#   ./scripts/scale-up-ollama-and-fix.sh
#
# Environment: Pass entries AWS/AWS4379 Sandbox (AWS creds), AWS/OSCAL-AWS4379-SSH (SSH key);
#   or set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN and SSH_KEY_FILE.

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TERRAFORM_DIR="${TERRAFORM_DIR:-$REPO_ROOT/terraform}"
AWS_PASS_ENTRY="${AWS_PASS_ENTRY:-AWS/AWS4379 Sandbox}"
MAX_WAIT="${OLLAMA_SCALE_UP_WAIT:-300}"

# Load AWS credentials from Pass if not already set
load_aws_if_needed() {
  if [ -n "$AWS_ACCESS_KEY_ID" ] && [ -n "$AWS_SECRET_ACCESS_KEY" ]; then
    return 0
  fi
  if ! command -v pass >/dev/null 2>&1; then
    echo "ERROR: pass not found. Install pass or set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY." >&2
    return 1
  fi
  if ! pass show "$AWS_PASS_ENTRY" >/dev/null 2>&1; then
    echo "ERROR: Pass entry '$AWS_PASS_ENTRY' not found. Set AWS credentials or add entry." >&2
    return 1
  fi
  while IFS= read -r line; do
    if [[ $line =~ ^aws_access_key_id=(.*)$ ]]; then export AWS_ACCESS_KEY_ID="${BASH_REMATCH[1]}"; fi
    if [[ $line =~ ^aws_secret_access_key=(.*)$ ]]; then export AWS_SECRET_ACCESS_KEY="${BASH_REMATCH[1]}"; fi
    if [[ $line =~ ^aws_session_token=(.*)$ ]]; then export AWS_SESSION_TOKEN="${BASH_REMATCH[1]}"; fi
  done < <(pass show "$AWS_PASS_ENTRY" 2>/dev/null)
}

get_asg_and_region() {
  [ ! -d "$TERRAFORM_DIR" ] || [ ! -f "$TERRAFORM_DIR/terraform.tfstate" ] && return 1
  asg_name=$(cd "$TERRAFORM_DIR" && terraform output -raw ollama_asg_name 2>/dev/null) || true
  region=$(cd "$TERRAFORM_DIR" && terraform output -raw aws_region 2>/dev/null) || true
  [ -z "$asg_name" ] || [ -z "$region" ] && return 1
  echo "$asg_name $region"
}

get_instance_ip() {
  local asg_name="$1"
  local region="$2"
  aws ec2 describe-instances \
    --region "$region" \
    --filters \
      "Name=tag:aws:autoscaling:groupName,Values=$asg_name" \
      "Name=instance-state-name,Values=running" \
    --query 'Reservations[*].Instances[*].PublicIpAddress' \
    --output text 2>/dev/null | head -1
}

# --- main ---
cd "$REPO_ROOT"
load_aws_if_needed || exit 1

read -r asg_name region <<< "$(get_asg_and_region)"
if [ -z "$asg_name" ] || [ -z "$region" ]; then
  echo "ERROR: Could not get ollama_asg_name and aws_region from terraform (run from repo with terraform applied)." >&2
  exit 1
fi

echo "Ollama ASG: $asg_name (region: $region)"
current_cap=$(aws autoscaling describe-auto-scaling-groups \
  --region "$region" \
  --auto-scaling-group-names "$asg_name" \
  --query 'AutoScalingGroups[0].DesiredCapacity' \
  --output text 2>/dev/null || echo "0")
echo "Current desired capacity: $current_cap"

if [ "${current_cap:-0}" -eq 0 ]; then
  echo "Setting desired capacity to 1..."
  aws autoscaling set-desired-capacity \
    --region "$region" \
    --auto-scaling-group-name "$asg_name" \
    --desired-capacity 1
  echo "Waiting for instance to be running (up to ${MAX_WAIT}s)..."
  elapsed=0
  while [ "$elapsed" -lt "$MAX_WAIT" ]; do
    ip=$(get_instance_ip "$asg_name" "$region")
    if [ -n "$ip" ] && [ "$ip" != "None" ]; then
      echo "Instance is running: $ip (after ${elapsed}s)"
      break
    fi
    sleep 15
    elapsed=$((elapsed + 15))
  done
  if [ -z "$ip" ] || [ "$ip" = "None" ]; then
    echo "ERROR: Timeout waiting for Ollama instance. Check EC2 console and ASG." >&2
    exit 1
  fi
else
  ip=$(get_instance_ip "$asg_name" "$region")
  if [ -z "$ip" ] || [ "$ip" = "None" ]; then
    echo "ASG desired capacity is $current_cap but no running instance IP found. Waiting up to ${MAX_WAIT}s..."
    elapsed=0
    while [ "$elapsed" -lt "$MAX_WAIT" ]; do
      ip=$(get_instance_ip "$asg_name" "$region")
      [ -n "$ip" ] && [ "$ip" != "None" ] && break
      sleep 15
      elapsed=$((elapsed + 15))
    done
  fi
  if [ -z "$ip" ] || [ "$ip" = "None" ]; then
    echo "ERROR: No running Ollama instance found." >&2
    exit 1
  fi
  echo "Using existing instance: $ip"
fi

echo "Running install and fix on instance $ip..."
export OLLAMA_INSTANCE_IP="$ip"
exec "$REPO_ROOT/scripts/run-install-ollama-on-instance.sh"
