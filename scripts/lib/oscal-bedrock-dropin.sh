#!/usr/bin/env bash
# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.
#
# Apply cross-account Bedrock systemd env + config.json aiConfig on an OSCAL EC2 instance.
# Sourced by deploy-to-ec2.sh (do not run standalone unless BEDROCK_ASSUME_ROLE_ARN is set).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./oscal-bedrock-apply-lib.sh disable=SC1091
source "${SCRIPT_DIR}/oscal-bedrock-apply-lib.sh"

oscal_bedrock_apply_on_instance() {
  local assume_arn="${BEDROCK_ASSUME_ROLE_ARN:-}"
  local external_id="${BEDROCK_EXTERNAL_ID:-}"
  oscal_bedrock_apply "$assume_arn" "$external_id"
}

# Invoked by deploy-to-ec2.sh via: sudo env BEDROCK_* bash /tmp/oscal-bedrock-dropin.sh
oscal_bedrock_apply_on_instance
