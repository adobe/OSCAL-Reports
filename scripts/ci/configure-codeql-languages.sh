#!/usr/bin/env bash
# Configure Adobe repo CodeQL default setup: JavaScript/TypeScript only (Node.js project).
# Requires repo admin / code-security permissions on adobe/OSCAL-Reports.
#
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
set -euo pipefail

REPO="${1:-adobe/OSCAL-Reports}"

echo "Updating CodeQL default setup for ${REPO} (javascript-typescript only)..."
gh api --method PATCH "repos/${REPO}/code-scanning/default-setup" \
  -f state=configured \
  -f query_suite=default \
  -F 'languages[]=javascript-typescript'

echo "Done. Re-run failed PR checks or push a commit to trigger CodeQL."
