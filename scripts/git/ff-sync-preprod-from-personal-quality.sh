#!/usr/bin/env bash
# Fast-forward local Pre_Prod to match personal repo branch Quality (read-only fetch).
# Intended for GitHub Actions on AdobeManagedServices/OSCAL-Reports (one-click sync).
# Requires: run from repo root with Pre_Prod checked out; PERSONAL_REPO_READ_TOKEN set.
set -euo pipefail

PERSONAL_REPO_FULL_NAME="${PERSONAL_REPO_FULL_NAME:-keekar2022/OSCAL-Reports}"
PERSONAL_BRANCH="${PERSONAL_BRANCH:-Quality}"

if [ -z "${PERSONAL_REPO_READ_TOKEN:-}" ]; then
	echo "PERSONAL_REPO_READ_TOKEN is required" >&2
	exit 1
fi

current_branch="$(git branch --show-current)"
if [ "$current_branch" != "Pre_Prod" ]; then
	echo "Expected current branch Pre_Prod, got: $current_branch" >&2
	exit 1
fi

git remote remove personal 2>/dev/null || true
# Token is not echoed; GitHub Actions masks secrets in logs.
git remote add personal "https://x-access-token:${PERSONAL_REPO_READ_TOKEN}@github.com/${PERSONAL_REPO_FULL_NAME}.git"
git fetch personal "$PERSONAL_BRANCH"
git merge --ff-only FETCH_HEAD
