#!/usr/bin/env bash
# Verify why config/users.json may not be backing up to S3 on Green/Blue.
# Uses same SSH key as deploy-to-ec2.sh (Pass or SSH_KEY_FILE). Run from repo root.

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TERRAFORM_DIR="${TERRAFORM_DIR:-$REPO_ROOT/terraform}"
SSH_USER="${SSH_USER:-ec2-user}"
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

get_ips() {
  [ ! -f "$TERRAFORM_DIR/terraform.tfstate" ] && { echo "No terraform state"; exit 1; }
  cd "$TERRAFORM_DIR"
  green=$(terraform output -raw oscal_green_public_ip 2>/dev/null || terraform output -raw oscal_green_private_ip 2>/dev/null)
  blue=$(terraform output -raw oscal_blue_public_ip 2>/dev/null || terraform output -raw oscal_blue_private_ip 2>/dev/null)
  echo "$green $blue"
}

run_diag() {
  local ip="$1"
  local role="$2"
  echo "========== $role ($ip) =========="
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "${SSH_USER}@${ip}" "
    echo '--- crontab ---'
    crontab -l 2>/dev/null || echo '(no crontab)'
    echo '--- ec2_automation.env ---'
    cat /opt/oscal/scripts/ec2_automation.env 2>/dev/null || echo '(file missing)'
    echo '--- /opt/oscal/data (config/users) ---'
    ls -la /opt/oscal/data/ 2>/dev/null || echo '(dir missing)'
    echo '--- AWS identity (instance role) ---'
    aws sts get-caller-identity 2>&1 || true
    echo '--- S3 bucket list (head) ---'
    BUCKET=\$(grep -E '^S3_BUCKET=' /opt/oscal/scripts/ec2_automation.env 2>/dev/null | cut -d= -f2)
    if [ -n \"\$BUCKET\" ]; then
      aws s3 ls \"s3://\$BUCKET/config/\" 2>&1 | head -5 || true
    else
      echo 'S3_BUCKET not set in env'
    fi
    echo '--- Run ec2_automation.sh (backup path) ---'
    mkdir -p /opt/oscal/app/logs
    CONFIG_PATH=/opt/oscal/data/config.json USERS_PATH=/opt/oscal/data/users.json /opt/oscal/scripts/ec2_automation.sh 2>&1 || true
    echo '--- Last ec2_automation.jsonl ---'
    tail -3 /opt/oscal/app/logs/ec2_automation.jsonl 2>/dev/null || echo '(no log)'
  "
  echo ""
}

resolve_ssh_key
read -r green_ip blue_ip < <(get_ips)

run_diag "$green_ip" "GREEN"
run_diag "$blue_ip" "BLUE"

echo "Done. Check above for: crontab entry, S3_BUCKET in env, presence of config.json/users.json, AWS CLI success, and ec2_automation.sh output."
