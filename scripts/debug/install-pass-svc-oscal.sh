#!/usr/bin/env bash
# Install pass and gnupg, then initialize the password store for user svc_ams-oscal on Green and Blue.
# After this, add the Okta client secret: sudo -u svc_ams-oscal pass insert OSCAL/sso-oauth-okta-client-secret
#
# Uses: Pass for SSH key (AWS/OSCAL-AWS4379-SSH); Terraform for Green/Blue IPs.
# Usage: ./scripts/debug/install-pass-svc-oscal.sh [--green-only | --blue-only]

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/ec2-common.sh disable=SC1091
source "$SCRIPT_DIR/lib/ec2-common.sh"
SSH_USER="${SSH_USER:-ec2-user}"
SVC_USER="svc_ams-oscal"
SVC_GROUP="oscal"
SVC_HOME="/var/lib/svc_ams-oscal"
# SVC_GROUP and SVC_HOME are used in REMOTE_SCRIPT (sent to server); echo for ShellCheck
echo "Installing pass for $SVC_USER (group $SVC_GROUP, home $SVC_HOME) on target(s)."

resolve_ssh_key
GREEN_IP=""
BLUE_IP=""
case "${1:-}" in
  --green-only) GREEN_IP=$(get_terraform_oscal_ip green) ;;
  --blue-only)  BLUE_IP=$(get_terraform_oscal_ip blue) ;;
  *)
    GREEN_IP=$(get_terraform_oscal_ip green)
    BLUE_IP=$(get_terraform_oscal_ip blue)
    ;;
esac
[ -n "$GREEN_IP" ] || [ -n "$BLUE_IP" ] || { echo "Error: Could not get Green or Blue IP from Terraform." >&2; exit 1; }

# Remote script: install pass + gpg, ensure user, generate GPG key, pass init (all as needed)
# shellcheck disable=SC2016
REMOTE_SCRIPT='
set -e
SVC_USER="svc_ams-oscal"
SVC_GROUP="oscal"
SVC_HOME="/var/lib/svc_ams-oscal"

# Install full gnupg2 (includes gpg-agent; replace gnupg2-minimal if present)
sudo dnf install -y --allowerasing gnupg2 2>/dev/null || sudo yum install -y gnupg2 2>/dev/null || true
command -v gpg >/dev/null 2>&1 || { echo "Failed to install gpg"; exit 1; }

# tree is required by pass ls (when pass is from source). Install first.
sudo dnf install -y tree 2>/dev/null || sudo yum install -y tree 2>/dev/null || true
# Install pass: try package first, then from source (for Amazon Linux 2023 where pass is not in default repos)
if ! command -v pass >/dev/null 2>&1; then
  sudo dnf install -y pass 2>/dev/null || sudo yum install -y pass 2>/dev/null || true
fi
if ! command -v pass >/dev/null 2>&1; then
  echo "Installing pass from source..."
  command -v git >/dev/null 2>&1 || sudo dnf install -y git 2>/dev/null || sudo yum install -y git 2>/dev/null || true
  command -v make >/dev/null 2>&1 || sudo dnf install -y make 2>/dev/null || sudo yum install -y make 2>/dev/null || true
  TMP_PASS=$(mktemp -d)
  if git clone --depth 1 https://github.com/zx2c4/password-store.git "$TMP_PASS" 2>/dev/null; then
    :
  elif git clone --depth 1 https://git.zx2c4.com/password-store "$TMP_PASS" 2>/dev/null; then
    :
  else
    rm -rf "$TMP_PASS"
    echo "Failed to clone password-store"; exit 1
  fi
  if [ -f "$TMP_PASS/Makefile" ]; then
    (cd "$TMP_PASS" && sudo make install PREFIX=/usr/local)
    rm -rf "$TMP_PASS"
  else
    rm -rf "$TMP_PASS"
    echo "No Makefile in password-store"; exit 1
  fi
fi
command -v pass >/dev/null 2>&1 || { echo "Failed to install pass"; exit 1; }

# Ensure service user and home
if ! getent group "$SVC_GROUP" >/dev/null 2>&1; then sudo groupadd -r "$SVC_GROUP"; fi
if ! id "$SVC_USER" >/dev/null 2>&1; then
  sudo useradd -r -s /bin/bash -g "$SVC_GROUP" -d "$SVC_HOME" -m -c "OSCAL service account" "$SVC_USER"
  sudo chmod 700 "$SVC_HOME"
fi

# Ensure /usr/local/bin in PATH for pass (when installed from source)
export PATH="/usr/local/bin:$PATH"

# Initialize password store if not present
if [ ! -d "$SVC_HOME/.password-store" ]; then
  # Start gpg-agent for service user (required for batch key generation on some systems)
  sudo -u "$SVC_USER" env HOME="$SVC_HOME" gpg-agent --daemon 2>/dev/null || true
  # Generate GPG key (batch, no passphrase)
  # GPG Name-Real is the identity shown for the store (use OSCAL_password_store, not generic "Password Store")
  sudo -u "$SVC_USER" env PATH="/usr/local/bin:$PATH" HOME="$SVC_HOME" gpg --batch --no-tty --yes --generate-key 2>/dev/null << GPGEOF
Key-Type: RSA
Key-Length: 2048
Name-Real: OSCAL_password_store
Name-Email: oscal-password-store@localhost
Expire-Date: 0
%no-protection
%commit
GPGEOF
  KEY_ID=$(sudo -u "$SVC_USER" env HOME="$SVC_HOME" gpg --list-keys --with-colons 2>/dev/null | awk -F: "/^pub/ {print \$5; exit}")
  if [ -n "$KEY_ID" ]; then
    sudo -u "$SVC_USER" env PATH="/usr/local/bin:$PATH" pass init "$KEY_ID"
    echo "Pass initialized for $SVC_USER (key $KEY_ID)"
  else
    echo "Warning: Could not get GPG key id for $SVC_USER"
    exit 1
  fi
else
  echo "Password store already exists at $SVC_HOME/.password-store"
fi
# Verify
sudo -u "$SVC_USER" env PATH="/usr/local/bin:$PATH" pass 2>/dev/null | head -5 || true
echo "Done."
'

run_one() {
  local ip=$1
  local name=$2
  echo "=== $name ($ip) ==="
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 "${SSH_USER}@${ip}" bash -s <<< "$REMOTE_SCRIPT"
}

[ -n "$GREEN_IP" ] && run_one "$GREEN_IP" "GREEN"
[ -n "$BLUE_IP" ] && run_one "$BLUE_IP" "BLUE"
echo "Pass install and init complete. Add Okta secret: sudo -u svc_ams-oscal pass insert OSCAL/sso-oauth-okta-client-secret"
