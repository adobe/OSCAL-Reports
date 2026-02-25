#!/usr/bin/env bash
# One-off: set ENABLE_GITHUB_UPDATE=false on Blue and remove the ec2_automation cron job.
# Use this to fix the current Blue instance without a full deploy.
# Uses same SSH key as deploy-to-ec2.sh (Pass or SSH_KEY_FILE). Run from repo root.
#
# Usage:
#   ./scripts/debug/fix-blue-no-cron.sh
#   ./scripts/debug/fix-blue-no-cron.sh 1.2.3.4

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TERRAFORM_DIR="${TERRAFORM_DIR:-$REPO_ROOT/terraform}"
SSH_USER="${SSH_USER:-ec2-user}"
SVC_USER="svc_ams-oscal"
PASS_ENTRY="${AWS_PASS_SSH_ENTRY:-AWS/OSCAL-AWS4379-SSH}"

resolve_ssh_key() {
  if [ -n "$SSH_KEY_FILE" ] && [ -f "$SSH_KEY_FILE" ]; then
    SSH_KEY="$SSH_KEY_FILE"
    return
  fi
  if command -v pass >/dev/null 2>&1 && pass show "$PASS_ENTRY" >/dev/null 2>&1; then
    SSH_KEY=$(mktemp)
    trap 'rm -f "$SSH_KEY"' EXIT
    pass show "$PASS_ENTRY" > "$SSH_KEY"
    chmod 600 "$SSH_KEY"
    return
  fi
  echo "ERROR: Set SSH_KEY_FILE or have Pass entry $PASS_ENTRY"
  exit 1
}

get_blue_ip() {
  if [ -n "$1" ]; then
    echo "$1"
    return
  fi
  [ ! -f "$TERRAFORM_DIR/terraform.tfstate" ] && { echo "No terraform state. Pass Blue IP as first argument."; exit 1; }
  if [ -x "$REPO_ROOT/terraform/run-with-aws-pass.sh" ]; then
    "$REPO_ROOT/terraform/run-with-aws-pass.sh" output -raw oscal_blue_public_ip 2>/dev/null || \
    "$REPO_ROOT/terraform/run-with-aws-pass.sh" output -raw oscal_blue_private_ip 2>/dev/null || true
  else
    (cd "$TERRAFORM_DIR" && terraform output -raw oscal_blue_public_ip 2>/dev/null) || \
    (cd "$TERRAFORM_DIR" && terraform output -raw oscal_blue_private_ip 2>/dev/null) || true
  fi
}

resolve_ssh_key
BLUE_IP=$(get_blue_ip "$1")
[ -z "$BLUE_IP" ] && { echo "Could not get Blue IP. Run from repo root after terraform apply or pass IP: $0 <blue_ip>"; exit 1; }

echo "Fixing Blue at $BLUE_IP: set ENABLE_GITHUB_UPDATE=false and remove ec2_automation cron..."

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "${SSH_USER}@${BLUE_IP}" "
  set -e
  ENV_FILE=/opt/oscal/scripts/ec2_automation.env
  if [ -f \"\$ENV_FILE\" ]; then
    if grep -q '^ENABLE_GITHUB_UPDATE=' \"\$ENV_FILE\" 2>/dev/null; then
      sudo sed -i 's/^ENABLE_GITHUB_UPDATE=.*/ENABLE_GITHUB_UPDATE=false/' \"\$ENV_FILE\"
    else
      echo 'ENABLE_GITHUB_UPDATE=false' | sudo tee -a \"\$ENV_FILE\" >/dev/null
    fi
    echo 'Set ENABLE_GITHUB_UPDATE=false in ec2_automation.env'
  else
    echo 'Warning: ec2_automation.env not found; skipping env update'
  fi
  remaining=\$(sudo crontab -u $SVC_USER -l 2>/dev/null | grep -v ec2_automation.sh || true)
  if [ -n \"\$remaining\" ]; then
    echo \"\$remaining\" | sudo crontab -u $SVC_USER -
    echo 'Removed ec2_automation.sh from crontab (other entries kept)'
  else
    sudo crontab -u $SVC_USER -r 2>/dev/null || true
    echo 'Removed crontab for $SVC_USER (was only ec2_automation or empty)'
  fi
"

echo "Done. Blue will no longer run ec2_automation from cron. Future deploys with deploy-to-ec2.sh will keep cron removed on Blue unless you set DEPLOY_BLUE_AUTO_UPDATE=1."
