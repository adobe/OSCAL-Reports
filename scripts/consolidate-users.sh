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
#   ./consolidate-users.sh --docker           # Direct Docker: merge users.json via docker exec (run ON server with containers)
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
#   - Pass vault first: tries login with pass (OSCAL/admin) without prompting; prompts only if missing or login fails

set -e

# ============================================================================
# CONFIGURATION
# ============================================================================

# URL Configuration (can be overridden by environment variables)
BLUE_URL="${BLUE_URL:-http://44.201.190.106:3020}"
GREEN_URL="${GREEN_URL:-http://192.168.1.200:3019}"
# BLUE_URL="${BLUE_URL:-https://oscal.amsgovcloud.com.au}"
# GREEN_URL="${GREEN_URL:-http://nas.keekar.com:3019/}"
# BLUE_URL="${BLUE_URL:-https://oscal.amsgovcloud.com.au}"
# GREEN_URL="${GREEN_URL:-https://keekar.3utilities.com}"


# Legacy container/port names (deprecated; BLUE_URL/GREEN_URL used instead)
# BLUE_CONTAINER, BLUE_PORT, GREEN_CONTAINER, GREEN_PORT removed to satisfy ShellCheck SC2034

BACKUP_DIR="$HOME/oscal-user-consolidation-$(date +%Y%m%d-%H%M%S)"

# Parse command-line arguments
AUTO_MODE=false
DIRECTION=""
DOCKER_MODE=false
# replace-by-username: sync users when same username exists with different ID (e.g. OIDC JIT on one side). merge: skip duplicates only.
IMPORT_MODE="${CONSOLIDATE_IMPORT_MODE:-replace-by-username}"

while [[ $# -gt 0 ]]; do
  case $1 in
    --docker)
      DOCKER_MODE=true
      shift
      ;;
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
      echo "  --docker                  Direct Docker: merge users.json via docker exec (run ON server with containers)"
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
  echo "  BLUE_PASS_ENTRY           Pass entry for Blue admin password (default: OSCAL/admin)"
  echo "  GREEN_PASS_ENTRY          Pass entry for Green admin password (default: OSCAL/admin)"
  echo "  CONSOLIDATE_IMPORT_MODE   merge | replace-by-username (default)"
  echo ""
  echo "  If BLUE_PASSWORD/GREEN_PASSWORD are not set, the script tries pass first and attempts login;"
  echo "  you are prompted only if the entry is missing or the login attempt fails."
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

# Load password from pass (first line of entry). Used when BLUE_PASSWORD/GREEN_PASSWORD not set.
get_password_from_pass() {
  local entry="${1:-OSCAL/admin}"
  if command -v pass >/dev/null 2>&1 && pass show "$entry" >/dev/null 2>&1; then
    pass show "$entry" 2>/dev/null | head -1
  else
    echo ""
  fi
}

# POST /api/auth/login. Sets API_LOGIN_HTTP_CODE and API_LOGIN_BODY. Returns 0 if sessionToken present.
api_login_attempt() {
  local base_url="$1" user="$2" pass="$3" cookie_jar="$4"
  local json response token
  json=$(jq -n --arg user "$user" --arg pass "$pass" '{username: $user, password: $pass}')
  response=$(curl -s -w "\n%{http_code}" -c "$cookie_jar" -b "$cookie_jar" \
    -X POST "$base_url/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "$json")
  API_LOGIN_HTTP_CODE=$(echo "$response" | tail -n1)
  API_LOGIN_BODY=$(echo "$response" | sed '$d')
  token=$(echo "$API_LOGIN_BODY" | jq -r '.sessionToken // empty' 2>/dev/null)
  if [ -n "$token" ]; then
    return 0
  fi
  return 1
}

# Print login failure details (uses API_LOGIN_HTTP_CODE, API_LOGIN_BODY, base_url).
print_login_failure() {
  local base_url="$1"
  if [ "$API_LOGIN_HTTP_CODE" = "000" ]; then
    echo "  → Could not reach $base_url (connection refused, DNS, or network issue)."
  else
    echo "  → HTTP $API_LOGIN_HTTP_CODE"
    local err_msg
    err_msg=$(echo "$API_LOGIN_BODY" | jq -r 'if type == "object" then (.message // .error // .) else . end' 2>/dev/null)
    if [ -n "$err_msg" ] && [ "$err_msg" != "null" ]; then
      echo "  → Response: $err_msg"
    elif [ -n "$API_LOGIN_BODY" ]; then
      echo "  → Response (first 200 chars): ${API_LOGIN_BODY:0:200}"
    fi
  fi
}

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
# DOCKER MODE: Direct docker exec merge (run ON server with containers)
# ============================================================================

run_docker_consolidation() {
  BLUE_CONTAINER="${BLUE_CONTAINER:-oscal-report-generator-blue}"
  GREEN_CONTAINER="${GREEN_CONTAINER:-oscal-report-generator-green}"

  if ! docker ps &> /dev/null; then
    print_error "Cannot access Docker. Please run with sudo or ensure user is in docker group."
    exit 1
  fi

  BLUE_RUNNING=$(docker ps --format '{{.Names}}' | grep -c "^${BLUE_CONTAINER}$" || echo "0")
  GREEN_RUNNING=$(docker ps --format '{{.Names}}' | grep -c "^${GREEN_CONTAINER}$" || echo "0")

  if [ "$BLUE_RUNNING" = "0" ] || [ "$GREEN_RUNNING" = "0" ]; then
    print_error "Both Blue and Green containers must be running!"
    echo "Blue: $([ "$BLUE_RUNNING" = "1" ] && echo "✓ Running" || echo "✗ Not running")"
    echo "Green: $([ "$GREEN_RUNNING" = "1" ] && echo "✓ Running" || echo "✗ Not running")"
    exit 1
  fi

  mkdir -p "$BACKUP_DIR"
  print_info "Backup directory: $BACKUP_DIR"
  echo ""

  print_header "📤 Extracting Users from Blue Container"
  docker exec "$BLUE_CONTAINER" cat /data/users.json > "$BACKUP_DIR/blue-users.json"
  BLUE_COUNT=$(jq 'length' "$BACKUP_DIR/blue-users.json")
  print_success "Extracted $BLUE_COUNT users from Blue"

  print_header "📤 Extracting Users from Green Container"
  docker exec "$GREEN_CONTAINER" cat /data/users.json > "$BACKUP_DIR/green-users.json"
  GREEN_COUNT=$(jq 'length' "$BACKUP_DIR/green-users.json")
  print_success "Extracted $GREEN_COUNT users from Green"

  print_header "🔍 Analyzing Differences"
  jq -r '.[].username' "$BACKUP_DIR/blue-users.json" | sort > "$BACKUP_DIR/blue-usernames.txt"
  jq -r '.[].username' "$BACKUP_DIR/green-users.json" | sort > "$BACKUP_DIR/green-usernames.txt"
  BLUE_ONLY_COUNT=$(comm -23 "$BACKUP_DIR/blue-usernames.txt" "$BACKUP_DIR/green-usernames.txt" | wc -l | tr -d ' ')
  GREEN_ONLY_COUNT=$(comm -13 "$BACKUP_DIR/blue-usernames.txt" "$BACKUP_DIR/green-usernames.txt" | wc -l | tr -d ' ')
  COMMON_COUNT=$(comm -12 "$BACKUP_DIR/blue-usernames.txt" "$BACKUP_DIR/green-usernames.txt" | wc -l | tr -d ' ')
  echo "Common users: $COMMON_COUNT"
  echo "Only on Blue: $BLUE_ONLY_COUNT"
  echo "Only on Green: $GREEN_ONLY_COUNT"
  echo ""

  if [ "$BLUE_ONLY_COUNT" -gt 0 ]; then
    print_header "📥 Merging Blue Users into Green"
    MERGED=$(jq -s '.[0] as $green | .[1] as $blue | $green + ($blue | map(select(.username as $u | $green | map(.username) | index($u) | not)))' "$BACKUP_DIR/green-users.json" "$BACKUP_DIR/blue-users.json")
    echo "$MERGED" > "$BACKUP_DIR/green-merged.json"
    echo "$MERGED" | docker exec -i "$GREEN_CONTAINER" tee /data/users.json > /dev/null
    print_success "Blue → Green: Added $BLUE_ONLY_COUNT users"
  else
    print_info "Blue → Green: No new users to add"
  fi

  if [ "$GREEN_ONLY_COUNT" -gt 0 ]; then
    print_header "📥 Merging Green Users into Blue"
    MERGED=$(jq -s '.[0] as $blue | .[1] as $green | $blue + ($green | map(select(.username as $u | $blue | map(.username) | index($u) | not)))' "$BACKUP_DIR/blue-users.json" "$BACKUP_DIR/green-users.json")
    echo "$MERGED" > "$BACKUP_DIR/blue-merged.json"
    echo "$MERGED" | docker exec -i "$BLUE_CONTAINER" tee /data/users.json > /dev/null
    print_success "Green → Blue: Added $GREEN_ONLY_COUNT users"
  else
    print_info "Green → Blue: No new users to add"
  fi

  print_header "🔄 Restarting Containers"
  docker restart "$BLUE_CONTAINER" > /dev/null &
  docker restart "$GREEN_CONTAINER" > /dev/null &
  wait
  print_success "Containers restarted"

  print_header "✅ Consolidation Complete!"
  BLUE_FINAL=$(docker exec "$BLUE_CONTAINER" cat /data/users.json | jq 'length')
  GREEN_FINAL=$(docker exec "$GREEN_CONTAINER" cat /data/users.json | jq 'length')
  echo "  Blue:  $BLUE_FINAL users"
  echo "  Green: $GREEN_FINAL users"
  echo ""
  echo "💾 Backups saved to: $BACKUP_DIR"
  echo "🎉 Users can now login to BOTH instances with same credentials!"
  exit 0
}

# ============================================================================
# MAIN SCRIPT
# ============================================================================

if [ "$DOCKER_MODE" = true ]; then
  print_header "👥 User Consolidation - Docker Mode"
  echo "Direct Docker merge: reading/writing users.json via docker exec."
  echo "Run this script ON the server where Blue and Green containers are running."
  echo ""
  run_docker_consolidation
fi

print_header "👥 User Consolidation - Blue ⟷ Green"

# Display TLS/Certificate Warning
print_warning "⚠️  IMPORTANT: TLS Certificate Compatibility"
echo ""
echo "  When consolidating between instances, use INTERNAL IP ADDRESSES instead of"
echo "  hostnames if TLS certificates don't match. API authentication may fail with"
echo "  certificate mismatch errors (e.g., cert for 'example.com' vs 'subdomain.example.com')."
echo ""
echo -e "  ${GREEN}✓ RECOMMENDED:${NC} http://192.168.1.200:3019  (internal IP, no TLS issues)"
echo -e "  ${RED}✗ MAY FAIL:${NC}    https://green.oscal.keekar.com  (TLS certificate mismatch)"
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
BLUE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "$BLUE_URL/" 2>/dev/null || echo "000")
GREEN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "$GREEN_URL/" 2>/dev/null || echo "000")

# When running ON the Blue or Green server, public IP may be unreachable; use localhost for the local instance
if [ "$BLUE_STATUS" = "000" ]; then
  LOCAL_BLUE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 "http://127.0.0.1:3020/" 2>/dev/null || echo "000")
  if [ "$LOCAL_BLUE" != "000" ]; then
    BLUE_URL="http://127.0.0.1:3020"
    BLUE_STATUS="$LOCAL_BLUE"
    print_info "Using localhost for Blue (script is running on Blue server)"
  else
    print_warning "Blue instance not accessible at $BLUE_URL"
  fi
fi

if [ "$GREEN_STATUS" = "000" ]; then
  LOCAL_GREEN=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 "http://127.0.0.1:3019/" 2>/dev/null || echo "000")
  if [ "$LOCAL_GREEN" != "000" ]; then
    GREEN_URL="http://127.0.0.1:3019"
    GREEN_STATUS="$LOCAL_GREEN"
    print_info "Using localhost for Green (script is running on Green server)"
  else
    print_warning "Green instance not accessible at $GREEN_URL"
  fi
fi

if [ "$BLUE_STATUS" = "000" ] && [ "$GREEN_STATUS" = "000" ]; then
  print_error "Neither Blue nor Green instances are accessible!"
  exit 1
fi

echo ""
echo "Instance Status:"
echo -e "  ${BLUE}Blue ($BLUE_URL):${NC}  $([ "$BLUE_STATUS" != "000" ] && echo "✓ Accessible (HTTP $BLUE_STATUS)" || echo "✗ Not accessible")"
echo -e "  ${GREEN}Green ($GREEN_URL):${NC} $([ "$GREEN_STATUS" != "000" ] && echo "✓ Accessible (HTTP $GREEN_STATUS)" || echo "✗ Not accessible")"
echo ""

# Create backup directory and cookie jars (for ALB stickiness when Blue/Green behind load balancer)
mkdir -p "$BACKUP_DIR"
COOKIE_JAR_BLUE="$BACKUP_DIR/.cookies_blue"
COOKIE_JAR_GREEN="$BACKUP_DIR/.cookies_green"
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
  
  BLUE_PASS_ENTRY="${BLUE_PASS_ENTRY:-OSCAL/admin}"
  BLUE_LOGGED_IN=false

  # 1) Password already set (env / --blue-password): try login once
  if [ -n "$BLUE_PASSWORD" ]; then
    print_info "Using Blue password from environment/cli"
    if api_login_attempt "$BLUE_URL" "$BLUE_USER" "$BLUE_PASSWORD" "$COOKIE_JAR_BLUE"; then
      BLUE_LOGGED_IN=true
      BLUE_TOKEN=$(echo "$API_LOGIN_BODY" | jq -r '.sessionToken // empty')
    else
      print_error "Blue authentication failed (password from environment/cli)!"
      print_login_failure "$BLUE_URL"
      echo "  → If running on Blue server, script will try http://127.0.0.1:3020 automatically."
      exit 1
    fi
  else
    # 2) Try pass vault first (no prompt until we know pass is missing or login fails)
    BLUE_PASSWORD=$(get_password_from_pass "$BLUE_PASS_ENTRY")
    if [ -n "$BLUE_PASSWORD" ]; then
      if api_login_attempt "$BLUE_URL" "$BLUE_USER" "$BLUE_PASSWORD" "$COOKIE_JAR_BLUE"; then
        print_info "Blue authenticated using pass ($BLUE_PASS_ENTRY)"
        BLUE_LOGGED_IN=true
        BLUE_TOKEN=$(echo "$API_LOGIN_BODY" | jq -r '.sessionToken // empty')
      else
        print_warning "Pass vault login failed for Blue ($BLUE_PASS_ENTRY); will prompt for password."
        BLUE_PASSWORD=""
      fi
    fi
    # 3) No pass entry or pass login failed: prompt then try
    if [ "$BLUE_LOGGED_IN" != true ]; then
      if [ -z "$BLUE_PASSWORD" ]; then
        print_info "Enter Blue admin password (pass entry missing or not used)."
      fi
      while [ "$BLUE_LOGGED_IN" != true ]; do
        if [ -z "$BLUE_PASSWORD" ]; then
          read -rsp "Blue password: " BLUE_PASSWORD
          echo ""
        fi
        if [ -z "$BLUE_PASSWORD" ]; then
          print_error "Blue password cannot be empty."
          exit 1
        fi
        if api_login_attempt "$BLUE_URL" "$BLUE_USER" "$BLUE_PASSWORD" "$COOKIE_JAR_BLUE"; then
          BLUE_LOGGED_IN=true
          BLUE_TOKEN=$(echo "$API_LOGIN_BODY" | jq -r '.sessionToken // empty')
        else
          print_error "Blue authentication failed!"
          print_login_failure "$BLUE_URL"
          BLUE_PASSWORD=""
          read -rp "Try again? [y/N]: " _retry
          case "$_retry" in
            y|Y|yes|YES) ;;
            *) exit 1 ;;
          esac
        fi
      done
    fi
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
  
  GREEN_PASS_ENTRY="${GREEN_PASS_ENTRY:-OSCAL/admin}"
  GREEN_LOGGED_IN=false

  # 1) Password already set (env / --green-password): try login once
  if [ -n "$GREEN_PASSWORD" ]; then
    print_info "Using Green password from environment/cli"
    if api_login_attempt "$GREEN_URL" "$GREEN_USER" "$GREEN_PASSWORD" "$COOKIE_JAR_GREEN"; then
      GREEN_LOGGED_IN=true
      GREEN_TOKEN=$(echo "$API_LOGIN_BODY" | jq -r '.sessionToken // empty')
    else
      print_error "Green authentication failed (password from environment/cli)!"
      print_login_failure "$GREEN_URL"
      echo "  → If running on Green server, script will try http://127.0.0.1:3019 automatically."
      exit 1
    fi
  else
    # 2) Try pass vault first (no prompt until pass missing or login fails)
    GREEN_PASSWORD=$(get_password_from_pass "$GREEN_PASS_ENTRY")
    if [ -n "$GREEN_PASSWORD" ]; then
      if api_login_attempt "$GREEN_URL" "$GREEN_USER" "$GREEN_PASSWORD" "$COOKIE_JAR_GREEN"; then
        print_info "Green authenticated using pass ($GREEN_PASS_ENTRY)"
        GREEN_LOGGED_IN=true
        GREEN_TOKEN=$(echo "$API_LOGIN_BODY" | jq -r '.sessionToken // empty')
      else
        print_warning "Pass vault login failed for Green ($GREEN_PASS_ENTRY); will prompt for password."
        GREEN_PASSWORD=""
      fi
    fi
    # 3) No pass entry or pass login failed: prompt then try
    if [ "$GREEN_LOGGED_IN" != true ]; then
      if [ -z "$GREEN_PASSWORD" ]; then
        print_info "Enter Green admin password (pass entry missing or not used)."
      fi
      while [ "$GREEN_LOGGED_IN" != true ]; do
        if [ -z "$GREEN_PASSWORD" ]; then
          read -rsp "Green password: " GREEN_PASSWORD
          echo ""
        fi
        if [ -z "$GREEN_PASSWORD" ]; then
          print_error "Green password cannot be empty."
          exit 1
        fi
        if api_login_attempt "$GREEN_URL" "$GREEN_USER" "$GREEN_PASSWORD" "$COOKIE_JAR_GREEN"; then
          GREEN_LOGGED_IN=true
          GREEN_TOKEN=$(echo "$API_LOGIN_BODY" | jq -r '.sessionToken // empty')
        else
          print_error "Green authentication failed!"
          print_login_failure "$GREEN_URL"
          GREEN_PASSWORD=""
          read -rp "Try again? [y/N]: " _retry
          case "$_retry" in
            y|Y|yes|YES) ;;
            *) exit 1 ;;
          esac
        fi
      done
    fi
  fi

  print_success "Green authentication successful"
fi

# ============================================================================
# BLUE → GREEN
# ============================================================================

if [ "$DIRECTION" = "1" ] || [ "$DIRECTION" = "3" ]; then
  print_header "📤 Exporting Users from Blue"
  
  BLUE_EXPORT_RESPONSE=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR_BLUE" -H "Authorization: Bearer $BLUE_TOKEN" \
    "$BLUE_URL/api/users/export")
  BLUE_EXPORT_HTTP=$(echo "$BLUE_EXPORT_RESPONSE" | tail -n1)
  echo "$BLUE_EXPORT_RESPONSE" | sed '$d' > "$BACKUP_DIR/blue-users.json"
  
  if [ "$BLUE_EXPORT_HTTP" != "200" ]; then
    print_error "Blue export failed (HTTP $BLUE_EXPORT_HTTP)"
    echo "  Response: $(jq -c '.' "$BACKUP_DIR/blue-users.json" 2>/dev/null || cat "$BACKUP_DIR/blue-users.json")"
    if [ "$BLUE_EXPORT_HTTP" = "401" ]; then
      echo ""
      echo "  💡 401 'Invalid or expired session' usually means:"
      echo "     Blue is behind a load balancer. Login and export hit different instances."
      echo "     Sessions are in-memory (not shared). Use DIRECT instance URL to bypass ALB:"
      echo "       --blue-url http://BLUE_IP:3020"
      echo "     Get Blue IP: terraform -chdir=terraform output -raw oscal_blue_public_ip"
    elif [ "$BLUE_EXPORT_HTTP" = "404" ]; then
      BLUE_ERR=$(jq -r '.error // empty' "$BACKUP_DIR/blue-users.json" 2>/dev/null)
      if [ "$BLUE_ERR" = "User not found" ]; then
        echo ""
        echo "  💡 404 'User not found' on /api/users/export means:"
        echo "     Blue instance does NOT have the export endpoint (older app version)."
        echo "     The request is being matched as GET /api/users/:userId with userId='export'."
        echo ""
        echo "  Fix: Deploy a newer OSCAL Report Generator version to Blue that includes"
        echo "       GET /api/users/export. Check docs/CONFIG_AND_USER_MIGRATION.md."
      else
        echo "  Check Blue auth and that BLUE_URL ($BLUE_URL) is correct."
      fi
    else
      echo "  Check Blue auth and that BLUE_URL ($BLUE_URL) is correct."
    fi
    exit 1
  fi
  
  BLUE_USER_COUNT=$(jq '.userCount // (.users | length) // 0' "$BACKUP_DIR/blue-users.json" 2>/dev/null || echo "0")
  if ! jq -e '.users | type == "array"' "$BACKUP_DIR/blue-users.json" >/dev/null 2>&1; then
    print_error "Blue export failed: response missing users array"
    echo "  Response: $(jq -c '.' "$BACKUP_DIR/blue-users.json" 2>/dev/null || cat "$BACKUP_DIR/blue-users.json")"
    exit 1
  fi
  print_success "Exported $BLUE_USER_COUNT users from Blue"
  
  print_header "📥 Importing Blue Users into Green (mode=$IMPORT_MODE)"
  
  IMPORT_RESPONSE=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR_GREEN" -X POST "$GREEN_URL/api/users/import?mode=$IMPORT_MODE" \
    -H "Authorization: Bearer $GREEN_TOKEN" \
    -H "Content-Type: application/json" \
    -d @"$BACKUP_DIR/blue-users.json")
  IMPORT_HTTP_CODE=$(echo "$IMPORT_RESPONSE" | tail -n1)
  IMPORT_RESULT=$(echo "$IMPORT_RESPONSE" | sed '$d')
  
  echo "$IMPORT_RESULT" | jq
  
  if [ "$IMPORT_HTTP_CODE" != "200" ]; then
    print_error "Blue → Green import failed (HTTP $IMPORT_HTTP_CODE)"
    echo "  Response: $(echo "$IMPORT_RESULT" | jq -c '.' 2>/dev/null || echo "$IMPORT_RESULT")"
    echo "  Check Green backend logs and ensure BLUE_URL/GREEN_URL point to the correct instances."
    exit 1
  fi
  
  IMPORT_SUCCESS=$(echo "$IMPORT_RESULT" | jq -r '.success' 2>/dev/null)
  if [ "$IMPORT_SUCCESS" != "true" ]; then
    print_error "Blue → Green import returned success=false"
    echo "  Response: $(echo "$IMPORT_RESULT" | jq -c '.' 2>/dev/null || echo "$IMPORT_RESULT")"
    exit 1
  fi
  
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
  
  GREEN_EXPORT_RESPONSE=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR_GREEN" -H "Authorization: Bearer $GREEN_TOKEN" \
    "$GREEN_URL/api/users/export")
  GREEN_EXPORT_HTTP=$(echo "$GREEN_EXPORT_RESPONSE" | tail -n1)
  echo "$GREEN_EXPORT_RESPONSE" | sed '$d' > "$BACKUP_DIR/green-users.json"
  
  if [ "$GREEN_EXPORT_HTTP" != "200" ]; then
    print_error "Green export failed (HTTP $GREEN_EXPORT_HTTP)"
    echo "  Response: $(jq -c '.' "$BACKUP_DIR/green-users.json" 2>/dev/null || cat "$BACKUP_DIR/green-users.json")"
    if [ "$GREEN_EXPORT_HTTP" = "404" ]; then
      GREEN_ERR=$(jq -r '.error // empty' "$BACKUP_DIR/green-users.json" 2>/dev/null)
      if [ "$GREEN_ERR" = "User not found" ]; then
        echo ""
        echo "  💡 404 'User not found' on /api/users/export means:"
        echo "     Green instance does NOT have the export endpoint (older app version)."
        echo "     Deploy a newer OSCAL Report Generator version that includes GET /api/users/export."
      fi
    fi
    echo "  Check Green auth and that GREEN_URL ($GREEN_URL) is correct."
    exit 1
  fi
  
  GREEN_USER_COUNT=$(jq '.userCount // (.users | length) // 0' "$BACKUP_DIR/green-users.json" 2>/dev/null || echo "0")
  if ! jq -e '.users | type == "array"' "$BACKUP_DIR/green-users.json" >/dev/null 2>&1; then
    print_error "Green export failed: response missing users array"
    echo "  Response: $(jq -c '.' "$BACKUP_DIR/green-users.json" 2>/dev/null || cat "$BACKUP_DIR/green-users.json")"
    exit 1
  fi
  print_success "Exported $GREEN_USER_COUNT users from Green"
  
  print_header "📥 Importing Green Users into Blue (mode=$IMPORT_MODE)"
  
  IMPORT_RESPONSE=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR_BLUE" -X POST "$BLUE_URL/api/users/import?mode=$IMPORT_MODE" \
    -H "Authorization: Bearer $BLUE_TOKEN" \
    -H "Content-Type: application/json" \
    -d @"$BACKUP_DIR/green-users.json")
  IMPORT_HTTP_CODE=$(echo "$IMPORT_RESPONSE" | tail -n1)
  IMPORT_RESULT=$(echo "$IMPORT_RESPONSE" | sed '$d')
  
  echo "$IMPORT_RESULT" | jq
  
  if [ "$IMPORT_HTTP_CODE" != "200" ]; then
    print_error "Green → Blue import failed (HTTP $IMPORT_HTTP_CODE)"
    echo "  Response: $(echo "$IMPORT_RESULT" | jq -c '.' 2>/dev/null || echo "$IMPORT_RESULT")"
    echo "  Check Blue backend logs and ensure BLUE_URL/GREEN_URL point to the correct instances."
    exit 1
  fi
  
  IMPORT_SUCCESS=$(echo "$IMPORT_RESULT" | jq -r '.success' 2>/dev/null)
  if [ "$IMPORT_SUCCESS" != "true" ]; then
    print_error "Green → Blue import returned success=false"
    echo "  Response: $(echo "$IMPORT_RESULT" | jq -c '.' 2>/dev/null || echo "$IMPORT_RESULT")"
    exit 1
  fi
  
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
  BLUE_FINAL_COUNT=$(curl -s -b "$COOKIE_JAR_BLUE" -H "Authorization: Bearer $BLUE_TOKEN" \
    "$BLUE_URL/api/users" | jq '.users | length' 2>/dev/null || echo "0")
  echo -e "${BLUE}Blue:${NC}  Total users: $BLUE_FINAL_COUNT"
fi

if [ "$GREEN_STATUS" != "000" ]; then
  GREEN_FINAL_COUNT=$(curl -s -b "$COOKIE_JAR_GREEN" -H "Authorization: Bearer $GREEN_TOKEN" \
    "$GREEN_URL/api/users" | jq '.users | length' 2>/dev/null || echo "0")
  echo -e "${GREEN}Green:${NC} Total users: $GREEN_FINAL_COUNT"
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
echo "⚠️  If Green/Blue still show fewer users in the UI than above:"
echo "   • Ensure --blue-url and --green-url match the EXACT URLs you use to access each instance"
echo "   • Different hostnames (e.g. ALB vs direct IP) can point to different backends"
echo "   • Use internal IPs: --blue-url http://IP:3020 --green-url http://IP:3019"
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
