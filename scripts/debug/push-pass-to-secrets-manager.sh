#!/bin/bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
#
# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.
#
# Push secrets from the local pass vault into AWS Secrets Manager (OSCAL bundle).
# DEPRECATED on EC2 (1.7.19+): app reads/writes SM directly; use migrate-config-secrets-to-sm.sh
# for one-time migration. Retained for laptop pass → SM seeding during cutover.
#
# Run on Green (working pass vault):
#   sudo bash /opt/oscal/scripts/debug/push-pass-to-secrets-manager.sh --discover-only
#   sudo bash /opt/oscal/scripts/debug/push-pass-to-secrets-manager.sh --dry-run
#   sudo bash /opt/oscal/scripts/debug/push-pass-to-secrets-manager.sh
#
# Related:
#   pull-secrets-manager-to-pass.sh      -> SM -> pass
#   ec2_automation pass_secrets_sync_run -> bidirectional by mtime (cron)

set -euo pipefail

SVC_USER="${SVC_USER:-svc_ams-oscal}"
SVC_HOME="${SVC_HOME:-/var/lib/svc_ams-oscal}"
ENV_FILE="${ENV_FILE:-/opt/oscal/scripts/ec2_automation.env}"
DRY_RUN=0
DISCOVER_ONLY=0

PASS_ENTRIES=(
  OSCAL/smtp-password
  OSCAL/slack-webhook-url
  OSCAL/ai-api-token
  OSCAL/ai-aws-access-key-id
  OSCAL/ai-aws-secret-access-key
  OSCAL/sso-oauth-azure-client-secret
  OSCAL/sso-oauth-google-client-secret
  OSCAL/sso-oauth-okta-client-secret
  OSCAL/sso-oauth-github-client-secret
)

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --discover-only)
      DISCOVER_ONLY=1
      shift
      ;;
    -h | --help)
      sed -n '14,22p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

info() { echo "[INFO] $*" >&2; }
ok() { echo "[OK] $*" >&2; }
warn() { echo "[WARN] $*" >&2; }
fail() { echo "[ERROR] $*" >&2; exit 1; }

is_svc_user() {
  [ "$(id -un 2>/dev/null)" = "$SVC_USER" ]
}

pass_show_entry() {
  local entry="$1"
  local pass_store="${PASSWORD_STORE_DIR:-$SVC_HOME/.password-store}"
  if is_svc_user; then
    env HOME="$SVC_HOME" PASSWORD_STORE_DIR="$pass_store" PATH="/usr/local/bin:/usr/bin:/bin" \
      pass show "$entry" 2>/dev/null | sed '/^#/d' | sed -e :a -e '/^\n*$/{$d;N;ba' -e '' || true
  else
    sudo -u "$SVC_USER" env HOME="$SVC_HOME" PASSWORD_STORE_DIR="$pass_store" PATH="/usr/local/bin:/usr/bin:/bin" \
      pass show "$entry" 2>/dev/null | sed '/^#/d' | sed -e :a -e '/^\n*$/{$d;N;ba' -e '' || true
  fi
}

resolve_secret_arn() {
  if [ -n "${SECRET_ARN_OVERRIDE:-}" ]; then
    printf '%s' "$SECRET_ARN_OVERRIDE"
    return 0
  fi
  if [ -f "$ENV_FILE" ]; then
    local arn=""
    arn=$(grep -E '^PASS_SECRETS_SYNC_SECRET_ARN=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d '\r' || true)
    if [ -n "$arn" ] && [ "$arn" != "null" ]; then
      printf '%s' "$arn"
      return 0
    fi
  fi
  local region name arn_found
  region="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
  name="${OSCAL_PASS_SYNC_SECRET_NAME:-ams-oscal-reports-oscal-pass-sync}"
  arn_found=$(aws secretsmanager describe-secret --region "$region" --secret-id "$name" --query ARN --output text 2>/dev/null || true)
  if [ -n "$arn_found" ] && [ "$arn_found" != "None" ]; then
    printf '%s' "$arn_found"
    return 0
  fi
  return 1
}

collect_pass_entries_json() {
  local now_ts="$1"
  local out_file="$2"
  local entry val found=0 skipped=0

  jq -n '{entries:{}, _meta:{keys:{}}}' >"$out_file"

  for entry in "${PASS_ENTRIES[@]}"; do
    val=$(pass_show_entry "$entry")
    if [ -z "$val" ]; then
      info "Skip (empty pass): $entry"
      skipped=$((skipped + 1))
      continue
    fi
    jq --arg k "$entry" --arg v "$val" --argjson t "$now_ts" \
      '.entries[$k] = $v | ._meta.keys[$k] = {t: $t}' "$out_file" >"${out_file}.new"
    mv "${out_file}.new" "$out_file"
    ok "Collected from pass: $entry (${#val} chars)"
    found=$((found + 1))
  done

  COLLECT_SKIPPED=$skipped
  if [ "$found" -eq 0 ]; then
    return 1
  fi
  return 0
}

merge_local_wins() {
  local local_bundle="$1"
  local arn="$2"
  local region="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
  local json_out remote_raw v1 merged

  if ! json_out=$(aws secretsmanager get-secret-value --region "$region" --secret-id "$arn" --output json 2>/dev/null); then
    warn "GetSecretValue failed; uploading pass bundle only"
    cat "$local_bundle"
    return 0
  fi

  remote_raw=$(echo "$json_out" | jq -r '.SecretString // empty')
  v1=$(echo "$json_out" | jq -r '.VersionId // empty')

  if ! echo "$remote_raw" | jq -e 'has("entries") and has("_meta")' >/dev/null 2>&1; then
    merged=$(cat "$local_bundle")
  else
    merged=$(echo "$remote_raw" | jq -c --slurpfile local "$local_bundle" '
      .entries = (.entries + $local[0].entries)
      | ._meta.keys = (.["_meta"].keys + $local[0]._meta.keys)
    ')
  fi

  local json_out2 v2 remote_raw2 canon_remote canon_merged
  if ! json_out2=$(aws secretsmanager get-secret-value --region "$region" --secret-id "$arn" --output json 2>/dev/null); then
    echo "$merged" | jq -c .
    return 0
  fi
  v2=$(echo "$json_out2" | jq -r '.VersionId // empty')
  remote_raw2=$(echo "$json_out2" | jq -r '.SecretString // empty')
  if [ -n "$v1" ] && [ -n "$v2" ] && [ "$v1" != "$v2" ]; then
    warn "Secret version changed during merge; re-run script"
    return 1
  fi

  canon_remote=$(echo "$remote_raw2" | jq -c -S . 2>/dev/null) || canon_remote=""
  canon_merged=$(echo "$merged" | jq -c -S .)
  if [ -n "$canon_remote" ] && [ "$canon_remote" = "$canon_merged" ]; then
    info "SM already matches pass (no PutSecretValue)"
    echo "$merged" | jq -c .
    return 2
  fi
  echo "$merged" | jq -c .
  return 0
}

compare_pass_vs_sm() {
  local arn="$1"
  local region="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
  local remote_raw entry local_val remote_val

  remote_raw=$(aws secretsmanager get-secret-value --region "$region" --secret-id "$arn" \
    --query SecretString --output text 2>/dev/null) || remote_raw=""

  for entry in "${PASS_ENTRIES[@]}"; do
    local_val=$(pass_show_entry "$entry")
    remote_val=$(echo "$remote_raw" | jq -r --arg k "$entry" '.entries[$k] // empty' 2>/dev/null || true)
    if [ -z "$local_val" ] && [ -z "$remote_val" ]; then
      info "  $entry: both empty"
    elif [ -z "$local_val" ]; then
      info "  $entry: pass empty, SM has value"
    elif [ -z "$remote_val" ]; then
      info "  $entry: pass has value, SM empty (would push)"
    elif [ "$local_val" = "$remote_val" ]; then
      info "  $entry: match"
    else
      info "  $entry: DIFFER (pass wins on push)"
    fi
  done
}

if [ ! -f "$ENV_FILE" ]; then
  fail "Missing $ENV_FILE"
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

command -v pass >/dev/null 2>&1 || fail "pass not installed"
command -v jq >/dev/null 2>&1 || fail "jq required"
command -v aws >/dev/null 2>&1 || fail "aws CLI required"

PASS_STORE="${PASSWORD_STORE_DIR:-$SVC_HOME/.password-store}"
if is_svc_user; then
  if [ ! -d "$PASS_STORE" ]; then
    fail "Pass store missing: $PASS_STORE"
  fi
else
  if ! sudo -u "$SVC_USER" test -d "$PASS_STORE"; then
    fail "Pass store missing: $PASS_STORE"
  fi
fi

SECRET_ARN=$(resolve_secret_arn) || fail "Could not resolve PASS_SECRETS_SYNC_SECRET_ARN"
info "Secrets Manager: $SECRET_ARN"
info "Pass store: $PASS_STORE (local wins on conflict)"

if [ "$DISCOVER_ONLY" = "1" ]; then
  info "Compare pass vs SM:"
  compare_pass_vs_sm "$SECRET_ARN"
  exit 0
fi

TMP_LOCAL=$(mktemp)
TMP_MERGED=$(mktemp)
trap 'rm -f "$TMP_LOCAL" "$TMP_MERGED"' EXIT

now_ts=$(date +%s)
if ! collect_pass_entries_json "$now_ts" "$TMP_LOCAL"; then
  fail "No pass entries to upload"
fi

entry_count=$(jq '.entries | length' "$TMP_LOCAL")
info "Summary: ${entry_count} pass entries (${COLLECT_SKIPPED:-0} skipped)"

if [ "$DRY_RUN" = "1" ]; then
  merge_local_wins "$TMP_LOCAL" "$SECRET_ARN" >"$TMP_MERGED" || true
  info "[dry-run] Would PutSecretValue with $(jq '.entries | length' "$TMP_MERGED" 2>/dev/null || echo 0) entries"
  jq -r '.entries | keys[]' "$TMP_MERGED" 2>/dev/null | sed 's/^/  /' >&2 || true
  exit 0
fi

merge_rc=0
merge_local_wins "$TMP_LOCAL" "$SECRET_ARN" >"$TMP_MERGED" || merge_rc=$?
if [ "$merge_rc" -eq 1 ]; then
  exit 1
fi
if [ "$merge_rc" -eq 2 ]; then
  ok "No SM update needed"
  exit 0
fi

aws secretsmanager put-secret-value \
  --region "${AWS_DEFAULT_REGION:-us-east-1}" \
  --secret-id "$SECRET_ARN" \
  --secret-string "file://${TMP_MERGED}" >/dev/null

ok "Secrets Manager updated from pass (${entry_count} entries, local wins)"
