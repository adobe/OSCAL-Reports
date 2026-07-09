#!/usr/bin/env bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
#
# One-time local Git remote migration to adobe/OSCAL-Reports.
# Usage: ./scripts/git/migrate-remote-to-adobe.sh [--push]
#
# Without --push: only reconfigures remotes locally.
# With --push: also pushes Quality and other local branches to origin.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

ORIGIN_URL="https://github.com/adobe/OSCAL-Reports.git"
DO_PUSH=false

for arg in "$@"; do
  case "${arg}" in
    --push) DO_PUSH=true ;;
    -h|--help)
      echo "Usage: $0 [--push]"
      exit 0
      ;;
    *)
      echo "Unknown argument: ${arg}" >&2
      exit 1
      ;;
  esac
done

echo "=== OSCAL Reports: migrate to adobe/OSCAL-Reports ==="
echo "Repository root: ${REPO_ROOT}"
echo ""

git config user.name "Mukesh Kesharwani"
git config user.email "mukesh.kesharwani@adobe.com"

for legacy in adobe personal all; do
  if git remote get-url "${legacy}" >/dev/null 2>&1; then
    echo "Removing legacy remote: ${legacy}"
    git remote remove "${legacy}"
  fi
done

if git remote get-url origin >/dev/null 2>&1; then
  current="$(git remote get-url origin)"
  if [ "${current}" != "${ORIGIN_URL}" ]; then
    echo "Updating origin: ${current} -> ${ORIGIN_URL}"
    git remote set-url origin "${ORIGIN_URL}"
  else
    echo "origin already set to ${ORIGIN_URL}"
  fi
else
  echo "Adding origin: ${ORIGIN_URL}"
  git remote add origin "${ORIGIN_URL}"
fi

echo ""
echo "Current remotes:"
git remote -v

if [ "${DO_PUSH}" = true ]; then
  echo ""
  echo "Pushing branches to origin (requires mkesharw_adobe auth)..."
  current_branch="$(git branch --show-current)"
  git push -u origin "${current_branch}"
  for branch in Quality Pre_Prod main Development Prod; do
    if git show-ref --verify --quiet "refs/heads/${branch}"; then
      git push origin "${branch}" || echo "Warning: push failed for ${branch}"
    fi
  done
  git push origin --tags 2>/dev/null || echo "Warning: tag push failed or no tags"
  echo "Push complete."
else
  echo ""
  echo "Local remotes updated. Run with --push to push branches after verifying GitHub access."
  echo "Manual GitHub UI steps: branch protection on Quality/Pre_Prod/main, migrate Actions secrets, set default branch to Quality."
fi
