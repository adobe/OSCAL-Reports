#!/usr/bin/env bash
# Remove Ollama-related resources from Terraform state (they were removed from .tf files).
# Run from repo root with credentials for the SAME account as your state (e.g. AWS/AWS4379 Sandbox for account 432417415905):
#   ./terraform/run-with-aws-pass.sh -chdir=terraform state list
#   ./terraform/remove-stale-ollama-state.sh
# Or from terraform dir after loading creds: ./remove-stale-ollama-state.sh
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
if [ -n "${TERRAFORM_DIR:-}" ]; then
  cd "$TERRAFORM_DIR"
fi

echo "Listing state resources that contain 'ollama' or 'ollama_activity'..."
list="$(terraform state list 2>/dev/null | grep -iE 'ollama|ollama_activity' || true)"
if [ -z "$list" ]; then
  echo "No matching state entries found. Nothing to remove."
  exit 0
fi

count=0
while IFS= read -r addr; do
  [ -z "$addr" ] && continue
  echo "Removing from state: $addr"
  terraform state rm "$addr" || { echo "Warning: failed to rm $addr" >&2; }
  count=$((count + 1))
done <<< "$list"

echo "Removed $count state entry/entries. Run: ./terraform/run-with-aws-pass.sh plan"
