#!/bin/bash
# Ollama instance: install Ollama, start serve, pull default LLMs (Mistral 7B + Gemma 2 2B), then write boot time to S3 ollama-activity/last.json (per diagram).
# Lambda uses last_activity for idle check; 1 hr no activity -> scale to 0.
set -e
dnf install -y curl awscli || dnf install -y curl && pip3 install awscli --break-system-packages 2>/dev/null || true
curl -fsSL https://ollama.com/install.sh | sh
# Use systemd if available (survives reboot); otherwise nohup
if systemctl list-unit-files --type=service 2>/dev/null | grep -q 'ollama.service'; then
  systemctl enable ollama
  pkill -x ollama 2>/dev/null || true
  sleep 2
  systemctl start ollama
else
  nohup ollama serve &
fi

# Wait for Ollama to be ready, then pull default models (Mistral 7B and Gemma 2 2B)
until ollama list >/dev/null 2>&1; do sleep 5; done
ollama pull mistral:7b
ollama pull gemma2:2b

# Write boot time to S3 so idle timer starts from latest activity (per workflow diagram)
BOOT_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "{\"last_activity\": \"$BOOT_TIME\"}" | aws s3 cp - "s3://${s3_bucket}/${s3_key}" --content-type "application/json"
