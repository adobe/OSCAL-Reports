#!/usr/bin/env bash
# One-off: set ENABLE_GITHUB_UPDATE=false on Blue and remove the ec2_automation cron job.
# Use this to fix the current Blue instance without a full deploy.
# Uses same SSH key as deploy-to-ec2.sh (Pass or SSH_KEY_FILE). Run from repo root.
#
# Usage:
#   ./scripts/debug/fix-blue-no-cron.sh
#   ./scripts/debug/fix-blue-no-cron.sh 1.2.3.4

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/ec2-common.sh disable=SC1091
source "$SCRIPT_DIR/lib/ec2-common.sh"
SSH_USER="${SSH_USER:-ec2-user}"
SVC_USER="svc_ams-oscal"

resolve_ssh_key
BLUE_IP="${1:-$(get_terraform_oscal_ip blue)}"
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

echo "Done. Blue will no longer run ec2_automation from cron. Future deploys default to cron on Blue; use DEPLOY_BLUE_AUTO_UPDATE=0 before deploy to keep Blue manual-only."
