#!/usr/bin/env bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
#
# Shared Green/Blue config + users on S3 (last writer wins).
# Canonical prefix: config/active/ (legacy config/green/, config/blue/ still read for migration).
# Golden restore point (operator-published, not overwritten by cron): config/default/

[ -n "${_CONFIG_S3_SYNC_LOADED:-}" ] && return 0
_CONFIG_S3_SYNC_LOADED=1

CONFIG_S3_ACTIVE_PREFIX="${CONFIG_S3_ACTIVE_PREFIX:-config/active}"
CONFIG_S3_DEFAULT_PREFIX="${CONFIG_S3_DEFAULT_PREFIX:-config/default}"
CONFIG_S3_SEARCH_PREFIXES="${CONFIG_S3_SEARCH_PREFIXES:-config/active config/green config/blue}"
CONFIG_S3_STATE_FILE="${CONFIG_S3_STATE_FILE:-/opt/oscal/data/.config-s3-sync.json}"

_config_s3_head_field() {
  local bucket="$1"
  local key="$2"
  local region="$3"
  local field="$4"
  aws s3api head-object --bucket "$bucket" --key "$key" --region "$region" \
    --query "$field" --output text 2>/dev/null || return 1
}

_config_s3_min_bytes() {
  local filename="$1"
  case "$filename" in
    config.json) printf '256' ;;
    users.json) printf '8' ;;
    *) printf '1' ;;
  esac
}

_config_s3_json_config_ok() {
  local file="$1"
  command -v jq >/dev/null 2>&1 || return 0
  jq -e 'type == "object" and (.ssoConfig != null or .messagingConfig != null or .aiConfig != null)' "$file" >/dev/null 2>&1
}

_config_s3_object_ok() {
  local bucket="$1"
  local key="$2"
  local region="$3"
  local filename="$4"
  local size min
  size=$(_config_s3_head_field "$bucket" "$key" "$region" 'ContentLength') || return 1
  min=$(_config_s3_min_bytes "$filename")
  [ "${size:-0}" -ge "$min" ]
}

_config_s3_lastmod_epoch() {
  local bucket="$1"
  local key="$2"
  local region="$3"
  local lm
  lm=$(_config_s3_head_field "$bucket" "$key" "$region" 'LastModified') || return 1
  date -d "$lm" +%s 2>/dev/null || return 1
}

# Print S3 object key (e.g. config/green/config.json) with newest LastModified, or empty.
config_s3_find_newest_key() {
  local bucket="$1"
  local filename="$2"
  local region="$3"
  local prefix key best_key="" best_epoch=0 epoch
  for prefix in $CONFIG_S3_SEARCH_PREFIXES; do
    key="${prefix}/${filename}"
    _config_s3_object_ok "$bucket" "$key" "$region" "$filename" || continue
    epoch=$(_config_s3_lastmod_epoch "$bucket" "$key" "$region") || continue
    if [ "$epoch" -gt "$best_epoch" ]; then
      best_epoch=$epoch
      best_key=$key
    fi
  done
  if [ -n "$best_key" ]; then
    printf '%s' "$best_key"
  fi
}

_config_s3_state_epoch() {
  local filename="$1"
  if [ ! -f "$CONFIG_S3_STATE_FILE" ] || ! command -v jq >/dev/null 2>&1; then
    printf '0'
    return 0
  fi
  jq -r --arg f "$filename" '.[$f].epoch // 0' "$CONFIG_S3_STATE_FILE" 2>/dev/null || printf '0'
}

_config_s3_write_state() {
  local filename="$1"
  local s3_key="$2"
  local epoch="$3"
  local tmp dir
  dir=$(dirname "$CONFIG_S3_STATE_FILE")
  mkdir -p "$dir" 2>/dev/null || sudo mkdir -p "$dir"
  if command -v jq >/dev/null 2>&1; then
    tmp=$(mktemp)
    if [ -f "$CONFIG_S3_STATE_FILE" ]; then
      jq --arg f "$filename" --arg k "$s3_key" --argjson e "$epoch" \
        '.[$f] = {key: $k, epoch: $e}' "$CONFIG_S3_STATE_FILE" >"$tmp" 2>/dev/null || \
        echo "{}" | jq --arg f "$filename" --arg k "$s3_key" --argjson e "$epoch" \
          '.[$f] = {key: $k, epoch: $e}' >"$tmp"
    else
      echo "{}" | jq --arg f "$filename" --arg k "$s3_key" --argjson e "$epoch" \
        '.[$f] = {key: $k, epoch: $e}' >"$tmp"
    fi
    if [ -w "$dir" ] 2>/dev/null; then
      mv -f "$tmp" "$CONFIG_S3_STATE_FILE"
    else
      sudo mv -f "$tmp" "$CONFIG_S3_STATE_FILE"
      sudo chown "${S3_SYNC_CHOWN_USER:-ec2-user}:${S3_SYNC_CHOWN_GROUP:-oscal}" "$CONFIG_S3_STATE_FILE" 2>/dev/null || true
    fi
  fi
}

# Set peer-aware S3 search prefixes (never prefer this instance's legacy config/<role>/ copy).
config_s3_set_search_prefixes_for_role() {
  local role="${1:-}"
  case "$role" in
    blue)  CONFIG_S3_SEARCH_PREFIXES="config/active config/green" ;;
    green) CONFIG_S3_SEARCH_PREFIXES="config/active config/blue" ;;
    *)     CONFIG_S3_SEARCH_PREFIXES="${CONFIG_S3_SEARCH_PREFIXES:-config/active config/green config/blue}" ;;
  esac
  export CONFIG_S3_SEARCH_PREFIXES
}

# Returns 0; sets CONFIG_S3_SYNC_CHANGED=1 when any file was updated.
config_s3_sync_shared_to_local() {
  local bucket="$1"
  local config_path="$2"
  local users_path="$3"
  local region="$4"
  local force="${5:-0}"
  local filename key epoch state_epoch pulled=0

  CONFIG_S3_SYNC_CHANGED=0
  export CONFIG_S3_SYNC_CHANGED
  [ -z "$bucket" ] && return 0
  export AWS_DEFAULT_REGION="${region:-us-east-1}"

  for filename in config.json users.json; do
    local dest
    if [ "$filename" = "config.json" ]; then
      dest="$config_path"
    else
      dest="$users_path"
    fi
    key=$(config_s3_find_newest_key "$bucket" "$filename" "$region") || true
    [ -z "$key" ] && continue
    epoch=$(_config_s3_lastmod_epoch "$bucket" "$key" "$region") || continue
    state_epoch=$(_config_s3_state_epoch "$filename")
    if [ "$force" = "1" ] || [ "$epoch" -gt "$state_epoch" ]; then
      if aws s3 cp "s3://${bucket}/${key}" "$dest" --region "$region" --quiet 2>/dev/null; then
        local min got
        min=$(_config_s3_min_bytes "$filename")
        got=$(wc -c <"$dest" | tr -d ' ')
        if [ "${got:-0}" -lt "$min" ]; then
          rm -f "$dest"
          continue
        fi
        if [ "$filename" = "config.json" ] && ! _config_s3_json_config_ok "$dest"; then
          rm -f "$dest"
          continue
        fi
        _config_s3_write_state "$filename" "$key" "$epoch"
        pulled=1
        CONFIG_S3_SYNC_CHANGED=1
      fi
    fi
  done

  if [ "$pulled" = "1" ]; then
    return 0
  fi
  return 0
}

# Upload local config/users to config/active/ and refresh sync state.
config_s3_backup_to_active() {
  local bucket="$1"
  local config_path="$2"
  local users_path="$3"
  local region="$4"
  local prefix="${CONFIG_S3_ACTIVE_PREFIX}"
  local key epoch

  [ -z "$bucket" ] && return 0
  export AWS_DEFAULT_REGION="${region:-us-east-1}"

  if [ -f "$config_path" ]; then
    key="${prefix}/config.json"
    cfg_min=$(_config_s3_min_bytes "config.json")
    if [ "$(wc -c <"$config_path" | tr -d ' ')" -ge "$cfg_min" ]; then
      if aws s3 cp "$config_path" "s3://${bucket}/${key}" --region "$region" --quiet 2>/dev/null; then
        epoch=$(_config_s3_lastmod_epoch "$bucket" "$key" "$region") || epoch=$(date +%s)
        _config_s3_write_state "config.json" "$key" "$epoch"
      fi
    fi
  fi
  if [ -f "$users_path" ]; then
    key="${prefix}/users.json"
    usr_min=$(_config_s3_min_bytes "users.json")
    if [ "$(wc -c <"$users_path" | tr -d ' ')" -ge "$usr_min" ]; then
      if aws s3 cp "$users_path" "s3://${bucket}/${key}" --region "$region" --quiet 2>/dev/null; then
        epoch=$(_config_s3_lastmod_epoch "$bucket" "$key" "$region") || epoch=$(date +%s)
        _config_s3_write_state "users.json" "$key" "$epoch"
      fi
    fi
  fi
}

# True when config/default/config.json exists and passes size/JSON checks.
config_s3_default_available() {
  local bucket="$1"
  local region="${2:-us-east-1}"
  local key="${CONFIG_S3_DEFAULT_PREFIX}/config.json"
  local tmp
  [ -z "$bucket" ] && return 1
  export AWS_DEFAULT_REGION="$region"
  _config_s3_object_ok "$bucket" "$key" "$region" "config.json" || return 1
  tmp=$(mktemp)
  if aws s3 cp "s3://${bucket}/${key}" "$tmp" --region "$region" --quiet 2>/dev/null; then
    if _config_s3_json_config_ok "$tmp"; then
      rm -f "$tmp"
      return 0
    fi
  fi
  rm -f "$tmp"
  return 1
}

config_s3_default_s3_uri() {
  local bucket="$1"
  printf 's3://%s/%s/' "$bucket" "${CONFIG_S3_DEFAULT_PREFIX}"
}

# Publish operator golden copy to config/default/ (manifest + config.json + users.json).
config_s3_backup_to_default() {
  local bucket="$1"
  local config_path="$2"
  local users_path="$3"
  local region="$4"
  local source_note="${5:-manual}"
  local prefix="${CONFIG_S3_DEFAULT_PREFIX}"
  local key epoch tmp_manifest pkg_ver="" host="" role=""

  [ -z "$bucket" ] && return 1
  export AWS_DEFAULT_REGION="${region:-us-east-1}"
  host=$(hostname -s 2>/dev/null || hostname 2>/dev/null || printf 'unknown')
  role="${DEPLOYMENT_ROLE:-${OSCAL_DEPLOYMENT_ROLE:-unknown}}"

  if [ -f /opt/oscal/app/package.json ]; then
    pkg_ver=$(jq -r '.version // empty' /opt/oscal/app/package.json 2>/dev/null || true)
  fi

  if [ ! -f "$config_path" ] || [ "$(wc -c <"$config_path" | tr -d ' ')" -lt "$(_config_s3_min_bytes config.json)" ]; then
    return 1
  fi
  if ! _config_s3_json_config_ok "$config_path"; then
    return 1
  fi

  key="${prefix}/config.json"
  if ! aws s3 cp "$config_path" "s3://${bucket}/${key}" --region "$region" --quiet 2>/dev/null; then
    return 1
  fi

  if [ -f "$users_path" ] && [ "$(wc -c <"$users_path" | tr -d ' ')" -ge "$(_config_s3_min_bytes users.json)" ]; then
    aws s3 cp "$users_path" "s3://${bucket}/${prefix}/users.json" --region "$region" --quiet 2>/dev/null || true
  fi

  tmp_manifest=$(mktemp)
  jq -n \
    --arg publishedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg source "$source_note" \
    --arg host "$host" \
    --arg role "$role" \
    --arg pkg "$pkg_ver" \
    --arg prefix "$prefix" \
    --arg bucket "$bucket" \
    '{
      purpose: "golden config restore point (config.default)",
      s3Prefix: $prefix,
      bucket: $bucket,
      publishedAt: $publishedAt,
      source: $source,
      host: $host,
      deploymentRole: $role,
      packageVersion: (if $pkg == "" then null else $pkg end),
      restoreHint: "sudo bash /opt/oscal/scripts/debug/restore-config-from-s3-default.sh"
    }' >"$tmp_manifest"
  aws s3 cp "$tmp_manifest" "s3://${bucket}/${prefix}/manifest.json" --region "$region" --quiet 2>/dev/null || true
  rm -f "$tmp_manifest"

  epoch=$(_config_s3_lastmod_epoch "$bucket" "$key" "$region") || epoch=$(date +%s)
  _config_s3_write_state "config.json" "$key" "$epoch"
  return 0
}

# Restore local config/users from config/default/ (does not touch config/active/).
config_s3_restore_from_default() {
  local bucket="$1"
  local config_path="$2"
  local users_path="$3"
  local region="$4"
  local prefix="${CONFIG_S3_DEFAULT_PREFIX}"
  local filename key epoch pulled=0

  CONFIG_S3_SYNC_CHANGED=0
  export CONFIG_S3_SYNC_CHANGED
  [ -z "$bucket" ] && return 1
  export AWS_DEFAULT_REGION="${region:-us-east-1}"

  if ! config_s3_default_available "$bucket" "$region"; then
    return 1
  fi

  for filename in config.json users.json; do
    local dest min got
    key="${prefix}/${filename}"
    if [ "$filename" = "config.json" ]; then
      dest="$config_path"
    else
      dest="$users_path"
    fi
    if ! aws s3api head-object --bucket "$bucket" --key "$key" --region "$region" >/dev/null 2>&1; then
      continue
    fi
    if aws s3 cp "s3://${bucket}/${key}" "$dest" --region "$region" --quiet 2>/dev/null; then
      min=$(_config_s3_min_bytes "$filename")
      got=$(wc -c <"$dest" | tr -d ' ')
      if [ "${got:-0}" -lt "$min" ]; then
        rm -f "$dest"
        continue
      fi
      if [ "$filename" = "config.json" ] && ! _config_s3_json_config_ok "$dest"; then
        rm -f "$dest"
        continue
      fi
      epoch=$(_config_s3_lastmod_epoch "$bucket" "$key" "$region") || epoch=$(date +%s)
      _config_s3_write_state "$filename" "$key" "$epoch"
      pulled=1
      CONFIG_S3_SYNC_CHANGED=1
    fi
  done

  [ "$pulled" = "1" ]
}
