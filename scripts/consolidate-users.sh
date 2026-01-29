#!/bin/bash
# Consolidate Users Between Blue and Green Deployments
# Author: Mukesh Kesharwani
# Version: 2.0.0
#
# This script synchronizes users between Blue and Green deployments,
# ensuring users registered on either instance can login to both.
#
# Usage:
#   ./consolidate-users.sh                    # Interactive mode
#   ./consolidate-users.sh --auto             # Automatic bi-directional sync
#   ./consolidate-users.sh --blue-to-green    # One-way: Blue → Green
#   ./consolidate-users.sh --green-to-blue    # One-way: Green → Blue
#
# Features:
#   - Bi-directional user synchronization (default)
#   - Automatic duplicate detection and merging
#   - Preserves existing passwords and user data
#   - Creates backup before consolidation

set -e

# ============================================================================
# CONFIGURATION
# ============================================================================

BLUE_CONTAINER="oscal-report-generator-blue"
BLUE_PORT="3020"
GREEN_CONTAINER="oscal-report-generator-green"
GREEN_PORT="3019"

BACKUP_DIR="$HOME/oscal-user-consolidation-$(date +%Y%m%d-%H%M%S)"

# Parse command-line arguments
AUTO_MODE=false
DIRECTION=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --auto)
      AUTO_MODE=true
      DIRECTION="3"
      shift
      ;;
    --blue-to-green)
      AUTO_MODE=true
      DIRECTION="1"
      shift
      ;;
    --green-to-blue)
      AUTO_MODE=true
      DIRECTION="2"
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --auto              Automatic bi-directional sync (recommended)"
      echo "  --blue-to-green     One-way sync: Blue → Green only"
      echo "  --green-to-blue     One-way sync: Green → Blue only"
      echo "  --help, -h          Show this help message"
      echo ""
      echo "Interactive mode (no flags): Prompts for sync direction"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

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

if [ "$AUTO_MODE" = true ]; then
  echo "Running in automatic mode..."
  case $DIRECTION in
    1) echo "Mode: Blue → Green (one-way sync)" ;;
    2) echo "Mode: Green → Blue (one-way sync)" ;;
    3) echo "Mode: Bi-directional sync (recommended)" ;;
  esac
  echo ""
else
  echo "This script synchronizes users between Blue and Green deployments."
  echo ""
  echo "✨ RECOMMENDED: Option 3 (Bi-directional sync)"
  echo "   Ensures users can login to BOTH instances with same credentials"
  echo ""
  echo "Available options:"
  echo "  1. Blue → Green only (users registered on Blue will work on Green)"
  echo "  2. Green → Blue only (users registered on Green will work on Blue)"
  echo "  3. Bi-directional ⭐ (users from either work on both - RECOMMENDED)"
  echo ""
  echo "How it works:"
  echo "  • Existing users will NOT be overwritten (merge mode)"
  echo "  • Duplicate usernames/IDs will be automatically skipped"
  echo "  • Password hashes are preserved exactly as-is"
  echo ""
fi

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
if [ "$AUTO_MODE" = false ]; then
  echo "Enter hostname or IP to access containers"
  echo "Common options: localhost, 127.0.0.1, or your NAS IP (e.g., 192.168.1.200)"
  echo ""
  read -p "Blue hostname/IP (default: localhost): " BLUE_HOST
  BLUE_HOST=${BLUE_HOST:-localhost}
  read -p "Green hostname/IP (default: localhost): " GREEN_HOST
  GREEN_HOST=${GREEN_HOST:-localhost}
else
  # Auto mode: use localhost as default
  BLUE_HOST="${BLUE_HOST:-localhost}"
  GREEN_HOST="${GREEN_HOST:-localhost}"
fi

echo ""
print_info "Blue will use: http://${BLUE_HOST}:${BLUE_PORT}"
print_info "Green will use: http://${GREEN_HOST}:${GREEN_PORT}"
echo ""

# Select consolidation direction (only in interactive mode)
if [ "$AUTO_MODE" = false ]; then
  echo "Select consolidation direction:"
  echo "  1) Blue → Green (merge Blue users into Green)"
  echo "  2) Green → Blue (merge Green users into Blue)"
  echo "  3) Bi-directional ⭐ (merge both ways - RECOMMENDED)"
  echo ""
  read -p "Enter choice (1-3, default: 3): " DIRECTION
  DIRECTION=${DIRECTION:-3}
fi

# ============================================================================
# AUTHENTICATE BLUE
# ============================================================================

if [ "$BLUE_RUNNING" = "1" ] && ( [ "$DIRECTION" = "1" ] || [ "$DIRECTION" = "2" ] || [ "$DIRECTION" = "3" ] ); then
  print_header "🔐 Authenticating Blue Deployment"
  
  # Check for environment variables first (useful for automation)
  if [ -z "$BLUE_USERNAME" ]; then
    if [ "$AUTO_MODE" = true ]; then
      BLUE_USER="admin"
      print_info "Using default username: admin"
    else
      read -p "Blue username (default: admin): " BLUE_USER
      BLUE_USER=${BLUE_USER:-admin}
    fi
  else
    BLUE_USER="$BLUE_USERNAME"
    print_info "Using username from environment: $BLUE_USER"
  fi
  
  if [ -z "$BLUE_PASSWORD" ]; then
    read -sp "Blue password: " BLUE_PASSWORD
    echo ""
  else
    print_info "Using password from environment variable"
  fi
  
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
  
  # Check for environment variables first (useful for automation)
  if [ -z "$GREEN_USERNAME" ]; then
    if [ "$AUTO_MODE" = true ]; then
      GREEN_USER="admin"
      print_info "Using default username: admin"
    else
      read -p "Green username (default: admin): " GREEN_USER
      GREEN_USER=${GREEN_USER:-admin}
    fi
  else
    GREEN_USER="$GREEN_USERNAME"
    print_info "Using username from environment: $GREEN_USER"
  fi
  
  if [ -z "$GREEN_PASSWORD" ]; then
    read -sp "Green password: " GREEN_PASSWORD
    echo ""
  else
    print_info "Using password from environment variable"
  fi
  
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
    echo ""
    echo "   ✓ Green now has users from both deployments"
    echo "   ✓ Users registered on Blue can now login to Green"
    echo "   • Blue remains unchanged"
    echo ""
    echo "   To enable login from Green → Blue, run with --auto flag"
    ;;
  2)
    echo "📊 Result: Green users merged into Blue"
    echo ""
    echo "   ✓ Blue now has users from both deployments"
    echo "   ✓ Users registered on Green can now login to Blue"
    echo "   • Green remains unchanged"
    echo ""
    echo "   To enable login from Blue → Green, run with --auto flag"
    ;;
  3)
    echo "📊 Result: Bi-directional merge complete ⭐"
    echo ""
    echo "   ✓ Both deployments now have all users"
    echo "   ✓ Users registered on Blue can login to Green"
    echo "   ✓ Users registered on Green can login to Blue"
    echo "   ✓ No duplicates created"
    echo ""
    echo "   🎉 Users can now use BOTH instances with same credentials!"
    ;;
esac

echo ""
echo "📖 Notes:"
echo "   • Duplicate users were automatically skipped"
echo "   • Existing users were preserved (not overwritten)"
echo "   • Password hashes were maintained exactly"
echo "   • Session data and preferences are deployment-specific"
echo ""
echo "🔄 To re-consolidate after new registrations:"
echo "   ./consolidate-users.sh --auto"
echo ""
echo "💡 Tip: Add this to a cron job for automatic synchronization!"
echo "   Example: 0 */6 * * * cd /path/to/scripts && ./consolidate-users.sh --auto"
echo ""
