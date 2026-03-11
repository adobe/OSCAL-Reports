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
#   AWS_PASS_ENTRY       Pass entry for AWS credentials (default: AWS/AMS_4403-STG for aws4403). For AWS4379: AWS/AWS4379 Sandbox.
#   AWS_PASS_SSH_ENTRY   Pass entry for SSH key (default: AWS/OSCAL-AWS4403-SSH). For AWS4379: AWS/OSCAL-AWS4379-SSH.
#   SSH_KEY_FILE         If set, use this key file instead of Pass
#   SSH_USER             SSH user: ec2-user (RHEL). Default: ec2-user
#   TERRAFORM_DIR        Terraform env dir (default: terraform/envs/aws4403). For AWS4379 Sandbox set
#                        TERRAFORM_DIR=$PWD/terraform/envs/aws4379 and AWS_PASS_ENTRY="AWS/AWS4379 Sandbox".

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
# Default to aws4403 so we do not accidentally deploy to or change AWS4379 Sandbox.
TERRAFORM_DIR="${TERRAFORM_DIR:-$REPO_ROOT/terraform/envs/aws4403}"
export TERRAFORM_DIR
SSH_USER="${SSH_USER:-ec2-user}"
PASS_ENTRY="${AWS_PASS_SSH_ENTRY:-AWS/OSCAL-AWS4403-SSH}"
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

# Run Terraform via wrapper (loads AWS creds from Pass). Uses TERRAFORM_DIR so correct state is read.
tf_output() {
  [ -x "$REPO_ROOT/terraform/run-with-aws-pass.sh" ] || return 1
  TERRAFORM_DIR="$TERRAFORM_DIR" "$REPO_ROOT/terraform/run-with-aws-pass.sh" output "$@" 2>/dev/null
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
  # GPG Name-Real is the identity shown for the store (avoid generic "Password Store" label)
  sudo -u "$SVC_USER" env PATH="/usr/local/bin:$PATH" HOME="$SVC_HOME" gpg --batch --no-tty --yes --generate-key 2>/dev/null << 'GPGEOF'
Key-Type: RSA
Key-Length: 2048
Name-Real: OSCAL_password_store
Name-Email: oscal-password-store@localhost
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
    for _src in "scripts/debug/update-pass-credential.sh" "scripts/sync-consolidation-script.sh" "scripts/consolidate-users.sh"; do
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

  # Rsync app code only; exclude repo config/ so config/users live only in /opt/oscal/data (no duplicate under app).
  # Exclude dev/infra-only paths not needed on EC2 (terraform, tests, Docker, hooks, retired, local data).
  rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '.cursor' \
    --exclude '.githooks' \
    --exclude '.validation' \
    --exclude '.github' \
    --exclude 'config' \
    --exclude 'retired' \
    --exclude 'terraform' \
    --exclude 'test_cases' \
    --exclude 'retired' \
    --exclude 'logs' \
    --exclude 'data/debug-state' \
    --exclude 'data/jobs' \
    --exclude 'bump_version.sh' \
    --exclude 'docker-compose.yml' \
    --exclude 'docker-entrypoint.sh' \
    --exclude 'Dockerfile' \
    --exclude 'setup-git-hooks.sh' \
    --exclude 'switch-github-account.sh' \
    --exclude 'backend/node_modules' \
    --exclude 'frontend/node_modules' \
    --exclude 'frontend/dist' \
    --exclude 'backend/public' \
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
    sudo systemctl daemon-reload
    sudo systemctl restart oscal-reporter.service 2>/dev/null || true
    echo OK
  "

  print_success "Deployed to $role at $ip"
  # Restart so new code and env (HOME/PASSWORD_STORE_DIR) are active
  print_info "Restarting oscal-reporter.service..."
  ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "sudo systemctl restart oscal-reporter.service" 2>/dev/null || true
  # Verify app responds. Public curl often fails: SG allows only ALB/VPC/self on 3019/3020, not the internet.
  print_info "Waiting 20s then checking /health (retry up to 5 times)..."
  sleep 20
  health_ok=""
  health_via_ssh=""
  for attempt in 1 2 3 4 5; do
    if curl -sf --connect-timeout 5 "http://${ip}:${port}/health" >/dev/null 2>&1; then
      health_ok=1
      break
    fi
    [ "$attempt" -lt 5 ] && sleep 5
  done
  if [ -z "$health_ok" ]; then
    # Fallback: check from inside instance (SG does not affect localhost).
    if ssh -i "$key" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "${SSH_USER}@${ip}" \
      "curl -sf --connect-timeout 5 http://127.0.0.1:${port}/health >/dev/null" 2>/dev/null; then
      health_ok=1
      health_via_ssh=1
    fi
  fi
  if [ -n "$health_ok" ]; then
    if [ -n "$health_via_ssh" ]; then
      print_success "App /health OK on instance (localhost only). Direct http://${ip}:${port}/ is blocked by SG -- use ALB URL to reach the app."
      [ -n "$results_file" ] && [ -f "$results_file" ] && echo "$role $ip ok_ssh" >> "$results_file"
    else
      print_success "App is up at http://${ip}:${port}/health"
      [ -n "$results_file" ] && [ -f "$results_file" ] && echo "$role $ip ok" >> "$results_file"
    fi
  else
    print_warning "App /health not yet responding at http://${ip}:${port}/health (check: sudo systemctl status oscal-reporter.service; config/users on EBS at /opt/oscal/data)"
    [ -n "$results_file" ] && [ -f "$results_file" ] && echo "$role $ip fail" >> "$results_file"
    print_info "Recent oscal-reporter.service logs (for debugging):"
    ssh -i "$key" -o StrictHostKeyChecking=no "${SSH_USER}@${ip}" "sudo journalctl -u oscal-reporter.service -n 30 --no-pager 2>/dev/null" 2>/dev/null || true
  fi
  # EC2-local deployment.log: binding (ss) + curl localhost + curl private IP on same host
  local priv_ip=""
  [ "$role" = "green" ] && priv_ip="${GREEN_PRIVATE:-}" || priv_ip="${BLUE_PRIVATE:-}"
  print_info "Appending local health/binding checks to ${DEPLOY_LOG_REMOTE} on $role..."
  ssh -i "$key" -o StrictHostKeyChecking=no -o ConnectTimeout=15 "${SSH_USER}@${ip}" bash -s "$port" "$role" "$priv_ip" << 'DEPLOYLOGLOCAL'
set +e
LOG=/opt/oscal/app/logs/deployment.log
sudo mkdir -p /opt/oscal/app/logs
sudo touch "$LOG"
sudo chown "$(whoami)":oscal "$LOG" 2>/dev/null || sudo chmod 666 "$LOG"
{
  echo "=== $(date -Iseconds) deploy_one local binding port=$1 role=$2 ==="
  echo "--- ss listening (3019/3020 or node) ---"
  ss -tlnp 2>/dev/null | grep -E ':3019|:3020' || ss -tlnp 2>/dev/null | grep node || echo "ss: no matching listener"
  echo "--- curl http://127.0.0.1:$1/health ---"
  curl -sS -w "\nhttp_code:%{http_code}\n" --connect-timeout 5 "http://127.0.0.1:$1/health" || echo "curl_127_fail"
  if [ -n "$3" ]; then
    echo "--- curl http://$3:$1/health (same host private IP) ---"
    curl -sS -w "\nhttp_code:%{http_code}\n" --connect-timeout 5 "http://$3:$1/health" || echo "curl_private_fail"
  else
    echo "--- skip private-IP curl (no private IP in tf output) ---"
  fi
} 2>&1 | sudo tee -a "$LOG" >/dev/null
DEPLOYLOGLOCAL
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
    print_info "Using Terraform dir: $TERRAFORM_DIR"
    print_info "Green: $GREEN_IP  Blue: $BLUE_IP"
  else
    print_error "Run from repo root after './terraform/run-with-aws-pass.sh apply' or use --green-only IP / --blue-only IP"
    echo "  For AWS4379 Sandbox: set TERRAFORM_DIR=\$PWD/terraform/envs/aws4379 and AWS_PASS_ENTRY=\"AWS/AWS4379 Sandbox\"."
    exit 1
  fi
fi

[ -z "$GREEN_IP" ] && [ -z "$BLUE_IP" ] && { print_error "No instance IPs"; exit 1; }

resolve_ssh_key

# S3 bucket for ec2_automation.env on instances (backup target; config/users live on EBS)
S3_BUCKET=$(get_s3_bucket "$TERRAFORM_DIR" || true)

# IPs and ALB for EC2-local deployment.log, cross-instance curls, and ALB checks (Terraform outputs)
DEPLOY_LOG_REMOTE="/opt/oscal/app/logs/deployment.log"
GREEN_PRIVATE=$(tf_output -raw oscal_green_private_ip 2>/dev/null || true)
BLUE_PRIVATE=$(tf_output -raw oscal_blue_private_ip 2>/dev/null || true)
GREEN_PUBLIC_TF=$(tf_output -raw oscal_green_public_ip 2>/dev/null || true)
BLUE_PUBLIC_TF=$(tf_output -raw oscal_blue_public_ip 2>/dev/null || true)
[ -n "${GREEN_PUBLIC_TF:-}" ] && GREEN_PUBLIC="$GREEN_PUBLIC_TF" || GREEN_PUBLIC="${GREEN_IP:-}"
[ -n "${BLUE_PUBLIC_TF:-}" ] && BLUE_PUBLIC="$BLUE_PUBLIC_TF" || BLUE_PUBLIC="${BLUE_IP:-}"
ALB_DNS=$(tf_output -raw alb_dns_name 2>/dev/null || true)
# ALB SG allows 443 only; use HTTPS when ALB exists
ALB_USE_HTTPS=$(tf_output -raw alb_use_https 2>/dev/null || echo "true")

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

# Cross-instance curls (private + public) logged on originating host; SG may block public-IP paths
# shellcheck disable=SC2087 # here-doc must expand GREEN_/BLUE_ IPs on client before ssh
if [ -n "$GREEN_IP" ] && [ -n "$BLUE_IP" ]; then
  print_info "Cross-instance curl tests (append to deployment.log on each host)..."
  # From Blue toward Green :3019 (heredoc unquoted so GREEN_* expand locally into remote script)
  if [ -n "$GREEN_PRIVATE" ]; then
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=15 "${SSH_USER}@${BLUE_IP}" bash << EOF
LOG=/opt/oscal/app/logs/deployment.log
sudo mkdir -p /opt/oscal/app/logs
{
  echo "=== \$(date -Iseconds) from-blue curl green-private:3019 ==="
  curl -sS -w "\\nhttp_code:%{http_code}\\n" --connect-timeout 5 "http://${GREEN_PRIVATE}:3019/health" || echo curl_fail
} 2>&1 | sudo tee -a "\$LOG" >/dev/null
EOF
  fi
  if [ -n "$GREEN_PUBLIC" ]; then
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=15 "${SSH_USER}@${BLUE_IP}" bash << EOF
LOG=/opt/oscal/app/logs/deployment.log
{
  echo "=== \$(date -Iseconds) from-blue curl green-public:3019 ==="
  curl -sS -w "\\nhttp_code:%{http_code}\\n" --connect-timeout 5 "http://${GREEN_PUBLIC}:3019/health" || echo curl_fail
} 2>&1 | sudo tee -a "\$LOG" >/dev/null
EOF
  fi
  # From Green toward Blue :3020
  if [ -n "$BLUE_PRIVATE" ]; then
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=15 "${SSH_USER}@${GREEN_IP}" bash << EOF
LOG=/opt/oscal/app/logs/deployment.log
{
  echo "=== \$(date -Iseconds) from-green curl blue-private:3020 ==="
  curl -sS -w "\\nhttp_code:%{http_code}\\n" --connect-timeout 5 "http://${BLUE_PRIVATE}:3020/health" || echo curl_fail
} 2>&1 | sudo tee -a "\$LOG" >/dev/null
EOF
  fi
  if [ -n "$BLUE_PUBLIC" ]; then
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=15 "${SSH_USER}@${GREEN_IP}" bash << EOF
LOG=/opt/oscal/app/logs/deployment.log
{
  echo "=== \$(date -Iseconds) from-green curl blue-public:3020 ==="
  curl -sS -w "\\nhttp_code:%{http_code}\\n" --connect-timeout 5 "http://${BLUE_PUBLIC}:3020/health" || echo curl_fail
} 2>&1 | sudo tee -a "\$LOG" >/dev/null
EOF
  fi
elif [ -n "$GREEN_IP" ] && [ -n "$BLUE_IP" ]; then
  print_warning "Cross-instance curls skipped (missing private/public IPs from terraform output)."
fi

# ALB /health from both hosts (HTTPS if ALB_USE_HTTPS true; ALB SG allows 443 only)
if [ -n "$ALB_DNS" ]; then
  print_info "ALB curl from Green and Blue to https://${ALB_DNS}/health ..."
  for _alb_role in green blue; do
    _alb_ip=""
    [ "$_alb_role" = "green" ] && _alb_ip="$GREEN_IP" || _alb_ip="$BLUE_IP"
    [ -z "$_alb_ip" ] && continue
    if [ "$ALB_USE_HTTPS" = "true" ]; then
      ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=15 "${SSH_USER}@${_alb_ip}" \
        "LOG=/opt/oscal/app/logs/deployment.log; { echo \"=== \$(date -Iseconds) ${_alb_role} curl ALB https://${ALB_DNS}/health ===\"; curl -sk --connect-timeout 10 -w \"\\nhttp_code:%{http_code}\\n\" \"https://${ALB_DNS}/health\"; } 2>&1 | sudo tee -a \"\$LOG\" >/dev/null" || true
    else
      ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=15 "${SSH_USER}@${_alb_ip}" \
        "LOG=/opt/oscal/app/logs/deployment.log; { echo \"=== \$(date -Iseconds) ${_alb_role} curl ALB http://${ALB_DNS}/health ===\"; curl -sS --connect-timeout 10 -w \"\\nhttp_code:%{http_code}\\n\" \"http://${ALB_DNS}/health\"; } 2>&1 | sudo tee -a \"\$LOG\" >/dev/null" || true
    fi
  done
fi

# Copy deployment.log from each deployed host to repo logs/ for local analysis
mkdir -p "$REPO_ROOT/logs"
if [ -n "$GREEN_IP" ]; then
  if scp -i "$SSH_KEY" -o StrictHostKeyChecking=no "${SSH_USER}@${GREEN_IP}:${DEPLOY_LOG_REMOTE}" "$REPO_ROOT/logs/deployment-green.log" 2>/dev/null; then
    print_success "Fetched deployment.log from green -> logs/deployment-green.log"
  else
    print_warning "Could not scp deployment.log from green (check path/permissions)."
  fi
fi
if [ -n "$BLUE_IP" ]; then
  if scp -i "$SSH_KEY" -o StrictHostKeyChecking=no "${SSH_USER}@${BLUE_IP}:${DEPLOY_LOG_REMOTE}" "$REPO_ROOT/logs/deployment-blue.log" 2>/dev/null; then
    print_success "Fetched deployment.log from blue -> logs/deployment-blue.log"
  else
    print_warning "Could not scp deployment.log from blue (check path/permissions)."
  fi
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
    elif [ "$status" = "ok_ssh" ]; then
      echo -e "  ${GREEN}✓${NC} $role ($ip): healthy (localhost; use ALB -- SG blocks direct :3019/:3020)"
    else
      echo -e "  ${RED}✗${NC} $role ($ip): /health not responding"
    fi
  done < "$DEPLOY_RESULTS_FILE"
fi
echo ""
# Post-deploy: pass vault check (option 1)
print_info "Pass vault status (secrets in vault vs config):"
if [ -x "$REPO_ROOT/scripts/debug/check-pass-vault-on-ec2.sh" ]; then
  "$REPO_ROOT/scripts/debug/check-pass-vault-on-ec2.sh" 2>/dev/null || true
else
  echo "  (run ./scripts/debug/check-pass-vault-on-ec2.sh for details)"
fi
echo ""
# Fail script if any instance failed health check (ok_ssh counts as success -- SG blocks public app ports by design)
# Use wc -l so HEALTH_FAIL is always a single integer (grep -c in a subshell can yield newlines on some systems)
HEALTH_FAIL=0
if [ -f "$DEPLOY_RESULTS_FILE" ]; then
  # grep -c in subshell can yield newlines on some systems; wc -l gives a single integer (SC2126 disabled)
  # shellcheck disable=SC2126
  HEALTH_FAIL=$(grep ' fail$' "$DEPLOY_RESULTS_FILE" 2>/dev/null | wc -l | tr -d ' \n\r')
fi
HEALTH_FAIL=${HEALTH_FAIL:-0}
case "$HEALTH_FAIL" in (*[!0-9]*) HEALTH_FAIL=0 ;; esac
if [ "$HEALTH_FAIL" -gt 0 ] 2>/dev/null; then
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