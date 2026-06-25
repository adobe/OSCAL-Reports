#!/bin/bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
#
# One-time migration: merge legacy per-key OSCAL/* pass entries into PROD/OSCAL/AWS_SM bundle.
# Does NOT delete legacy entries (operator cleanup). Default is --dry-run only.
#
# Usage:
#   ./scripts/debug/migrate-pass-entries-to-bundle.sh --dry-run
#   ./scripts/debug/migrate-pass-entries-to-bundle.sh --apply
#
# Env: PASSWORD_STORE_DIR (operator laptop store), OSCAL_PASS_BUNDLE_ENTRY

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/pass-bundle-common.sh disable=SC1091
source "$SCRIPT_DIR/../lib/pass-bundle-common.sh"

DRY_RUN=1

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run)
      shift
      ;;
    --apply)
      DRY_RUN=0
      shift
      ;;
    -h | --help)
      sed -n '8,12p' "$0"
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

command -v pass >/dev/null 2>&1 || fail "pass not installed"
command -v jq >/dev/null 2>&1 || fail "jq required"

bundle_entry=$(pass_bundle_entry)
now_ts=$(date +%s)

existing_raw=$(pass_show_bundle_json)
if echo "$existing_raw" | jq -e 'has("entries") and has("_meta")' >/dev/null 2>&1; then
  bundle=$(echo "$existing_raw" | jq -c .)
else
  bundle=$(pass_empty_bundle_json)
fi

found=0
while IFS= read -r key || [ -n "$key" ]; do
  [ -z "$key" ] && continue
  if echo "$bundle" | jq -e --arg k "$key" '.entries[$k] != null and .entries[$k] != ""' >/dev/null 2>&1; then
    info "Skip (already in bundle): $key"
    continue
  fi
  val=""
  if pass show "$key" >/dev/null 2>&1; then
    val=$(pass show "$key" 2>/dev/null | sed '/^#/d' | sed -e :a -e '/^\n*$/{$d;N;ba' -e '' || true)
  fi
  if [ -z "$val" ]; then
    info "Skip (empty legacy): $key"
    continue
  fi
  bundle=$(echo "$bundle" | jq -c --arg k "$key" --arg v "$val" --argjson t "$now_ts" \
    '.entries[$k] = $v | ._meta.keys[$k] = {t: $t}')
  ok "Would merge: $key (${#val} chars)"
  found=$((found + 1))
done < <(pass_legacy_oscal_keys)

if [ "$found" -eq 0 ]; then
  info "Nothing to migrate"
  exit 0
fi

entry_count=$(echo "$bundle" | jq '.entries | length')
info "Bundle $bundle_entry would have $entry_count entries"

if [ "$DRY_RUN" -eq 1 ]; then
  info "[dry-run] Run with --apply to write pass insert -m -f $bundle_entry"
  exit 0
fi

if pass_insert_bundle_json "$(echo "$bundle" | jq -c .)"; then
  ok "Wrote pass bundle $bundle_entry ($entry_count entries). Legacy OSCAL/* entries left in place."
else
  fail "pass insert failed for $bundle_entry"
fi
