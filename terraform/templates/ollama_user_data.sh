#!/bin/bash
# Ollama instance bootstrap: SSM, awscli, S3 activity write, then run shared install script (scripts/install-ollama-and-models.sh).
# Lambda uses last_activity for idle check; 1 hr no activity -> scale to 0.
# Output goes to /var/log/cloud-init-output.log (view via SSM or SSH).
# For manual install/fix use scripts/debug/run-install-ollama-on-instance.sh (which runs the same install script).
#
# s3_bucket, s3_key, install_script_b64 are injected by Terraform templatefile().
# shellcheck disable=SC2154
set -e

# Start SSM agent early so Session Manager works once instance has IAM (AmazonSSMManagedInstanceCore)
systemctl start amazon-ssm-agent 2>/dev/null || true
systemctl enable amazon-ssm-agent 2>/dev/null || true

# awscli for S3 boot-time write (non-fatal)
dnf install -y awscli 2>/dev/null || (yum install -y awscli 2>/dev/null || (apt-get update 2>/dev/null && apt-get install -y awscli 2>/dev/null)) || true

# Write boot time to S3 early so Lambda sees activity even if later steps fail
BOOT_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "{\"last_activity\": \"$BOOT_TIME\"}" | aws s3 cp - "s3://${s3_bucket}/${s3_key}" --content-type "application/json" 2>/dev/null || true

# Single source of truth: run scripts/install-ollama-and-models.sh (deps, Ollama, 0.0.0.0, start, pull models)
echo "${install_script_b64}" | base64 -d > /tmp/install-ollama-and-models.sh
chmod +x /tmp/install-ollama-and-models.sh
/tmp/install-ollama-and-models.sh

# Allow inbound 11434 so NLB health checks and Green/Blue can reach Ollama (if firewalld is active)
if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active firewalld >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port=11434/tcp 2>/dev/null || true
  firewall-cmd --reload 2>/dev/null || true
fi

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
