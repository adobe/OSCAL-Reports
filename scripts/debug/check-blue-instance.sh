#!/usr/bin/env bash
# Debug why Blue instance is not responding.
# Checks: oscal-reporter.service status, journalctl, disk, cron (ec2_automation), recent ec2_automation logs.
# Uses same SSH key as deploy-to-ec2.sh (Pass or SSH_KEY_FILE). Run from repo root.
#
# Usage:
#   ./scripts/debug/check-blue-instance.sh
#   ./scripts/debug/check-blue-instance.sh 1.2.3.4   # use this IP instead of Terraform output

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

echo "=== Blue instance: $BLUE_IP (port 3020) ==="
echo ""

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "${SSH_USER}@${BLUE_IP}" "
  echo '--- 1. oscal-reporter.service status ---'
  sudo systemctl status oscal-reporter.service --no-pager 2>/dev/null || true
  echo ''
  echo '--- 2. Last 40 lines of journalctl (oscal-reporter) ---'
  sudo journalctl -u oscal-reporter.service -n 40 --no-pager 2>/dev/null || true
  echo ''
  echo '--- 3. Disk usage (/opt/oscal, /var) ---'
  df -h /opt/oscal /var 2>/dev/null || df -h
  echo ''
  echo '--- 4. Cron for $SVC_USER (ec2_automation runs every 10 min) ---'
  sudo crontab -u $SVC_USER -l 2>/dev/null || echo '(no crontab for $SVC_USER)'
  echo ''
  echo '--- 5. ec2_automation.env (ENABLE_GITHUB_UPDATE=false disables auto git pull/restart) ---'
  cat /opt/oscal/scripts/ec2_automation.env 2>/dev/null || echo '(file missing)'
  echo ''
  echo '--- 6. Last ec2_automation stdout (cron runs every 10 min) ---'
  tail -30 /opt/oscal/app/logs/ec2_automation.stdout 2>/dev/null || echo '(no log)'
  echo ''
  echo '--- 7. Last 5 ec2_automation.jsonl entries ---'
  tail -5 /opt/oscal/app/logs/ec2_automation.jsonl 2>/dev/null || echo '(no log)'
  echo ''
  echo '--- 8. Local /health (port 3020) ---'
  curl -sf --connect-timeout 3 http://127.0.0.1:3020/health 2>/dev/null && echo 'OK' || echo 'FAIL'
"

echo ""
echo "If the service is failed/inactive, try: ssh -i <key> ${SSH_USER}@${BLUE_IP} 'sudo systemctl restart oscal-reporter.service'"
echo "To stop cron from auto-updating Blue from GitHub: set ENABLE_GITHUB_UPDATE=false in ec2_automation.env on Blue."
echo "Note: deploy-to-ec2.sh overwrites that file on each deploy; to persist, add ENABLE_GITHUB_UPDATE=false when writing env for blue (see deploy-to-ec2.sh deploy_one)."
echo "See scripts/deploy-to-ec2.sh and scripts/ec2_automation.sh for cron and auto-update behavior."
