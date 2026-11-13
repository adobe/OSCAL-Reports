#!/usr/bin/env bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
#
# Audit config.json on S3 or local path for secret storage shapes (no secret values printed).

set -euo pipefail

BUCKET="${S3_BUCKET:-ams-oscal-442277170733}"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"
PREFIXES="${CONFIG_AUDIT_PREFIXES:-config/active config/default config/green config/blue}"

usage() {
  cat <<EOF
Usage: $0 [--local PATH] [--bucket BUCKET] [--prefix PREFIX]

Reports storage shape for sensitive config paths (_sm, _pass, _cfgenc, plaintext, empty).
Does not print secret values.

Examples:
  $0 --local /opt/oscal/data/config.json
  $0 --bucket ams-oscal-442277170733
  AWS_DEFAULT_REGION=us-east-1 $0
EOF
}

audit_json() {
  local label="$1"
  local file="$2"
  if [ ! -f "$file" ] || [ ! -s "$file" ]; then
    echo "[$label] missing or empty"
    return 0
  fi
  echo "=== $label ==="
  node -e "
const fs=require('fs');
const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
const paths=[
  'messagingConfig.email.smtpPassword',
  'messagingConfig.slack.webhookUrl',
  'aiConfig.apiToken',
  'aiConfig.awsAccessKeyId',
  'aiConfig.awsSecretAccessKey',
  'ssoConfig.oauth.providers.okta.clientSecret',
  'ssoConfig.oauth.providers.Generic_OIDC.clientSecret',
  'databaseConfig.password'
];
function shape(v){
  if(v==null) return 'empty';
  if(typeof v==='string'){ const t=v.trim(); if(!t) return 'empty'; if(t==='********') return 'masked'; return 'PLAINTEXT'; }
  if(v._sm) return '_sm';
  if(v._pass) return '_pass';
  if(v._cfgenc) return '_cfgenc';
  return 'other';
}
let bad=0;
for(const p of paths){
  let v=c; for(const k of p.split('.')) v=v?.[k];
  const s=shape(v);
  if(s==='PLAINTEXT') bad++;
  console.log('  '+p+': '+s);
}
if(bad>0) console.log('  WARNING: '+bad+' plaintext secret(s) detected');
" "$file"
}

LOCAL_PATH=""
CUSTOM_BUCKET=""

while [ $# -gt 0 ]; do
  case "$1" in
    --local) LOCAL_PATH="$2"; shift 2 ;;
    --bucket) CUSTOM_BUCKET="$2"; shift 2 ;;
    --prefix) PREFIXES="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

if [ -n "$LOCAL_PATH" ]; then
  audit_json "local:$LOCAL_PATH" "$LOCAL_PATH"
  exit 0
fi

[ -n "$CUSTOM_BUCKET" ] && BUCKET="$CUSTOM_BUCKET"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

for prefix in $PREFIXES; do
  key="${prefix}/config.json"
  dest="$tmp/$(echo "$prefix" | tr '/' '_').json"
  if aws s3 cp "s3://${BUCKET}/${key}" "$dest" --region "$REGION" --quiet 2>/dev/null; then
    audit_json "s3://${BUCKET}/${key}" "$dest"
  else
    echo "=== s3://${BUCKET}/${key} ==="
    echo "  (not found)"
  fi
done
