#!/usr/bin/env bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
#
# Ensure SESSION_SECRET for oscal-reporter (systemd drop-in) from AWS SM bundle key OSCAL/session-secret.
# Creates the key in the bundle on first run. Required for _cfgenc fields and secure Express sessions on EC2.

[ -n "${_SESSION_SECRET_SYSTEMD_LOADED:-}" ] && return 0
_SESSION_SECRET_SYSTEMD_LOADED=1

SESSION_SECRET_SM_ENTRY="${SESSION_SECRET_SM_ENTRY:-OSCAL/session-secret}"

# ensure_oscal_session_secret_systemd IP SSH_KEY SSH_USER SM_ARN AWS_REGION
ensure_oscal_session_secret_systemd() {
  local ip="$1"
  local key="$2"
  local ssh_user="${3:-ec2-user}"
  local sm_arn="$4"
  local region="${5:-us-east-1}"
  local sm_entry="$SESSION_SECRET_SM_ENTRY"

  [ -z "$ip" ] || [ -z "$key" ] || [ -z "$sm_arn" ] && return 0

  ssh -i "$key" -o StrictHostKeyChecking=no -o ConnectTimeout=120 \
    -o ServerAliveInterval=15 -o ServerAliveCountMax=20 \
    "${ssh_user}@${ip}" bash -s "$sm_arn" "$region" "$sm_entry" <<'REMOTE'
set -euo pipefail
ARN="$1"
REGION="$2"
SM_ENTRY="$3"
export AWS_DEFAULT_REGION="$REGION"
DROPIN_DIR="/etc/systemd/system/oscal-reporter.service.d"
DROPIN="${DROPIN_DIR}/52-oscal-session-secret.conf"

command -v jq >/dev/null 2>&1 || { sudo dnf install -y jq 2>/dev/null || sudo yum install -y jq; }
command -v aws >/dev/null 2>&1 || { echo "aws CLI required for SESSION_SECRET bootstrap" >&2; exit 1; }

bundle="$(aws secretsmanager get-secret-value --secret-id "$ARN" --query SecretString --output text)"
sess="$(echo "$bundle" | jq -r --arg k "$SM_ENTRY" '.entries[$k] // empty')"
if [ -z "$sess" ]; then
  sess="$(openssl rand -base64 48 | tr -d '\n' | head -c 64)"
  now="$(date +%s)"
  new_bundle="$(echo "$bundle" | jq --arg s "$sess" --arg k "$SM_ENTRY" --argjson t "$now" \
    '.entries[$k]=$s | ._meta.keys[$k]={"t":$t}')"
  aws secretsmanager put-secret-value --secret-id "$ARN" --secret-string "$new_bundle"
  echo "Created ${SM_ENTRY} in Secrets Manager bundle"
fi

sudo mkdir -p "$DROPIN_DIR"
tmp="$(mktemp)"
{
  printf '%s\n' '[Service]'
  printf 'Environment=SESSION_SECRET=%s\n' "$sess"
} >"$tmp"
sudo install -m 0644 "$tmp" "$DROPIN"
rm -f "$tmp"
sudo systemctl daemon-reload
echo "SESSION_SECRET systemd drop-in updated at $DROPIN"
REMOTE
}
