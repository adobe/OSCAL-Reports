#!/bin/bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
#
# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.
#
# Push secrets from laptop pass bundle (PROD/OSCAL/AWS_SM) into AWS Secrets Manager.
# DEPRECATED on EC2 (1.7.19+): app reads/writes SM directly. Retained for laptop → SM sync.
#
# Run on laptop (operator pass store):
#   ./scripts/debug/push-pass-to-secrets-manager.sh --discover-only
#   ./scripts/debug/push-pass-to-secrets-manager.sh --dry-run
#   ./scripts/debug/push-pass-to-secrets-manager.sh
#
# Env: OSCAL_PASS_BUNDLE_ENTRY (default PROD/OSCAL/AWS_SM), PASSWORD_STORE_DIR (operator store)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/pass-bundle-common.sh disable=SC1091
source "$SCRIPT_DIR/../lib/pass-bundle-common.sh"

SVC_USER="${SVC_USER:-svc_ams-oscal}"
SVC_HOME="${SVC_HOME:-/var/lib/svc_ams-oscal}"
ENV_FILE="${ENV_FILE:-/opt/oscal/scripts/ec2_automation.env}"
DRY_RUN=0
DISCOVER_ONLY=0

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

pass_show_bundle() {
  local pass_store="${PASSWORD_STORE_DIR:-$SVC_HOME/.password-store}"
  local entry
  entry=$(pass_bundle_entry)
  if is_svc_user; then
    env HOME="${HOME:-$SVC_HOME}" PASSWORD_STORE_DIR="$pass_store" PATH="/usr/local/bin:/usr/bin:/bin" \
      pass show "$entry" 2>/dev/null || true
  else
    env HOME="${HOME:-$SVC_HOME}" PASSWORD_STORE_DIR="$pass_store" PATH="/usr/local/bin:/usr/bin:/bin" \
      pass show "$entry" 2>/dev/null || true
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

read_local_bundle() {
  local raw entry
  entry=$(pass_bundle_entry)
  raw=$(pass_show_bundle)
  if ! echo "$raw" | jq -e 'has("entries") and has("_meta")' >/dev/null 2>&1; then
    fail "Pass bundle $entry missing or invalid JSON (run migrate-pass-entries-to-bundle.sh --dry-run first)"
  fi
  echo "$raw" | jq -c .
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
    info "SM already matches pass bundle (no PutSecretValue)"
    echo "$merged" | jq -c .
    return 2
  fi
  echo "$merged" | jq -c .
  return 0
}

compare_pass_vs_sm() {
  local arn="$1"
  local region="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
  local remote_raw local_bundle entry key local_val remote_val

  entry=$(pass_bundle_entry)
  local_bundle=$(read_local_bundle)
  remote_raw=$(aws secretsmanager get-secret-value --region "$region" --secret-id "$arn" \
    --query SecretString --output text 2>/dev/null) || remote_raw=""

  info "Pass bundle: $entry"
  while IFS= read -r key || [ -n "$key" ]; do
    [ -z "$key" ] && continue
    local_val=$(echo "$local_bundle" | jq -r --arg k "$key" '.entries[$k] // empty')
    remote_val=$(echo "$remote_raw" | jq -r --arg k "$key" '.entries[$k] // empty' 2>/dev/null || true)
    if [ -z "$local_val" ] && [ -z "$remote_val" ]; then
      info "  $key: both empty"
    elif [ -z "$local_val" ]; then
      info "  $key: pass empty, SM has value"
    elif [ -z "$remote_val" ]; then
      info "  $key: pass has value, SM empty (would push)"
    elif [ "$local_val" = "$remote_val" ]; then
      info "  $key: match"
    else
      info "  $key: DIFFER (pass wins on push)"
    fi
  done < <(echo "$local_bundle" | jq -r '.entries | keys[]?' 2>/dev/null)
}

command -v pass >/dev/null 2>&1 || fail "pass not installed"
command -v jq >/dev/null 2>&1 || fail "jq required"
command -v aws >/dev/null 2>&1 || fail "aws CLI required"

PASS_STORE="${PASSWORD_STORE_DIR:-${HOME}/.password-store}"
info "Pass store: $PASS_STORE"
info "Bundle entry: $(pass_bundle_entry)"

SECRET_ARN=$(resolve_secret_arn) || fail "Could not resolve PASS_SECRETS_SYNC_SECRET_ARN (set env or run on EC2 with ec2_automation.env)"
info "Secrets Manager: $SECRET_ARN"
info "Local pass bundle wins on conflict"

if [ "$DISCOVER_ONLY" = "1" ]; then
  info "Compare pass bundle vs SM:"
  compare_pass_vs_sm "$SECRET_ARN"
  exit 0
fi

TMP_LOCAL=$(mktemp)
TMP_MERGED=$(mktemp)
trap 'rm -f "$TMP_LOCAL" "$TMP_MERGED"' EXIT

read_local_bundle >"$TMP_LOCAL"
entry_count=$(jq '.entries | length' "$TMP_LOCAL")
if [ "$entry_count" -eq 0 ]; then
  fail "Pass bundle has no entries"
fi
info "Summary: ${entry_count} entries in pass bundle"

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

ok "Secrets Manager updated from pass bundle (${entry_count} entries, local wins)"
