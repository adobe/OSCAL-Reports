#!/bin/bash
# Ollama instance: start SSM agent, install Ollama, start serve, pull default LLMs (Mistral 7B + Gemma 3 latest), write boot time to S3.
# Lambda uses last_activity for idle check; 1 hr no activity -> scale to 0.
# Output goes to /var/log/cloud-init-output.log (view via SSM or SSH).
set -e

# Start SSM agent early so Session Manager works once instance has IAM (AmazonSSMManagedInstanceCore)
systemctl start amazon-ssm-agent 2>/dev/null || true
systemctl enable amazon-ssm-agent 2>/dev/null || true

dnf install -y curl 2>/dev/null || true
dnf install -y awscli 2>/dev/null || (dnf install -y python3-pip 2>/dev/null && pip3 install awscli --break-system-packages 2>/dev/null) || true

# Write boot time to S3 early so Lambda sees activity even if later steps fail
BOOT_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "{\"last_activity\": \"$BOOT_TIME\"}" | aws s3 cp - "s3://${s3_bucket}/${s3_key}" --content-type "application/json" 2>/dev/null || true

curl -fsSL https://ollama.com/install.sh | sh

# Listen on all interfaces so NLB health checks and Green/Blue can reach Ollama (default is 127.0.0.1)
if systemctl list-unit-files --type=service 2>/dev/null | grep -q 'ollama.service'; then
  mkdir -p /etc/systemd/system/ollama.service.d
  printf '%s\n' '[Service]' 'Environment="OLLAMA_HOST=0.0.0.0"' > /etc/systemd/system/ollama.service.d/override.conf
  systemctl daemon-reload
  systemctl enable ollama
  pkill -x ollama 2>/dev/null || true
  sleep 2
  systemctl start ollama
else
  OLLAMA_HOST=0.0.0.0 nohup ollama serve &
fi

# Wait for Ollama to be ready, then pull default models (non-fatal so instance still becomes healthy if pull fails)
until ollama list >/dev/null 2>&1; do sleep 5; done
ollama pull mistral:7b 2>/dev/null || true
ollama pull gemma3:latest 2>/dev/null || true

# Write boot time to S3 again so idle timer reflects latest activity
BOOT_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "{\"last_activity\": \"$BOOT_TIME\"}" | aws s3 cp - "s3://${s3_bucket}/${s3_key}" --content-type "application/json" 2>/dev/null || true
