#!/usr/bin/env bash
# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# Deprecated wrapper: use ff-sync-adobe-from-personal-quality.sh with ADOBE_TARGET_BRANCH=Pre_Prod.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export ADOBE_TARGET_BRANCH="${ADOBE_TARGET_BRANCH:-Pre_Prod}"
exec "${SCRIPT_DIR}/ff-sync-adobe-from-personal-quality.sh"
