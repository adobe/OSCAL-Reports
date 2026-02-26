#!/bin/bash
# Install Ollama on an Ollama instance and pull default LLM models: Mistral 7B and Gemma 2 (2B).
# Use valid Ollama library names: mistral (7B), gemma2:2b (see https://ollama.com/library).
# Can be run standalone (e.g. after SSH into EC2) or invoked from Terraform user_data bootstrap.
# Usage:
#   ./install-ollama-and-models.sh             # Full: install Ollama, start serve, pull models
#   ./install-ollama-and-models.sh --pull-only  # Assume Ollama is already running; only pull models
#   ./install-ollama-and-models.sh --install-only  # Install deps + binary + systemd unit only (no start/pull; for cloud-init before systemd is up)
set -e

OLLAMA_MODELS_MISTRAL="${OLLAMA_MODELS_MISTRAL:-mistral}"
OLLAMA_MODELS_GEMMA="${OLLAMA_MODELS_GEMMA:-gemma2:2b}"
OLLAMA_READY_TIMEOUT="${OLLAMA_READY_TIMEOUT:-300}"

pull_models() {
  echo "Pulling default LLM models: $OLLAMA_MODELS_MISTRAL and $OLLAMA_MODELS_GEMMA"
  ollama pull "$OLLAMA_MODELS_MISTRAL" || { echo "WARN: mistral pull failed" >&2; }
  ollama pull "$OLLAMA_MODELS_GEMMA"   || { echo "WARN: gemma pull failed" >&2; }
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
INSTALL_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --pull-only) PULL_ONLY=true ;;
    --install-only) INSTALL_ONLY=true ;;
  esac
done

if [ "$INSTALL_ONLY" = true ]; then
  # Install deps + Ollama binary + systemd override only. No start/pull (used when systemd not yet up, e.g. cloud-init user_data).
  if command -v dnf >/dev/null 2>&1; then
    dnf install -y --allowerasing zstd curl 2>/dev/null || true
  elif command -v yum >/dev/null 2>&1; then
    yum install -y --allowerasing zstd curl 2>/dev/null || true
  elif command -v apt-get >/dev/null 2>&1; then
    apt-get update 2>/dev/null && apt-get install -y zstd curl 2>/dev/null || true
  fi
  if ! command -v ollama >/dev/null 2>&1; then
    echo "Installing Ollama..."
    curl -fsSL https://ollama.com/install.sh | sh
  fi
  export OLLAMA_HOST="${OLLAMA_HOST:-0.0.0.0}"
  OLLAMA_BIN="$(command -v ollama 2>/dev/null || echo /usr/local/bin/ollama)"
  mkdir -p /etc/systemd/system/ollama.service.d
  printf '%s\n' '[Service]' 'Environment="OLLAMA_HOST=0.0.0.0"' > /etc/systemd/system/ollama.service.d/override.conf
  echo "Ollama binary and systemd override installed. Start/pull will run from ollama-bootstrap.service after boot."
  exit 0
fi

if [ "$PULL_ONLY" = true ]; then
  wait_for_ollama
  pull_models
  exit 0
fi

# Full install: ensure zstd (required by Ollama install for extraction) and curl are available.
# On Amazon Linux 2023, curl-minimal is default; --allowerasing lets dnf replace it with full curl.
if command -v dnf >/dev/null 2>&1; then
  dnf install -y --allowerasing zstd curl
elif command -v yum >/dev/null 2>&1; then
  yum install -y --allowerasing zstd curl
elif command -v apt-get >/dev/null 2>&1; then
  apt-get update && apt-get install -y zstd curl
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

# Listener: allow NLB health checks and Green/Blue (in VPC) to reach Ollama on 11434.
# When firewalld is active, allow 11434 only from VPC (not public). VPC_CIDR from env or default.
if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active firewalld >/dev/null 2>&1; then
  vpc_cidr="${VPC_CIDR:-10.0.0.0/16}"
  firewall-cmd --permanent --remove-port=11434/tcp 2>/dev/null || true
  firewall-cmd --permanent --add-rich-rule="rule family=ipv4 source address=$vpc_cidr port port=11434 protocol=tcp accept" 2>/dev/null || true
  firewall-cmd --reload 2>/dev/null && echo "Port 11434 allowed only from $vpc_cidr (internal). Not exposed to public." || true
fi
