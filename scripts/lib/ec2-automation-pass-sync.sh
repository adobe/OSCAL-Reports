# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# shellcheck shell=bash
# Pass vault ↔ AWS Secrets Manager sync (single bundle entry). Sourced by ec2_automation.sh after otel_log is defined.
# Test hook: PASS_SYNC_TEST_EPOCH overrides wall clock for min-interval and merge timestamps (integer seconds).

# shellcheck source=./pass-bundle-common.sh disable=SC1091
_LIB_DIR="${BASH_SOURCE[0]%/*}"
source "${_LIB_DIR}/pass-bundle-common.sh"

pass_secrets_sync_epoch() {
  if [ -n "${PASS_SYNC_TEST_EPOCH:-}" ]; then
    printf '%s\n' "${PASS_SYNC_TEST_EPOCH}"
    return 0
  fi
  date +%s
}

pass_secrets_sync_otel() {
  local sev="$1" msg="$2" outcome="$3" extra="$4"
  if type otel_log >/dev/null 2>&1; then
    otel_log "$sev" "$msg" "$outcome" "$extra"
  fi
}

pass_secrets_sync_run() {
  if [ "${PASS_SECRETS_SYNC_ENABLED:-false}" != "true" ]; then
    return 0
  fi
  local arn="${PASS_SECRETS_SYNC_SECRET_ARN:-}"
  if [ -z "$arn" ]; then
    return 0
  fi

  if ! command -v aws >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
    pass_secrets_sync_otel "warn" "pass secrets sync skipped: missing aws or jq" "failure" "\"event.action\":\"pass_sm_sync\",\"sync.skipped\":\"missing_deps\""
    return 0
  fi
  if ! command -v pass >/dev/null 2>&1; then
    pass_secrets_sync_otel "warn" "pass secrets sync skipped: pass not installed" "failure" "\"event.action\":\"pass_sm_sync\",\"sync.skipped\":\"no_pass\""
    return 0
  fi

  local data_dir="${DATA_DIR:-}"
  if [ -z "$data_dir" ]; then
    local cfg="${CONFIG_PATH:-/opt/oscal/data/config.json}"
    data_dir=$(dirname "$cfg")
  fi
  mkdir -p "$data_dir" 2>/dev/null || true
  local state_file="${data_dir}/.pass-secrets-sync-state"
  local min_interval="${PASS_SECRETS_SYNC_MIN_INTERVAL_SECONDS:-21600}"
  local now bundle_entry
  now=$(pass_secrets_sync_epoch)
  bundle_entry=$(pass_bundle_entry)
  local last_run=0
  if [ -f "$state_file" ]; then
    last_run=$(jq -r '.last_run // 0' "$state_file" 2>/dev/null || echo 0)
  fi
  if [ "$((now - last_run))" -lt "$min_interval" ] && [ "$last_run" -gt 0 ]; then
    return 0
  fi

  local json_out remote_raw v1
  if ! json_out=$(aws secretsmanager get-secret-value --secret-id "$arn" --output json 2>/dev/null); then
    pass_secrets_sync_otel "warn" "pass secrets sync: GetSecretValue failed" "failure" "\"event.action\":\"pass_sm_sync\",\"sync.skipped\":\"get_failed\""
    return 0
  fi
  remote_raw=$(echo "$json_out" | jq -r '.SecretString // empty')
  v1=$(echo "$json_out" | jq -r '.VersionId // empty')

  if ! echo "$remote_raw" | jq -e 'has("entries") and has("_meta")' >/dev/null 2>&1; then
    pass_secrets_sync_otel "warn" "pass secrets sync: invalid JSON shape from AWS" "failure" "\"event.action\":\"pass_sm_sync\",\"sync.skipped\":\"bad_json\""
    return 0
  fi

  local local_raw local_mtime remote_max_t
  local_raw=$(pass_show_bundle_json)
  if ! echo "$local_raw" | jq -e 'has("entries") and has("_meta")' >/dev/null 2>&1; then
    local_raw=$(pass_empty_bundle_json)
  fi
  local_mtime=$(pass_bundle_gpg_mtime)
  remote_max_t=$(pass_bundle_max_meta_t "$remote_raw")

  local canon_local canon_remote
  canon_local=$(echo "$local_raw" | jq -c -S . 2>/dev/null) || canon_local=""
  canon_remote=$(echo "$remote_raw" | jq -c -S . 2>/dev/null) || canon_remote=""

  if [ "$canon_local" = "$canon_remote" ]; then
    echo "{\"last_run\":$now}" >"$state_file" 2>/dev/null || true
    return 0
  fi

  if [ "$local_mtime" -gt "$remote_max_t" ]; then
    local merged now_ts
    now_ts=$(pass_secrets_sync_epoch)
    merged=$(echo "$remote_raw" | jq -c --argjson local "$local_raw" --argjson t "$now_ts" '
      .entries = (.entries + $local.entries)
      | ._meta.keys = (.["_meta"].keys + ($local.entries | keys | map({key: ., value: {t: $t}}) | from_entries))
    ')

    local json_out2 v2 remote_raw2
    if ! json_out2=$(aws secretsmanager get-secret-value --secret-id "$arn" --output json 2>/dev/null); then
      pass_secrets_sync_otel "warn" "pass secrets sync: second GetSecretValue failed; skipping Put" "failure" "\"event.action\":\"pass_sm_sync\",\"sync.skipped\":\"cas_get_failed\""
      echo "{\"last_run\":$now}" >"$state_file" 2>/dev/null || true
      return 0
    fi
    v2=$(echo "$json_out2" | jq -r '.VersionId // empty')
    remote_raw2=$(echo "$json_out2" | jq -r '.SecretString // empty')
    if [ -n "$v1" ] && [ -n "$v2" ] && [ "$v1" != "$v2" ]; then
      pass_secrets_sync_otel "info" "pass secrets sync: secret version changed during merge; skipping Put" "success" "\"event.action\":\"pass_sm_sync\",\"sync.skipped\":\"cas_version\""
      echo "{\"last_run\":$now}" >"$state_file" 2>/dev/null || true
      return 0
    fi

    local canon_merged canon_remote2
    canon_remote2=$(echo "$remote_raw2" | jq -c -S . 2>/dev/null) || canon_remote2=""
    canon_merged=$(echo "$merged" | jq -c -S .)
    if [ -n "$canon_remote2" ] && [ "$canon_remote2" = "$canon_merged" ]; then
      pass_secrets_sync_otel "info" "pass secrets sync: merged equals remote; no Put" "success" "\"event.action\":\"pass_sm_sync\""
      echo "{\"last_run\":$now}" >"$state_file" 2>/dev/null || true
      return 0
    fi

    if aws secretsmanager put-secret-value --secret-id "$arn" --secret-string "$merged" >/dev/null 2>&1; then
      pass_secrets_sync_otel "info" "pass secrets sync: PutSecretValue succeeded (local bundle wins)" "success" "\"event.action\":\"pass_sm_sync\",\"sync.put\":true,\"sync.bundle\":\"${bundle_entry//\"/\\\"}\""
    else
      pass_secrets_sync_otel "warn" "pass secrets sync: PutSecretValue failed" "failure" "\"event.action\":\"pass_sm_sync\",\"sync.put\":false"
    fi
  else
    if pass_insert_bundle_json "$(echo "$remote_raw" | jq -c .)"; then
      pass_secrets_sync_otel "info" "pass secrets sync: updated pass bundle from AWS" "success" "\"event.action\":\"pass_sm_sync\",\"sync.pull\":true,\"sync.bundle\":\"${bundle_entry//\"/\\\"}\""
    else
      pass_secrets_sync_otel "warn" "pass secrets sync: pass bundle insert failed" "failure" "\"event.action\":\"pass_sm_sync\",\"sync.pull\":false"
    fi
  fi

  echo "{\"last_run\":$now}" >"$state_file" 2>/dev/null || true
  return 0
}
