#!/usr/bin/env bash
# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# Remove Ollama-related resources from Terraform state (they were removed from .tf files).
# Run with credentials for the SAME account as your state (e.g. via terraform/run-with-aws-pass.sh):
#   ./terraform/run-with-aws-pass.sh remove-stale-ollama-state
# Or from repo root after cd to env dir and loading creds:
#   TERRAFORM_DIR=$PWD/terraform/envs/aws4403 ./scripts/debug/remove-stale-ollama-state.sh
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
if [ -n "${TERRAFORM_DIR:-}" ] && [ -d "$TERRAFORM_DIR" ]; then
  cd "$TERRAFORM_DIR"
else
  cd "${REPO_ROOT}/terraform/envs/aws4403"
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
