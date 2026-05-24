#!/usr/bin/env bash
# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# Import the existing ALB port-80 listener into Terraform state as aws_lb_listener.http_redirect[0].
# Use this when Terraform apply fails with "DuplicateListener: A listener already exists on this port"
# (e.g. after enabling HTTPS: the old HTTP listener still exists and Terraform tries to create the redirect listener).
#
# Run from repo root. Uses AWS credentials from Pass (AWS/AMS_4403-STG) or env.
#
# Usage: ./scripts/debug/import-alb-http-redirect-listener.sh
#   TERRAFORM_DIR=$PWD/terraform/envs/aws4403 ./scripts/debug/import-alb-http-redirect-listener.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source=./lib/ec2-common.sh disable=SC1091
source "$SCRIPT_DIR/lib/ec2-common.sh"

TERRAFORM_DIR="${TERRAFORM_DIR:-$REPO_ROOT/terraform/envs/aws4403}"
AWS_PASS_ENTRY="${AWS_PASS_ENTRY:-AWS/AMS_4403-STG}"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'
print_ok() { echo -e "${GREEN}✓${NC} $1"; }
print_fail() { echo -e "${RED}✗${NC} $1"; }

[ -d "$TERRAFORM_DIR" ] && [ -f "$TERRAFORM_DIR/terraform.tfstate" ] || { print_fail "Terraform state not found at $TERRAFORM_DIR"; exit 1; }
load_aws_from_pass || { print_fail "AWS credentials not set and Pass entry '$AWS_PASS_ENTRY' not found."; exit 1; }
command -v aws >/dev/null 2>&1 || { print_fail "AWS CLI (aws) not found."; exit 1; }

region=$(cd "$TERRAFORM_DIR" && terraform output -raw aws_region 2>/dev/null) || region="us-east-1"
alb_arn=$(cd "$TERRAFORM_DIR" && terraform output -raw alb_arn 2>/dev/null) || true
if [ -z "$alb_arn" ] || [ "$alb_arn" = "None" ]; then
  alb_dns=$(cd "$TERRAFORM_DIR" && terraform output -raw alb_dns_name 2>/dev/null) || true
  [ -n "$alb_dns" ] || { print_fail "Could not get alb_arn or alb_dns_name from Terraform."; exit 1; }
  alb_arn=$(aws elbv2 describe-load-balancers --region "$region" --query "LoadBalancers[?DNSName=='$alb_dns'].LoadBalancerArn" --output text 2>/dev/null) || true
fi
[ -n "$alb_arn" ] && [ "$alb_arn" != "None" ] || { print_fail "Could not determine ALB ARN."; exit 1; }

listener_arn=$(aws elbv2 describe-listeners --load-balancer-arn "$alb_arn" --region "$region" --query "Listeners[?Port==\`80\`].ListenerArn" --output text 2>/dev/null) || true
if [ -z "$listener_arn" ] || [ "$listener_arn" = "None" ]; then
  print_fail "No listener on port 80 found for ALB $alb_arn"
  exit 1
fi

echo "Importing port-80 listener into Terraform state as aws_lb_listener.http_redirect[0]..."
(cd "$TERRAFORM_DIR" && terraform import 'aws_lb_listener.http_redirect[0]' "$listener_arn")
print_ok "Import complete. Run 'terraform plan' from $TERRAFORM_DIR to confirm; then 'terraform apply' if needed."
