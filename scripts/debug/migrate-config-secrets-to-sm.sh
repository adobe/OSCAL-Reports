#!/usr/bin/env bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
#
# Migrate EC2 config.json plaintext / _pass secrets into AWS Secrets Manager and rewrite _sm pointers.
# Usage:
#   On instance: sudo -u svc_ams-oscal env OSCAL_SECRETS_MODE=aws-sm OSCAL_SECRETS_MANAGER_ARN=arn:... \
#     CONFIG_PATH=/opt/oscal/data/config.json /opt/oscal/app/backend/scripts/migrate-config-to-sm.mjs
#   From laptop (Green): ./scripts/debug/migrate-config-secrets-to-sm.sh green
#   From laptop (Blue):  ./scripts/debug/migrate-config-secrets-to-sm.sh blue

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source=../lib/ec2-common.sh disable=SC1091
source "$SCRIPT_DIR/../lib/ec2-common.sh"

SSH_USER="${SSH_USER:-ec2-user}"
SVC_USER="${SVC_USER:-svc_ams-oscal}"
ROLE="${1:-green}"
TERRAFORM_DIR="${TERRAFORM_DIR:-$REPO_ROOT/terraform/envs/aws4403}"

if [ "$ROLE" != "green" ] && [ "$ROLE" != "blue" ]; then
  echo "Usage: $0 [green|blue]" >&2
  exit 1
fi

get_sm_arn() {
  if [ -x "$REPO_ROOT/terraform/run-with-aws-pass.sh" ]; then
    TERRAFORM_DIR="$TERRAFORM_DIR" "$REPO_ROOT/terraform/run-with-aws-pass.sh" output -raw oscal_pass_secrets_sync_secret_arn 2>/dev/null || true
  fi
}

SM_ARN="$(get_sm_arn)"
SM_ARN="$(printf '%s' "$SM_ARN" | tr -d '\r\n')"
if [ -z "$SM_ARN" ] || [ "$SM_ARN" = "null" ]; then
  echo "Could not read oscal_pass_secrets_sync_secret_arn from Terraform." >&2
  exit 1
fi

if [ "$ROLE" = "green" ]; then
  IP="${GREEN_IP:-}"
  if [ -z "$IP" ] && [ -x "$REPO_ROOT/terraform/run-with-aws-pass.sh" ]; then
    IP=$(TERRAFORM_DIR="$TERRAFORM_DIR" "$REPO_ROOT/terraform/run-with-aws-pass.sh" output -raw oscal_green_public_ip 2>/dev/null || true)
  fi
else
  IP="${BLUE_IP:-}"
  if [ -z "$IP" ] && [ -x "$REPO_ROOT/terraform/run-with-aws-pass.sh" ]; then
    IP=$(TERRAFORM_DIR="$TERRAFORM_DIR" "$REPO_ROOT/terraform/run-with-aws-pass.sh" output -raw oscal_blue_public_ip 2>/dev/null || true)
  fi
fi

if [ -z "$IP" ] || [ "$IP" = "null" ]; then
  echo "Could not resolve IP for role $ROLE (set GREEN_IP/BLUE_IP or Terraform outputs)." >&2
  exit 1
fi

KEY="$(resolve_ssh_key)"
echo "Migrating secrets on $ROLE ($IP) → SM ARN (truncated): ${SM_ARN:0:40}..."

ssh -i "$KEY" -o StrictHostKeyChecking=no "${SSH_USER}@${IP}" \
  "sudo -u $SVC_USER env OSCAL_SECRETS_MODE=aws-sm OSCAL_SECRETS_MANAGER_ARN='${SM_ARN}' CONFIG_PATH=/opt/oscal/data/config.json AWS_DEFAULT_REGION=\${AWS_DEFAULT_REGION:-us-east-1} node /opt/oscal/app/backend/scripts/migrate-config-to-sm.mjs"

echo "Done. Verify: jq 'paths with _sm' on /opt/oscal/data/config.json and test Okta sign-in."
