#!/usr/bin/env bash
# Deploy OSCAL Report Generator to EC2 instances (direct run, no Docker).
# Syncs code to /opt/oscal/app, runs npm install + frontend build, installs ec2_automation.sh and 10-min cron, restarts oscal-reporter.
# Config and users live on EBS at /opt/oscal/data; ec2_automation backs up to S3 every 10 min (no S3 mount).
#
# Prerequisites: Terraform applied with run_oscal_via_docker = false; SSH key in Pass or file; AWS CLI (for ec2_automation env).
#
# Usage:
#   ./scripts/deploy-to-ec2.sh
#   ./scripts/deploy-to-ec2.sh --green-only 1.2.3.4
#   ./scripts/deploy-to-ec2.sh --blue-only 5.6.7.8
#   SSH_KEY_FILE=/path/to/key.pem ./scripts/deploy-to-ec2.sh
#
# Environment:
#   AWS_PASS_SSH_ENTRY   Pass entry for SSH key (default: AWS/OSCAL-AWS4379-SSH)
#   SSH_KEY_FILE         If set, use this key file instead of Pass
#   SSH_USER             SSH user: ec2-user (RHEL). Default: ec2-user
#   TERRAFORM_DIR        Path to terraform dir (default: terraform)

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC}  $1"; }
print_info() { echo -e "${CYAN}ℹ${NC}  $1"; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TERRAFORM_DIR="${TERRAFORM_DIR:-$REPO_ROOT/terraform}"
SSH_USER="${SSH_USER:-ec2-user}"
PASS_ENTRY="${AWS_PASS_SSH_ENTRY:-AWS/OSCAL-AWS4379-SSH}"
REMOTE_APP="/opt/oscal/app"
CONFIG_APP="$REPO_ROOT/config/app"

# Resolve SSH key into SSH_KEY (from file or from Pass). Call from main; do not use in subshell.
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
  print_error "Set SSH_KEY_FILE or have Pass entry $PASS_ENTRY"
  exit 1
}

# Get S3 bucket name from Terraform output (for ec2_automation.env on instances)
get_s3_bucket() {
  local tfdir="$1"
  if [ ! -d "$tfdir" ] || [ ! -f "$tfdir/terraform.tfstate" ]; then
    return 1
  fi
  (cd "$tfdir" && terraform output -raw s3_logs_bucket_name 2>/dev/null) || return 1
}

# Get instance IPs from Terraform output (optional)
get_terraform_ips() {
  local tfdir="$1"
  if [ ! -d "$tfdir" ] || [ ! -f "$tfdir/terraform.tfstate" ]; then
    return 1
  fi
  cd "$tfdir"
  local green blue
  green=$(terraform output -raw oscal_green_public_ip 2>/dev/null || terraform output -raw oscal_green_private_ip 2>/dev/null || true)
  blue=$(terraform output -raw oscal_blue_public_ip 2>/dev/null || terraform output -raw oscal_blue_private_ip 2>/dev/null || true)
  cd - >/dev/null
  if [ -n "$green" ] && [ -n "$blue" ]; then
    echo "$green $blue"
    return 0
  fi
  return 1
}

deploy_one() {
  local ip="$1"
  local role="$2"
  local key="$3"
  local s3_bucket="$4"
  local port
  [ "$role" = "green" ] && port="3019" || port="3020"

  print_info "Deploying to $role at $ip (port $port)..."

  # Ensure /opt/oscal/app exists and is writable by SSH user (idempotent for existing instances)
  ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "sudo mkdir -p /opt/oscal/app /opt/oscal/scripts && sudo chown -R ${SSH_USER}:${SSH_USER} /opt/oscal" || true

  # Deploy ec2_automation.sh and env for 10-min cron (backup to S3 + git pull/restart)
  if [ -f "$REPO_ROOT/scripts/ec2_automation.sh" ]; then
    scp -i "$key" -o StrictHostKeyChecking=no "$REPO_ROOT/scripts/ec2_automation.sh" "${SSH_USER}@${ip}:${REMOTE_APP}/../scripts/ec2_automation.sh"
    ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "chmod +x /opt/oscal/scripts/ec2_automation.sh"
    if [ -n "$s3_bucket" ]; then
      ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "cat > /opt/oscal/scripts/ec2_automation.env << ENVEOF
S3_BUCKET=$s3_bucket
S3_CONFIG_PREFIX=config/$role
S3_LOGS_PREFIX=logs/$role
DEPLOYMENT_ROLE=$role
ENVEOF"
      # Install cron: every 10 min run ec2_automation.sh (script sources ec2_automation.env)
      # On Amazon Linux 2023 crontab is not installed by default; ensure cronie + crond before setting crontab.
      ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "
        command -v crontab >/dev/null 2>&1 || { sudo dnf install -y cronie 2>/dev/null || sudo yum install -y cronie 2>/dev/null; sudo systemctl enable crond --now 2>/dev/null; }
        (crontab -l 2>/dev/null | grep -v ec2_automation.sh || true
         echo '*/10 * * * * mkdir -p /opt/oscal/app/logs && /opt/oscal/scripts/ec2_automation.sh >> /opt/oscal/app/logs/ec2_automation.stdout 2>\&1') | crontab -
      "
      print_success "ec2_automation.sh installed; cron every 10 min (S3 bucket: $s3_bucket, prefix: config/${role}, logs/${role})"
    else
      print_warning "S3 bucket not set; ec2_automation.sh installed but backup/cron skipped (no S3_BUCKET)."
    fi
  fi

  # Ensure rsync on remote (Amazon Linux 2023 does not install it by default)
  ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "command -v rsync >/dev/null 2>&1 || { sudo dnf install -y rsync 2>/dev/null || sudo yum install -y rsync 2>/dev/null; }"

  # Rsync repo (exclude node_modules, .git, etc.)
  rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude 'backend/node_modules' \
    --exclude 'frontend/node_modules' \
    --exclude 'frontend/dist' \
    --exclude 'backend/public' \
    --exclude 'logs' \
    --exclude '*.log' \
    -e "ssh -i $key -o StrictHostKeyChecking=accept-new" \
    "$REPO_ROOT/" "${SSH_USER}@${ip}:${REMOTE_APP}/"

  # On instance: ensure Node/npm (Amazon Linux may not have it if user_data not run yet), then npm install, build, restart
  ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "set -e
    export PATH=\"/usr/bin:/usr/local/bin:\$PATH\"
    command -v npm >/dev/null 2>&1 || {
      curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
      sudo dnf install -y nodejs 2>/dev/null || sudo yum install -y nodejs 2>/dev/null
    }
    cd $REMOTE_APP
    npm install --no-audit --no-fund
    cd backend && npm install --no-audit --no-fund && cd ..
    cd frontend && npm install --no-audit --no-fund && npm run build && cd ..
    mkdir -p backend/public
    cp -r frontend/dist/* backend/public/
    if ! sudo systemctl restart oscal-reporter.service 2>/dev/null; then
      if [ ! -f /etc/systemd/system/oscal-reporter.service ]; then
        sudo tee /etc/systemd/system/oscal-reporter.service > /dev/null << 'SVCEOF'
[Unit]
Description=OSCAL Report Generator
After=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/oscal/app/backend
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=PORT_PLACEHOLDER
Environment=CONFIG_PATH=/opt/oscal/data/config.json
Environment=USERS_PATH=/opt/oscal/data/users.json

[Install]
WantedBy=multi-user.target
SVCEOF
        sudo sed -i \"s/PORT_PLACEHOLDER/$port/g\" /etc/systemd/system/oscal-reporter.service
        sudo systemctl daemon-reload
        sudo systemctl enable oscal-reporter.service
        sudo systemctl start oscal-reporter.service
      else
        echo '--- oscal-reporter.service failed. Last 15 lines: ---'
        sudo journalctl -u oscal-reporter.service -n 15 --no-pager 2>/dev/null || true
        exit 1
      fi
    fi
    echo OK
  "

  print_success "Deployed to $role at $ip"
  # Verify app responds (ALB needs healthy targets; avoid 502)
  print_info "Waiting 15s then checking /health on instance..."
  sleep 15
  if curl -sf --connect-timeout 5 "http://${ip}:${port}/health" >/dev/null 2>&1; then
    print_success "App is up at http://${ip}:${port}/health"
  else
    print_warning "App /health not yet responding at http://${ip}:${port}/health (check: sudo systemctl status oscal-reporter.service; config/users on EBS at /opt/oscal/data)"
  fi
}

# --- main ---
GREEN_ONLY=""
BLUE_ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --green-only)
      shift
      GREEN_IP="${1:?Give IP after --green-only}"
      GREEN_ONLY="1"
      shift
      ;;
    --blue-only)
      shift
      BLUE_IP="${1:?Give IP after --blue-only}"
      BLUE_ONLY="1"
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--green-only IP] [--blue-only IP]"
      echo "  With no IPs, reads from terraform output (run from repo root)."
      echo "  With --green-only IP or --blue-only IP, deploys to that host only."
      echo "  SSH key: Pass entry $PASS_ENTRY or SSH_KEY_FILE=/path/to/key.pem"
      exit 0
      ;;
    *)
      print_error "Unknown option: $1"; exit 1
      ;;
  esac
done

# If IPs not set by --green-only/--blue-only, get from Terraform
if [ -z "$GREEN_ONLY" ] && [ -z "$BLUE_ONLY" ]; then
  IPS=$(get_terraform_ips "$TERRAFORM_DIR" || true)
  if [ -n "$IPS" ]; then
    GREEN_IP=$(echo "$IPS" | awk '{print $1}')
    BLUE_IP=$(echo "$IPS" | awk '{print $2}')
  else
    print_error "Run from repo root after 'terraform apply' or use --green-only IP / --blue-only IP"
    exit 1
  fi
fi

[ -z "$GREEN_IP" ] && [ -z "$BLUE_IP" ] && { print_error "No instance IPs"; exit 1; }

resolve_ssh_key

# S3 bucket for ec2_automation.env on instances (backup target; config/users live on EBS)
S3_BUCKET=$(get_s3_bucket "$TERRAFORM_DIR" || true)

if [ -n "$GREEN_IP" ]; then
  deploy_one "$GREEN_IP" "green" "$SSH_KEY" "$S3_BUCKET"
fi
if [ -n "$BLUE_IP" ]; then
  deploy_one "$BLUE_IP" "blue" "$SSH_KEY" "$S3_BUCKET"
fi

print_success "Deploy complete."
print_info "ALB default route goes to Blue (3020). If you get 502 Bad Gateway, wait 1–2 min for target health checks then retry the ALB URL."