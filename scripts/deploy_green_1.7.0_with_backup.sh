#!/bin/bash
#
# Deploy v1.7.0 to Green instance on nas.keekar.com with config/users backup and restore.
# Run this ON the NAS in the Green app directory:
#   mkesharw@NAS01:/mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green$
#   ./scripts/deploy_green_1.7.0_with_backup.sh
#
# Steps:
#   1. Backup config/app and data volume (users + config) to a timestamped directory
#   2. Fetch origin and checkout Development (1.7.0)
#   3. Run build_on_truenas.sh --no-pull --skip-persistence-check
#   4. On success: restore config and users from backup
#   5. On failure: print restore instructions
#
# Prerequisites:
#   - Run from repo root (the Green directory)
#   - Push Development branch with 1.7.0 to remote first

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC}  $1"; }
print_info() { echo -e "${CYAN}ℹ${NC}  $1"; }
print_header() {
  echo ""
  echo -e "${CYAN}========================================${NC}"
  echo -e "${CYAN}$1${NC}"
  echo -e "${CYAN}========================================${NC}"
  echo ""
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

BACKUP_TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="${REPO_ROOT}/backups/pre-1.7.0-deploy-${BACKUP_TIMESTAMP}"

CONFIG_APP="${REPO_ROOT}/config/app"
DATA_VOLUME_GREEN="${REPO_ROOT}/data-green"

# -----------------------------------------------------------------------------
# 1. Backup config and users
# -----------------------------------------------------------------------------
print_header "📦 Step 1: Backup config and users"

mkdir -p "$BACKUP_DIR"
mkdir -p "$BACKUP_DIR/config_app"
# shellcheck disable=SC2034
BACKED_UP=0

if [ -d "$CONFIG_APP" ]; then
  for f in users.json config.json email_blacklist.json rate_limit.json okta_oidc_state.json; do
    if [ -f "${CONFIG_APP}/${f}" ]; then
      cp "${CONFIG_APP}/${f}" "$BACKUP_DIR/config_app/"
      print_success "Backed up config/app/${f}"
      # shellcheck disable=SC2034
      BACKED_UP=1
    fi
  done
fi

if [ -d "$DATA_VOLUME_GREEN" ]; then
  BACKUP_ARCHIVE="${BACKUP_DIR}/data-green.tar.gz"
  if tar -czf "$BACKUP_ARCHIVE" -C "$REPO_ROOT" data-green 2>/dev/null; then
    print_success "Backed up data volume to $BACKUP_ARCHIVE"
    # shellcheck disable=SC2034
    BACKED_UP=1
  fi
fi

print_info "Backup location: $BACKUP_DIR"
echo ""

# -----------------------------------------------------------------------------
# 2. Fetch and checkout Development (1.7.0)
# -----------------------------------------------------------------------------
print_header "📌 Step 2: Checkout 1.7.0 (Development)"

print_info "Fetching origin..."
if ! git fetch origin 2>&1; then
  print_warning "git fetch failed; continuing with existing refs"
fi

if git rev-parse origin/Development >/dev/null 2>&1; then
  git checkout -f origin/Development
  print_success "Checked out origin/Development (1.7.0)"
elif git rev-parse v1.7.0 >/dev/null 2>&1; then
  git checkout -f v1.7.0
  print_success "Checked out v1.7.0"
else
  print_error "Neither origin/Development nor tag v1.7.0 found. Push Development or tag v1.7.0 first."
  exit 1
fi
echo ""

# -----------------------------------------------------------------------------
# 3. Build and deploy
# -----------------------------------------------------------------------------
print_header "🔨 Step 3: Build and deploy 1.7.0 on Green"

if [ ! -f "${REPO_ROOT}/build_on_truenas.sh" ]; then
  print_error "build_on_truenas.sh not found in $REPO_ROOT"
  exit 1
fi

if ! "${REPO_ROOT}/build_on_truenas.sh" --no-pull --skip-persistence-check; then
  print_error "Build/deploy failed. Restore backup manually:"
  echo "  1. Restore config: cp -r $BACKUP_DIR/config_app/* $CONFIG_APP/"
  echo "  2. Restore data:   tar -xzf $BACKUP_DIR/data-green.tar.gz -C $REPO_ROOT"
  exit 1
fi

print_success "Build and deploy completed"
echo ""

# -----------------------------------------------------------------------------
# 4. Restore config and users
# -----------------------------------------------------------------------------
print_header "📥 Step 4: Restore config and users"

RESTORED=0

if [ -d "$BACKUP_DIR/config_app" ]; then
  mkdir -p "$CONFIG_APP"
  for f in "$BACKUP_DIR/config_app"/*; do
    [ -f "$f" ] || continue
    name="$(basename "$f")"
    cp "$f" "${CONFIG_APP}/${name}"
    print_success "Restored config/app/${name}"
    RESTORED=1
  done
fi

if [ -f "${BACKUP_DIR}/data-green.tar.gz" ]; then
  if tar -xzf "${BACKUP_DIR}/data-green.tar.gz" -C "$REPO_ROOT" 2>/dev/null; then
    print_success "Restored data volume from backup"
    RESTORED=1
  fi
fi

if [ $RESTORED -eq 1 ]; then
  print_success "Config and users restored. Restart container: docker restart oscal-report-generator-green"
fi

echo ""
print_header "✅ Green 1.7.0 deployment complete"
echo "  Backup kept at: $BACKUP_DIR"
echo ""
