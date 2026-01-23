#!/bin/bash
# Consolidate Users Between Blue and Green Deployments
# Author: Mukesh Kesharwani
# Version: 1.0.0
#
# This script merges users from one deployment into another,
# avoiding duplicates and preserving existing users.

set -e

# ============================================================================
# CONFIGURATION
# ============================================================================

BLUE_CONTAINER="oscal-report-generator-blue"
BLUE_PORT="3020"
GREEN_CONTAINER="oscal-report-generator-green"
GREEN_PORT="3019"

BACKUP_DIR="$HOME/oscal-user-consolidation-$(date +%Y%m%d-%H%M%S)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC}  $1"; }
print_info() { echo -e "${CYAN}ℹ${NC}  $1"; }
print_header() {
  echo ""
  echo -e "${MAGENTA}========================================${NC}"
  echo -e "${MAGENTA}$1${NC}"
  echo -e "${MAGENTA}========================================${NC}"
  echo ""
}

# ============================================================================
# MAIN SCRIPT
# ============================================================================

print_header "👥 User Consolidation - Blue ⟷ Green"

echo "This script consolidates users between Blue and Green deployments."
echo ""
echo "You can choose to:"
echo "  1. Export users from Blue → Import to Green"
echo "  2. Export users from Green → Import to Blue"
echo "  3. Merge both ways (bi-directional sync)"
echo ""
echo "Existing users will NOT be overwritten (merge mode)."
echo "Users with duplicate IDs or usernames will be skipped."
echo ""

# Check if containers are running
BLUE_RUNNING=$(docker ps --format '{{.Names}}' | grep -c "^${BLUE_CONTAINER}$" || echo "0")
GREEN_RUNNING=$(docker ps --format '{{.Names}}' | grep -c "^${GREEN_CONTAINER}$" || echo "0")

if [ "$BLUE_RUNNING" = "0" ]; then
  print_warning "Blue container is not running"
fi

if [ "$GREEN_RUNNING" = "0" ]; then
  print_warning "Green container is not running"
fi

if [ "$BLUE_RUNNING" = "0" ] && [ "$GREEN_RUNNING" = "0" ]; then
  print_error "Neither Blue nor Green containers are running!"
  exit 1
fi

echo ""
echo "Container Status:"
echo "  ${BLUE}Blue:${NC}  $([ "$BLUE_RUNNING" = "1" ] && echo "✓ Running" || echo "✗ Not running")"
echo "  ${GREEN}Green:${NC} $([ "$GREEN_RUNNING" = "1" ] && echo "✓ Running" || echo "✗ Not running")"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"
print_info "Backup directory: $BACKUP_DIR"
echo ""

# Configure hostnames
echo "Enter hostname or IP to access containers"
echo "Common options: localhost, 127.0.0.1, or your NAS IP (e.g., 192.168.1.200)"
echo ""
read -p "Blue hostname/IP (default: localhost): " BLUE_HOST
BLUE_HOST=${BLUE_HOST:-localhost}
read -p "Green hostname/IP (default: localhost): " GREEN_HOST
GREEN_HOST=${GREEN_HOST:-localhost}
echo ""
print_info "Blue will use: http://${BLUE_HOST}:${BLUE_PORT}"
print_info "Green will use: http://${GREEN_HOST}:${GREEN_PORT}"
echo ""

# Select consolidation direction
echo "Select consolidation direction:"
echo "  1) Blue → Green (merge Blue users into Green)"
echo "  2) Green → Blue (merge Green users into Blue)"
echo "  3) Bi-directional (merge both ways)"
echo ""
read -p "Enter choice (1-3): " DIRECTION

# ============================================================================
# AUTHENTICATE BLUE
# ============================================================================

if [ "$BLUE_RUNNING" = "1" ] && ( [ "$DIRECTION" = "1" ] || [ "$DIRECTION" = "2" ] || [ "$DIRECTION" = "3" ] ); then
  print_header "🔐 Authenticating Blue Deployment"
  
  read -p "Blue username (default: admin): " BLUE_USER
  BLUE_USER=${BLUE_USER:-admin}
  read -sp "Blue password: " BLUE_PASSWORD
  echo ""
  
  BLUE_JSON=$(jq -n --arg user "$BLUE_USER" --arg pass "$BLUE_PASSWORD" '{username: $user, password: $pass}')
  BLUE_TOKEN=$(curl -s -X POST "http://${BLUE_HOST}:${BLUE_PORT}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "$BLUE_JSON" \
    | jq -r '.sessionToken' 2>/dev/null || echo "null")
  
  if [ "$BLUE_TOKEN" = "null" ] || [ -z "$BLUE_TOKEN" ]; then
    print_error "Blue authentication failed!"
    exit 1
  fi
  
  print_success "Blue authentication successful"
fi

# ============================================================================
# AUTHENTICATE GREEN
# ============================================================================

if [ "$GREEN_RUNNING" = "1" ] && ( [ "$DIRECTION" = "1" ] || [ "$DIRECTION" = "2" ] || [ "$DIRECTION" = "3" ] ); then
  print_header "🔐 Authenticating Green Deployment"
  
  read -p "Green username (default: admin): " GREEN_USER
  GREEN_USER=${GREEN_USER:-admin}
  read -sp "Green password: " GREEN_PASSWORD
  echo ""
  
  GREEN_JSON=$(jq -n --arg user "$GREEN_USER" --arg pass "$GREEN_PASSWORD" '{username: $user, password: $pass}')
  GREEN_TOKEN=$(curl -s -X POST "http://${GREEN_HOST}:${GREEN_PORT}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "$GREEN_JSON" \
    | jq -r '.sessionToken' 2>/dev/null || echo "null")
  
  if [ "$GREEN_TOKEN" = "null" ] || [ -z "$GREEN_TOKEN" ]; then
    print_error "Green authentication failed!"
    exit 1
  fi
  
  print_success "Green authentication successful"
fi

# ============================================================================
# BLUE → GREEN
# ============================================================================

if [ "$DIRECTION" = "1" ] || [ "$DIRECTION" = "3" ]; then
  print_header "📤 Exporting Users from Blue"
  
  curl -s -H "Authorization: Bearer $BLUE_TOKEN" \
    "http://${BLUE_HOST}:${BLUE_PORT}/api/users/export" > "$BACKUP_DIR/blue-users.json"
  
  BLUE_USER_COUNT=$(jq '.userCount' "$BACKUP_DIR/blue-users.json" 2>/dev/null || echo "0")
  print_success "Exported $BLUE_USER_COUNT users from Blue"
  
  print_header "📥 Importing Blue Users into Green"
  
  IMPORT_RESULT=$(curl -s -X POST "http://${GREEN_HOST}:${GREEN_PORT}/api/users/import?mode=merge" \
    -H "Authorization: Bearer $GREEN_TOKEN" \
    -H "Content-Type: application/json" \
    -d @"$BACKUP_DIR/blue-users.json")
  
  echo "$IMPORT_RESULT" | jq
  
  ADDED=$(echo "$IMPORT_RESULT" | jq -r '.results.added' 2>/dev/null || echo "0")
  SKIPPED=$(echo "$IMPORT_RESULT" | jq -r '.results.skipped' 2>/dev/null || echo "0")
  
  print_success "Blue → Green: $ADDED users added, $SKIPPED skipped (duplicates)"
  echo ""
fi

# ============================================================================
# GREEN → BLUE
# ============================================================================

if [ "$DIRECTION" = "2" ] || [ "$DIRECTION" = "3" ]; then
  print_header "📤 Exporting Users from Green"
  
  curl -s -H "Authorization: Bearer $GREEN_TOKEN" \
    "http://${GREEN_HOST}:${GREEN_PORT}/api/users/export" > "$BACKUP_DIR/green-users.json"
  
  GREEN_USER_COUNT=$(jq '.userCount' "$BACKUP_DIR/green-users.json" 2>/dev/null || echo "0")
  print_success "Exported $GREEN_USER_COUNT users from Green"
  
  print_header "📥 Importing Green Users into Blue"
  
  IMPORT_RESULT=$(curl -s -X POST "http://${BLUE_HOST}:${BLUE_PORT}/api/users/import?mode=merge" \
    -H "Authorization: Bearer $BLUE_TOKEN" \
    -H "Content-Type: application/json" \
    -d @"$BACKUP_DIR/green-users.json")
  
  echo "$IMPORT_RESULT" | jq
  
  ADDED=$(echo "$IMPORT_RESULT" | jq -r '.results.added' 2>/dev/null || echo "0")
  SKIPPED=$(echo "$IMPORT_RESULT" | jq -r '.results.skipped' 2>/dev/null || echo "0")
  
  print_success "Green → Blue: $ADDED users added, $SKIPPED skipped (duplicates)"
  echo ""
fi

# ============================================================================
# VERIFICATION
# ============================================================================

print_header "🔍 Verification"

if [ "$BLUE_RUNNING" = "1" ]; then
  BLUE_FINAL_COUNT=$(curl -s -H "Authorization: Bearer $BLUE_TOKEN" \
    "http://${BLUE_HOST}:${BLUE_PORT}/api/users" | jq 'length' 2>/dev/null || echo "0")
  echo "${BLUE}Blue:${NC}  Total users: $BLUE_FINAL_COUNT"
fi

if [ "$GREEN_RUNNING" = "1" ]; then
  GREEN_FINAL_COUNT=$(curl -s -H "Authorization: Bearer $GREEN_TOKEN" \
    "http://${GREEN_HOST}:${GREEN_PORT}/api/users" | jq 'length' 2>/dev/null || echo "0")
  echo "${GREEN}Green:${NC} Total users: $GREEN_FINAL_COUNT"
fi

echo ""

# ============================================================================
# COMPLETION
# ============================================================================

print_header "✅ User Consolidation Complete!"

echo ""
echo "💾 Export files saved to:"
echo "   $BACKUP_DIR/"
if [ -f "$BACKUP_DIR/blue-users.json" ]; then
  echo "   ├── blue-users.json"
fi
if [ -f "$BACKUP_DIR/green-users.json" ]; then
  echo "   └── green-users.json"
fi
echo ""

case $DIRECTION in
  1)
    echo "📊 Result: Blue users merged into Green"
    echo "   - Green now has users from both deployments"
    echo "   - Blue remains unchanged"
    ;;
  2)
    echo "📊 Result: Green users merged into Blue"
    echo "   - Blue now has users from both deployments"
    echo "   - Green remains unchanged"
    ;;
  3)
    echo "📊 Result: Bi-directional merge complete"
    echo "   - Both deployments now have all users"
    echo "   - No duplicates created"
    ;;
esac

echo ""
echo "📖 Notes:"
echo "   - Duplicate users were automatically skipped"
echo "   - Existing users were preserved (not overwritten)"
echo "   - Password hashes were maintained"
echo ""
echo "🔄 To re-consolidate in the future, run this script again"
echo ""
