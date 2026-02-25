#!/bin/bash
# Restore Blue instance config and users after accidental rollback/wipe
#
# Run this ON the host where Blue runs (e.g. 192.168.1.200), from the Blue
# deployment directory (the repo root that contains scripts/ and data-blue/).
#
# Usage:
#   ./scripts/debug/restore-blue-config.sh --from-backup   # Restore from latest deploy backup
#   ./scripts/debug/restore-blue-config.sh --from-green    # Copy config/users from Green to Blue
#
# Author: OSCAL Reports project
# License: GPL-3.0-or-later

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC}  $1"; }
print_info() { echo -e "${CYAN}ℹ${NC}  $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && cd .. && pwd)"
cd "$SCRIPT_DIR"

BACKUPS_BASE="${SCRIPT_DIR}/backups"
DATA_BLUE="${SCRIPT_DIR}/data-blue"
DATA_GREEN="${SCRIPT_DIR}/data-green"
CONTAINER_BLUE="oscal-report-generator-blue"
BLUE_PORT="3020"

usage() {
  echo "Usage: $0 --from-backup | --from-green"
  echo ""
  echo "  --from-backup   Restore Blue from the most recent deploy backup"
  echo "                 (looks in $BACKUPS_BASE)"
  echo "  --from-green    Copy config.json and users.json from Green to Blue"
  echo "                 (requires Green volume at $DATA_GREEN)"
  echo ""
  echo "Run from the Blue deployment directory on the host (e.g. 192.168.1.200)."
  exit 1
}

FROM_BACKUP=false
FROM_GREEN=false
for arg in "$@"; do
  case "$arg" in
    --from-backup)  FROM_BACKUP=true ;;
    --from-green)   FROM_GREEN=true ;;
    -h|--help)      usage ;;
    *)              echo "Unknown option: $arg"; usage ;;
  esac
done

if [ "$FROM_BACKUP" = false ] && [ "$FROM_GREEN" = false ]; then
  echo "Specify --from-backup or --from-green"
  usage
fi

if [ "$FROM_BACKUP" = true ] && [ "$FROM_GREEN" = true ]; then
  echo "Specify only one: --from-backup or --from-green"
  usage
fi

# Ensure Blue data dir exists
mkdir -p "$DATA_BLUE"

# Backup current (wiped) state before overwriting
SAVE_DIR="$HOME/oscal-blue-recovery-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$SAVE_DIR"
if [ -f "$DATA_BLUE/config.json" ]; then
  cp -a "$DATA_BLUE/config.json" "$SAVE_DIR/" 2>/dev/null || true
fi
if [ -f "$DATA_BLUE/users.json" ]; then
  cp -a "$DATA_BLUE/users.json" "$SAVE_DIR/" 2>/dev/null || true
fi
print_info "Current Blue data saved under $SAVE_DIR (in case you need to revert)"

if [ "$FROM_BACKUP" = true ]; then
  # Find latest backup dir (by mtime) that has a volume tarball
  if [ ! -d "$BACKUPS_BASE" ]; then
    print_error "No backups directory found: $BACKUPS_BASE"
    echo "  Deploy backups are created when you run scripts/deploy_from_dockerhub.sh from the Blue directory."
    exit 1
  fi

  # Prefer: data-volume > legacy-config > volume (legacy name)
  LATEST_TAR=""
  for tarball in data-volume-backup.tar.gz legacy-config-backup.tar.gz volume-backup.tar.gz; do
    for f in "$BACKUPS_BASE"/dockerhub-deploy-*/"$tarball"; do
      [ -f "$f" ] || continue
      if [ -z "$LATEST_TAR" ] || [ "$f" -nt "$LATEST_TAR" ]; then
        LATEST_TAR="$f"
      fi
    done
  done

  if [ -z "$LATEST_TAR" ] || [ ! -f "$LATEST_TAR" ]; then
    print_error "No deploy backup tarball found under $BACKUPS_BASE"
    echo "  Look for: backups/dockerhub-deploy-YYYYMMDD-HHMMSS/data-volume-backup.tar.gz"
    echo "  Use --from-green if Green has good config/users on this host."
    exit 1
  fi

  print_info "Restoring from: $LATEST_TAR"
  if tar -xzf "$LATEST_TAR" -C "$DATA_BLUE" 2>/dev/null; then
    print_success "Restored config and users into $DATA_BLUE"
  else
    print_error "Failed to extract backup"
    exit 1
  fi
fi

if [ "$FROM_GREEN" = true ]; then
  if [ ! -f "$DATA_GREEN/config.json" ] && [ ! -f "$DATA_GREEN/users.json" ]; then
    print_error "Green data not found at $DATA_GREEN (need config.json and/or users.json)"
    echo "  If Green runs on this host, ensure data-green exists and has the files."
    exit 1
  fi
  if [ -f "$DATA_GREEN/config.json" ]; then
    cp -a "$DATA_GREEN/config.json" "$DATA_BLUE/"
    print_success "Copied config.json from Green to Blue"
  fi
  if [ -f "$DATA_GREEN/users.json" ]; then
    cp -a "$DATA_GREEN/users.json" "$DATA_BLUE/"
    print_success "Copied users.json from Green to Blue"
  fi
fi

# Restart Blue container so it loads the restored data
print_info "Restarting Blue container..."
if docker restart "$CONTAINER_BLUE" 2>/dev/null; then
  print_success "Container $CONTAINER_BLUE restarted"
else
  print_warning "Could not restart container (is Docker available?). Restart manually:"
  echo "  docker restart $CONTAINER_BLUE"
fi

echo ""
print_success "Blue recovery complete. Verify at http://192.168.1.200:${BLUE_PORT} or https://blue.oscal.keekar.com"
echo "  - Log in with an existing user"
echo "  - Check Admin → Configuration and user list"
echo ""
