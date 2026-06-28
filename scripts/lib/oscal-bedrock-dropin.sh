#!/usr/bin/env bash
# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.
#
# Apply cross-account Bedrock systemd env + config.json aiConfig on an OSCAL EC2 instance.
# Sourced by deploy-to-ec2.sh (do not run standalone unless BEDROCK_ASSUME_ROLE_ARN is set).

set -euo pipefail

oscal_bedrock_apply_on_instance() {
  local assume_arn="${BEDROCK_ASSUME_ROLE_ARN:-}"
  local external_id="${BEDROCK_EXTERNAL_ID:-}"
  local config_path="${OSCAL_CONFIG_PATH:-/opt/oscal/data/config.json}"

  [ -n "$assume_arn" ] || return 0

  local dropin_dir="/etc/systemd/system/oscal-reporter.service.d"
  local dropin="${dropin_dir}/51-oscal-bedrock-env.conf"
  sudo mkdir -p "$dropin_dir"
  sudo tee "$dropin" >/dev/null <<EOF
[Service]
Environment=BEDROCK_ASSUME_ROLE_ARN=${assume_arn}
Environment=BEDROCK_EXTERNAL_ID=${external_id}
EOF
  sudo chmod 644 "$dropin"
  sudo systemctl daemon-reload

  if [ -f "$config_path" ] && command -v jq >/dev/null 2>&1; then
    sudo jq \
      --arg arn "$assume_arn" \
      --arg eid "$external_id" \
      --arg mode "iam-role" \
      '.aiConfig = (.aiConfig // {}) |
       .aiConfig.bedrockAuthMode = $mode |
       .aiConfig.bedrockAssumeRoleArn = $arn |
       .aiConfig.bedrockExternalId = $eid' \
      "$config_path" | sudo tee "$config_path" >/dev/null
    sudo chown "${S3_SYNC_CHOWN_USER:-ec2-user}:${S3_SYNC_CHOWN_GROUP:-oscal}" "$config_path" 2>/dev/null || true
  fi
}

# Invoked by deploy-to-ec2.sh via: sudo env BEDROCK_* bash /tmp/oscal-bedrock-dropin.sh
oscal_bedrock_apply_on_instance
