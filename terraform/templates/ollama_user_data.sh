#!/bin/bash
# Ollama instance: start SSM agent, install dependencies (zstd, curl), install Ollama, start serve, pull default LLMs, write boot time to S3.
# Lambda uses last_activity for idle check; 1 hr no activity -> scale to 0.
# Output goes to /var/log/cloud-init-output.log (view via SSM or SSH).
# For Amazon Linux 2023 (and compatible). Run scripts/run-install-ollama-on-instance.sh from your laptop for immediate fix or new regions.
#
# s3_bucket and s3_key are injected by Terraform templatefile().
# shellcheck disable=SC2154
set -e

# Start SSM agent early so Session Manager works once instance has IAM (AmazonSSMManagedInstanceCore)
systemctl start amazon-ssm-agent 2>/dev/null || true
systemctl enable amazon-ssm-agent 2>/dev/null || true

# Install dependencies: zstd required by Ollama install script for extraction; curl for install script
if command -v dnf >/dev/null 2>&1; then
  dnf install -y zstd curl 2>/dev/null || true
elif command -v yum >/dev/null 2>&1; then
  yum install -y zstd curl 2>/dev/null || true
elif command -v apt-get >/dev/null 2>&1; then
  apt-get update 2>/dev/null && apt-get install -y zstd curl 2>/dev/null || true
fi
dnf install -y awscli 2>/dev/null || (yum install -y awscli 2>/dev/null || (apt-get update 2>/dev/null && apt-get install -y awscli 2>/dev/null)) || true

# Write boot time to S3 early so Lambda sees activity even if later steps fail
BOOT_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "{\"last_activity\": \"$BOOT_TIME\"}" | aws s3 cp - "s3://${s3_bucket}/${s3_key}" --content-type "application/json" 2>/dev/null || true

curl -fsSL https://ollama.com/install.sh | sh

# Ensure Ollama listens on 0.0.0.0 so NLB health checks and Green/Blue can reach it (default is 127.0.0.1)
OLLAMA_BIN="$(command -v ollama 2>/dev/null || echo /usr/local/bin/ollama)"
mkdir -p /etc/systemd/system/ollama.service.d
printf '%s\n' '[Service]' 'Environment="OLLAMA_HOST=0.0.0.0"' > /etc/systemd/system/ollama.service.d/override.conf
if systemctl list-unit-files --type=service 2>/dev/null | grep -q 'ollama.service'; then
  systemctl daemon-reload
  systemctl enable ollama
  pkill -x ollama 2>/dev/null || true
  sleep 2
  systemctl start ollama
else
  # Install script did not create a unit (e.g. on some Amazon Linux); create one so Ollama survives reboot and listens on 0.0.0.0
  cat > /etc/systemd/system/ollama.service << OLLAMA_UNIT
[Unit]
Description=Ollama AI server
After=network-online.target

[Service]
Type=simple
ExecStart=$OLLAMA_BIN serve
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

# Allow inbound 11434 so NLB health checks and Green/Blue can reach Ollama (if firewalld is active)
if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active firewalld >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port=11434/tcp 2>/dev/null || true
  firewall-cmd --reload 2>/dev/null || true
fi

# Wait for Ollama to be ready, then pull default models (non-fatal so instance still becomes healthy if pull fails)
until ollama list >/dev/null 2>&1; do sleep 5; done
ollama pull mistral:7b 2>/dev/null || true
ollama pull gemma3:latest 2>/dev/null || true

# One-shot service: ensure models exist a few minutes after boot (covers user_data timeout or pull failure)
mkdir -p /opt/ollama
cat > /opt/ollama/ensure-models.sh << 'ENSURE_SCRIPT'
#!/bin/bash
OLLAMA_READY_TIMEOUT="$${OLLAMA_READY_TIMEOUT:-600}"
elapsed=0
while [ "$$elapsed" -lt "$$OLLAMA_READY_TIMEOUT" ]; do
  ollama list >/dev/null 2>&1 && break
  sleep 10
  elapsed=$$((elapsed + 10))
done
ollama list 2>/dev/null | grep -qE 'mistral|gemma' && exit 0
ollama pull mistral:7b 2>/dev/null || true
ollama pull gemma3:latest 2>/dev/null || true
ENSURE_SCRIPT
chmod +x /opt/ollama/ensure-models.sh
cat > /etc/systemd/system/ollama-ensure-models.service << 'ENSURE_UNIT'
[Unit]
Description=Ensure Ollama default models (mistral, gemma3) after boot
After=network-online.target ollama.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/opt/ollama/ensure-models.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
ENSURE_UNIT
systemctl enable ollama-ensure-models.service
systemctl start ollama-ensure-models.service 2>/dev/null || true

# Write boot time to S3 again so idle timer reflects latest activity
BOOT_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "{\"last_activity\": \"$BOOT_TIME\"}" | aws s3 cp - "s3://${s3_bucket}/${s3_key}" --content-type "application/json" 2>/dev/null || true
