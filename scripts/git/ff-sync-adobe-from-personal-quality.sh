#!/usr/bin/env bash
# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# Fast-forward an Adobe branch to match personal repo branch Quality (read-only fetch).
# Intended for GitHub Actions on AdobeManagedServices/OSCAL-Reports.
#
# Requires: run from repo root; PERSONAL_REPO_READ_TOKEN set.
# Env:
#   ADOBE_TARGET_BRANCH  — Adobe branch to update (default: Quality)
#   PERSONAL_BRANCH      — personal source branch (default: Quality)
#   PERSONAL_REPO_FULL_NAME — default keekar2022/OSCAL-Reports
set -euo pipefail

ADOBE_TARGET_BRANCH="${ADOBE_TARGET_BRANCH:-Quality}"
PERSONAL_BRANCH="${PERSONAL_BRANCH:-Quality}"
PERSONAL_REPO_FULL_NAME="${PERSONAL_REPO_FULL_NAME:-keekar2022/OSCAL-Reports}"

if [ -z "${PERSONAL_REPO_READ_TOKEN:-}" ]; then
	echo "PERSONAL_REPO_READ_TOKEN is required (GitHub Actions secret or local: export before running)." >&2
	echo "Example: export PERSONAL_REPO_READ_TOKEN='…'  # read token for ${PERSONAL_REPO_FULL_NAME} branch ${PERSONAL_BRANCH}" >&2
	exit 1
fi

git remote remove personal 2>/dev/null || true
git remote add personal "https://x-access-token:${PERSONAL_REPO_READ_TOKEN}@github.com/${PERSONAL_REPO_FULL_NAME}.git"
git fetch personal "${PERSONAL_BRANCH}"

if git show-ref --verify --quiet "refs/heads/${ADOBE_TARGET_BRANCH}"; then
	git checkout "${ADOBE_TARGET_BRANCH}"
	git merge --ff-only "personal/${PERSONAL_BRANCH}"
else
	echo "Adobe branch ${ADOBE_TARGET_BRANCH} does not exist locally; creating from personal/${PERSONAL_BRANCH}"
	git checkout -B "${ADOBE_TARGET_BRANCH}" "personal/${PERSONAL_BRANCH}"
fi
