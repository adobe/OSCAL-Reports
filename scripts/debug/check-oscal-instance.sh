#!/usr/bin/env bash
# Debug why Green or Blue OSCAL instance is not responding.
# Checks: oscal-reporter.service status, journalctl, disk, cron (ec2_automation), recent ec2_automation logs.
# Uses same SSH key as deploy-to-ec2.sh (Pass or SSH_KEY_FILE). Run from repo root.
#
# Usage:
#   ./scripts/debug/check-oscal-instance.sh           # Blue (default)
#   ./scripts/debug/check-oscal-instance.sh --blue    # Blue
#   ./scripts/debug/check-oscal-instance.sh --green   # Green
#   ./scripts/debug/check-oscal-instance.sh --blue 1.2.3.4   # use this IP instead of Terraform
#   ./scripts/debug/check-oscal-instance.sh --green 1.2.3.4

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/ec2-common.sh disable=SC1091
source "$SCRIPT_DIR/lib/ec2-common.sh"
SSH_USER="${SSH_USER:-ec2-user}"
SVC_USER="svc_ams-oscal"

# Parse args: --green | --blue (default) | optional IP
ROLE="blue"
IP_OVERRIDE=""
for arg in "$@"; do
  case "$arg" in
    --green) ROLE="green" ;;
    --blue)  ROLE="blue" ;;
    [0-9]*.[0-9]*.[0-9]*.[0-9]*) IP_OVERRIDE="$arg" ;;
  esac
done

resolve_ssh_key
INSTANCE_IP="${IP_OVERRIDE:-$(get_terraform_oscal_ip "$ROLE")}"
[ -z "$INSTANCE_IP" ] && { echo "Could not get $ROLE IP. Run from repo root after terraform apply or pass IP: $0 --$ROLE <ip>"; exit 1; }

# Green=3019, Blue=3020
PORT=$([ "$ROLE" = "green" ] && echo "3019" || echo "3020")

echo "=== $ROLE instance: $INSTANCE_IP (port $PORT) ==="
echo ""

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "${SSH_USER}@${INSTANCE_IP}" "
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
  echo \"--- 8. Local /health (port $PORT) ---\"
  curl -sf --connect-timeout 3 http://127.0.0.1:$PORT/health 2>/dev/null && echo 'OK' || echo 'FAIL'
"

echo ""
echo "If the service is failed/inactive, try: ssh -i <key> ${SSH_USER}@${INSTANCE_IP} 'sudo systemctl restart oscal-reporter.service'"
echo "To stop cron from auto-updating from GitHub: set ENABLE_GITHUB_UPDATE=false in ec2_automation.env."
echo "See scripts/deploy-to-ec2.sh and scripts/ec2_automation.sh for cron and auto-update behavior."
