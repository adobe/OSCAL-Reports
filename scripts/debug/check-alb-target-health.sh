#!/usr/bin/env bash
# Check ALB target group health for Green and Blue. Use when debugging 503 Service Unavailable.
# Requires: AWS CLI, Terraform applied (or set AWS_REGION and TG ARNs via env).
# Usage: ./scripts/debug/check-alb-target-health.sh
#   Or:  AWS_REGION=us-east-1 ./scripts/debug/check-alb-target-health.sh
# AWS credentials: from Pass (same entry as terraform/run-with-aws-pass.sh), or from env (AWS_PROFILE / AWS_ACCESS_KEY_ID etc.).

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/ec2-common.sh disable=SC1091
source "$SCRIPT_DIR/lib/ec2-common.sh"

tf_output() {
  [ -x "$TERRAFORM_DIR/run-with-aws-pass.sh" ] && [ -f "$TERRAFORM_DIR/terraform.tfstate" ] || return 1
  "$TERRAFORM_DIR/run-with-aws-pass.sh" output -raw "$@" 2>/dev/null || true
}

load_aws_from_pass || true

AWS_REGION="${AWS_REGION:-$(tf_output aws_region)}"
GREEN_ARN="${ALB_TG_GREEN_ARN:-$(tf_output alb_target_group_green_arn)}"
BLUE_ARN="${ALB_TG_BLUE_ARN:-$(tf_output alb_target_group_blue_arn)}"

if [ -z "$AWS_REGION" ]; then
  echo "Set AWS_REGION or run from repo root after terraform apply (run-with-aws-pass.sh output aws_region)."
  exit 1
fi
if [ -z "$GREEN_ARN" ] || [ -z "$BLUE_ARN" ]; then
  echo "Set ALB_TG_GREEN_ARN and ALB_TG_BLUE_ARN or run from repo root after terraform apply."
  exit 1
fi

echo "Region: $AWS_REGION"
echo "Green TG: $GREEN_ARN"
echo "Blue TG:  $BLUE_ARN"
echo ""

describe_health() {
  local name="$1"
  local arn="$2"
  echo "--- $name target group ---"
  aws elbv2 describe-target-health --target-group-arn "$arn" --region "$AWS_REGION" --output table 2>/dev/null || {
    echo "Failed to describe target health (check AWS credentials: Pass entry $AWS_PASS_ENTRY or AWS_PROFILE / AWS_ACCESS_KEY_ID)."
    return 1
  }
  local healthy
  healthy=$(aws elbv2 describe-target-health --target-group-arn "$arn" --region "$AWS_REGION" --query "TargetHealthDescriptions[?TargetHealth.State=='healthy']" --output json 2>/dev/null | grep -c '"State"' || echo 0)
  local total
  total=$(aws elbv2 describe-target-health --target-group-arn "$arn" --region "$AWS_REGION" --query "TargetHealthDescriptions" --output json 2>/dev/null | grep -c '"Target"' || echo 0)
  echo "Healthy: $healthy / $total"
  echo ""
}

describe_health "Green" "$GREEN_ARN"
describe_health "Blue" "$BLUE_ARN"

echo "503 cause: ALB returns 503 when the target group that was selected has no healthy targets."
echo "  - If you use the GREEN hostname (e.g. green.*), traffic goes only to Green; if Green is unhealthy → 503."
echo "  - If you use the BLUE hostname or main ALB URL, traffic can go to Blue when Green is unhealthy."
echo "  - Fix: Use the Blue URL when only Blue is up, or bring Green instance/app healthy (port 3019, /health returns 200)."
