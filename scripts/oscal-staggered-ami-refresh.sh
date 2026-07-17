#!/usr/bin/env bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
#
# Staggered ASG instance refresh after launch template AMI update (SSAAU-209 / InfraSec).
# Refreshes Green first, waits for success, then Blue — keeps one color serving ALB traffic.
#
# Usage (from repo root):
#   TERRAFORM_DIR=$PWD/terraform/envs/aws4403 ./scripts/oscal-staggered-ami-refresh.sh
#   TERRAFORM_DIR=... ./scripts/oscal-staggered-ami-refresh.sh --role green   # one color only
#   TERRAFORM_DIR=... ./scripts/oscal-staggered-ami-refresh.sh --dry-run
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/ec2-common.sh disable=SC1091
source "$SCRIPT_DIR/lib/ec2-common.sh"
ROLE_FILTER=""
DRY_RUN=false
WARMUP="${OSCAL_ASG_WARMUP_SECONDS:-420}"
POLL_SECONDS="${OSCAL_REFRESH_POLL_SECONDS:-30}"
MAX_WAIT_SECONDS="${OSCAL_REFRESH_MAX_WAIT_SECONDS:-3600}"

usage() {
  echo "Usage: $0 [--role green|blue|both] [--dry-run]" >&2
  echo "  TERRAFORM_DIR  Terraform env directory (default: terraform/envs/aws4403)" >&2
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --role)
      ROLE_FILTER="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h | --help)
      usage
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      ;;
  esac
done

if [ -z "$ROLE_FILTER" ]; then
  ROLE_FILTER="both"
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "Error: aws CLI required." >&2
  exit 1
fi

if ! command -v terraform >/dev/null 2>&1; then
  echo "Error: terraform required." >&2
  exit 1
fi

if ! load_aws_from_pass; then
  if [ -z "${AWS_ACCESS_KEY_ID:-}" ] || [ -z "${AWS_SECRET_ACCESS_KEY:-}" ]; then
    echo "Error: AWS credentials not set. Export AWS_* or use Pass entry '${AWS_PASS_ENTRY:-AWS/AMS_4403-STG}'." >&2
    exit 1
  fi
fi
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-${AWS_REGION:-us-east-1}}"

cd "$TERRAFORM_DIR"

GREEN_ASG="$(terraform output -raw oscal_green_autoscaling_group_name 2>/dev/null || true)"
BLUE_ASG="$(terraform output -raw oscal_blue_autoscaling_group_name 2>/dev/null || true)"
RESOLVED_AMI="$(terraform output -raw oscal_resolved_ami_id 2>/dev/null || true)"
REGION="$(terraform output -raw aws_region 2>/dev/null || echo "us-east-1")"

if [ -z "$GREEN_ASG" ] || [ -z "$BLUE_ASG" ]; then
  echo "Error: Could not read ASG names from terraform output in $TERRAFORM_DIR" >&2
  exit 1
fi

echo "Resolved AMI (terraform): ${RESOLVED_AMI:-unknown}"
echo "Region: $REGION"
echo "Green ASG: $GREEN_ASG"
echo "Blue ASG:  $BLUE_ASG"

wait_for_refresh() {
  local asg_name="$1"
  local elapsed=0
  while [ "$elapsed" -lt "$MAX_WAIT_SECONDS" ]; do
    local status
    status="$(aws autoscaling describe-instance-refreshes \
      --auto-scaling-group-name "$asg_name" \
      --region "$REGION" \
      --query 'InstanceRefreshes[0].Status' \
      --output text 2>/dev/null || echo "Unknown")"
    case "$status" in
      Successful)
        echo "  Instance refresh Successful for $asg_name"
        return 0
        ;;
      Failed | Cancelled | RollbackFailed | RollbackSuccessful)
        echo "  Instance refresh ended with status=$status for $asg_name" >&2
        return 1
        ;;
      Pending | InProgress)
        echo "  Waiting for $asg_name refresh... ($status, ${elapsed}s)"
        sleep "$POLL_SECONDS"
        elapsed=$((elapsed + POLL_SECONDS))
        ;;
      None | Unknown | "")
        echo "  No active refresh for $asg_name (status=$status)"
        return 0
        ;;
      *)
        echo "  Refresh status=$status for $asg_name (${elapsed}s)"
        sleep "$POLL_SECONDS"
        elapsed=$((elapsed + POLL_SECONDS))
        ;;
    esac
  done
  echo "  Timeout waiting for instance refresh on $asg_name" >&2
  return 1
}

start_refresh() {
  local asg_name="$1"
  local color="$2"
  echo ""
  echo "=== Starting instance refresh: $color ($asg_name) ==="
  if [ "$DRY_RUN" = true ]; then
    echo "[dry-run] aws autoscaling start-instance-refresh --auto-scaling-group-name $asg_name ..."
    return 0
  fi
  aws autoscaling start-instance-refresh \
    --region "$REGION" \
    --auto-scaling-group-name "$asg_name" \
    --strategy Rolling \
    --preferences "MinHealthyPercentage=0,InstanceWarmup=${WARMUP},SkipMatching=false,AutoRollback=false" \
    --output json
  wait_for_refresh "$asg_name"
}

refresh_roles=()
case "$ROLE_FILTER" in
  green) refresh_roles=(green) ;;
  blue) refresh_roles=(blue) ;;
  both) refresh_roles=(green blue) ;;
  *) echo "Invalid --role: $ROLE_FILTER" >&2; exit 1 ;;
esac

pre_blue_refresh_cutover() {
  if [ "$DRY_RUN" = true ]; then
    echo "[dry-run] pre-blue: wake passive + ALB failover"
    return 0
  fi
  # shellcheck source=./lib/oscal-traffic-mode.sh disable=SC1091
  source "$SCRIPT_DIR/lib/oscal-traffic-mode.sh"
  # shellcheck source=./lib/oscal-standby.sh disable=SC1091
  source "$SCRIPT_DIR/lib/oscal-standby.sh"
  if ! oscal_traffic_mode_is_active_passive; then
    return 0
  fi
  echo ""
  echo "=== Pre-Blue refresh: wake passive and cutover ALB (avoid 502 on active refresh) ==="
  oscal_standby_wake_passive || echo "Warning: passive wake failed (continuing)" >&2
  oscal_traffic_mode_enter failover || {
    echo "Error: ALB cutover before Blue instance refresh failed." >&2
    return 1
  }
}

post_refresh_deploy() {
  if [ "${OSCAL_POST_REFRESH_DEPLOY:-1}" != "1" ]; then
    echo "Skipping post-refresh deploy (OSCAL_POST_REFRESH_DEPLOY=0)."
    return 0
  fi
  local repo_root
  repo_root="$(cd "$SCRIPT_DIR/.." && pwd)"
  echo ""
  echo "=== Post-refresh passive-first app deploy ==="
  if [ "$DRY_RUN" = true ]; then
    echo "[dry-run] TERRAFORM_DIR=$TERRAFORM_DIR $repo_root/scripts/deploy-to-ec2.sh"
    return 0
  fi
  TERRAFORM_DIR="$TERRAFORM_DIR" "$repo_root/scripts/deploy-to-ec2.sh" || {
    echo "Error: post-refresh deploy failed. Run ./scripts/deploy-to-ec2.sh manually to avoid 502." >&2
    return 1
  }
}

for color in "${refresh_roles[@]}"; do
  if [ "$color" = "blue" ]; then
    pre_blue_refresh_cutover || exit 1
    start_refresh "$BLUE_ASG" "blue"
  else
    start_refresh "$GREEN_ASG" "green"
  fi
done

post_refresh_deploy || exit 1

echo ""
echo "Staggered instance refresh complete."
echo "Post-refresh deploy ran when OSCAL_POST_REFRESH_DEPLOY=1 (default)."
echo "Verify: ./scripts/debug/alb-target-health.sh and https://oscal.amsgovcloud.com.au/health/ready"
