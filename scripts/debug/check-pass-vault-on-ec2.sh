#!/usr/bin/env bash
# Check which app secrets are NOT stored in the pass vault (svc_ams-oscal) on Green and Blue.
# Uses: Pass for SSH key (AWS/OSCAL-AWS4379-SSH); Terraform for IPs.
# Usage: ./scripts/debug/check-pass-vault-on-ec2.sh [--green-only | --blue-only]

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/ec2-common.sh disable=SC1091
source "$SCRIPT_DIR/lib/ec2-common.sh"
SSH_USER="${SSH_USER:-ec2-user}"
SVC_USER="svc_ams-oscal"
SVC_HOME="/var/lib/svc_ams-oscal"

resolve_ssh_key
GREEN_IP=""; BLUE_IP=""
case "${1:-}" in
  --green-only) GREEN_IP=$(get_terraform_oscal_ip green) ;;
  --blue-only)  BLUE_IP=$(get_terraform_oscal_ip blue) ;;
  *) GREEN_IP=$(get_terraform_oscal_ip green); BLUE_IP=$(get_terraform_oscal_ip blue) ;;
esac
[ -z "$GREEN_IP" ] && [ -z "$BLUE_IP" ] && { echo "Error: No Green or Blue IP." >&2; exit 1; }

run_remote() {
  local ip=$1
  local name=$2
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "${SSH_USER}@${ip}" \
    SVC_USER="$SVC_USER" SVC_HOME="$SVC_HOME" INSTANCE_NAME="$name" bash -s << 'REMOTE'
# Prefer runtime config (same as systemd CONFIG_PATH)
CONFIG_FILE=""
for p in /opt/oscal/data/config.json /data/config.json; do
  [ -f "$p" ] && CONFIG_FILE="$p" && break
done
[ -z "$CONFIG_FILE" ] && CONFIG_FILE="/opt/oscal/data/config.json"

echo "========== $INSTANCE_NAME =========="
echo "  Config: $CONFIG_FILE"
echo "  Pass store: $SVC_HOME/.password-store"

[ ! -f "$CONFIG_FILE" ] && { echo "  Config not found."; exit 0; }
command -v jq >/dev/null 2>&1 || { echo "  jq not installed."; exit 0; }

# Check if an entry exists in pass vault (pass show exits 0). Does not rely on pass ls or tree.
pass_entry_exists() {
  sudo -u "$SVC_USER" env HOME="$SVC_HOME" PASSWORD_STORE_DIR="$SVC_HOME/.password-store" PATH="/usr/local/bin:/usr/bin:/bin" pass show "$1" >/dev/null 2>&1
}

not_in_pass=""
in_pass=""

# path|pass_entry (must match backend/utils/sensitiveConfigKeys.js)
while IFS='|' read -r path pass_entry; do
  [ -z "$path" ] && continue
  raw=$(jq -r --arg p "$path" '
    ($p | split(".")) as $keys |
    . as $doc |
    reduce $keys[] as $k ($doc; .[$k]?) |
    if . == null then "null"
    elif type == "object" and ._pass then "_pass:" + (._pass // "")
    elif type == "string" then .
    else "null" end
  ' "$CONFIG_FILE" 2>/dev/null)
  [ "$raw" = "null" ] || [ -z "$raw" ] && continue
  if [ "${raw#_pass:}" != "$raw" ]; then
    entry="${raw#_pass:}"
    if pass_entry_exists "$entry"; then
      in_pass="${in_pass}  ✓ $path -> $entry (in vault)\n"
    else
      not_in_pass="${not_in_pass}  ✗ $path -> $entry (pointer in config but entry MISSING in vault)\n"
    fi
  else
    not_in_pass="${not_in_pass}  ✗ $path (plaintext in config, not in vault)\n"
  fi
done << 'ENTRIES'
messagingConfig.email.smtpPassword|OSCAL/smtp-password
messagingConfig.slack.webhookUrl|OSCAL/slack-webhook-url
aiConfig.apiToken|OSCAL/ai-api-token
aiConfig.awsAccessKeyId|OSCAL/ai-aws-access-key-id
aiConfig.awsSecretAccessKey|OSCAL/ai-aws-secret-access-key
ssoConfig.oauth.providers.azure.clientSecret|OSCAL/sso-oauth-azure-client-secret
ssoConfig.oauth.providers.google.clientSecret|OSCAL/sso-oauth-google-client-secret
ssoConfig.oauth.providers.okta.clientSecret|OSCAL/sso-oauth-okta-client-secret
ssoConfig.oauth.providers.github.clientSecret|OSCAL/sso-oauth-github-client-secret
ENTRIES

echo "  Secrets NOT in pass vault:"
[ -n "$not_in_pass" ] && printf "$not_in_pass" || echo "    (none – all configured secrets use vault or are unset)"
echo "  Secrets in pass vault:"
[ -n "$in_pass" ] && printf "$in_pass" || echo "    (none)"
REMOTE
}

[ -n "$GREEN_IP" ] && { echo "Green IP: $GREEN_IP"; run_remote "$GREEN_IP" "GREEN"; echo ""; }
[ -n "$BLUE_IP" ] && { echo "Blue IP: $BLUE_IP"; run_remote "$BLUE_IP" "BLUE"; echo ""; }
echo "Done."
