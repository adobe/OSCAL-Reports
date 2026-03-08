#!/usr/bin/env bash
# Diagnose Okta 401 on Blue and Green EC2 instances.
# SSHs to each instance and checks: config (ssoConfig.okta), pass secret, env, logs.
# Uses: Pass for SSH key (AWS/OSCAL-AWS4379-SSH); Terraform via terraform/run-with-aws-pass.sh for IPs.
#
# Usage: ./scripts/debug/diagnose-okta-on-ec2.sh
#        ./scripts/debug/diagnose-okta-on-ec2.sh --green-only
#        ./scripts/debug/diagnose-okta-on-ec2.sh --blue-only

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/ec2-common.sh disable=SC1091
source "$SCRIPT_DIR/lib/ec2-common.sh"
OKTA_PASS_ENTRY="${OSCAL_PASS_OKTA_SECRET:-OSCAL/sso-oauth-okta-client-secret}"

resolve_ssh_key
[ ! -x "$TERRAFORM_DIR/run-with-aws-pass.sh" ] && { echo "Error: $TERRAFORM_DIR/run-with-aws-pass.sh not executable. Use it for all Terraform commands." >&2; exit 1; }

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

if [ -z "$GREEN_IP" ] && [ -z "$BLUE_IP" ]; then
  echo "Error: Could not get Green or Blue IP from Terraform. Run: cd terraform && ./run-with-aws-pass.sh apply" >&2
  exit 1
fi

run_remote() {
  local ip=$1
  local name=$2
  shift 2
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "${SSH_USER}@${ip}" bash -s "$name" "$OKTA_PASS_ENTRY" "$@" << 'REMOTE'
INSTANCE_NAME=$1
OKTA_PASS_ENTRY=$2

echo "========== $INSTANCE_NAME =========="

# Config paths (direct run vs Docker)
CONFIG_PATHS="/opt/oscal/data/config.json /data/config.json"
CONFIG_FILE=""
for p in $CONFIG_PATHS; do
  if [ -f "$p" ]; then
    CONFIG_FILE=$p
    break
  fi
done
if [ -z "$CONFIG_FILE" ]; then
  echo "  Config: NOT FOUND in $CONFIG_PATHS"
else
  echo "  Config file: $CONFIG_FILE"
  if command -v jq >/dev/null 2>&1; then
    OAUTH=$(jq -r '.ssoConfig.oauth // empty' "$CONFIG_FILE" 2>/dev/null)
    if [ -n "$OAUTH" ]; then
      OKTA_ENABLED=$(jq -r '.ssoConfig.oauth.providers.okta.enabled // empty' "$CONFIG_FILE" 2>/dev/null)
      OKTA_DOMAIN=$(jq -r '.ssoConfig.oauth.providers.okta.domain // empty' "$CONFIG_FILE" 2>/dev/null)
      OKTA_CLIENT_ID=$(jq -r '.ssoConfig.oauth.providers.okta.clientId // empty' "$CONFIG_FILE" 2>/dev/null)
      OKTA_REDIRECT=$(jq -r '.ssoConfig.oauth.providers.okta.redirectUri // empty' "$CONFIG_FILE" 2>/dev/null)
      CLIENT_SECRET_RAW=$(jq -r '.ssoConfig.oauth.providers.okta.clientSecret // empty' "$CONFIG_FILE" 2>/dev/null)
      if [ "$CLIENT_SECRET_RAW" = "null" ] || [ -z "$CLIENT_SECRET_RAW" ]; then
        CLIENT_SECRET_SOURCE=$(jq -r '.ssoConfig.oauth.providers.okta.clientSecret._pass // "not set"' "$CONFIG_FILE" 2>/dev/null)
        echo "  Okta enabled: $OKTA_ENABLED | domain: $OKTA_DOMAIN | clientId: ${OKTA_CLIENT_ID:0:12}... | redirectUri: $OKTA_REDIRECT"
        echo "  Okta clientSecret: _pass pointer = $CLIENT_SECRET_SOURCE"
        if [ -z "$OKTA_REDIRECT" ]; then
          echo "  ⚠ redirectUri is empty in config; set to https://oscal.amsgovcloud.com.au/auth/okta/callback to match Okta and Blue"
        fi
      else
        echo "  Okta enabled: $OKTA_ENABLED | domain: $OKTA_DOMAIN | clientId: ${OKTA_CLIENT_ID:0:12}... | redirectUri: $OKTA_REDIRECT"
        echo "  Okta clientSecret: plaintext (length ${#CLIENT_SECRET_RAW})"
        if [ -z "$OKTA_REDIRECT" ]; then
          echo "  ⚠ redirectUri is empty in config; set to https://oscal.amsgovcloud.com.au/auth/okta/callback to match Okta and Blue"
        fi
      fi
    else
      echo "  ssoConfig.oauth: not present or empty"
    fi
  else
    echo "  (install jq for full parse; checking grep)"
    grep -o '"okta"[^}]*' "$CONFIG_FILE" 2>/dev/null | head -1 || true
  fi
fi

# Env (Okta-related)
echo "  Env: OSCAL_OKTA_REDIRECT_URI=${OSCAL_OKTA_REDIRECT_URI:-<not set>} OSCAL_PASS_DISABLED=${OSCAL_PASS_DISABLED:-<not set>} PASSWORD_STORE_DIR=${PASSWORD_STORE_DIR:-<not set>}"

# Pass: can service user read Okta secret? (do not print value)
if [ -n "$CONFIG_FILE" ]; then
  SVC_USER="svc_ams-oscal"
  SVC_HOME="/var/lib/svc_ams-oscal"
  if [ -d "$SVC_HOME/.password-store" ]; then
    if sudo -u "$SVC_USER" pass show "$OKTA_PASS_ENTRY" >/dev/null 2>&1; then
      echo "  Pass ($SVC_USER): entry $OKTA_PASS_ENTRY is present and readable"
    else
      echo "  Pass ($SVC_USER): entry $OKTA_PASS_ENTRY MISSING or not readable (Okta client secret will be empty -> 401)"
    fi
  else
    echo "  Pass: $SVC_HOME/.password-store not found (service user may use different store or pass not set up)"
  fi
fi

# Backend logs (last Okta-related lines)
LOG_FILES="/opt/oscal/logs/agent.log /var/log/oscal-reporter.log"
for lf in $LOG_FILES; do
  if [ -f "$lf" ]; then
    echo "  Recent Okta/401 in $lf:"
    grep -i -E "okta|exchange-token|401|access token" "$lf" 2>/dev/null | tail -15 || true
    break
  fi
done
# systemd/journal for oscal-reporter
if command -v journalctl >/dev/null 2>&1 && systemctl list-units --full 2>/dev/null | grep -q oscal-reporter; then
  echo "  Journal (oscal-reporter):"
  journalctl -u oscal-reporter.service -n 30 --no-pager 2>/dev/null | grep -i -E "okta|exchange|401|access token" || true
fi

# Debug NDJSON (tokenUrl, clientSecretLength, etc.) from last exchange-token
for debug_path in /opt/oscal/data/debug-okta.ndjson /opt/oscal/app/data/debug-okta.ndjson /data/debug-okta.ndjson; do
  if [ -f "$debug_path" ] || sudo test -f "$debug_path" 2>/dev/null; then
    echo "  Debug Okta (last 15 lines) $debug_path:"
    (sudo tail -15 "$debug_path" 2>/dev/null || tail -15 "$debug_path" 2>/dev/null) | while read -r ln; do echo "    $ln"; done
    break
  fi
done

echo ""
REMOTE
}

if [ -n "$GREEN_IP" ]; then
  echo "Green IP: $GREEN_IP"
  run_remote "$GREEN_IP" "GREEN"
fi
if [ -n "$BLUE_IP" ]; then
  echo "Blue IP: $BLUE_IP"
  run_remote "$BLUE_IP" "BLUE"
fi

echo "Done."
echo "  • Pass: If entry is missing, add on instance: sudo -u svc_ams-oscal pass insert $OKTA_PASS_ENTRY"
echo "  • Redirect URI: In Okta and in app (Settings → SSO) set exactly: https://oscal.amsgovcloud.com.au/auth/okta/callback"
echo "  • 401 'invalid client secret': Copy the current client secret from Okta Admin (Applications → your app → Client credentials), update /opt/oscal/data/config.json on BOTH Green and Blue with that exact value (no spaces/newlines), then restart: sudo systemctl restart oscal-reporter.service"
