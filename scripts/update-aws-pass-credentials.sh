#!/usr/bin/env bash
# Prompt for pasted AWS credentials, parse them, and update the Pass entry.
# Credentials are read from stdin (paste then Ctrl+D); they are not written to disk.
#
# Usage:
#   ./scripts/update-aws-pass-credentials.sh
#   ./scripts/update-aws-pass-credentials.sh   # then paste 3 lines and press Ctrl+D
#
# Pass entry: AWS_PASS_ENTRY (default: AWS/AWS4379 Sandbox)
# Required: pass, gpg
# Format (paste exactly three lines):
#   aws_access_key_id=ASIA...
#   aws_secret_access_key=...
#   aws_session_token=...

set -e

ENTRY="${AWS_PASS_ENTRY:-AWS/AWS4379 Sandbox}"

command -v pass >/dev/null 2>&1 || { echo "Error: pass is required. Install: brew install pass" >&2; exit 1; }

echo "Pass entry to update: $ENTRY"
echo "Paste your AWS credentials (exactly 3 lines: aws_access_key_id, aws_secret_access_key, aws_session_token), then press Ctrl+D:"
echo ""

acc=''
sec=''
tok=''

while IFS= read -r line; do
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"
  [[ -z "$line" ]] && continue
  if [[ $line =~ ^aws_access_key_id=(.*)$ ]]; then
    acc="${BASH_REMATCH[1]}"
  elif [[ $line =~ ^aws_secret_access_key=(.*)$ ]]; then
    sec="${BASH_REMATCH[1]}"
  elif [[ $line == aws_session_token=* ]]; then
    tok="${line#aws_session_token=}"
  fi
done

if [[ -z "$acc" || -z "$sec" || -z "$tok" ]]; then
  echo "Error: Could not find all three credentials. Expected lines:" >&2
  echo "  aws_access_key_id=..." >&2
  echo "  aws_secret_access_key=..." >&2
  echo "  aws_session_token=..." >&2
  exit 1
fi

{
  echo "aws_access_key_id=$acc"
  echo "aws_secret_access_key=$sec"
  echo "aws_session_token=$tok"
} | pass insert -m "$ENTRY" --force

echo "Updated Pass entry: $ENTRY"
echo "Verify with: ./terraform/run-with-aws-pass.sh plan"
