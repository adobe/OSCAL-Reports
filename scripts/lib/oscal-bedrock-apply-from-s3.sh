#!/usr/bin/env bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
#
# Idempotent cross-account Bedrock apply from S3 manifest (installer/.oscal-bedrock-cross-account.json).
# Used by first-boot user_data, ec2_automation cron, SSM post-boot, and optional manual runs on EC2.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./oscal-bedrock-apply-lib.sh disable=SC1091
source "${SCRIPT_DIR}/oscal-bedrock-apply-lib.sh"

OSCAL_BEDROCK_MANIFEST_NAME="${OSCAL_BEDROCK_MANIFEST_NAME:-.oscal-bedrock-cross-account.json}"
INSTALLER_PREFIX="${INSTALLER_PREFIX:-installer}"
APP_DIR="${APP_DIR:-/opt/oscal/app}"

oscal_bedrock_otel_log() {
  local level="$1"
  local message="$2"
  local outcome="${3:-success}"
  local extra="${4:-}"
  printf '{"timestamp":"%s","level":"%s","message":"%s","service.name":"oscal-report-generator","event.action":"bedrock_cross_account_apply","event.outcome":"%s"%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$level" "$message" "$outcome" "$extra"
}

# Fetch manifest JSON to stdout (from local app dir or S3).
oscal_bedrock_fetch_manifest() {
  local bucket="$1"
  local region="$2"
  local prefix="${3:-installer}"
  local local_mf="${APP_DIR}/${OSCAL_BEDROCK_MANIFEST_NAME}"
  local s3_uri="s3://${bucket}/${prefix}/${OSCAL_BEDROCK_MANIFEST_NAME}"

  export AWS_DEFAULT_REGION="${region}"

  if [ -f "$local_mf" ]; then
    cat "$local_mf"
    return 0
  fi

  if [ -z "$bucket" ] || ! command -v aws >/dev/null 2>&1; then
    return 1
  fi

  if ! aws s3api head-object --bucket "$bucket" --key "${prefix}/${OSCAL_BEDROCK_MANIFEST_NAME}" --region "$region" >/dev/null 2>&1; then
    return 1
  fi

  aws s3 cp "$s3_uri" - --region "$region"
}

# Parse manifest and apply when enabled with assume_role_arn. Returns 0 (skip is not failure).
oscal_bedrock_apply_from_manifest_json() {
  local manifest_json="$1"

  command -v jq >/dev/null 2>&1 || {
    oscal_bedrock_otel_log error "jq required for bedrock manifest apply" failure
    return 1
  }

  local enabled assume_arn external_id
  enabled=$(echo "$manifest_json" | jq -r '.enabled // true')
  assume_arn=$(echo "$manifest_json" | jq -r '.assume_role_arn // ""')
  external_id=$(echo "$manifest_json" | jq -r '.external_id // ""')

  if [ "$enabled" = "false" ] || [ -z "$assume_arn" ] || [ "$assume_arn" = "null" ]; then
    oscal_bedrock_otel_log info "bedrock manifest disabled or empty; skipping apply" success ',"bedrock.skipped":"manifest_disabled"'
    return 0
  fi

  if oscal_bedrock_dropin_matches "$assume_arn" "$external_id"; then
    oscal_bedrock_otel_log info "bedrock drop-in already matches manifest; no change" success ',"bedrock.changed":false'
    return 0
  fi

  oscal_bedrock_apply "$assume_arn" "$external_id"
  if [ "${OSCAL_BEDROCK_APPLY_CHANGED:-0}" = "1" ]; then
    oscal_bedrock_otel_log info "bedrock cross-account env applied from manifest" success ',"bedrock.changed":true'
  else
    oscal_bedrock_otel_log info "bedrock apply completed (no effective change)" success ',"bedrock.changed":false'
  fi
  return 0
}

# Main entry: S3_BUCKET + AWS_DEFAULT_REGION required; optional INSTALLER_PREFIX, OSCAL_BEDROCK_RESTART_ON_APPLY.
oscal_bedrock_apply_from_s3() {
  local bucket="${S3_BUCKET:-}"
  local region="${AWS_DEFAULT_REGION:-us-east-1}"
  local prefix="${INSTALLER_PREFIX:-installer}"
  local manifest_json

  if [ -z "$bucket" ]; then
    oscal_bedrock_otel_log warn "S3_BUCKET unset; skipping bedrock apply from S3" success ',"bedrock.skipped":"no_bucket"'
    return 0
  fi

  if ! manifest_json=$(oscal_bedrock_fetch_manifest "$bucket" "$region" "$prefix"); then
    oscal_bedrock_otel_log info "bedrock manifest not found; skipping apply" success ',"bedrock.skipped":"no_manifest"'
    return 0
  fi

  oscal_bedrock_apply_from_manifest_json "$manifest_json"
}

# When executed directly (not sourced).
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  oscal_bedrock_apply_from_s3
fi
