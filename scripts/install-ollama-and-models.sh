#!/bin/bash
# Install Ollama on an Ollama instance and pull default LLM models: Mistral 7B and Gemma 3 latest.
# Can be run standalone (e.g. after SSH into EC2) or invoked from Terraform user_data bootstrap.
# Usage:
#   ./install-ollama-and-models.sh           # Full: install Ollama, start serve, pull models
#   ./install-ollama-and-models.sh --pull-only  # Assume Ollama is already running; only pull models
set -e

OLLAMA_MODELS_MISTRAL="${OLLAMA_MODELS_MISTRAL:-mistral:7b}"
OLLAMA_MODELS_GEMMA="${OLLAMA_MODELS_GEMMA:-gemma3:latest}"
OLLAMA_READY_TIMEOUT="${OLLAMA_READY_TIMEOUT:-300}"

pull_models() {
  echo "Pulling default LLM models: $OLLAMA_MODELS_MISTRAL and $OLLAMA_MODELS_GEMMA"
  ollama pull "$OLLAMA_MODELS_MISTRAL"
  ollama pull "$OLLAMA_MODELS_GEMMA"
  echo "Default models ready: $OLLAMA_MODELS_MISTRAL, $OLLAMA_MODELS_GEMMA"
}

wait_for_ollama() {
  local elapsed=0
  while [ "$elapsed" -lt "$OLLAMA_READY_TIMEOUT" ]; do
    if ollama list >/dev/null 2>&1; then
      echo "Ollama is ready (after ${elapsed}s)."
      return 0
    fi
    sleep 5
    elapsed=$((elapsed + 5))
  done
  echo "Timeout waiting for Ollama to be ready (${OLLAMA_READY_TIMEOUT}s)." >&2
  return 1
}

PULL_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --pull-only) PULL_ONLY=true ;;
  esac
done

if [ "$PULL_ONLY" = true ]; then
  wait_for_ollama
  pull_models
  exit 0
fi

# Full install: ensure zstd (required by Ollama install for extraction) and curl are available
if command -v dnf >/dev/null 2>&1; then
  dnf install -y zstd curl 2>/dev/null || true
elif command -v yum >/dev/null 2>&1; then
  yum install -y zstd curl 2>/dev/null || true
elif command -v apt-get >/dev/null 2>&1; then
  apt-get update 2>/dev/null && apt-get install -y zstd curl 2>/dev/null || true
else
  echo "Unsupported package manager (dnf, yum, or apt-get required)." >&2
  exit 1
fi

if ! command -v ollama >/dev/null 2>&1; then
  echo "Installing Ollama..."
  curl -fsSL https://ollama.com/install.sh | sh
fi

# Ensure Ollama listens on 0.0.0.0 so NLB health checks and Green/Blue can connect (default is 127.0.0.1)
export OLLAMA_HOST="${OLLAMA_HOST:-0.0.0.0}"
OLLAMA_BIN="$(command -v ollama 2>/dev/null || echo /usr/local/bin/ollama)"
mkdir -p /etc/systemd/system/ollama.service.d
printf '%s\n' '[Service]' 'Environment="OLLAMA_HOST=0.0.0.0"' > /etc/systemd/system/ollama.service.d/override.conf

if ! pgrep -x ollama >/dev/null 2>&1; then
  echo "Starting Ollama serve (OLLAMA_HOST=0.0.0.0)..."
  if systemctl list-unit-files --type=service 2>/dev/null | grep -q 'ollama.service'; then
    systemctl daemon-reload
    systemctl enable ollama 2>/dev/null || true
    pkill -x ollama 2>/dev/null || true
    sleep 2
    systemctl start ollama
  else
    # No systemd unit (e.g. Amazon Linux); create one so Ollama listens on 0.0.0.0 and survives reboot
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
fi

wait_for_ollama
pull_models
