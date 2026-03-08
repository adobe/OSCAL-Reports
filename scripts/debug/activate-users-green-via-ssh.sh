#!/usr/bin/env bash
# Activate admin and mkesharw on the Green instance via SSH.
# Uses: Pass for SSH key (AWS/OSCAL-AWS4379-SSH) and Terraform for Green IP.
#
# Usage: ./scripts/debug/activate-users-green-via-ssh.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/ec2-common.sh disable=SC1091
source "$SCRIPT_DIR/lib/ec2-common.sh"

resolve_ssh_key
GREEN_IP=$(get_terraform_oscal_ip green)
if [ -z "$GREEN_IP" ]; then
  echo "Error: Could not get Green IP from Terraform. Run: cd terraform && ./run-with-aws-pass.sh apply" >&2
  exit 1
fi

echo "Green IP: $GREEN_IP"
echo "Activating admin + mkesharw on Green..."

# Inline Node one-liner to activate admin and mkesharw in users.json
ACTIVATE_SCRIPT='const fs=require("fs"),path=process.env.USERS_PATH||"/opt/oscal/data/users.json";if(!fs.existsSync(path)){console.error("Not found:",path);process.exit(1);}const d=JSON.parse(fs.readFileSync(path,"utf8"));d.forEach(u=>{if(u.username==="admin"||u.username==="mkesharw"){u.isActive=true;delete u.deactivatedAt;}});fs.writeFileSync(path,JSON.stringify(d));console.log("Updated",path,"- admin and mkesharw are now active. Restart the app.");'

# Run on instance: try direct-run path first, then container
# Direct run: USERS_PATH=/opt/oscal/data/users.json (app runs as svc_ams-oscal; we need sudo to write)
# Quote REMOTE so heredoc is sent literally and expansions happen on the server; pass script via argument
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "${SSH_USER}@${GREEN_IP}" bash -s "$ACTIVATE_SCRIPT" << 'REMOTE'
set -e
NODE_SCRIPT="$1"
USERS_FILE="/opt/oscal/data/users.json"
if [ -f "$USERS_FILE" ]; then
  echo "Using direct-run path: $USERS_FILE"
  sudo bash -c "USERS_PATH=$USERS_FILE node -e \"$NODE_SCRIPT\""
  echo "Restarting oscal-reporter..."
  sudo systemctl restart oscal-reporter.service 2>/dev/null || true
elif command -v podman >/dev/null 2>&1 && podman ps --format '{{.Names}}' 2>/dev/null | grep -q oscal; then
  echo "Using podman container"
  podman exec oscal node -e "$NODE_SCRIPT"
  podman restart oscal 2>/dev/null || true
elif command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' 2>/dev/null | grep -q oscal; then
  echo "Using docker container"
  docker exec oscal node -e "$NODE_SCRIPT"
  docker restart oscal 2>/dev/null || true
else
  sudo bash -c "USERS_PATH=/opt/oscal/data/users.json node -e \"$NODE_SCRIPT\""
  sudo systemctl restart oscal-reporter.service 2>/dev/null || true
fi
echo "Done on Green instance."
REMOTE

echo "Activation complete. Try logging in as admin or mkesharw."
