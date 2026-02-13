#!/usr/bin/env bash
# Deploy OSCAL Report Generator to EC2 instances (direct run, no Docker).
# Syncs code to /opt/oscal/app, runs npm install + frontend build, restarts systemd.
#
# Prerequisites: Terraform applied with run_oscal_via_docker = false; SSH key in Pass or file.
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
#   SSH_USER             SSH user: ubuntu (Ubuntu AMI) or ec2-user (RHEL9/Amazon Linux). Default: ubuntu
#   TERRAFORM_DIR        Path to terraform dir (default: terraform)
#
# If oscal-data-mount.service fails: SSH to instance and run
#   sudo journalctl -xeu oscal-data-mount.service
# Check /etc/fuse.conf has "user_allow_other". For RHEL9 use SSH_USER=ec2-user.

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
SSH_USER="${SSH_USER:-ubuntu}"
PASS_ENTRY="${AWS_PASS_SSH_ENTRY:-AWS/OSCAL-AWS4379-SSH}"
REMOTE_APP="/opt/oscal/app"

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
  local port
  [ "$role" = "green" ] && port="3019" || port="3020"

  print_info "Deploying to $role at $ip (port $port)..."

  # Ensure /opt/oscal/app exists and is writable by SSH user (idempotent for existing instances)
  ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "sudo mkdir -p /opt/oscal/app && sudo chown -R ${SSH_USER}:${SSH_USER} /opt/oscal" || true

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

  # On instance: npm install, build frontend, copy to backend/public, start S3 mount then restart app
  ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "set -e
    cd $REMOTE_APP
    npm install --no-audit --no-fund
    cd backend && npm install --no-audit --no-fund && cd ..
    cd frontend && npm install --no-audit --no-fund && npm run build && cd ..
    mkdir -p backend/public
    cp -r frontend/dist/* backend/public/
    if ! sudo systemctl start oscal-data-mount.service 2>/dev/null; then
      echo '--- oscal-data-mount.service failed (S3 mount). Last 15 lines: ---'
      sudo journalctl -u oscal-data-mount.service -n 15 --no-pager 2>/dev/null || true
      echo '--- Ensure /etc/fuse.conf has user_allow_other. For RHEL9 use: SSH_USER=ec2-user ./scripts/deploy-to-ec2.sh ---'
    fi
    if ! sudo systemctl restart oscal-reporter.service 2>/dev/null; then
      echo '--- oscal-reporter.service failed. Last 15 lines: ---'
      sudo journalctl -u oscal-reporter.service -n 15 --no-pager 2>/dev/null || true
      echo '--- Full logs: sudo journalctl -u oscal-data-mount.service -u oscal-reporter.service -n 50 ---'
      exit 1
    fi
    echo OK
  "

  print_success "Deployed to $role at $ip"
  print_info "Health: curl http://${ip}:${port}/health"
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

if [ -n "$GREEN_IP" ]; then
  deploy_one "$GREEN_IP" "green" "$SSH_KEY"
fi
if [ -n "$BLUE_IP" ]; then
  deploy_one "$BLUE_IP" "blue" "$SSH_KEY"
fi

print_success "Deploy complete."
