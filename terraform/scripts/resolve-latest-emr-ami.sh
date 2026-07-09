#!/usr/bin/env bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
#
# Terraform external data source: resolve newest launchable Image Factory EMR AMI
# in the current AWS account (shared AMIs via --executable-users self).
# Usage: echo '{"region":"us-east-1","architecture":"x86_64"}' | ./resolve-latest-emr-ami.sh
set -euo pipefail

if ! command -v aws >/dev/null 2>&1; then
  echo '{"ami_id":"","ami_name":"","creation_date":"","error":"aws CLI not found"}'
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  echo '{"ami_id":"","ami_name":"","creation_date":"","error":"jq not found"}'
  exit 0
fi

QUERY_JSON="$(cat)"
REGION="$(echo "$QUERY_JSON" | jq -r '.region // "us-east-1"')"
ARCH="$(echo "$QUERY_JSON" | jq -r '.architecture // "x86_64"')"

set +e
RESULT="$(
  aws ec2 describe-images \
    --region "${REGION}" \
    --executable-users self \
    --filters \
    "Name=architecture,Values=${ARCH}" \
    "Name=name,Values=*Amazon*Linux*2023*EMR*,*amazon*linux*2023*emr*" \
    "Name=state,Values=available" \
    --query 'sort_by(Images,&CreationDate)[-1].[ImageId,Name,CreationDate]' \
    --output json 2>/dev/null
)"
AWS_EXIT=$?
set -e

if [ "$AWS_EXIT" -ne 0 ] || [ -z "$RESULT" ] || [ "$RESULT" = "null" ]; then
  echo '{"ami_id":"","ami_name":"","creation_date":"","error":"no EMR AMI found (check AWS creds and Image Factory share)"}'
  exit 0
fi

AMI_ID="$(echo "$RESULT" | jq -r '.[0] // empty')"
AMI_NAME="$(echo "$RESULT" | jq -r '.[1] // empty')"
CREATION_DATE="$(echo "$RESULT" | jq -r '.[2] // empty')"

if [ -z "$AMI_ID" ] || [ "$AMI_ID" = "null" ]; then
  echo '{"ami_id":"","ami_name":"","creation_date":"","error":"no EMR AMI matched filters"}'
  exit 0
fi

jq -n \
  --arg ami_id "$AMI_ID" \
  --arg ami_name "$AMI_NAME" \
  --arg creation_date "$CREATION_DATE" \
  '{ami_id: $ami_id, ami_name: $ami_name, creation_date: $creation_date, error: ""}'
