#!/bin/bash
# Ollama instance bootstrap: SSM, awscli, S3 activity write, then run shared install script (scripts/install-ollama-and-models.sh).
# Lambda uses last_activity for idle check; 1 hr no activity -> scale to 0.
# Output goes to /var/log/cloud-init-output.log (view via SSM or SSH).
# For manual install/fix use scripts/debug/run-install-ollama-on-instance.sh (which runs the same install script).
#
# s3_bucket, s3_key, install_script_b64, vpc_cidr are injected by Terraform templatefile().
# shellcheck disable=SC2154
set -e

# Start SSM agent early so Session Manager works once instance has IAM (AmazonSSMManagedInstanceCore)
systemctl start amazon-ssm-agent 2>/dev/null || true
systemctl enable amazon-ssm-agent 2>/dev/null || true

# Fix hostname (EC2 default can have chars that trigger "hostname contains invalid characters" with sudo)
hostname ollama-instance 2>/dev/null || true
echo 'ollama-instance' > /etc/hostname
grep -q '127.0.0.1.*ollama-instance' /etc/hosts || echo '127.0.0.1 ollama-instance' >> /etc/hosts

# awscli for S3 boot-time write (non-fatal)
dnf install -y awscli 2>/dev/null || (yum install -y awscli 2>/dev/null || (apt-get update 2>/dev/null && apt-get install -y awscli 2>/dev/null)) || true

# Write boot time to S3 early so Lambda sees activity even if later steps fail
BOOT_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "{\"last_activity\": \"$BOOT_TIME\"}" | aws s3 cp - "s3://${s3_bucket}/${s3_key}" --content-type "application/json" 2>/dev/null || true

# Install deps and Ollama binary in user_data (no systemd needed). Start/pull deferred to ollama-bootstrap
# because user_data runs before systemd is fully up ("systemd is not running" -> systemctl start fails).
mkdir -p /opt/ollama
echo "${install_script_b64}" | base64 -d > /opt/ollama/install-ollama-and-models.sh
chmod +x /opt/ollama/install-ollama-and-models.sh
# Run install script for deps + Ollama binary only; skip start/pull (will fail - systemd not ready)
/opt/ollama/install-ollama-and-models.sh --install-only || true

# Bootstrap oneshot: runs AFTER multi-user.target when systemd is up. Starts Ollama, pulls models, firewalld.
cat > /etc/systemd/system/ollama-bootstrap.service << 'BOOTSTRAP_UNIT'
[Unit]
Description=Ollama bootstrap: start serve, pull models, firewalld (runs after systemd is up)
After=network-online.target multi-user.target
Wants=network-online.target

[Service]
Type=oneshot
Environment=VPC_CIDR=${vpc_cidr}
ExecStart=/opt/ollama/install-ollama-and-models.sh
RemainAfterExit=yes
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
BOOTSTRAP_UNIT
systemctl enable ollama-bootstrap.service
# Start now if systemd is up; otherwise it runs when multi-user.target is reached
systemctl start ollama-bootstrap.service 2>/dev/null || true

# One-shot service: ensure models exist a few minutes after boot (covers user_data timeout or pull failure)
# Use valid Ollama library names: mistral (7B), gemma2:2b (gemma3 does not exist)
mkdir -p /opt/ollama
cat > /opt/ollama/ensure-models.sh << 'ENSURE_SCRIPT'
#!/bin/bash
LOG=/var/log/ollama-ensure-models.log
exec >> "$LOG" 2>&1
OLLAMA_READY_TIMEOUT="$${OLLAMA_READY_TIMEOUT:-600}"
elapsed=0
while [ "$$elapsed" -lt "$$OLLAMA_READY_TIMEOUT" ]; do
  if ollama list >/dev/null 2>&1; then
    echo "Ollama ready after $${elapsed}s"
    break
  fi
  sleep 10
  elapsed=$$((elapsed + 10))
done
ollama list 2>/dev/null | grep -qE 'mistral|gemma' && { echo "Models already present"; exit 0; }
echo "Pulling mistral (7B)..."
ollama pull mistral || echo "WARN: mistral pull failed"
echo "Pulling gemma2:2b..."
ollama pull gemma2:2b || echo "WARN: gemma2:2b pull failed"
echo "ensure-models done"
ENSURE_SCRIPT
chmod +x /opt/ollama/ensure-models.sh
cat > /etc/systemd/system/ollama-ensure-models.service << 'ENSURE_UNIT'
[Unit]
Description=Ensure Ollama default models (mistral, gemma2:2b) after boot
After=network-online.target ollama.service ollama-bootstrap.service
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
