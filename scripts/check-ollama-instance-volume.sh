#!/usr/bin/env bash
# Report EBS volume size(s) attached to the running Ollama instance.
# Uses AWS credentials from Pass (or env) and Terraform for ASG/region. Scripts/Terraform only.
#
# Usage (from repo root):
#   ./scripts/check-ollama-instance-volume.sh

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TERRAFORM_DIR="${TERRAFORM_DIR:-$REPO_ROOT/terraform}"
AWS_PASS_ENTRY="${AWS_PASS_ENTRY:-AWS/AWS4379 Sandbox}"

load_aws_if_needed() {
  if [ -n "$AWS_ACCESS_KEY_ID" ] && [ -n "$AWS_SECRET_ACCESS_KEY" ]; then return 0; fi
  if ! command -v pass >/dev/null 2>&1; then echo "ERROR: pass not found. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY or use pass." >&2; return 1; fi
  while IFS= read -r line; do
    if [[ $line =~ ^aws_access_key_id=(.*)$ ]]; then export AWS_ACCESS_KEY_ID="${BASH_REMATCH[1]}"; fi
    if [[ $line =~ ^aws_secret_access_key=(.*)$ ]]; then export AWS_SECRET_ACCESS_KEY="${BASH_REMATCH[1]}"; fi
    if [[ $line =~ ^aws_session_token=(.*)$ ]]; then export AWS_SESSION_TOKEN="${BASH_REMATCH[1]}"; fi
  done < <(pass show "$AWS_PASS_ENTRY" 2>/dev/null)
}

asg_name=$(cd "$TERRAFORM_DIR" 2>/dev/null && terraform output -raw ollama_asg_name 2>/dev/null) || true
region="${AWS_REGION:-$AWS_DEFAULT_REGION}"
[ -z "$region" ] && region=$(cd "$TERRAFORM_DIR" 2>/dev/null && terraform output -raw aws_region 2>/dev/null) || true
[ -z "$asg_name" ] && { echo "ERROR: Could not get ollama_asg_name from terraform." >&2; exit 1; }
[ -z "$region" ] && { echo "ERROR: Set AWS_REGION or run terraform output aws_region." >&2; exit 1; }

load_aws_if_needed || exit 1

instance_id=$(aws ec2 describe-instances --region "$region" \
  --filters "Name=tag:aws:autoscaling:groupName,Values=$asg_name" "Name=instance-state-name,Values=running" \
  --query 'Reservations[*].Instances[*].InstanceId' --output text 2>/dev/null | head -1)
[ -z "$instance_id" ] && { echo "No running Ollama instance in ASG $asg_name." >&2; exit 1; }

echo "Ollama instance ID: $instance_id (region: $region)"
echo ""
echo "Launch template (expected) root volume: 150 GB (see terraform/ollama_asg.tf block_device_mappings)"
echo ""
echo "Attached EBS volumes:"
aws ec2 describe-instances --region "$region" --instance-ids "$instance_id" \
  --query 'Reservations[*].Instances[*].BlockDeviceMappings[*].[DeviceName,Ebs.VolumeId]' --output text 2>/dev/null | while read -r dev vol; do
  [ -z "$vol" ] && continue
  size_gb=$(aws ec2 describe-volumes --region "$region" --volume-ids "$vol" --query 'Volumes[*].Size' --output text 2>/dev/null)
  echo "  $dev  VolumeId: $vol  Size: ${size_gb} GB"
done
