#!/usr/bin/env bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
#
# Compare deployed OSCAL launch template AMI vs newest Image Factory EMR candidate.
# Exit 0 when drift is within threshold; exit 1 when deployed AMI is older than max age.
#
# Usage:
#   TERRAFORM_DIR=$PWD/terraform/envs/aws4403 ./scripts/check-ami-drift.sh
#   MAX_AMI_AGE_DAYS=7 ./scripts/check-ami-drift.sh
#
# AWS credentials: export AWS_* yourself, or rely on Pass (AWS_PASS_ENTRY, default AWS/AMS_4403-STG).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/ec2-common.sh disable=SC1091
source "$SCRIPT_DIR/lib/ec2-common.sh"
# shellcheck source=./lib/image-factory-emr-pattern.sh disable=SC1091
source "$SCRIPT_DIR/lib/image-factory-emr-pattern.sh"
MAX_AMI_AGE_DAYS="${MAX_AMI_AGE_DAYS:-7}"
REGION="${AWS_REGION:-us-east-1}"
ARCH="${INSTANCE_ARCHITECTURE:-x86_64}"

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
    echo "Error: AWS credentials not set. Export AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY or store in Pass entry '${AWS_PASS_ENTRY:-AWS/AMS_4403-STG}'." >&2
    exit 1
  fi
fi
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-${AWS_REGION:-us-east-1}}"

cd "$TERRAFORM_DIR"
REGION="$(terraform output -raw aws_region 2>/dev/null || echo "$REGION")"
DEPLOYED_AMI="$(terraform output -raw oscal_resolved_ami_id 2>/dev/null || true)"
DEPLOYED_NAME="$(terraform output -raw oscal_resolved_ami_name 2>/dev/null || true)"

if [ -z "$DEPLOYED_AMI" ]; then
  echo "Error: oscal_resolved_ami_id output is empty. Run terraform apply first." >&2
  exit 1
fi

LATEST_LINE="$(
  aws ec2 describe-images \
    --region "$REGION" \
    --executable-users self \
    --filters \
    "Name=architecture,Values=${ARCH}" \
    "Name=name,Values=${IMAGE_FACTORY_EMR_NAME_PATTERN}" \
    "Name=state,Values=available" \
    --query 'sort_by(Images,&CreationDate)[-1].[ImageId,Name,CreationDate]' \
    --output text 2>/dev/null || true
)"

if [ -z "$LATEST_LINE" ]; then
  echo "Error: Could not resolve latest EMR AMI (check AWS creds and Image Factory share to this account)." >&2
  exit 1
fi

read -r LATEST_AMI LATEST_NAME LATEST_CREATED <<< "$LATEST_LINE"

DEPLOYED_CREATED="$(
  aws ec2 describe-images \
    --image-ids "$DEPLOYED_AMI" \
    --region "$REGION" \
    --query 'Images[0].CreationDate' \
    --output text 2>/dev/null || echo ""
)"

echo "Deployed AMI:  $DEPLOYED_AMI ($DEPLOYED_NAME)"
echo "Latest EMR AMI: $LATEST_AMI ($LATEST_NAME)"
echo "Deployed created:  ${DEPLOYED_CREATED:-unknown}"
echo "Latest created:    ${LATEST_CREATED:-unknown}"

if [ "$DEPLOYED_AMI" = "$LATEST_AMI" ]; then
  echo "OK: Deployed AMI matches latest Image Factory EMR candidate."
  exit 0
fi

if [ -n "$DEPLOYED_CREATED" ] && [ "$DEPLOYED_CREATED" != "None" ]; then
  if command -v python3 >/dev/null 2>&1; then
    AGE_DAYS="$(
      python3 - <<PY
from datetime import datetime, timezone
deployed = datetime.fromisoformat("${DEPLOYED_CREATED}".replace("Z", "+00:00"))
age = (datetime.now(timezone.utc) - deployed).total_seconds() / 86400
print(int(age))
PY
    )"
    echo "Deployed AMI age: ${AGE_DAYS} day(s) (threshold: ${MAX_AMI_AGE_DAYS})"
    if [ "$AGE_DAYS" -gt "$MAX_AMI_AGE_DAYS" ]; then
      echo "FAIL: Deployed AMI is older than ${MAX_AMI_AGE_DAYS} days and differs from latest EMR build." >&2
      echo "Action: update terraform.tfvars / dynamic lookup, terraform apply, then ./scripts/oscal-staggered-ami-refresh.sh" >&2
      exit 1
    fi
  fi
fi

echo "WARN: Deployed AMI differs from latest EMR but is within age threshold (or age unknown)."
exit 0
