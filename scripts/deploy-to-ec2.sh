#!/usr/bin/env bash
# Deploy OSCAL Report Generator to EC2 instances (direct run, no Docker).
# Syncs code to /opt/oscal/app, runs npm install + frontend build, installs ec2_automation.sh and scripts (e.g. reactivate-admin.sh) to /opt/oscal/scripts, restarts oscal-reporter.
# Config and users live on EBS at /opt/oscal/data; ec2_automation backs up to S3 every 10 min (no S3 mount).
# Application and cron run as service account svc_ams-oscal (not root). Pass is installed and initialized for that user for secrets.
#
# Prerequisites: Terraform applied with run_oscal_via_docker = false; SSH key in Pass or file; AWS CLI (for ec2_automation env).
#
# Usage:
#   ./scripts/deploy-to-ec2.sh
#   ./scripts/deploy-to-ec2.sh --green-only 1.2.3.4
#   ./scripts/deploy-to-ec2.sh --blue-only 5.6.7.8
#   SSH_KEY_FILE=/path/to/key.pem ./scripts/deploy-to-ec2.sh
#
# Blue vs Green: Only PORT differs (Blue=3020, Green=3019). Same unit file, S3 prefix (config/blue vs config/green),
# and ec2_automation.env DEPLOYMENT_ROLE. If Blue fails to start, check journalctl (shown on health failure);
# common causes: bad config/users, missing pass vault, or wrong PORT in unit (script now forces PORT per role).
#
# Terraform: All terraform commands (output, apply) use terraform/run-with-aws-pass.sh.
#
# Environment:
#   AWS_PASS_SSH_ENTRY   Pass entry for SSH key (default: AWS/OSCAL-AWS4379-SSH)
#   SSH_KEY_FILE         If set, use this key file instead of Pass
#   SSH_USER             SSH user: ec2-user (RHEL). Default: ec2-user
#   TERRAFORM_DIR        Path to terraform dir (default: terraform)

set -e

# Service account for OSCAL app and cron (not root). Pass vault at $SVC_HOME/.password-store for tokens/credentials.
# To add a secret on instance: sudo -u svc_ams-oscal pass insert OSCAL/entry-name
SVC_USER="svc_ams-oscal"
SVC_GROUP="oscal"
SVC_HOME="/var/lib/svc_ams-oscal"

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

# Run Terraform via wrapper (loads AWS creds from Pass). Do not run terraform directly.
tf_output() {
  [ -x "$REPO_ROOT/terraform/run-with-aws-pass.sh" ] || return 1
  "$REPO_ROOT/terraform/run-with-aws-pass.sh" output "$@" 2>/dev/null
}

# Get S3 bucket name from Terraform output (for ec2_automation.env on instances)
get_s3_bucket() {
  local tfdir="$1"
  if [ ! -d "$tfdir" ] || [ ! -f "$tfdir/terraform.tfstate" ]; then
    return 1
  fi
  tf_output -raw s3_logs_bucket_name || return 1
}

# Get instance IPs from Terraform output (optional)
get_terraform_ips() {
  local tfdir="$1"
  if [ ! -d "$tfdir" ] || [ ! -f "$tfdir/terraform.tfstate" ]; then
    return 1
  fi
  local green blue
  green=$(tf_output -raw oscal_green_public_ip 2>/dev/null || tf_output -raw oscal_green_private_ip 2>/dev/null || true)
  blue=$(tf_output -raw oscal_blue_public_ip 2>/dev/null || tf_output -raw oscal_blue_private_ip 2>/dev/null || true)
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
  local results_file="${5:-}"
  local port
  [ "$role" = "green" ] && port="3019" || port="3020"
  local lambda_name ollama_url
  lambda_name=$(tf_output -raw lambda_ollama_controller_name 2>/dev/null) || lambda_name=""
  ollama_url=$(tf_output -raw ollama_url 2>/dev/null) || ollama_url=""

  print_info "Deploying to $role at $ip (port $port)..."

  # Ensure service account svc_ams-oscal and group oscal exist; install and initialize Pass (same logic as scripts/debug/install-pass-svc-oscal.sh).
  ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" bash -s "$SSH_USER" << 'REMOTEPASS' || true
set -e
REMOTE_SSH_USER="${1:-ec2-user}"
SVC_USER="svc_ams-oscal"
SVC_GROUP="oscal"
SVC_HOME="/var/lib/svc_ams-oscal"
export PATH="/usr/local/bin:$PATH"

if ! getent group "$SVC_GROUP" >/dev/null 2>&1; then sudo groupadd -r "$SVC_GROUP"; fi
if ! id "$SVC_USER" >/dev/null 2>&1; then
  sudo useradd -r -s /bin/bash -g "$SVC_GROUP" -d "$SVC_HOME" -m -c "OSCAL service account" "$SVC_USER"
  sudo chmod 700 "$SVC_HOME"
fi
sudo usermod -aG "$SVC_GROUP" "$REMOTE_SSH_USER" 2>/dev/null || true
command -v aws >/dev/null 2>&1 || sudo dnf install -y awscli 2>/dev/null || sudo yum install -y awscli 2>/dev/null || true

# --- Install dependencies (tree, pass, gnupg2, git, make) ---
sudo dnf install -y tree 2>/dev/null || sudo yum install -y tree 2>/dev/null || true
sudo dnf install -y --allowerasing gnupg2 2>/dev/null || sudo yum install -y gnupg2 2>/dev/null || true
command -v gpg >/dev/null 2>&1 || { echo "Failed to install gpg"; exit 1; }
command -v git >/dev/null 2>&1 || sudo dnf install -y git 2>/dev/null || sudo yum install -y git 2>/dev/null || true
command -v make >/dev/null 2>&1 || sudo dnf install -y make 2>/dev/null || sudo yum install -y make 2>/dev/null || true
# Pass: package first, then from source (Amazon Linux 2023 often has no pass package)
if ! command -v pass >/dev/null 2>&1; then
  sudo dnf install -y pass 2>/dev/null || sudo yum install -y pass 2>/dev/null || true
fi
if ! command -v pass >/dev/null 2>&1; then
  TMP_PASS=$(mktemp -d)
  if git clone --depth 1 https://github.com/zx2c4/password-store.git "$TMP_PASS" 2>/dev/null; then :; elif git clone --depth 1 https://git.zx2c4.com/password-store "$TMP_PASS" 2>/dev/null; then :; else rm -rf "$TMP_PASS"; exit 1; fi
  if [ -f "$TMP_PASS/Makefile" ]; then (cd "$TMP_PASS" && sudo make install PREFIX=/usr/local); fi
  rm -rf "$TMP_PASS"
fi
command -v pass >/dev/null 2>&1 || { echo "Failed to install pass"; exit 1; }

if [ ! -d "$SVC_HOME/.password-store" ]; then
  sudo -u "$SVC_USER" env HOME="$SVC_HOME" gpg-agent --daemon 2>/dev/null || true
  sudo -u "$SVC_USER" env PATH="/usr/local/bin:$PATH" HOME="$SVC_HOME" gpg --batch --no-tty --yes --generate-key 2>/dev/null << 'GPGEOF'
Key-Type: RSA
Key-Length: 2048
Name-Real: svc_ams-oscal
Name-Email: svc_ams-oscal@localhost
Expire-Date: 0
%no-protection
%commit
GPGEOF
  KEY_ID=$(sudo -u "$SVC_USER" env HOME="$SVC_HOME" gpg --list-keys --with-colons 2>/dev/null | awk -F: '/^pub/ {print $5; exit}')
  # Run pass init from SVC_HOME so any subprocess (e.g. find) restores cwd to a dir svc_ams-oscal can access; avoids "find: Failed to restore initial working directory: /home/ec2-user: Permission denied"
  if [ -n "$KEY_ID" ]; then sudo -u "$SVC_USER" env PATH="/usr/local/bin:$PATH" HOME="$SVC_HOME" sh -c "cd \"$SVC_HOME\" && pass init \"$KEY_ID\""; fi
fi
REMOTEPASS
  # Check if pass is usable by service user (store exists and pass runs)
  if ! ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "sudo -u $SVC_USER env PATH=/usr/local/bin:/usr/bin:/bin HOME=$SVC_HOME test -d $SVC_HOME/.password-store 2>/dev/null && sudo -u $SVC_USER env PATH=/usr/local/bin:/usr/bin:/bin HOME=$SVC_HOME pass ls >/dev/null 2>&1"; then
    PASS_MISSING_ANY=1
  fi
  print_success "Service account $SVC_USER and Pass vault ensured"

  # Directory layout: /opt/oscal/app = app code only; /opt/oscal/data = config.json + users.json (canonical on EC2); /opt/oscal/scripts = ec2_automation. Repo config/ is excluded from rsync so only /opt/oscal/data is used.
  ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "sudo mkdir -p /opt/oscal/app /opt/oscal/scripts /opt/oscal/data && sudo chown -R ${SSH_USER}:${SVC_GROUP} /opt/oscal && sudo chmod -R g+rX,g+w /opt/oscal" || true

  # Prefer last backed-up config/users from S3; fall back to repo then leave as-is if both missing
  if [ -n "$s3_bucket" ]; then
    print_info "Copying config.json and users.json from s3://${s3_bucket}/config/${role}/ to /opt/oscal/data/..."
    if ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "command -v aws >/dev/null 2>&1 && aws s3 cp s3://${s3_bucket}/config/${role}/config.json /opt/oscal/data/config.json --quiet 2>/dev/null && aws s3 cp s3://${s3_bucket}/config/${role}/users.json /opt/oscal/data/users.json --quiet 2>/dev/null"; then
      print_success "Restored config.json and users.json from S3 (last backup)"
    else
      print_warning "S3 restore skipped or failed (bucket: $s3_bucket, role: $role); will use repo seed if local missing"
    fi
  fi
  need_seed=$(ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "[ -f /opt/oscal/data/config.json ] && [ -f /opt/oscal/data/users.json ] && echo no || echo yes" 2>/dev/null) || need_seed="yes"
  if [ "$need_seed" = "yes" ] && [ -f "$REPO_ROOT/config/app/config.json" ] && [ -f "$REPO_ROOT/config/app/users.json" ]; then
    scp -i "$key" -o StrictHostKeyChecking=no "$REPO_ROOT/config/app/config.json" "$REPO_ROOT/config/app/users.json" "${SSH_USER}@${ip}:/tmp/" 2>/dev/null && \
    ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "mv -f /tmp/config.json /tmp/users.json /opt/oscal/data/" 2>/dev/null && \
    print_success "Seeded /opt/oscal/data/config.json and users.json from repo (were missing after S3)"
  fi

  # Deploy ec2_automation.sh and env; cron runs as svc_ams-oscal. Also copy helper scripts to same destination (/opt/oscal/scripts).
  if [ -f "$REPO_ROOT/scripts/ec2_automation.sh" ]; then
    scp -i "$key" -o StrictHostKeyChecking=no "$REPO_ROOT/scripts/ec2_automation.sh" "${SSH_USER}@${ip}:${REMOTE_APP}/../scripts/ec2_automation.sh"
    ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "chmod +x /opt/oscal/scripts/ec2_automation.sh"
    # Copy optional helper scripts to /opt/oscal/scripts (same destination as ec2_automation.sh)
    for _src in "scripts/update-pass-credential.sh" "scripts/sync-consolidation-script.sh"; do
      if [ -f "$REPO_ROOT/$_src" ]; then
        scp -i "$key" -o StrictHostKeyChecking=no "$REPO_ROOT/$_src" "${SSH_USER}@${ip}:/opt/oscal/scripts/$(basename "$_src")"
        ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "chmod +x /opt/oscal/scripts/$(basename "$_src")"
      fi
    done
    if [ -f "$REPO_ROOT/scripts/reactivate-admin.sh" ]; then
      scp -i "$key" -o StrictHostKeyChecking=no "$REPO_ROOT/scripts/reactivate-admin.sh" "${SSH_USER}@${ip}:/opt/oscal/scripts/reactivate-admin.sh"
      ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "chmod +x /opt/oscal/scripts/reactivate-admin.sh"
    fi
    if [ -n "$s3_bucket" ]; then
      # Blue: disable auto git pull/restart from cron so manual deploys are not overwritten (optional; set DEPLOY_BLUE_AUTO_UPDATE=1 to enable)
      github_update="true"
      if [ "$role" = "blue" ] && [ "${DEPLOY_BLUE_AUTO_UPDATE:-0}" != "1" ]; then
        github_update="false"
      fi
      ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "cat > /opt/oscal/scripts/ec2_automation.env << ENVEOF
S3_BUCKET=$s3_bucket
S3_CONFIG_PREFIX=config/$role
S3_LOGS_PREFIX=logs/$role
DEPLOYMENT_ROLE=$role
ENABLE_GITHUB_UPDATE=$github_update
ENVEOF"
      if [ "$role" = "blue" ] && [ "${DEPLOY_BLUE_AUTO_UPDATE:-0}" != "1" ]; then
        # Blue: remove existing ec2_automation cron so code is not updated from GitHub; ENABLE_GITHUB_UPDATE=false in env for consistency
        ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "
          remaining=\$(sudo crontab -u $SVC_USER -l 2>/dev/null | grep -v ec2_automation.sh || true)
          if [ -n \"\$remaining\" ]; then
            echo \"\$remaining\" | sudo crontab -u $SVC_USER -
          else
            sudo crontab -u $SVC_USER -r 2>/dev/null || true
          fi
        "
        print_success "ec2_automation.sh and env installed on Blue; cron job removed (no auto update from GitHub). Set DEPLOY_BLUE_AUTO_UPDATE=1 to install cron on Blue."
      else
        ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "
          command -v crontab >/dev/null 2>&1 || { sudo dnf install -y cronie 2>/dev/null || sudo yum install -y cronie 2>/dev/null; sudo systemctl enable crond --now 2>/dev/null; }
          CRONLINE='*/10 * * * * mkdir -p /opt/oscal/app/logs && /opt/oscal/scripts/ec2_automation.sh >> /opt/oscal/app/logs/ec2_automation.stdout 2>\&1'
          (sudo crontab -u $SVC_USER -l 2>/dev/null | grep -v ec2_automation.sh || true; echo \"\$CRONLINE\") | sudo crontab -u $SVC_USER -
        "
        print_success "ec2_automation.sh installed; cron every 10 min as $SVC_USER (S3 bucket: $s3_bucket)"
      fi
    else
      print_warning "S3 bucket not set; ec2_automation.sh installed but backup/cron skipped (no S3_BUCKET)."
    fi
  fi

  # Ensure rsync on remote (Amazon Linux 2023 does not install it by default)
  ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "command -v rsync >/dev/null 2>&1 || { sudo dnf install -y rsync 2>/dev/null || sudo yum install -y rsync 2>/dev/null; }"

  # Rsync app code only; exclude repo config/ so config/users live only in /opt/oscal/data (no duplicate under app)
  rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude 'config' \
    --exclude 'backend/node_modules' \
    --exclude 'frontend/node_modules' \
    --exclude 'frontend/dist' \
    --exclude 'backend/public' \
    --exclude 'logs' \
    --exclude '*.log' \
    -e "ssh -i $key -o StrictHostKeyChecking=accept-new" \
    "$REPO_ROOT/" "${SSH_USER}@${ip}:${REMOTE_APP}/"
  # Remove orphan config dir if present (from older deploys); app uses CONFIG_PATH/USERS_PATH=/opt/oscal/data only
  ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "rm -rf ${REMOTE_APP}/config" 2>/dev/null || true

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
User=SVC_USER_PLACEHOLDER
Group=SVC_GROUP_PLACEHOLDER
WorkingDirectory=/opt/oscal/app/backend
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=PORT_PLACEHOLDER
Environment=CONFIG_PATH=/opt/oscal/data/config.json
Environment=USERS_PATH=/opt/oscal/data/users.json
Environment=HOME=SVC_HOME_PLACEHOLDER
Environment=PASSWORD_STORE_DIR=SVC_HOME_PLACEHOLDER/.password-store
Environment=PATH=/usr/local/bin:/usr/bin:/bin
# HOME and PASSWORD_STORE_DIR required so GUI save uses pass vault (not plaintext in config)

[Install]
WantedBy=multi-user.target
SVCEOF
        SVC_HOME=/var/lib/svc_ams-oscal
        sudo sed -i \"s/PORT_PLACEHOLDER/$port/g;s/SVC_USER_PLACEHOLDER/$SVC_USER/g;s/SVC_GROUP_PLACEHOLDER/$SVC_GROUP/g;s|SVC_HOME_PLACEHOLDER|$SVC_HOME|g\" /etc/systemd/system/oscal-reporter.service
        sudo systemctl daemon-reload
        sudo systemctl enable oscal-reporter.service
        sudo systemctl start oscal-reporter.service
      else
        echo '--- oscal-reporter.service failed. Last 15 lines: ---'
        sudo journalctl -u oscal-reporter.service -n 15 --no-pager 2>/dev/null || true
        exit 1
      fi
    fi
    sudo chown -R $SVC_USER:$SVC_GROUP /opt/oscal
    # Always ensure PORT matches this role (Blue=3020, Green=3019) so health check and ALB target use correct port
    sudo sed -i \"s/^Environment=PORT=.*/Environment=PORT=$port/\" /etc/systemd/system/oscal-reporter.service 2>/dev/null || true
    grep -q '^User=' /etc/systemd/system/oscal-reporter.service 2>/dev/null || { sudo sed -i '/^\[Service\]/a User=$SVC_USER' /etc/systemd/system/oscal-reporter.service; sudo sed -i '/^User=/a Group=$SVC_GROUP' /etc/systemd/system/oscal-reporter.service; sudo systemctl daemon-reload; sudo systemctl restart oscal-reporter.service 2>/dev/null; }
    grep -q 'Environment=PATH=' /etc/systemd/system/oscal-reporter.service 2>/dev/null || { sudo sed -i '/Environment=USERS_PATH=/a Environment=PATH=/usr/local/bin:/usr/bin:/bin' /etc/systemd/system/oscal-reporter.service; sudo systemctl daemon-reload; sudo systemctl restart oscal-reporter.service 2>/dev/null; }
    grep -q 'Environment=HOME=' /etc/systemd/system/oscal-reporter.service 2>/dev/null || { sudo sed -i '/Environment=USERS_PATH=/a Environment=HOME=/var/lib/svc_ams-oscal' /etc/systemd/system/oscal-reporter.service; sudo systemctl daemon-reload; sudo systemctl restart oscal-reporter.service 2>/dev/null; }
    grep -q 'Environment=PASSWORD_STORE_DIR=' /etc/systemd/system/oscal-reporter.service 2>/dev/null || { sudo sed -i '/Environment=HOME=/a Environment=PASSWORD_STORE_DIR=/var/lib/svc_ams-oscal/.password-store' /etc/systemd/system/oscal-reporter.service; sudo systemctl daemon-reload; sudo systemctl restart oscal-reporter.service 2>/dev/null; }
    if [ -n \"$lambda_name\" ]; then grep -q 'Environment=OLLAMA_WAKE_LAMBDA=' /etc/systemd/system/oscal-reporter.service 2>/dev/null && sudo sed -i \"s/^Environment=OLLAMA_WAKE_LAMBDA=.*/Environment=OLLAMA_WAKE_LAMBDA=$lambda_name/\" /etc/systemd/system/oscal-reporter.service || sudo sed -i \"/Environment=USERS_PATH=/a Environment=OLLAMA_WAKE_LAMBDA=$lambda_name\" /etc/systemd/system/oscal-reporter.service; fi
    if [ -n \"$ollama_url\" ]; then grep -q 'Environment=OLLAMA_URL=' /etc/systemd/system/oscal-reporter.service 2>/dev/null && sudo sed -i \"s|^Environment=OLLAMA_URL=.*|Environment=OLLAMA_URL=$ollama_url|\" /etc/systemd/system/oscal-reporter.service || sudo sed -i \"/Environment=USERS_PATH=/a Environment=OLLAMA_URL=$ollama_url\" /etc/systemd/system/oscal-reporter.service; fi
    sudo systemctl daemon-reload
    sudo systemctl restart oscal-reporter.service 2>/dev/null || true
    echo OK
  "

  print_success "Deployed to $role at $ip"
  # Restart so new code and env (HOME/PASSWORD_STORE_DIR) are active
  print_info "Restarting oscal-reporter.service..."
  ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "sudo systemctl restart oscal-reporter.service" 2>/dev/null || true
  # Verify app responds (ALB needs healthy targets; avoid 502/504)
  print_info "Waiting 20s then checking /health (retry up to 5 times)..."
  sleep 20
  health_ok=""
  for attempt in 1 2 3 4 5; do
    if curl -sf --connect-timeout 5 "http://${ip}:${port}/health" >/dev/null 2>&1; then
      health_ok=1
      break
    fi
    [ "$attempt" -lt 5 ] && sleep 5
  done
  if [ -n "$health_ok" ]; then
    print_success "App is up at http://${ip}:${port}/health"
    [ -n "$results_file" ] && [ -f "$results_file" ] && echo "$role $ip ok" >> "$results_file"
  else
    print_warning "App /health not yet responding at http://${ip}:${port}/health (check: sudo systemctl status oscal-reporter.service; config/users on EBS at /opt/oscal/data)"
    [ -n "$results_file" ] && [ -f "$results_file" ] && echo "$role $ip fail" >> "$results_file"
    print_info "Recent oscal-reporter.service logs (for debugging):"
    ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "sudo journalctl -u oscal-reporter.service -n 30 --no-pager 2>/dev/null" 2>/dev/null || true
  fi
  print_info "ALB idle_timeout should be 300s (see terraform/alb.tf) to avoid 504 on long requests."
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
    print_error "Run from repo root after './terraform/run-with-aws-pass.sh apply' or use --green-only IP / --blue-only IP"
    exit 1
  fi
fi

[ -z "$GREEN_IP" ] && [ -z "$BLUE_IP" ] && { print_error "No instance IPs"; exit 1; }

resolve_ssh_key

# S3 bucket for ec2_automation.env on instances (backup target; config/users live on EBS)
S3_BUCKET=$(get_s3_bucket "$TERRAFORM_DIR" || true)

# Results file for post-deploy summary and health status (option 2, 4)
DEPLOY_RESULTS_FILE=$(mktemp)
trap 'rm -f "$DEPLOY_RESULTS_FILE"' EXIT

PASS_MISSING_ANY=0
if [ -n "$GREEN_IP" ]; then
  deploy_one "$GREEN_IP" "green" "$SSH_KEY" "$S3_BUCKET" "$DEPLOY_RESULTS_FILE"
fi
if [ -n "$BLUE_IP" ]; then
  deploy_one "$BLUE_IP" "blue" "$SSH_KEY" "$S3_BUCKET" "$DEPLOY_RESULTS_FILE"
fi

# If Pass is not installed/initialized on any instance, warn and prompt
if [ "${PASS_MISSING_ANY:-0}" = "1" ]; then
  echo ""
  print_warning "Pass is not installed or not initialized for $SVC_USER on one or more instances."
  echo -e "  ${YELLOW}Secrets (e.g. Okta client secret) will be stored in plain text in config.json.${NC}"
  echo ""
  echo "  Would you like to continue with deployment anyway? [y/N]"
  if [ -t 0 ]; then
    read -r response
    case "${response:-n}" in
      [yY]|[yY][eE][sS]) ;;
      *) print_error "Deployment aborted. Install and initialize Pass first, then re-run deploy."
        echo "  Run: ./scripts/debug/install-pass-svc-oscal.sh"
        echo "  Then add secrets (e.g. Okta): sudo -u $SVC_USER pass insert OSCAL/sso-oauth-okta-client-secret"
        exit 1
        ;;
    esac
  else
    print_error "Deployment completed but Pass is not available. Secrets will be stored in config.json."
    echo "  To use Pass for secrets, run: ./scripts/debug/install-pass-svc-oscal.sh"
  fi
fi

# Summary: deployed instances and health (option 4)
print_success "Deploy complete."
if [ -f "$DEPLOY_RESULTS_FILE" ] && [ -s "$DEPLOY_RESULTS_FILE" ]; then
  echo ""
  print_info "Summary:"
  while read -r role ip status; do
    [ -z "$role" ] && continue
    if [ "$status" = "ok" ]; then
      echo -e "  ${GREEN}✓${NC} $role ($ip): healthy"
    else
      echo -e "  ${RED}✗${NC} $role ($ip): /health not responding"
    fi
  done < "$DEPLOY_RESULTS_FILE"
fi
echo ""
# Post-deploy: pass vault check (option 1)
print_info "Pass vault status (secrets in vault vs config):"
if [ -x "$REPO_ROOT/scripts/check-pass-vault-on-ec2.sh" ]; then
  "$REPO_ROOT/scripts/check-pass-vault-on-ec2.sh" 2>/dev/null || true
else
  echo "  (run ./scripts/check-pass-vault-on-ec2.sh for details)"
fi
echo ""
# Fail script if any instance failed health check (option 2)
HEALTH_FAIL=$(grep -c ' fail$' "$DEPLOY_RESULTS_FILE" 2>/dev/null || echo 0 | tr -d '\n\r')
HEALTH_FAIL=$(( ${HEALTH_FAIL:-0} + 0 ))
if [ "$HEALTH_FAIL" -gt 0 ]; then
  print_error "One or more instances failed health check. Fix and re-run deploy or check: sudo systemctl status oscal-reporter.service"
  exit 1
fi
print_info "ALB default route goes to Blue (3020). If you get 502 Bad Gateway, wait 1–2 min for target health checks then retry the ALB URL."

# Apply Terraform so any drift (e.g. ALB idle_timeout) is applied. Does not destroy or replace Green/Blue instances.
print_info "Running terraform apply -auto-approve via run-with-aws-pass.sh..."
if [ -x "$REPO_ROOT/terraform/run-with-aws-pass.sh" ]; then
  if "$REPO_ROOT/terraform/run-with-aws-pass.sh" apply -auto-approve; then
    print_success "Terraform apply completed."
  else
    print_warning "Terraform apply failed or had errors (check output above). Instances were not modified."
  fi
else
  print_warning "terraform/run-with-aws-pass.sh not found or not executable; skipping terraform apply."
fi

# --- ACM HTTPS: validate CNAME records and guide next steps or raise-a-ticket ---
check_acm_validation_and_ticket() {
  local tfdir="${1:-$REPO_ROOT/terraform}"
  [ ! -d "$tfdir" ] || [ ! -f "$tfdir/terraform.tfstate" ] && return 0
  local json
  json=$(tf_output -json acm_certificate_validation_records 2>/dev/null) || return 0
  # Empty array or null => no cert workflow
  if [ -z "$json" ] || [ "$json" = "[]" ] || [ "$json" = "null" ]; then
    return 0
  fi
  local alb_dns
  alb_dns=$(tf_output -raw alb_dns_name 2>/dev/null) || alb_dns=""
  local domain_url
  domain_url=$(tf_output -raw alb_domain_url 2>/dev/null) || domain_url=""
  [ -z "$domain_url" ] && domain_url="https://oscal.amsgovcloud.com.au"

  if ! command -v jq >/dev/null 2>&1; then
    print_warning "jq not found; cannot validate ACM CNAMEs. Run: terraform output acm_certificate_validation_records and add those CNAMEs in Route53, then set alb_certificate_ready = true and terraform apply again."
    return 0
  fi

  local count missing
  count=$(echo "$json" | jq 'length')
  [ "$count" -eq 0 ] 2>/dev/null && return 0
  missing=""
  local i=0
  while [ "$i" -lt "$count" ]; do
    local name value
    name=$(echo "$json" | jq -r ".[$i].name" 2>/dev/null | sed 's/\.$//')
    value=$(echo "$json" | jq -r ".[$i].value" 2>/dev/null | sed 's/\.$//')
    [ -z "$name" ] || [ "$name" = "null" ] && { i=$((i+1)); continue; }
    local resolved
    resolved=""
    if command -v dig >/dev/null 2>&1; then
      resolved=$(dig +short CNAME "$name" 2>/dev/null | head -1 | sed 's/\.$//')
    elif command -v host >/dev/null 2>&1; then
      resolved=$(host -t CNAME "$name" 2>/dev/null | awk '{print $NF}' | sed 's/\.$//')
    fi
    if [ -z "$resolved" ] || [ "$resolved" != "$value" ]; then
      missing="${missing}  - Name: $name -> Value: $value (current DNS: ${resolved:-not found})\n"
    fi
    i=$((i+1))
  done

  if [ -n "$missing" ]; then
    echo ""
    print_warning "ACM certificate validation CNAME record(s) are missing or incorrect in DNS. Validate CNAME record first; then request the following via ticket."
    echo ""
    echo "--------- RAISE A TICKET (DNS team / Route53 in other account) ---------"
    echo "Subject: Add DNS records for oscal.amsgovcloud.com.au (ACM validation + ALB)"
    echo ""
    echo "1) Add these CNAME records so AWS ACM can validate the certificate:"
    echo "$json" | jq -r '.[] | "   Name: \(.name)\n   Type: \(.type)\n   Value: \(.value)\n"' 2>/dev/null || tf_output acm_certificate_validation_records 2>/dev/null
    echo "2) After the certificate shows 'Issued' in AWS ACM, add an A record (alias) or CNAME:"
    echo "   Hostname: oscal.amsgovcloud.com.au"
    echo "   Target:   ${alb_dns:-<run: terraform output alb_dns_name>}"
    echo ""
    echo "3) Then in this repo set in terraform.tfvars: alb_certificate_ready = true"
    echo "   and run: ./terraform/run-with-aws-pass.sh apply -auto-approve"
    echo "-----------------------------------------------------------------------"
    echo ""
    return 0
  fi

  print_success "ACM validation CNAME record(s) are present in DNS."
  print_info "Wait for the certificate to show 'Issued' in AWS Console → Certificate Manager, then:"
  echo "  1. Set in terraform.tfvars: alb_certificate_ready = true"
  echo "  2. Run: ./terraform/run-with-aws-pass.sh apply -auto-approve"
  echo "  Then https://oscal.amsgovcloud.com.au will work (once DNS A/alias points to the ALB)."
  echo ""
}

check_acm_validation_and_ticket "$TERRAFORM_DIR"