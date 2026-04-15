#!/usr/bin/env bash
# List resources that depend on an AWS security group (ENIs and optionally other SGs).
# Use when Terraform fails with DependencyViolation deleting an SG.
# Requires: AWS CLI, credentials configured (e.g. via Pass or AWS_PROFILE).
#
# Usage: ./scripts/debug/terraform-find-sg-dependencies.sh SG_ID [REGION]
# Example: ./scripts/debug/terraform-find-sg-dependencies.sh sg-0c7ef7d9fd21a63d6 us-east-1

set -e

SG_ID="${1:?Usage: $0 SG_ID [REGION]}"
REGION="${2:-us-east-1}"

if [[ ! "$SG_ID" =~ ^sg-[a-f0-9]+$ ]]; then
  echo "Error: SG_ID must match sg-xxxxxxxx (e.g. sg-0c7ef7d9fd21a63d6)" >&2
  exit 1
fi

echo "Security group: $SG_ID (region: $REGION)"
echo "---"
echo "1. Network interfaces using this SG:"
ENI_OUT=$(aws ec2 describe-network-interfaces \
  --filters "Name=group-id,Values=$SG_ID" \
  --region "$REGION" \
  --query 'NetworkInterfaces[*].{ENI:NetworkInterfaceId,Description:Description,Status:Status,InstanceId:Attachment.InstanceId}' \
  --output table 2>&1) || true
if [[ -n "$ENI_OUT" && "$ENI_OUT" != *"error"* && "$ENI_OUT" != *"Error"* && "$ENI_OUT" != *"Unable"* ]]; then
  if [[ "$ENI_OUT" == *"NetworkInterfaceId"* || "$ENI_OUT" == *"eni-"* ]]; then
    echo "$ENI_OUT"
  else
    echo "(none found)"
  fi
else
  echo "(none found)"
  if [[ "$ENI_OUT" == *"error"* || "$ENI_OUT" == *"Error"* || "$ENI_OUT" == *"Unable"* ]]; then
    echo "   AWS error: $ENI_OUT" >&2
  fi
fi

echo ""
echo "2. Other security groups that reference this SG (inbound or outbound rules):"
# SGs that have an inbound rule referencing this SG
REF_IN=$(aws ec2 describe-security-groups --region "$REGION" \
  --filters "Name=ip-permission.group-id,Values=$SG_ID" \
  --query 'SecurityGroups[*].{GroupId:GroupId,GroupName:GroupName}' \
  --output text 2>&1) || true
# SGs that have an outbound rule referencing this SG
REF_OUT=$(aws ec2 describe-security-groups --region "$REGION" \
  --filters "Name=egress.ip-permission.group-id,Values=$SG_ID" \
  --query 'SecurityGroups[*].{GroupId:GroupId,GroupName:GroupName}' \
  --output text 2>&1) || true
REF_SGS=$(echo "$REF_IN" "$REF_OUT" | tr ' \n' '\n' | sort -u)
if [[ -n "$REF_SGS" && "$REF_SGS" != *"error"* && "$REF_SGS" != *"Unable"* ]]; then
  echo "$REF_SGS"
  echo "   Fix: In AWS Console (EC2 -> Security Groups), edit those SGs and remove rules that reference $SG_ID, then re-run terraform apply."
else
  echo "(none found)"
  if [[ "$REF_IN" == *"error"* || "$REF_IN" == *"Error"* || "$REF_IN" == *"Unable"* ]]; then
    echo "   AWS output: $REF_IN" >&2
  fi
fi

echo ""
echo "If nothing is listed but Terraform still fails with DependencyViolation, wait a few minutes (ENI cleanup after instance terminate) and run terraform apply again, or check the SG in AWS Console -> EC2 -> Security Groups -> $SG_ID -> In use by."
