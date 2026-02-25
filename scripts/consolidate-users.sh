#!/bin/bash
# Consolidate Users Between Blue and Green Deployments
# Author: Mukesh Kesharwani
# Version: 2.0.2
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
# IMPORTANT - TLS Certificate Compatibility:
#   ⚠️  Use INTERNAL IP ADDRESSES (http://192.168.x.x:port) instead of hostnames
#       when TLS certificates don't match the hostname. API authentication will fail
#       with SSL/TLS certificate mismatch errors if hostname != certificate CN/SAN.
#
#   ✓ RECOMMENDED: --blue-url http://192.168.1.200:3020
#   ✗ MAY FAIL:    --blue-url https://blue.oscal.keekar.com (if cert doesn't match)
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

# URL Configuration (can be overridden by environment variables)
BLUE_URL="${BLUE_URL:-http://blue.oscal.keekar.com}"
GREEN_URL="${GREEN_URL:-http://green.oscal.keekar.com}"

# Legacy container/port names (deprecated; BLUE_URL/GREEN_URL used instead)
# BLUE_CONTAINER, BLUE_PORT, GREEN_CONTAINER, GREEN_PORT removed to satisfy ShellCheck SC2034

BACKUP_DIR="$HOME/oscal-user-consolidation-$(date +%Y%m%d-%H%M%S)""$HOME/oscal-user-consolidation-$(date +%Y%m%d-%H%M%S)"

# Parse command-line arguments
AUTO_MODE=false
DIRECTION=""
# replace-by-username: sync users when same username exists with different ID (e.g. OIDC JIT on one side). merge: skip duplicates only.
IMPORT_MODE="${CONSOLIDATE_IMPORT_MODE:-replace-by-username}"

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
    --blue-url)
      BLUE_URL="$2"
      shift 2
      ;;
    --green-url)
      GREEN_URL="$2"
      shift 2
      ;;
    --blue-password)
      BLUE_PASSWORD="$2"
      shift 2
      ;;
    --green-password)
      GREEN_PASSWORD="$2"
      shift 2
      ;;
    --import-mode)
      IMPORT_MODE="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --auto                    Automatic bi-directional sync (recommended)"
      echo "  --blue-to-green           One-way sync: Blue → Green only"
      echo "  --green-to-blue           One-way sync: Green → Blue only"
      echo "  --blue-url URL            Blue instance URL (default: http://blue.oscal.keekar.com)"
      echo "  --green-url URL           Green instance URL (default: http://green.oscal.keekar.com)"
      echo "  --blue-password PASS      Blue admin password (for automation)"
      echo "  --green-password PASS     Green admin password (for automation)"
      echo "  --import-mode MODE        merge (skip duplicates) | replace-by-username (default, sync same user across Blue/Green)"
      echo "  --help, -h                Show this help message"
      echo ""
      echo "Environment Variables:"
      echo "  BLUE_URL                  Blue instance URL"
      echo "  GREEN_URL                 Green instance URL"
      echo "  BLUE_USERNAME             Blue admin username (default: admin)"
      echo "  GREEN_USERNAME            Green admin username (default: admin)"
  echo "  BLUE_PASSWORD             Blue admin password"
  echo "  GREEN_PASSWORD            Green admin password"
  echo "  CONSOLIDATE_IMPORT_MODE   merge | replace-by-username (default)"
  echo ""
  echo "  ⚠️  IMPORTANT: TLS Certificate Compatibility"
      echo "  When defining instance URLs, use INTERNAL IP ADDRESSES instead of hostnames"
      echo "  if TLS certificates don't match the hostname. APIs may fail with certificate"
      echo "  mismatch errors (e.g., certificate for 'keekar.ddns.net' vs hostname 'green.oscal.keekar.com')."
      echo ""
      echo "  ✓ RECOMMENDED: http://192.168.1.200:3019  (internal IP, no TLS issues)"
      echo "  ✗ MAY FAIL:    https://green.oscal.keekar.com  (TLS certificate mismatch)"
      echo ""
      echo "Examples:"
      echo "  $0 --auto"
      echo "  $0 --auto --blue-url http://localhost:3020 --green-url http://localhost:3019"
      echo "  $0 --auto --blue-url http://192.168.1.200:3020 --green-url http://192.168.1.200:3019"
      echo "  BLUE_PASSWORD=secret GREEN_PASSWORD=secret $0 --auto"
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

# Display TLS/Certificate Warning
print_warning "⚠️  IMPORTANT: TLS Certificate Compatibility"
echo ""
echo "  When consolidating between instances, use INTERNAL IP ADDRESSES instead of"
echo "  hostnames if TLS certificates don't match. API authentication may fail with"
echo "  certificate mismatch errors (e.g., cert for 'example.com' vs 'subdomain.example.com')."
echo ""
echo "  ${GREEN}✓ RECOMMENDED:${NC} http://192.168.1.200:3019  (internal IP, no TLS issues)"
echo "  ${RED}✗ MAY FAIL:${NC}    https://green.oscal.keekar.com  (TLS certificate mismatch)"
echo ""
echo "  Current configuration:"
echo "    Blue:  $BLUE_URL"
echo "    Green: $GREEN_URL"
echo ""

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

# Check if instances are accessible
print_info "Checking instance accessibility..."
BLUE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "$BLUE_URL/" || echo "000")
GREEN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "$GREEN_URL/" || echo "000")

if [ "$BLUE_STATUS" = "000" ]; then
  print_warning "Blue instance not accessible at $BLUE_URL"
fi

if [ "$GREEN_STATUS" = "000" ]; then
  print_warning "Green instance not accessible at $GREEN_URL"
fi

if [ "$BLUE_STATUS" = "000" ] && [ "$GREEN_STATUS" = "000" ]; then
  print_error "Neither Blue nor Green instances are accessible!"
  exit 1
fi

echo ""
echo "Instance Status:"
echo "  ${BLUE}Blue ($BLUE_URL):${NC}  $([ "$BLUE_STATUS" != "000" ] && echo "✓ Accessible (HTTP $BLUE_STATUS)" || echo "✗ Not accessible")"
echo "  ${GREEN}Green ($GREEN_URL):${NC} $([ "$GREEN_STATUS" != "000" ] && echo "✓ Accessible (HTTP $GREEN_STATUS)" || echo "✗ Not accessible")"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"
print_info "Backup directory: $BACKUP_DIR"
echo ""

print_info "Blue instance: $BLUE_URL"
print_info "Green instance: $GREEN_URL"
echo ""

# Select consolidation direction (only in interactive mode)
if [ "$AUTO_MODE" = false ]; then
  echo "Select consolidation direction:"
  echo "  1) Blue → Green (merge Blue users into Green)"
  echo "  2) Green → Blue (merge Green users into Blue)"
  echo "  3) Bi-directional ⭐ (merge both ways - RECOMMENDED)"
  echo ""
  read -rp "Enter choice (1-3, default: 3): " DIRECTION
  DIRECTION=${DIRECTION:-3}
fi

# ============================================================================
# AUTHENTICATE BLUE
# ============================================================================

if [ "$BLUE_STATUS" != "000" ] && { [ "$DIRECTION" = "1" ] || [ "$DIRECTION" = "2" ] || [ "$DIRECTION" = "3" ]; }; then
  print_header "🔐 Authenticating Blue Deployment"
  
  # Check for environment variables first (useful for automation)
  if [ -z "$BLUE_USERNAME" ]; then
    if [ "$AUTO_MODE" = true ]; then
      BLUE_USER="admin"
      print_info "Using default username: admin"
    else
      read -rp "Blue username (default: admin): " BLUE_USER
      BLUE_USER=${BLUE_USER:-admin}
    fi
  else
    BLUE_USER="$BLUE_USERNAME"
    print_info "Using username from environment: $BLUE_USER"
  fi
  
  if [ -z "$BLUE_PASSWORD" ]; then
    read -rsp "Blue password: " BLUE_PASSWORD
    echo ""
  else
    print_info "Using password from environment variable"
  fi
  
  if [ -z "$BLUE_PASSWORD" ]; then
    print_error "Blue password cannot be empty."
    exit 1
  fi
  
  BLUE_JSON=$(jq -n --arg user "$BLUE_USER" --arg pass "$BLUE_PASSWORD" '{username: $user, password: $pass}')
  BLUE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BLUE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "$BLUE_JSON")
  BLUE_HTTP_CODE=$(echo "$BLUE_RESPONSE" | tail -n1)
  BLUE_BODY=$(echo "$BLUE_RESPONSE" | sed '$d')
  BLUE_TOKEN=$(echo "$BLUE_BODY" | jq -r '.sessionToken // empty' 2>/dev/null)
  
  if [ "$BLUE_TOKEN" = "" ] || [ -z "$BLUE_TOKEN" ]; then
    print_error "Blue authentication failed!"
    if [ "$BLUE_HTTP_CODE" = "000" ]; then
      echo "  → Could not reach $BLUE_URL (connection refused, DNS, or network issue)."
      echo "  → If using hostnames over HTTPS, try --blue-url http://INTERNAL_IP:PORT (see script --help)."
    else
      echo "  → HTTP $BLUE_HTTP_CODE"
      echo "$BLUE_BODY" | jq -r '.message // .error // .' 2>/dev/null || echo "$BLUE_BODY"
    fi
    exit 1
  fi
  
  print_success "Blue authentication successful"
fi

# ============================================================================
# AUTHENTICATE GREEN
# ============================================================================

if [ "$GREEN_STATUS" != "000" ] && { [ "$DIRECTION" = "1" ] || [ "$DIRECTION" = "2" ] || [ "$DIRECTION" = "3" ]; }; then
  print_header "🔐 Authenticating Green Deployment"
  
  # Check for environment variables first (useful for automation)
  if [ -z "$GREEN_USERNAME" ]; then
    if [ "$AUTO_MODE" = true ]; then
      GREEN_USER="admin"
      print_info "Using default username: admin"
    else
      read -rp "Green username (default: admin): " GREEN_USER
      GREEN_USER=${GREEN_USER:-admin}
    fi
  else
    GREEN_USER="$GREEN_USERNAME"
    print_info "Using username from environment: $GREEN_USER"
  fi
  
  if [ -z "$GREEN_PASSWORD" ]; then
    read -rsp "Green password: " GREEN_PASSWORD
    echo ""
  else
    print_info "Using password from environment variable"
  fi
  
  if [ -z "$GREEN_PASSWORD" ]; then
    print_error "Green password cannot be empty."
    exit 1
  fi
  
  GREEN_JSON=$(jq -n --arg user "$GREEN_USER" --arg pass "$GREEN_PASSWORD" '{username: $user, password: $pass}')
  GREEN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$GREEN_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "$GREEN_JSON")
  GREEN_HTTP_CODE=$(echo "$GREEN_RESPONSE" | tail -n1)
  GREEN_BODY=$(echo "$GREEN_RESPONSE" | sed '$d')
  GREEN_TOKEN=$(echo "$GREEN_BODY" | jq -r '.sessionToken // empty' 2>/dev/null)
  
  if [ "$GREEN_TOKEN" = "" ] || [ -z "$GREEN_TOKEN" ]; then
    print_error "Green authentication failed!"
    if [ "$GREEN_HTTP_CODE" = "000" ]; then
      echo "  → Could not reach $GREEN_URL (connection refused, DNS, or network issue)."
      echo "  → If using hostnames over HTTPS, try --green-url http://INTERNAL_IP:PORT (see script --help)."
    else
      echo "  → HTTP $GREEN_HTTP_CODE"
      echo "$GREEN_BODY" | jq -r '.message // .error // .' 2>/dev/null || echo "$GREEN_BODY"
    fi
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
    "$BLUE_URL/api/users/export" > "$BACKUP_DIR/blue-users.json"
  
  BLUE_USER_COUNT=$(jq '.userCount' "$BACKUP_DIR/blue-users.json" 2>/dev/null || echo "0")
  print_success "Exported $BLUE_USER_COUNT users from Blue"
  
  print_header "📥 Importing Blue Users into Green (mode=$IMPORT_MODE)"
  
  IMPORT_RESULT=$(curl -s -X POST "$GREEN_URL/api/users/import?mode=$IMPORT_MODE" \
    -H "Authorization: Bearer $GREEN_TOKEN" \
    -H "Content-Type: application/json" \
    -d @"$BACKUP_DIR/blue-users.json")
  
  echo "$IMPORT_RESULT" | jq
  
  ADDED=$(echo "$IMPORT_RESULT" | jq -r '.results.added' 2>/dev/null || echo "0")
  UPDATED=$(echo "$IMPORT_RESULT" | jq -r '.results.updated' 2>/dev/null || echo "0")
  SKIPPED=$(echo "$IMPORT_RESULT" | jq -r '.results.skipped' 2>/dev/null || echo "0")
  
  print_success "Blue → Green: $ADDED added, $UPDATED updated, $SKIPPED skipped"
  if [ "${SKIPPED:-0}" -gt 0 ]; then
    echo "  Skipped users:"
    echo "$IMPORT_RESULT" | jq -r '.results.skippedUsers[]? | "    - \(.username): \(.reason)"' 2>/dev/null || true
  fi
  echo ""
fi

# ============================================================================
# GREEN → BLUE
# ============================================================================

if [ "$DIRECTION" = "2" ] || [ "$DIRECTION" = "3" ]; then
  print_header "📤 Exporting Users from Green"
  
  curl -s -H "Authorization: Bearer $GREEN_TOKEN" \
    "$GREEN_URL/api/users/export" > "$BACKUP_DIR/green-users.json"
  
  GREEN_USER_COUNT=$(jq '.userCount' "$BACKUP_DIR/green-users.json" 2>/dev/null || echo "0")
  print_success "Exported $GREEN_USER_COUNT users from Green"
  
  print_header "📥 Importing Green Users into Blue (mode=$IMPORT_MODE)"
  
  IMPORT_RESULT=$(curl -s -X POST "$BLUE_URL/api/users/import?mode=$IMPORT_MODE" \
    -H "Authorization: Bearer $BLUE_TOKEN" \
    -H "Content-Type: application/json" \
    -d @"$BACKUP_DIR/green-users.json")
  
  echo "$IMPORT_RESULT" | jq
  
  ADDED=$(echo "$IMPORT_RESULT" | jq -r '.results.added' 2>/dev/null || echo "0")
  UPDATED=$(echo "$IMPORT_RESULT" | jq -r '.results.updated' 2>/dev/null || echo "0")
  SKIPPED=$(echo "$IMPORT_RESULT" | jq -r '.results.skipped' 2>/dev/null || echo "0")
  
  print_success "Green → Blue: $ADDED added, $UPDATED updated, $SKIPPED skipped"
  if [ "${SKIPPED:-0}" -gt 0 ]; then
    echo "  Skipped users:"
    echo "$IMPORT_RESULT" | jq -r '.results.skippedUsers[]? | "    - \(.username): \(.reason)"' 2>/dev/null || true
  fi
  echo ""
fi

# ============================================================================
# VERIFICATION
# ============================================================================

print_header "🔍 Verification"

if [ "$BLUE_STATUS" != "000" ]; then
  BLUE_FINAL_COUNT=$(curl -s -H "Authorization: Bearer $BLUE_TOKEN" \
    "$BLUE_URL/api/users" | jq '.users | length' 2>/dev/null || echo "0")
  echo "${BLUE}Blue:${NC}  Total users: $BLUE_FINAL_COUNT"
fi

if [ "$GREEN_STATUS" != "000" ]; then
  GREEN_FINAL_COUNT=$(curl -s -H "Authorization: Bearer $GREEN_TOKEN" \
    "$GREEN_URL/api/users" | jq '.users | length' 2>/dev/null || echo "0")
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
echo "⚠️  TLS Certificate Reminder:"
echo "   • Use internal IP addresses (http://192.168.1.x:port) for consolidation"
echo "   • Avoid hostnames with certificate mismatches (https://subdomain.example.com)"
echo "   • This prevents API authentication failures due to SSL/TLS errors"
echo ""
echo "🔄 To re-consolidate after new registrations:"
echo "   ./consolidate-users.sh --auto --blue-url http://IP:PORT --green-url http://IP:PORT"
echo ""
echo "💡 Tip: Add this to a cron job for automatic synchronization!"
echo "   Example: 0 */6 * * * cd /path/to/scripts && ./consolidate-users.sh --auto"
echo ""
