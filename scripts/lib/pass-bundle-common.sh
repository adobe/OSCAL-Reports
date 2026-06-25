# shellcheck shell=bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
#
# Shared pass bundle entry name and legacy OSCAL/* keys for migration.

pass_bundle_entry() {
  printf '%s\n' "${OSCAL_PASS_BUNDLE_ENTRY:-PROD/OSCAL/AWS_SM}"
}

pass_legacy_oscal_keys() {
  cat <<'LEGACY'
OSCAL/smtp-password
OSCAL/slack-webhook-url
OSCAL/ai-api-token
OSCAL/ai-aws-access-key-id
OSCAL/ai-aws-secret-access-key
OSCAL/sso-oauth-azure-client-secret
OSCAL/sso-oauth-google-client-secret
OSCAL/sso-oauth-okta-client-secret
OSCAL/sso-oauth-github-client-secret
OSCAL/sso-oauth-generic-oidc-client-secret
LEGACY
}

pass_bundle_gpg_mtime() {
  local store="${PASSWORD_STORE_DIR:-$HOME/.password-store}"
  local entry
  entry=$(pass_bundle_entry)
  local f="${store}/${entry}.gpg"
  if [ -f "$f" ]; then
    stat -c %Y "$f" 2>/dev/null || stat -f %m "$f" 2>/dev/null || echo 0
  else
    echo 0
  fi
}

pass_show_bundle_json() {
  local entry
  entry=$(pass_bundle_entry)
  if command -v pass >/dev/null 2>&1; then
    pass show "$entry" 2>/dev/null || true
  fi
}

pass_insert_bundle_json() {
  local json="$1"
  local entry
  entry=$(pass_bundle_entry)
  printf '%s' "$json" | pass insert -m -f "$entry" >/dev/null 2>&1
}

pass_bundle_max_meta_t() {
  local json="$1"
  echo "$json" | jq -r '._meta.keys | to_entries | map(.value.t // 0) | max // 0' 2>/dev/null || echo 0
}

pass_empty_bundle_json() {
  jq -nc '{entries:{}, _meta:{keys:{}}}'
}
