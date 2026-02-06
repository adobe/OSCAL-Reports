#!/bin/bash
# Sync consolidate-users.sh to Blue, Green (and optional other) script folders
# so you can check in the same script from Local and deploy to Blue/Green.
# Author: Mukesh Kesharwani
#
# Usage:
#   From repo root (OSCAL_Reports):
#     ./scripts/sync-consolidation-script.sh
#
#   With custom paths (e.g. NAS mounted or different server paths):
#     BLUE_SCRIPTS_DIR=/mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue/scripts \
#     GREEN_SCRIPTS_DIR=/mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green/scripts \
#     ./scripts/sync-consolidation-script.sh
#
# Environment (optional):
#   BLUE_SCRIPTS_DIR   Target scripts dir for Blue (default below)
#   GREEN_SCRIPTS_DIR  Target scripts dir for Green (default below)

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$REPO_ROOT/scripts/consolidate-users.sh"

# Default paths (override with env if your Blue/Green are elsewhere)
BLUE_SCRIPTS_DIR="${BLUE_SCRIPTS_DIR:-/mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue/scripts}"
GREEN_SCRIPTS_DIR="${GREEN_SCRIPTS_DIR:-/mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green/scripts}"

if [ ! -f "$SOURCE" ]; then
  echo "Error: Source script not found: $SOURCE"
  exit 1
fi

echo "Source: $SOURCE"
echo ""

copied=0

# Blue
if [ -d "$BLUE_SCRIPTS_DIR" ]; then
  cp "$SOURCE" "$BLUE_SCRIPTS_DIR/consolidate-users.sh"
  chmod +x "$BLUE_SCRIPTS_DIR/consolidate-users.sh"
  echo "  ✓ Blue: $BLUE_SCRIPTS_DIR/consolidate-users.sh"
  copied=$((copied + 1))
else
  echo "  ⊘ Blue: $BLUE_SCRIPTS_DIR (directory not found, skipped)"
fi

# Green
if [ -d "$GREEN_SCRIPTS_DIR" ]; then
  cp "$SOURCE" "$GREEN_SCRIPTS_DIR/consolidate-users.sh"
  chmod +x "$GREEN_SCRIPTS_DIR/consolidate-users.sh"
  echo "  ✓ Green: $GREEN_SCRIPTS_DIR/consolidate-users.sh"
  copied=$((copied + 1))
else
  echo "  ⊘ Green: $GREEN_SCRIPTS_DIR (directory not found, skipped)"
fi

echo ""
if [ "$copied" -eq 0 ]; then
  echo "No target directories found. Set BLUE_SCRIPTS_DIR and GREEN_SCRIPTS_DIR if Blue/Green are in different paths."
  echo "Example: BLUE_SCRIPTS_DIR=/path/to/Blue/scripts GREEN_SCRIPTS_DIR=/path/to/Green/scripts $0"
  exit 0
fi
echo "Synced to $copied place(s). You can now check in from Blue/Green repos or pull from main repo."
