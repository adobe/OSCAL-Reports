#!/usr/bin/env bash
# Fix Ollama to listen on 0.0.0.0 so NLB health checks and Green/Blue can connect.
# Run ON the Ollama instance (e.g. via SSH or SSM). Use sudo.
# After running, wait 1–2 min for NLB target to become healthy, then re-run check-ollama-connectivity.sh from your laptop.
set -e
OLLAMA_BIN="$(command -v ollama 2>/dev/null || echo /usr/local/bin/ollama)"
echo "Setting OLLAMA_HOST=0.0.0.0 for Ollama..."
mkdir -p /etc/systemd/system/ollama.service.d
printf '%s\n' '[Service]' 'Environment="OLLAMA_HOST=0.0.0.0"' > /etc/systemd/system/ollama.service.d/override.conf
if systemctl list-unit-files --type=service 2>/dev/null | grep -q 'ollama.service'; then
  systemctl daemon-reload
  systemctl restart ollama
  echo "Ollama restarted with OLLAMA_HOST=0.0.0.0. NLB target should become healthy in 1–2 minutes."
else
  # No unit: create one so Ollama runs as a service listening on 0.0.0.0
  echo "Creating ollama.service (was missing)..."
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
  echo "Ollama service created and started. NLB target should become healthy in 1–2 minutes."
fi
# Allow inbound 11434 if firewalld is active (NLB health checks and Green/Blue need it)
if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active firewalld >/dev/null 2>&1; then
  echo "Opening port 11434 in firewalld..."
  firewall-cmd --permanent --add-port=11434/tcp 2>/dev/null && firewall-cmd --reload 2>/dev/null && echo "Port 11434 opened." || true
fi
