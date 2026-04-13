# shellcheck shell=bash
# Pass vault ↔ AWS Secrets Manager sync (allowlist). Sourced by ec2_automation.sh after otel_log is defined.
# Test hook: PASS_SYNC_TEST_EPOCH overrides wall clock for min-interval and merge timestamps (integer seconds).

pass_secrets_sync_epoch() {
  if [ -n "${PASS_SYNC_TEST_EPOCH:-}" ]; then
    printf '%s\n' "${PASS_SYNC_TEST_EPOCH}"
    return 0
  fi
  date +%s
}

pass_secrets_sync_allowlist() {
  cat <<'ALLOW'
OSCAL/smtp-password
OSCAL/slack-webhook-url
OSCAL/ai-api-token
OSCAL/ai-aws-access-key-id
OSCAL/ai-aws-secret-access-key
OSCAL/sso-oauth-azure-client-secret
OSCAL/sso-oauth-google-client-secret
OSCAL/sso-oauth-okta-client-secret
OSCAL/sso-oauth-github-client-secret
ALLOW
}

pass_secrets_sync_gpg_mtime() {
  local key="$1"
  local store="${PASSWORD_STORE_DIR:-$HOME/.password-store}"
  local f="${store}/${key}.gpg"
  if [ -f "$f" ]; then
    stat -c %Y "$f" 2>/dev/null || echo 0
  else
    echo 0
  fi
}

pass_secrets_sync_local_show() {
  local key="$1"
  if command -v pass >/dev/null 2>&1 && pass show "$key" >/dev/null 2>&1; then
    pass show "$key" 2>/dev/null || true
  fi
}

pass_secrets_sync_insert() {
  local key="$1"
  local val="$2"
  printf '%s\n' "$val" | pass insert -m -f "$key" >/dev/null 2>&1
}

pass_secrets_sync_same() {
  [ "$1" = "$2" ]
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
  local now
  now=$(pass_secrets_sync_epoch)
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

  local key local_val remote_val remote_t local_mtime
  local need_put=0
  local pulls=0
  local keys_to_update_pass=()
  local vals_for_pass=()
  local keys_local_won=()

  while IFS= read -r key || [ -n "$key" ]; do
    [ -z "$key" ] && continue
    remote_val=$(echo "$remote_raw" | jq -r --arg k "$key" '.entries[$k] // empty')
    remote_t=$(echo "$remote_raw" | jq -r --arg k "$key" '._meta.keys[$k].t? // 0')
    local_val=$(pass_secrets_sync_local_show "$key")
    local_mtime=$(pass_secrets_sync_gpg_mtime "$key")

    if pass_secrets_sync_same "$local_val" "$remote_val"; then
      continue
    fi

    if [ -z "$local_val" ] && [ -n "$remote_val" ]; then
      keys_to_update_pass+=("$key")
      vals_for_pass+=("$remote_val")
      pulls=$((pulls + 1))
    elif [ -n "$local_val" ] && [ -z "$remote_val" ]; then
      keys_local_won+=("$key")
      need_put=1
    elif [ "$local_mtime" -gt "$remote_t" ]; then
      keys_local_won+=("$key")
      need_put=1
    else
      keys_to_update_pass+=("$key")
      vals_for_pass+=("$remote_val")
      pulls=$((pulls + 1))
    fi
  done < <(pass_secrets_sync_allowlist)

  local i plen=${#keys_to_update_pass[@]}
  for ((i = 0; i < plen; i++)); do
    key="${keys_to_update_pass[$i]}"
    remote_val="${vals_for_pass[$i]}"
    if ! pass_secrets_sync_insert "$key" "$remote_val"; then
      pass_secrets_sync_otel "warn" "pass secrets sync: pass insert failed for entry" "failure" "\"event.action\":\"pass_sm_sync\",\"sync.entry\":\"${key//\"/\\\"}\""
    fi
  done

  if [ "$need_put" -eq 0 ]; then
    if [ "$pulls" -gt 0 ]; then
      pass_secrets_sync_otel "info" "pass secrets sync: updated pass from AWS only" "success" "\"event.action\":\"pass_sm_sync\",\"sync.pulls\":$pulls"
    fi
    echo "{\"last_run\":$now}" >"$state_file" 2>/dev/null || true
    return 0
  fi

  local merged newt now_ts
  merged=$(echo "$remote_raw" | jq -c .)
  now_ts=$(pass_secrets_sync_epoch)
  for key in "${keys_local_won[@]}"; do
    local_val=$(pass_secrets_sync_local_show "$key")
    if [ -z "$local_val" ]; then
      merged=$(echo "$merged" | jq -c --arg k "$key" 'del(.entries[$k]) | .["_meta"].keys |= del(.[$k])')
    else
      local_mtime=$(pass_secrets_sync_gpg_mtime "$key")
      if [ "$now_ts" -gt "$local_mtime" ]; then
        newt=$now_ts
      else
        newt=$local_mtime
      fi
      merged=$(echo "$merged" | jq -c --arg k "$key" --arg v "$local_val" --argjson t "$newt" '.entries[$k]=$v | ._meta.keys[$k].t=$t')
    fi
  done

  local json_out2 v2 remote_raw2
  if ! json_out2=$(aws secretsmanager get-secret-value --secret-id "$arn" --output json 2>/dev/null); then
    pass_secrets_sync_otel "warn" "pass secrets sync: second GetSecretValue failed; skipping Put" "failure" "\"event.action\":\"pass_sm_sync\",\"sync.skipped\":\"cas_get_failed\""
    echo "{\"last_run\":$now}" >"$state_file" 2>/dev/null || true
    return 0
  fi
  v2=$(echo "$json_out2" | jq -r '.VersionId // empty')
  remote_raw2=$(echo "$json_out2" | jq -r '.SecretString // empty')
  if [ -n "$v1" ] && [ -n "$v2" ] && [ "$v1" != "$v2" ]; then
    pass_secrets_sync_otel "info" "pass secrets sync: secret version changed during merge; skipping Put (retry next interval)" "success" "\"event.action\":\"pass_sm_sync\",\"sync.skipped\":\"cas_version\""
    echo "{\"last_run\":$now}" >"$state_file" 2>/dev/null || true
    return 0
  fi

  local canon_remote canon_merged
  canon_remote=$(echo "$remote_raw2" | jq -c -S . 2>/dev/null) || canon_remote=""
  canon_merged=$(echo "$merged" | jq -c -S .)
  if [ -n "$canon_remote" ] && [ "$canon_remote" = "$canon_merged" ]; then
    pass_secrets_sync_otel "info" "pass secrets sync: merged equals remote; no Put" "success" "\"event.action\":\"pass_sm_sync\""
    echo "{\"last_run\":$now}" >"$state_file" 2>/dev/null || true
    return 0
  fi

  if aws secretsmanager put-secret-value --secret-id "$arn" --secret-string "$merged" >/dev/null 2>&1; then
    pass_secrets_sync_otel "info" "pass secrets sync: PutSecretValue succeeded" "success" "\"event.action\":\"pass_sm_sync\",\"sync.put\":true,\"sync.pulls\":$pulls"
  else
    pass_secrets_sync_otel "warn" "pass secrets sync: PutSecretValue failed" "failure" "\"event.action\":\"pass_sm_sync\",\"sync.put\":false"
  fi
  echo "{\"last_run\":$now}" >"$state_file" 2>/dev/null || true
  return 0
}
