#!/usr/bin/env bash
# List EC2 AMIs you can launch in the current account that look like Amazon Linux 2023 EMR
# (Image Factory naming). Use after AWS credentials are active (e.g. run-with-aws-pass / SSO).
#
# Usage: ./list-emr-candidate-amis.sh [region] [architecture]
# Example: ./list-emr-candidate-amis.sh us-east-1 x86_64
#
# Pick the newest row that matches the "Amazon Linux 2023 EMR" build from Image Factory UI,
# then set image_factory_amazon_linux_ami_us_east_1 (or oscal_ami_id) in terraform.tfvars.
set -euo pipefail

REGION="${1:-us-east-1}"
ARCH="${2:-x86_64}"

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI not found; install AWS CLI v2." >&2
  exit 1
fi

echo "Region: ${REGION}  Architecture: ${ARCH}" >&2
echo "AMIs launchable in this account (shared or owned) with name matching *Amazon*Linux*2023*EMR* ..." >&2
echo >&2

aws ec2 describe-images \
  --region "${REGION}" \
  --executable-users self \
  --filters \
  "Name=architecture,Values=${ARCH}" \
  "Name=name,Values=*Amazon*Linux*2023*EMR*,*amazon*linux*2023*emr*" \
  "Name=state,Values=available" \
  --query 'sort_by(Images,&CreationDate)[-25:].[ImageId,Name,CreationDate,ImageOwnerAlias]' \
  --output table

echo >&2
echo "If empty, confirm org/flavor in Image Factory UI or widen the name pattern in this script." >&2
