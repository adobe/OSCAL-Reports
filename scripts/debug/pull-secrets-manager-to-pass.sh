#!/bin/bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
#
# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.
#
# Pull AWS Secrets Manager bundle into pass entry PROD/OSCAL/AWS_SM (single JSON).
# DEPRECATED on EC2 (1.7.19+): app uses SM in-process; use migrate-config-secrets-to-sm.sh instead.
# Retained for laptop pass seeding during cutover only.
#
# On EC2 (recommended as ec2-user):
#   sudo bash /opt/oscal/scripts/debug/pull-secrets-manager-to-pass.sh
#   sudo bash /opt/oscal/scripts/debug/pull-secrets-manager-to-pass.sh --dry-run
#
# May also run as svc_ams-oscal (e.g. after ./scripts/ssh-ec2.sh blue svc) — no sudo used.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/pass-bundle-common.sh disable=SC1091
source "$SCRIPT_DIR/../lib/pass-bundle-common.sh"

SVC_USER="${SVC_USER:-svc_ams-oscal}"
SVC_HOME="${SVC_HOME:-/var/lib/svc_ams-oscal}"
ENV_FILE="${ENV_FILE:-/opt/oscal/scripts/ec2_automation.env}"
DRY_RUN=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h | --help)
      sed -n '15,19p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

info() {
  echo "[INFO] $*" >&2
}

ok() {
  echo "[OK] $*" >&2
}

warn() {
  echo "[WARN] $*" >&2
}

fail() {
  echo "[ERROR] $*" >&2
  exit 1
}

is_svc_user() {
  [ "$(id -un 2>/dev/null)" = "$SVC_USER" ]
}

run_as_svc() {
  if is_svc_user; then
    env HOME="$SVC_HOME" PASSWORD_STORE_DIR="$PASS_STORE" PATH="/usr/local/bin:/usr/bin:/bin" "$@"
  else
    sudo -u "$SVC_USER" env HOME="$SVC_HOME" PASSWORD_STORE_DIR="$PASS_STORE" PATH="/usr/local/bin:/usr/bin:/bin" "$@"
  fi
}

pass_store_exists() {
  if is_svc_user; then
    [ -d "$PASS_STORE" ]
  else
    sudo -u "$SVC_USER" test -d "$PASS_STORE"
  fi
}

if [ ! -f "$ENV_FILE" ]; then
  fail "Missing $ENV_FILE (deploy sets PASS_SECRETS_SYNC_*)"
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

if [ "${PASS_SECRETS_SYNC_ENABLED:-false}" != "true" ]; then
  fail "PASS_SECRETS_SYNC_ENABLED is not true in $ENV_FILE"
fi

if [ -z "${PASS_SECRETS_SYNC_SECRET_ARN:-}" ]; then
  fail "PASS_SECRETS_SYNC_SECRET_ARN is empty in $ENV_FILE"
fi

command -v pass >/dev/null 2>&1 || fail "pass is not installed"
command -v jq >/dev/null 2>&1 || fail "jq is not installed"
command -v aws >/dev/null 2>&1 || fail "aws CLI is not installed"

PASS_STORE="${PASSWORD_STORE_DIR:-$SVC_HOME/.password-store}"

if ! pass_store_exists; then
  fail "Pass store missing: $PASS_STORE

  Fix (as ec2-user, not $SVC_USER):
    sudo bash /opt/oscal/scripts/debug/pull-secrets-manager-to-pass.sh

  Or re-run deploy pass setup, then pull again.
  Manual init only if deploy never ran pass init on this instance."
fi

LIB="/opt/oscal/scripts/lib/ec2-automation-pass-sync.sh"
if [ ! -f "$LIB" ]; then
  LIB="/opt/oscal/app/scripts/lib/ec2-automation-pass-sync.sh"
fi
if [ ! -f "$LIB" ]; then
  fail "Missing ec2-automation-pass-sync.sh (re-deploy scripts/lib)"
fi

info "Secrets Manager: ${PASS_SECRETS_SYNC_SECRET_ARN}"
info "Pass store: ${PASS_STORE} (user ${SVC_USER}, runner: $(id -un))"

if [ "$DRY_RUN" = "1" ]; then
  info "[dry-run] Would write pass bundle: $(pass_bundle_entry)"
  aws secretsmanager get-secret-value \
    --secret-id "${PASS_SECRETS_SYNC_SECRET_ARN}" \
    --query SecretString --output text 2>/dev/null \
    | jq -r '.entries | keys[]?' 2>/dev/null | sed 's/^/  would sync: /' >&2 || true
  exit 0
fi

SYNC_WRAPPER=$(mktemp /tmp/oscal-pass-sm-pull.XXXXXX.sh)
chmod 700 "$SYNC_WRAPPER"
if ! is_svc_user; then
  chown "$SVC_USER:$SVC_USER" "$SYNC_WRAPPER" 2>/dev/null || chown "$SVC_USER" "$SYNC_WRAPPER"
fi

cat >"$SYNC_WRAPPER" <<SYNC_EOF
#!/bin/bash
set -euo pipefail
export HOME='${SVC_HOME}'
export PASSWORD_STORE_DIR='${PASS_STORE}'
export PASS_SECRETS_SYNC_ENABLED='true'
export PASS_SECRETS_SYNC_SECRET_ARN='${PASS_SECRETS_SYNC_SECRET_ARN}'
export PASS_SECRETS_SYNC_MIN_INTERVAL_SECONDS=0
export DATA_DIR='${DATA_DIR:-/opt/oscal/data}'
export PATH='/usr/local/bin:/usr/bin:/bin'
# shellcheck source=/dev/null
source '${LIB}'
pass_secrets_sync_run
SYNC_EOF

trap 'rm -f "$SYNC_WRAPPER"' EXIT

if is_svc_user; then
  "$SYNC_WRAPPER"
else
  sudo -u "$SVC_USER" "$SYNC_WRAPPER"
fi

info "Pass bundle after sync: $(pass_bundle_entry 2>/dev/null || echo 'PROD/OSCAL/AWS_SM')"

if is_svc_user; then
  ok "Done. Ask ec2-user to restart: sudo systemctl restart oscal-reporter.service"
else
  ok "Done. Restart if needed: sudo systemctl restart oscal-reporter.service"
fi
