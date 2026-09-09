#!/usr/bin/env bash
# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# Push Development to origin and merge into main on adobe/OSCAL-Reports.
# Usage: ./scripts/push-and-merge-main.sh

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

git config user.name "Mukesh Kesharwani"
git config user.email "mukesh.kesharwani@adobe.com"

echo "Pushing Development to origin..."
git push origin Development

echo "Fetching origin..."
git fetch origin

if ! git rev-parse --verify main &>/dev/null; then
  echo "Creating local main from origin/main..."
  git branch main origin/main
fi

git checkout main
git merge origin/main --no-edit 2>/dev/null || true

echo "Merging Development into main..."
git merge Development --no-edit

echo "Pushing main to origin..."
git push origin main

echo "Switching back to Development..."
git checkout Development

echo "Done. Development pushed and merged into main on adobe/OSCAL-Reports."
