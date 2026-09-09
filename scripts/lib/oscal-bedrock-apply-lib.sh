#!/usr/bin/env bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
#
# Shared cross-account Bedrock apply: systemd drop-in + config.json aiConfig.
# Sourced by oscal-bedrock-dropin.sh, oscal-bedrock-apply-from-s3.sh, and deploy hooks.

[ -n "${_OSCAL_BEDROCK_APPLY_LIB_LOADED:-}" ] && return 0
_OSCAL_BEDROCK_APPLY_LIB_LOADED=1

oscal_bedrock_dropin_path() {
  echo "/etc/systemd/system/oscal-reporter.service.d/51-oscal-bedrock-env.conf"
}

# Print desired drop-in contents to stdout.
oscal_bedrock_dropin_content() {
  local assume_arn="$1"
  local external_id="${2:-}"
  cat <<EOF
[Service]
Environment=BEDROCK_ASSUME_ROLE_ARN=${assume_arn}
Environment=BEDROCK_EXTERNAL_ID=${external_id}
EOF
}

# Return 0 when drop-in on disk matches desired content.
oscal_bedrock_dropin_matches() {
  local assume_arn="$1"
  local external_id="${2:-}"
  local dropin
  dropin="$(oscal_bedrock_dropin_path)"
  [ -f "$dropin" ] || return 1
  local want got
  want="$(oscal_bedrock_dropin_content "$assume_arn" "$external_id")"
  got="$(sudo cat "$dropin" 2>/dev/null || cat "$dropin" 2>/dev/null || true)"
  [ "$want" = "$got" ]
}

# Apply systemd drop-in and patch config.json. Returns 0; sets OSCAL_BEDROCK_APPLY_CHANGED=1 when mutating.
oscal_bedrock_apply() {
  local assume_arn="$1"
  local external_id="${2:-}"
  OSCAL_BEDROCK_APPLY_CHANGED=0
  local config_path="${OSCAL_CONFIG_PATH:-/opt/oscal/data/config.json}"

  [ -n "$assume_arn" ] || return 0

  local dropin_dir dropin want
  dropin_dir="/etc/systemd/system/oscal-reporter.service.d"
  dropin="$(oscal_bedrock_dropin_path)"
  want="$(oscal_bedrock_dropin_content "$assume_arn" "$external_id")"

  if ! oscal_bedrock_dropin_matches "$assume_arn" "$external_id"; then
    sudo mkdir -p "$dropin_dir"
    printf '%s\n' "$want" | sudo tee "$dropin" >/dev/null
    sudo chmod 644 "$dropin"
    OSCAL_BEDROCK_APPLY_CHANGED=1
  fi

  if [ -f "$config_path" ] && command -v jq >/dev/null 2>&1; then
    local cur_arn cur_mode
    cur_arn=$(sudo jq -r '.aiConfig.bedrockAssumeRoleArn // ""' "$config_path" 2>/dev/null || echo "")
    cur_mode=$(sudo jq -r '.aiConfig.bedrockAuthMode // ""' "$config_path" 2>/dev/null || echo "")
    if [ "$cur_arn" != "$assume_arn" ] || [ "$cur_mode" != "iam-role" ]; then
      sudo jq \
        --arg arn "$assume_arn" \
        --arg eid "$external_id" \
        --arg mode "iam-role" \
        '.aiConfig = (.aiConfig // {}) |
         .aiConfig.bedrockAuthMode = $mode |
         .aiConfig.bedrockAssumeRoleArn = $arn |
         .aiConfig.bedrockExternalId = $eid' \
        "$config_path" | sudo tee "${config_path}.tmp" >/dev/null
      sudo mv "${config_path}.tmp" "$config_path"
      sudo chown "${S3_SYNC_CHOWN_USER:-ec2-user}:${S3_SYNC_CHOWN_GROUP:-oscal}" "$config_path" 2>/dev/null || true
      OSCAL_BEDROCK_APPLY_CHANGED=1
    fi
  fi

  if [ "${OSCAL_BEDROCK_APPLY_CHANGED}" = "1" ]; then
    sudo systemctl daemon-reload 2>/dev/null || true
  fi

  if [ "${OSCAL_BEDROCK_RESTART_ON_APPLY:-0}" = "1" ] && [ "${OSCAL_BEDROCK_APPLY_CHANGED}" = "1" ]; then
    if systemctl list-unit-files 2>/dev/null | grep -q '^oscal-reporter.service'; then
      sudo systemctl restart oscal-reporter.service 2>/dev/null || true
    fi
  fi

  return 0
}
