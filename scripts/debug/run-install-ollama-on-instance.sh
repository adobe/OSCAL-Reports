#!/usr/bin/env bash
# Single Ollama setup script: wake, volume check, install, listener. All logic in this file (no wrapper scripts).
#
# Subcommands (first argument):
#   (none) or full  – Full flow: wake → ensure instance → check volume → install Ollama + models → configure listener (internal only).
#   wake            – Invoke wake Lambda only; wait for instance; print IP.
#   volume         – Report EBS volume size(s) for the running Ollama instance; warn if root < 150 GB.
#   listener [IP]   – Configure listener only (OLLAMA_HOST=0.0.0.0, firewalld 11434 from VPC only). Optional IP or set OLLAMA_INSTANCE_IP.
#
# Flow (full):
#   1. Wake – Invoke wake Lambda (retry on rate limit). Wait for instance.
#   2. If no instance – Scale ASG to 1 or create via run-instances + attach.
#   3. Check volume – Report EBS sizes; warn if root < 150 GB.
#   4. Install – Free disk if needed, run install-ollama-and-models.sh (Ollama + mistral, gemma2:2b).
#   5. Listener – 0.0.0.0:11434; firewalld allows 11434 only from VPC (not public).
#
# Usage (from repo root):
#   ./scripts/debug/run-install-ollama-on-instance.sh
#   ./scripts/debug/run-install-ollama-on-instance.sh wake
#   ./scripts/debug/run-install-ollama-on-instance.sh volume
#   ./scripts/debug/run-install-ollama-on-instance.sh listener [IP]
#
# Environment: OLLAMA_WAKE_WAIT (180), OLLAMA_INSTANCE_WAIT (300), OLLAMA_MIN_FREE_MB (2048), OLLAMA_INSTANCE_IP.
#   Pass: AWS/AWS4379 Sandbox, AWS/OSCAL-AWS4379-SSH. Or set AWS_* and SSH_KEY_FILE.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/ec2-common.sh disable=SC1091
source "$SCRIPT_DIR/lib/ec2-common.sh"

RUN_WITH_AWS="$REPO_ROOT/terraform/run-with-aws-pass.sh"
INSTALL_SCRIPT="$REPO_ROOT/scripts/install-ollama-and-models.sh"
AWS_PASS_ENTRY="${AWS_PASS_ENTRY:-AWS/AWS4379 Sandbox}"
OLLAMA_MIN_FREE_MB="${OLLAMA_MIN_FREE_MB:-2048}"
WAIT_TIMEOUT="${OLLAMA_INSTANCE_WAIT:-300}"
OLLAMA_EXPECTED_ROOT_GB="${OLLAMA_EXPECTED_ROOT_GB:-150}"
OLLAMA_MODELS_MISTRAL="${OLLAMA_MODELS_MISTRAL:-mistral}"
OLLAMA_MODELS_GEMMA="${OLLAMA_MODELS_GEMMA:-gemma2:2b}"

get_terraform_output() {
  local name="$1"
  [ ! -f "$RUN_WITH_AWS" ] && return 1
  (bash "$RUN_WITH_AWS" output -raw "$name" 2>/dev/null) || true
}

# ========== Check instance ==========
get_ollama_instance_ip() {
  if [ -n "$OLLAMA_INSTANCE_IP" ]; then echo "$OLLAMA_INSTANCE_IP"; return; fi
  if [ -d "$TERRAFORM_DIR" ] && [ -f "$TERRAFORM_DIR/terraform.tfstate" ]; then
    local tf_ip
    tf_ip=$(get_terraform_output ollama_public_ip 2>/dev/null) || true
    if [ -n "$tf_ip" ] && [ "$tf_ip" != "null" ]; then echo "$tf_ip"; return; fi
  fi
  if ! command -v aws >/dev/null 2>&1; then return 1; fi
  local asg_name region
  asg_name=$(get_terraform_output ollama_asg_name 2>/dev/null) || true
  [ -z "$asg_name" ] && return 1
  region=$(get_terraform_output aws_region 2>/dev/null) || true
  [ -z "$region" ] && return 1
  local ip
  ip=$(aws ec2 describe-instances --region "$region" \
    --filters "Name=tag:aws:autoscaling:groupName,Values=$asg_name" "Name=instance-state-name,Values=running" \
    --query 'Reservations[*].Instances[*].PublicIpAddress' --output text 2>/dev/null | head -1)
  if [ -z "$ip" ] || [ "$ip" = "None" ]; then return 1; fi
  echo "$ip"
}

get_ollama_instance_id() {
  if ! command -v aws >/dev/null 2>&1; then return 1; fi
  local asg_name region
  asg_name=$(get_terraform_output ollama_asg_name 2>/dev/null) || true
  region=$(get_terraform_output aws_region 2>/dev/null) || true
  [ -z "$asg_name" ] || [ -z "$region" ] && return 1
  aws ec2 describe-instances --region "$region" \
    --filters "Name=tag:aws:autoscaling:groupName,Values=$asg_name" "Name=instance-state-name,Values=running" \
    --query 'Reservations[*].Instances[*].InstanceId' --output text 2>/dev/null | head -1
}

# ========== 1. Wake (invoke Lambda with retry) ==========
wake_ollama_lambda() {
  local lambda_name region wait_max="${OLLAMA_WAKE_WAIT:-180}" elapsed=0 interval=15
  lambda_name=$(get_terraform_output lambda_ollama_controller_name 2>/dev/null) || true
  region=$(get_terraform_output aws_region 2>/dev/null) || true
  if [ -z "$lambda_name" ] || [ "$lambda_name" = "null" ] || [ -z "$region" ]; then return 1; fi
  echo "Invoking wake Lambda: $lambda_name (region: $region)"
  local attempt backoff=3 output_file err_file
  output_file=$(mktemp)
  err_file=$(mktemp)
  trap 'rm -f "$output_file" "$err_file"' RETURN
  for attempt in 1 2 3 4 5; do
    if aws lambda invoke --function-name "$lambda_name" --region "$region" \
      --payload '{"action":"wake"}' --cli-binary-format raw-in-base64-out "$output_file" 2>"$err_file"; then
      echo "Lambda invoked successfully."
      break
    fi
    if grep -qE "TooManyRequestsException|Rate Exceeded" "$err_file" 2>/dev/null && [ "$attempt" -lt 5 ]; then
      echo "Rate limited (attempt $attempt/5). Waiting ${backoff}s..."
      sleep "$backoff"
      backoff=$((backoff * 2))
      continue
    fi
    echo "Lambda invoke failed: $(cat "$err_file" 2>/dev/null)" >&2
    return 1
  done
  echo "Waiting up to ${wait_max}s for Ollama instance..."
  while [ "$elapsed" -lt "$wait_max" ]; do
    sleep "$interval"
    elapsed=$((elapsed + interval))
    OLLAMA_INSTANCE_IP="" ip_retry=$(get_ollama_instance_ip) || true
    if [ -n "$ip_retry" ] && [ "$ip_retry" != "None" ]; then echo "$ip_retry"; return 0; fi
  done
  return 1
}

# ========== Ensure instance (scale ASG or create via run-instances) ==========
scale_asg_and_wait() {
  local asg_name region wait_max="${WAIT_TIMEOUT}" elapsed=0 interval=15
  asg_name=$(get_terraform_output ollama_asg_name 2>/dev/null) || true
  region=$(get_terraform_output aws_region 2>/dev/null) || true
  if [ -z "$asg_name" ] || [ -z "$region" ]; then return 1; fi
  echo "Ollama instance not present. Setting ASG desired capacity to 1..."
  aws autoscaling set-desired-capacity --region "$region" --auto-scaling-group-name "$asg_name" --desired-capacity 1 --output text 2>/dev/null || return 1
  echo "Waiting up to ${wait_max}s for instance..."
  while [ "$elapsed" -lt "$wait_max" ]; do
    sleep "$interval"
    elapsed=$((elapsed + interval))
    OLLAMA_INSTANCE_IP="" ip_retry=$(get_ollama_instance_ip) || true
    if [ -n "$ip_retry" ] && [ "$ip_retry" != "None" ]; then echo "$ip_retry"; return 0; fi
  done
  return 1
}

create_ollama_instance() {
  local region asg_name subnet_id vpc_id lt_name_prefix lt_id run_json out instance_id state elapsed interval
  region=$(get_terraform_output aws_region) || true
  asg_name=$(get_terraform_output ollama_asg_name) || true
  subnet_id=$(get_terraform_output ollama_public_subnet_id) || true
  vpc_id=$(get_terraform_output vpc_id) || true
  if [ -z "$region" ] || [ -z "$asg_name" ]; then echo "ERROR: Could not get region/asg from Terraform." >&2; return 1; fi
  if [ -z "$subnet_id" ] || [ "$subnet_id" = "null" ]; then
    if [ -n "$vpc_id" ] && [ "$vpc_id" != "null" ]; then
      subnet_id=$(aws ec2 describe-subnets --region "$region" --filters "Name=vpc-id,Values=$vpc_id" "Name=map-public-ip-on-launch,Values=true" --query "Subnets[0].SubnetId" --output text 2>/dev/null) || true
    fi
  fi
  if [ -z "$subnet_id" ] || [ "$subnet_id" = "None" ]; then echo "ERROR: Could not get subnet." >&2; return 1; fi
  lt_name_prefix="${asg_name%-asg}-"
  lt_id=$(aws ec2 describe-launch-templates --region "$region" --query "LaunchTemplates[?starts_with(LaunchTemplateName, '$lt_name_prefix')].LaunchTemplateId" --output text 2>/dev/null | head -1)
  if [ -z "$lt_id" ]; then echo "ERROR: No launch template found." >&2; return 1; fi
  echo "Creating new Ollama instance (run-instances + attach to ASG)..."
  run_json=$(printf '%s' "{\"LaunchTemplate\":{\"LaunchTemplateId\":\"$lt_id\"},\"SubnetId\":\"$subnet_id\",\"MinCount\":1,\"MaxCount\":1}")
  out=$(aws ec2 run-instances --region "$region" --cli-input-json "$run_json" --output json 2>&1) || { echo "$out" >&2; return 1; }
  instance_id=$(echo "$out" | grep -o '"InstanceId": "[^"]*"' | head -1 | cut -d'"' -f4)
  if [ -z "$instance_id" ]; then echo "ERROR: Could not parse instance ID." >&2; return 1; fi
  echo "Instance launched: $instance_id. Waiting for running (up to ${WAIT_TIMEOUT}s)..."
  elapsed=0; interval=10; state=""
  while [ "$elapsed" -lt "$WAIT_TIMEOUT" ]; do
    state=$(aws ec2 describe-instances --region "$region" --instance-ids "$instance_id" --query 'Reservations[*].Instances[*].State.Name' --output text 2>/dev/null) || state=""
    [ "$state" = "running" ] && break
    sleep "$interval"; elapsed=$((elapsed + interval))
  done
  echo "Attaching instance to ASG: $asg_name"
  aws autoscaling attach-instances --region "$region" --instance-ids "$instance_id" --auto-scaling-group-name "$asg_name" --output text 2>&1 || { echo "Attach failed." >&2; return 1; }
  aws autoscaling set-desired-capacity --region "$region" --auto-scaling-group-name "$asg_name" --desired-capacity 1 --output text 2>/dev/null || true
  for _ in 1 2 3 4 5 6; do
    sleep 5
    OLLAMA_INSTANCE_IP="" ip_new=$(get_ollama_instance_ip) || true
    if [ -n "$ip_new" ] && [ "$ip_new" != "None" ]; then echo "$ip_new"; return 0; fi
  done
  echo "WARNING: New instance attached but could not get public IP yet." >&2
  return 1
}

# ========== 3. Check volume size (report; warn if root < expected) ==========
check_ollama_volume_size() {
  local key="$1" ip="$2" region="$3" instance_id="$4"
  echo "Checking EBS volume size(s) for Ollama instance..."
  local vol_info
  vol_info=$(aws ec2 describe-instances --region "$region" --instance-ids "$instance_id" \
    --query 'Reservations[*].Instances[*].BlockDeviceMappings[*].[DeviceName,Ebs.VolumeId]' --output text 2>/dev/null) || true
  while read -r dev vol; do
    [ -z "$vol" ] && continue
    local size_gb
    size_gb=$(aws ec2 describe-volumes --region "$region" --volume-ids "$vol" --query 'Volumes[*].Size' --output text 2>/dev/null) || size_gb="?"
    echo "  $dev  VolumeId: $vol  Size: ${size_gb} GB"
    if [[ "$dev" == *"sda"* ]] || [[ "$dev" == *"xvda"* ]]; then
      if [ -n "$size_gb" ] && [ "$size_gb" != "?" ] && [ "$size_gb" -lt "${OLLAMA_EXPECTED_ROOT_GB}" ] 2>/dev/null; then
        echo "  WARNING: Root volume is ${size_gb} GB (expected >= ${OLLAMA_EXPECTED_ROOT_GB} GB). Consider replacing instance or resizing in AWS Console." >&2
      fi
    fi
  done <<< "$vol_info"
  echo "Expected root from launch template: ${OLLAMA_EXPECTED_ROOT_GB} GB (terraform/ollama_asg.tf)."
}

# ========== 4. Install (disk + install script + pull two models) ==========
check_and_free_ollama_disk_space() {
  local key="$1" ip="$2"
  # Quote REMOTE_SPACE so heredoc is literal; pass OLLAMA_MIN_FREE_MB via env so remote can use it
  ssh -i "$key" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 "${SSH_USER}@${ip}" "OLLAMA_MIN_FREE_MB=$OLLAMA_MIN_FREE_MB sudo -E bash -s" << 'REMOTE_SPACE'
set -e
avail_mb=$(df -m / | awk 'NR==2{print $4}')
if [ "$avail_mb" -lt "${OLLAMA_MIN_FREE_MB:-2048}" ]; then
  echo "Low disk space (${avail_mb} MB free). Freeing dnf/yum cache, journal, /tmp..."
  dnf clean all 2>/dev/null || yum clean all 2>/dev/null || true
  rm -rf /var/cache/dnf 2>/dev/null || rm -rf /var/cache/yum 2>/dev/null || true
  journalctl --vacuum-time=1d 2>/dev/null || true
  journalctl --vacuum-size=100M 2>/dev/null || true
  find /tmp -maxdepth 1 -type f -mtime +1 -delete 2>/dev/null || true
  avail_mb=$(df -m / | awk 'NR==2{print $4}')
  if [ "$avail_mb" -lt "${OLLAMA_MIN_FREE_MB:-2048}" ]; then echo "ERROR: Still only ${avail_mb} MB free." >&2; exit 1; fi
else
  echo "Disk space OK (${avail_mb} MB free)."
fi
REMOTE_SPACE
}

# ========== 5. Configure listener: internal interfaces only (11434 not exposed to public) ==========
configure_listener_internal_only() {
  local key="$1" ip="$2"
  local vpc_cidr
  vpc_cidr=$(get_terraform_output vpc_cidr 2>/dev/null) || true
  [ -z "$vpc_cidr" ] || [ "$vpc_cidr" = "null" ] && vpc_cidr="10.0.0.0/16"
  echo "Configuring Ollama to listen on all interfaces; firewalld allows 11434 only from VPC ($vpc_cidr) so port is NOT exposed to public IP."
  ssh -i "$key" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 "${SSH_USER}@${ip}" "sudo bash -s" "$vpc_cidr" << REMOTE_LISTENER
set -e
vpc_cidr="\${1:-10.0.0.0/16}"
OLLAMA_BIN="\$(command -v ollama 2>/dev/null || echo /usr/local/bin/ollama)"
mkdir -p /etc/systemd/system/ollama.service.d
printf '%s\\n' '[Service]' 'Environment="OLLAMA_HOST=0.0.0.0"' > /etc/systemd/system/ollama.service.d/override.conf
if systemctl list-unit-files --type=service 2>/dev/null | grep -q 'ollama.service'; then
  systemctl daemon-reload
  systemctl restart ollama 2>/dev/null || true
else
  cat > /etc/systemd/system/ollama.service << OLLAMA_UNIT
[Unit]
Description=Ollama AI server
After=network-online.target

[Service]
Type=simple
ExecStart=\$OLLAMA_BIN serve
Environment=OLLAMA_HOST=0.0.0.0
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
OLLAMA_UNIT
  systemctl daemon-reload
  systemctl enable ollama
  pkill -x ollama 2>/dev/null || true
  sleep 2
  systemctl start ollama
fi
if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active firewalld >/dev/null 2>&1; then
  firewall-cmd --permanent --remove-port=11434/tcp 2>/dev/null || true
  firewall-cmd --permanent --add-rich-rule="rule family=ipv4 source address=\$vpc_cidr port port=11434 protocol=tcp accept" 2>/dev/null || true
  firewall-cmd --reload 2>/dev/null && echo "Port 11434 allowed only from \$vpc_cidr (internal). Not exposed to public." || true
fi
REMOTE_LISTENER
}

# ========== Main (subcommand dispatch) ==========
cd "$REPO_ROOT"

[ ! -f "$RUN_WITH_AWS" ] && { echo "ERROR: run-with-aws-pass.sh not found. Run from repo root." >&2; exit 1; }

load_aws_from_pass || true
SUBCMD="${1:-}"

region=$(get_terraform_output aws_region) || true
[ -z "$region" ] && { echo "ERROR: Could not get aws_region. Run: $RUN_WITH_AWS output" >&2; exit 1; }

# Subcommand: wake
if [ "$SUBCMD" = "wake" ]; then
  OLLAMA_IP=$(wake_ollama_lambda) || true
  if [ -n "$OLLAMA_IP" ]; then
    echo "Ollama instance IP: $OLLAMA_IP"
    echo "Wait ~2–3 min for NLB target health, then use Test AI."
    exit 0
  fi
  echo "Wake Lambda did not result in a running instance." >&2
  exit 1
fi

# Subcommand: volume
if [ "$SUBCMD" = "volume" ]; then
  instance_id=$(get_ollama_instance_id) || true
  [ -z "$instance_id" ] && { echo "No running Ollama instance in ASG." >&2; exit 1; }
  echo "Ollama instance ID: $instance_id (region: $region)"
  echo ""
  check_ollama_volume_size "" "" "$region" "$instance_id"
  exit 0
fi

# Subcommand: listener
if [ "$SUBCMD" = "listener" ]; then
  resolve_ssh_key
  OLLAMA_IP="${2:-${OLLAMA_INSTANCE_IP:-$(get_ollama_instance_ip)}}"
  [ -z "$OLLAMA_IP" ] && { echo "ERROR: Pass instance IP as second argument or set OLLAMA_INSTANCE_IP or ensure an Ollama instance is running." >&2; exit 1; }
  configure_listener_internal_only "$SSH_KEY" "$OLLAMA_IP"
  echo "Listener configured (11434 from VPC only, not public)."
  exit 0
fi

# Full flow (no subcommand or "full")
resolve_ssh_key

[ ! -f "$INSTALL_SCRIPT" ] && { echo "ERROR: Install script not found: $INSTALL_SCRIPT" >&2; exit 1; }

# 1. Wake first
OLLAMA_IP=$(wake_ollama_lambda) || true

# 2. If Ollama instance not present: check, then scale ASG or create EC2
if [ -z "$OLLAMA_IP" ]; then
  echo "Ollama instance not present after wake. Checking again..."
  OLLAMA_IP=$(get_ollama_instance_ip) || true
fi
if [ -z "$OLLAMA_IP" ]; then
  OLLAMA_IP=$(scale_asg_and_wait) || true
fi
if [ -z "$OLLAMA_IP" ]; then
  OLLAMA_IP=$(create_ollama_instance) || true
fi
if [ -z "$OLLAMA_IP" ]; then
  echo "ERROR: Could not get or create Ollama instance." >&2
  echo "  Set OLLAMA_INSTANCE_IP=1.2.3.4 or run: $RUN_WITH_AWS output" >&2
  exit 1
fi

echo "Ollama instance IP: $OLLAMA_IP"
instance_id=$(get_ollama_instance_id) || true

# 3. Check volume size
if [ -n "$instance_id" ]; then
  check_ollama_volume_size "$SSH_KEY" "$OLLAMA_IP" "$region" "$instance_id"
fi

# 3b. Fix hostname (EC2 default can have chars that trigger "hostname contains invalid characters" with sudo)
echo "Ensuring valid hostname on instance..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 "${SSH_USER}@${OLLAMA_IP}" \
  "sudo hostname ollama-instance 2>/dev/null; echo 'ollama-instance' | sudo tee /etc/hostname >/dev/null; grep -q '127.0.0.1.*ollama-instance' /etc/hosts || echo '127.0.0.1 ollama-instance' | sudo tee -a /etc/hosts >/dev/null" 2>/dev/null || true

# 4. Install Ollama and pull two models (install-ollama-and-models.sh now applies listener/firewalld when run on instance)
echo "Checking disk space (cleanup if below ${OLLAMA_MIN_FREE_MB} MB free)..."
check_and_free_ollama_disk_space "$SSH_KEY" "$OLLAMA_IP" || { echo "Warning: disk check failed (e.g. hostname/sudo on instance), continuing with install and listener." >&2; }
echo "Running install-ollama-and-models.sh (Ollama + pull $OLLAMA_MODELS_MISTRAL and $OLLAMA_MODELS_GEMMA)..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 "${SSH_USER}@${OLLAMA_IP}" "sudo bash -s" < "$INSTALL_SCRIPT"

# 5. Configure listener: internal only (11434 from VPC). Idempotent with install script; ensures fix on existing instances.
configure_listener_internal_only "$SSH_KEY" "$OLLAMA_IP"

echo ""
echo "Done. Ollama listens on 0.0.0.0:11434; firewalld allows 11434 only from VPC (not public)."
echo "Wait 1–2 min for NLB target health, then test: curl http://<ollama_nlb_dns>:11434/api/tags"
