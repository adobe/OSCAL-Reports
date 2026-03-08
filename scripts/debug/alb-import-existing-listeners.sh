#!/usr/bin/env bash
# Resolve DuplicateListener / existing ALB listeners not in Terraform state.
# Run from repo root. Prints import or delete commands; run them from terraform/ with AWS creds.
#
# Usage: ./scripts/debug/alb-import-existing-listeners.sh [import|delete]
#   import (default) - print terraform import commands for existing port 80 and 443 listeners
#   delete           - print aws elbv2 delete-listener commands (then run terraform apply)

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/ec2-common.sh disable=SC1091
source "$SCRIPT_DIR/lib/ec2-common.sh"

[ ! -d "$TERRAFORM_DIR" ] && { echo "Terraform dir not found: $TERRAFORM_DIR"; exit 1; }
load_aws_from_pass || { echo "Set AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY or install pass with entry $AWS_PASS_ENTRY"; exit 1; }
command -v aws >/dev/null 2>&1 || { echo "AWS CLI required"; exit 1; }

alb_arn=$(cd "$TERRAFORM_DIR" && terraform state show -no-color aws_lb.main 2>/dev/null | grep -E '^\s*arn\s*=' | sed -E 's/.*=\s*"(.*)"/\1/' | tr -d ' ') || true
if [ -z "$alb_arn" ]; then
  dns=$(cd "$TERRAFORM_DIR" && terraform output -raw alb_dns_name 2>/dev/null)
  if [ -n "$dns" ]; then
    alb_arn=$(aws elbv2 describe-load-balancers --query "LoadBalancers[?DNSName=='$dns'].LoadBalancerArn" --output text 2>/dev/null) || true
  fi
fi
if [ -z "$alb_arn" ]; then
  echo "Could not get ALB ARN. Set TERRAFORM_DIR or run from repo with state in terraform/"; exit 1
fi

region=$(cd "$TERRAFORM_DIR" && terraform output -raw aws_region 2>/dev/null) || region="us-east-1"
export AWS_DEFAULT_REGION="$region"

listeners=$(aws elbv2 describe-listeners --load-balancer-arn "$alb_arn" --query 'Listeners[].[Port,ListenerArn]' --output text 2>/dev/null) || { echo "Failed to describe listeners"; exit 1; }
listener_80_arn=""
listener_443_arn=""
while read -r port arn; do
  case "$port" in
    80)  listener_80_arn=$arn ;;
    443) listener_443_arn=$arn ;;
  esac
done <<< "$listeners"

mode="${1:-import}"
if [ "$mode" = "delete" ]; then
  echo "# Delete existing listeners so Terraform can create them. Run from anywhere (AWS creds required):"
  [ -n "$listener_80_arn" ] && echo "aws elbv2 delete-listener --listener-arn \"$listener_80_arn\""
  [ -n "$listener_443_arn" ] && echo "aws elbv2 delete-listener --listener-arn \"$listener_443_arn\""
  echo "# Then: cd $TERRAFORM_DIR && ./run-with-aws-pass.sh apply"
  exit 0
fi

echo "# Import existing listeners into Terraform state. Run each line from $TERRAFORM_DIR (e.g. ./run-with-aws-pass.sh import ...):"
if [ -n "$listener_80_arn" ]; then
  echo "./run-with-aws-pass.sh import 'aws_lb_listener.http_redirect[0]' \"$listener_80_arn\""
fi
if [ -n "$listener_443_arn" ]; then
  echo "./run-with-aws-pass.sh import 'aws_lb_listener.https[0]' \"$listener_443_arn\""
fi
if [ -z "$listener_80_arn" ] && [ -z "$listener_443_arn" ]; then
  echo "# No port 80 or 443 listeners found on this ALB. Run: cd $TERRAFORM_DIR && ./run-with-aws-pass.sh apply"
fi
