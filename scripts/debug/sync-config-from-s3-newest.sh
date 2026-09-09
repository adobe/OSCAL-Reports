#!/usr/bin/env bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
#
# Pull config.json and users.json from the newest S3 copy among config/active, config/green, config/blue.
# For a known-good snapshot use restore-config-from-s3-default.sh (s3://<bucket>/config/default/).
# Use on Blue (or Green) when peer instance saved config and this host is stale — no full deploy required.
#
# On EC2:
#   sudo bash /opt/oscal/scripts/debug/sync-config-from-s3-newest.sh
#   sudo bash /opt/oscal/scripts/debug/sync-config-from-s3-newest.sh --dry-run
#
# From laptop (via scp-to-ec2):
#   ./scripts/debug/scp-to-ec2.sh blue scripts/debug/sync-config-from-s3-newest.sh /tmp/
#   ./scripts/ssh-ec2.sh blue 'sudo bash /tmp/sync-config-from-s3-newest.sh'

set -euo pipefail

CONFIG_PATH="${CONFIG_PATH:-/opt/oscal/data/config.json}"
USERS_PATH="${USERS_PATH:-/opt/oscal/data/users.json}"
ENV_FILE="${ENV_FILE:-/opt/oscal/scripts/ec2_automation.env}"
DRY_RUN=0
FORCE=1

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --cron)
      FORCE=0
      shift
      ;;
    -h | --help)
      sed -n '8,15p' "$0"
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
fail() { echo "[ERROR] $*" >&2; exit 1; }

if [ ! -f "$ENV_FILE" ]; then
  fail "Missing $ENV_FILE (run deploy first)"
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

if [ -z "${S3_BUCKET:-}" ]; then
  fail "S3_BUCKET not set in $ENV_FILE"
fi

REGION="${AWS_DEFAULT_REGION:-us-east-1}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYNC_LIB="${SYNC_LIB:-$SCRIPT_DIR/../lib/config-s3-sync.sh}"
if [ ! -f "$SYNC_LIB" ]; then
  SYNC_LIB="/opt/oscal/scripts/lib/config-s3-sync.sh"
fi
[ -f "$SYNC_LIB" ] || fail "Missing config-s3-sync.sh (deploy or copy scripts/lib/config-s3-sync.sh)"

command -v aws >/dev/null 2>&1 || fail "aws CLI required"

# shellcheck source=/dev/null disable=SC1091
. "$SYNC_LIB"
config_s3_set_search_prefixes_for_role "${DEPLOYMENT_ROLE:-}"

if [ "$DRY_RUN" = "1" ]; then
  for filename in config.json users.json; do
    key=$(config_s3_find_newest_key "$S3_BUCKET" "$filename" "$REGION") || true
    if [ -n "$key" ]; then
      info "[dry-run] Would pull s3://${S3_BUCKET}/${key}"
    else
      info "[dry-run] No S3 object found for $filename"
    fi
  done
  exit 0
fi

mkdir -p "$(dirname "$CONFIG_PATH")"
rm -f /opt/oscal/data/.config-s3-sync.json 2>/dev/null || sudo rm -f /opt/oscal/data/.config-s3-sync.json 2>/dev/null || true
config_s3_sync_shared_to_local "$S3_BUCKET" "$CONFIG_PATH" "$USERS_PATH" "$REGION" "$FORCE"

if [ "${CONFIG_S3_SYNC_CHANGED:-0}" = "1" ]; then
  ok "Updated config/users from newest S3 backup"
  sudo systemctl restart oscal-reporter.service 2>/dev/null || true
  ok "Restarted oscal-reporter.service"
else
  info "No newer S3 backup than last applied sync (use --cron for non-force compare)"
fi
