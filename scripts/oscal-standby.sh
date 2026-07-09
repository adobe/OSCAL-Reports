#!/usr/bin/env bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
#
# Operator CLI for active-passive standby (wake/shutdown passive, traffic mode).
# Usage: ./scripts/oscal-standby.sh status|wake|shutdown|set-mode steady|deploy_green|failover

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TERRAFORM_DIR="${TERRAFORM_DIR:-$REPO_ROOT/terraform/envs/aws4403}"

# shellcheck source=./lib/oscal-traffic-mode.sh disable=SC1091
source "$REPO_ROOT/scripts/lib/oscal-traffic-mode.sh"
# shellcheck source=./lib/oscal-standby.sh disable=SC1091
source "$REPO_ROOT/scripts/lib/oscal-standby.sh"

PASS_ENTRY="${AWS_PASS_ENTRY:-AWS/AMS_4403-STG}"

load_aws_from_pass() {
  command -v pass >/dev/null 2>&1 || return 1
  local line key val
  while IFS= read -r line; do
    if [[ $line =~ ^(aws_[a-z_]+)=(.*)$ ]]; then
      key="${BASH_REMATCH[1]}"
      val="${BASH_REMATCH[2]}"
      case "$key" in
        aws_access_key_id) export AWS_ACCESS_KEY_ID="$val" ;;
        aws_secret_access_key) export AWS_SECRET_ACCESS_KEY="$val" ;;
        aws_session_token) export AWS_SESSION_TOKEN="$val" ;;
      esac
    fi
  done < <(pass show "$PASS_ENTRY" 2>/dev/null)
  [ -n "${AWS_ACCESS_KEY_ID:-}" ]
}

cmd="${1:-status}"
shift || true

case "$cmd" in
  status)
    oscal_traffic_mode__require_tools || exit 1
    echo "traffic_mode=$(oscal_traffic_mode__tf_raw oscal_traffic_mode 2>/dev/null || echo unknown)"
    echo "ssm_mode=$(oscal_traffic_mode_get 2>/dev/null || echo n/a)"
    echo "passive_asg=$(oscal_standby_passive_asg_name 2>/dev/null || echo n/a)"
    echo "passive_desired=$(oscal_standby_asg_desired "$(oscal_standby_passive_asg_name)" 2>/dev/null || echo n/a)"
    echo "active_asg=$(oscal_standby_active_asg_name 2>/dev/null || echo n/a)"
    echo "active_desired=$(oscal_standby_asg_desired "$(oscal_standby_active_asg_name)" 2>/dev/null || echo n/a)"
    ;;
  wake)
    oscal_standby_wake_passive
    ;;
  shutdown)
    oscal_standby_shutdown_passive
    ;;
  set-mode)
    mode="${1:?set-mode requires steady|deploy_green|failover}"
    oscal_traffic_mode_enter "$mode"
    ;;
  *)
    echo "Usage: $0 status|wake|shutdown|set-mode steady|deploy_green|failover" >&2
    exit 1
    ;;
esac
