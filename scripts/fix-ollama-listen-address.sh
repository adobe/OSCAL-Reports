#!/usr/bin/env bash
# Fix Ollama to listen on 0.0.0.0 so NLB health checks and Green/Blue can connect.
# Run ON the Ollama instance (e.g. via SSH or SSM). Use sudo.
# After running, wait 1–2 min for NLB target to become healthy, then re-run check-ollama-connectivity.sh from your laptop.
set -e
echo "Setting OLLAMA_HOST=0.0.0.0 for Ollama service..."
mkdir -p /etc/systemd/system/ollama.service.d
printf '%s\n' '[Service]' 'Environment="OLLAMA_HOST=0.0.0.0"' > /etc/systemd/system/ollama.service.d/override.conf
systemctl daemon-reload
systemctl restart ollama
echo "Ollama restarted. NLB target should become healthy in 1–2 minutes."
