#!/bin/bash
#
# Deploy v1.6.7 to Blue instance on nas.keekar.com with config/users backup and restore.
# Run this ON the NAS in the Blue app directory:
#   mkesharw@NAS01:/mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue$
#   ./scripts/deploy_blue_1.6.7_with_backup.sh
#
# Steps:
#   1. Backup config/app and data volume (users + config) to a timestamped directory
#   2. Fetch tags and checkout v1.6.7
#   3. Run build_on_truenas.sh --no-pull (build and deploy 1.6.7)
#   4. On success: restore config and users from backup
#   5. On failure: print restore instructions
#
# Prerequisites:
#   - Run from repo root (the Blue directory), not from scripts/
#   - Pull a branch that has this script first (e.g. git pull origin main). Then run this.
#   - Push tag v1.6.7 to remote first: git push origin v1.6.7

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

# Resolve repo root (Blue directory): script lives in scripts/, so parent is repo root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

BACKUP_TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="${REPO_ROOT}/backups/pre-1.6.7-deploy-${BACKUP_TIMESTAMP}"

CONFIG_APP="${REPO_ROOT}/config/app"
DATA_VOLUME_BLUE="${REPO_ROOT}/data-blue"

# -----------------------------------------------------------------------------
# 1. Backup config and users
# -----------------------------------------------------------------------------
print_header "📦 Step 1: Backup config and users"

mkdir -p "$BACKUP_DIR"
mkdir -p "$BACKUP_DIR/config_app"
BACKED_UP=0

if [ -d "$CONFIG_APP" ]; then
  for f in users.json config.json email_blacklist.json rate_limit.json okta_oidc_state.json; do
    if [ -f "${CONFIG_APP}/${f}" ]; then
      cp "${CONFIG_APP}/${f}" "$BACKUP_DIR/config_app/"
      print_success "Backed up config/app/${f}"
      BACKED_UP=1
    fi
  done
  if [ $BACKED_UP -eq 0 ]; then
    print_info "config/app exists but no known config files found"
  fi
else
  print_warning "config/app not found (may be first deploy)"
fi

if [ -d "$DATA_VOLUME_BLUE" ]; then
  BACKUP_ARCHIVE="${BACKUP_DIR}/data-blue.tar.gz"
  if tar -czf "$BACKUP_ARCHIVE" -C "$REPO_ROOT" data-blue 2>/dev/null; then
    print_success "Backed up data volume to $BACKUP_ARCHIVE"
    BACKED_UP=1
  else
    print_warning "Could not create data-blue archive (directory may be empty or in use)"
  fi
else
  print_warning "data-blue directory not found (container may use different path)"
fi

if [ $BACKED_UP -eq 0 ]; then
  print_warning "No config or data was backed up. Proceeding anyway."
fi

echo ""
print_info "Backup location: $BACKUP_DIR"
echo ""

# -----------------------------------------------------------------------------
# 2. Fetch tags and checkout v1.6.7
# -----------------------------------------------------------------------------
print_header "📌 Step 2: Checkout v1.6.7"

print_info "Fetching tags from origin..."
if ! git fetch origin --tags 2>&1; then
  print_warning "git fetch --tags failed; continuing with existing refs"
fi
if ! git rev-parse v1.6.7 >/dev/null 2>&1; then
  print_error "Tag v1.6.7 not found. Push the tag first: git push origin v1.6.7"
  exit 1
fi

git checkout v1.6.7
print_success "Checked out v1.6.7"
echo ""

# -----------------------------------------------------------------------------
# 3. Build and deploy (use current checkout; do not pull)
# -----------------------------------------------------------------------------
print_header "🔨 Step 3: Build and deploy 1.6.7 on Blue"

if [ ! -f "${REPO_ROOT}/build_on_truenas.sh" ]; then
  print_error "build_on_truenas.sh not found in $REPO_ROOT"
  exit 1
fi

if ! "${REPO_ROOT}/build_on_truenas.sh" --no-pull; then
  print_error "Build/deploy failed. Restore backup manually:"
  echo "  1. Restore config: cp -r $BACKUP_DIR/config_app/* $CONFIG_APP/"
  echo "  2. Restore data:   tar -xzf $BACKUP_DIR/data-blue.tar.gz -C $REPO_ROOT"
  exit 1
fi

print_success "Build and deploy completed"
echo ""

# -----------------------------------------------------------------------------
# 4. Restore config and users from backup
# -----------------------------------------------------------------------------
print_header "📥 Step 4: Restore config and users"

RESTORED=0

if [ -d "$BACKUP_DIR/config_app" ]; then
  mkdir -p "$CONFIG_APP"
  for f in "$BACKUP_DIR/config_app"/*; do
    if [ -f "$f" ]; then
      name="$(basename "$f")"
      cp "$f" "${CONFIG_APP}/${name}"
      print_success "Restored config/app/${name}"
      RESTORED=1
    fi
  done
fi

if [ -f "${BACKUP_DIR}/data-blue.tar.gz" ]; then
  if tar -xzf "${BACKUP_DIR}/data-blue.tar.gz" -C "$REPO_ROOT" 2>/dev/null; then
    print_success "Restored data volume from backup"
    RESTORED=1
  else
    print_warning "Could not extract data-blue backup (container may be using volume)"
    print_info "If the app is missing users/config, stop the container and run:"
    echo "  tar -xzf $BACKUP_DIR/data-blue.tar.gz -C $REPO_ROOT"
  fi
fi

if [ $RESTORED -eq 0 ]; then
  print_warning "Nothing was restored (no backup files or extract failed)"
else
  print_success "Config and users restored. Restart container to load: docker restart oscal-report-generator-blue"
fi

echo ""
print_header "✅ Blue 1.6.7 deployment complete"
echo "  Backup kept at: $BACKUP_DIR"
echo "  Remove old backups after verification: rm -rf ${REPO_ROOT}/backups/pre-1.6.7-deploy-*"
echo ""
