#!/bin/bash
# Direct Docker User Consolidation (Workaround)
# 
# This script directly accesses Docker containers to merge users.
# Use this until the backend API fix is deployed to both servers.
#
# Usage: Run this script ON the server where Docker containers are running
#   ./consolidate-users-docker.sh

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

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

print_header "👥 Direct Docker User Consolidation"

# Check if running as root or with docker permissions
if ! docker ps &> /dev/null; then
  print_error "Cannot access Docker. Please run with sudo or ensure user is in docker group."
  exit 1
fi

# Container names
BLUE_CONTAINER="oscal-report-generator-blue"
GREEN_CONTAINER="oscal-report-generator-green"

# Check containers
BLUE_RUNNING=$(docker ps --format '{{.Names}}' | grep -c "^${BLUE_CONTAINER}$" || echo "0")
GREEN_RUNNING=$(docker ps --format '{{.Names}}' | grep -c "^${GREEN_CONTAINER}$" || echo "0")

if [ "$BLUE_RUNNING" = "0" ] || [ "$GREEN_RUNNING" = "0" ]; then
  print_error "Both Blue and Green containers must be running!"
  echo "Blue: $([ "$BLUE_RUNNING" = "1" ] && echo "✓ Running" || echo "✗ Not running")"
  echo "Green: $([ "$GREEN_RUNNING" = "1" ] && echo "✓ Running" || echo "✗ Not running")"
  exit 1
fi

# Create backup directory
BACKUP_DIR="$HOME/oscal-user-consolidation-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
print_info "Backup directory: $BACKUP_DIR"
echo ""

# Extract users from Blue
print_header "📤 Extracting Users from Blue Container"
docker exec "$BLUE_CONTAINER" cat /data/users.json > "$BACKUP_DIR/blue-users.json"
BLUE_COUNT=$(jq 'length' "$BACKUP_DIR/blue-users.json")
print_success "Extracted $BLUE_COUNT users from Blue"

# Extract users from Green
print_header "📤 Extracting Users from Green Container"
docker exec "$GREEN_CONTAINER" cat /data/users.json > "$BACKUP_DIR/green-users.json"
GREEN_COUNT=$(jq 'length' "$BACKUP_DIR/green-users.json")
print_success "Extracted $GREEN_COUNT users from Green"

# Analyze differences
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
  echo "Users to copy from Blue to Green:"
  comm -23 "$BACKUP_DIR/blue-usernames.txt" "$BACKUP_DIR/green-usernames.txt" | while read -r user; do
    echo "  ✓ $user"
  done
  echo ""
fi

if [ "$GREEN_ONLY_COUNT" -gt 0 ]; then
  echo "Users to copy from Green to Blue:"
  comm -13 "$BACKUP_DIR/blue-usernames.txt" "$BACKUP_DIR/green-usernames.txt" | while read -r user; do
    echo "  ✓ $user"
  done
  echo ""
fi

# Merge Blue → Green
if [ "$BLUE_ONLY_COUNT" -gt 0 ]; then
  print_header "📥 Merging Blue Users into Green"
  
  # Create merged array (Green + new from Blue)
  MERGED=$(jq -s '.[0] as $green | .[1] as $blue | 
    $green + ($blue | map(select(.username as $u | $green | map(.username) | index($u) | not)))' \
    "$BACKUP_DIR/green-users.json" "$BACKUP_DIR/blue-users.json")
  
  # Save merged to temp file
  echo "$MERGED" > "$BACKUP_DIR/green-merged.json"
  
  ADDED=$(jq 'length' "$BACKUP_DIR/green-merged.json")
  echo "$MERGED" | docker exec -i "$GREEN_CONTAINER" tee /data/users.json > /dev/null
  
  print_success "Blue → Green: Added $BLUE_ONLY_COUNT users (Total: $ADDED)"
else
  print_info "Blue → Green: No new users to add"
fi

# Merge Green → Blue  
if [ "$GREEN_ONLY_COUNT" -gt 0 ]; then
  print_header "📥 Merging Green Users into Blue"
  
  # Create merged array (Blue + new from Green)
  MERGED=$(jq -s '.[0] as $blue | .[1] as $green | 
    $blue + ($green | map(select(.username as $u | $blue | map(.username) | index($u) | not)))' \
    "$BACKUP_DIR/blue-users.json" "$BACKUP_DIR/green-users.json")
  
  # Save merged to temp file
  echo "$MERGED" > "$BACKUP_DIR/blue-merged.json"
  
  ADDED=$(jq 'length' "$BACKUP_DIR/blue-merged.json")
  echo "$MERGED" | docker exec -i "$BLUE_CONTAINER" tee /data/users.json > /dev/null
  
  print_success "Green → Blue: Added $GREEN_ONLY_COUNT users (Total: $ADDED)"
else
  print_info "Green → Blue: No new users to add"
fi

# Restart containers to reload users
print_header "🔄 Restarting Containers"
docker restart "$BLUE_CONTAINER" > /dev/null &
docker restart "$GREEN_CONTAINER" > /dev/null &
wait
print_success "Containers restarted"

# Verification
print_header "✅ Consolidation Complete!"

echo ""
echo "📊 Final Status:"
BLUE_FINAL=$(docker exec "$BLUE_CONTAINER" cat /data/users.json | jq 'length')
GREEN_FINAL=$(docker exec "$GREEN_CONTAINER" cat /data/users.json | jq 'length')
echo "  Blue:  $BLUE_FINAL users"
echo "  Green: $GREEN_FINAL users"
echo ""
echo "💾 Backups saved to: $BACKUP_DIR"
echo ""
echo "🎉 Users can now login to BOTH instances with same credentials!"
echo ""
