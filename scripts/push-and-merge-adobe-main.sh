#!/usr/bin/env bash
# Push Development to Adobe remote and merge into main on Adobe repo.
# Run this on your machine where the Adobe SSH key is configured (e.g. github.com-adobe).
# Usage: ./scripts/push-and-merge-adobe-main.sh

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Ensure Adobe Git user for correct attribution
git config user.name "Mukesh Kesharwani"
git config user.email "mukesh.kesharwani@adobe.com"

echo "Pushing Development to adobe..."
git push adobe Development

echo "Fetching adobe..."
git fetch adobe

# Ensure local main exists and tracks adobe/main
if ! git rev-parse --verify main &>/dev/null; then
  echo "Creating local main from adobe/main..."
  git branch main adobe/main
fi

git checkout main
# Update local main from remote
git merge adobe/main --no-edit 2>/dev/null || true

echo "Merging Development into main..."
git merge Development --no-edit

echo "Pushing main to adobe..."
git push adobe main

echo "Switching back to Development..."
git checkout Development

echo "Done. Development pushed and merged into main on Adobe repo."
