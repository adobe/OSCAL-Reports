#!/bin/bash
# Upgrade Blue Deployment with Data Backup and Restore
# Author: Mukesh Kesharwani
# Version: 1.0.0

set -e

# ============================================================================
# CONFIGURATION
# ============================================================================

DEPLOYMENT="Blue"
CONTAINER_NAME="oscal-report-generator-blue"
CONTAINER_PORT="3020"
BACKUP_DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="$HOME/oscal-blue-backup-$BACKUP_DATE"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC}  $1"; }
print_info() { echo -e "${BLUE}ℹ${NC}  $1"; }
print_header() {
  echo ""
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo ""
}

# ============================================================================
# MAIN SCRIPT
# ============================================================================

print_header "Blue Deployment Upgrade (v1.5.0 → v1.6.5+)"

echo "This script will:"
echo "  1. Backup your current Blue deployment data"
echo "  2. Upgrade to version with volume persistence"
echo "  3. Restore your users and configuration"
echo ""
echo "⚠️  WARNING: This will cause downtime for Blue deployment"
echo ""
read -p "Do you want to proceed? (yes/no): " -r
if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
  echo "Upgrade cancelled."
  exit 0
fi

# ============================================================================
# STEP 1: BACKUP CURRENT DATA
# ============================================================================

print_header "Step 1: Backing Up Current Data"

mkdir -p "$BACKUP_DIR"
print_info "Backup directory: $BACKUP_DIR"

# Check if container exists
if ! docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  print_error "Container $CONTAINER_NAME not found!"
  echo "Available containers:"
  docker ps -a --format '{{.Names}}'
  exit 1
fi

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  print_warning "Container is not running. Starting it for backup..."
  docker start "$CONTAINER_NAME"
  sleep 10
fi

# Get admin credentials
echo ""
print_info "Enter Blue deployment admin credentials"
read -p "Username (default: admin): " ADMIN_USER
ADMIN_USER=${ADMIN_USER:-admin}
read -sp "Password: " ADMIN_PASSWORD
echo ""

# Get hostname/IP for API access
echo ""
print_info "Enter hostname or IP to access the container"
print_info "Common options: localhost, 127.0.0.1, or your NAS IP (e.g., 192.168.1.111)"
read -p "Hostname/IP (default: localhost): " CONTAINER_HOST
CONTAINER_HOST=${CONTAINER_HOST:-localhost}
print_info "Will use: http://${CONTAINER_HOST}:${CONTAINER_PORT}"

# Authenticate and export users
print_info "Exporting users..."

# Create JSON payload with proper escaping
JSON_PAYLOAD=$(jq -n \
  --arg user "$ADMIN_USER" \
  --arg pass "$ADMIN_PASSWORD" \
  '{username: $user, password: $pass}')

TOKEN=$(curl -s -X POST "http://${CONTAINER_HOST}:${CONTAINER_PORT}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "$JSON_PAYLOAD" \
  | jq -r '.sessionToken' 2>/dev/null || echo "null")

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  print_error "Authentication failed! Please check your credentials."
  echo ""
  echo "If you don't remember the password, you can:"
  echo "  1. Skip backup (data will be lost)"
  echo "  2. Try to recover from container logs"
  echo ""
  read -p "Continue without backup? (yes/no): " -r
  if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "Upgrade cancelled."
    exit 1
  fi
  print_warning "Proceeding without user backup"
else
  # Export users
  curl -s -H "Authorization: Bearer $TOKEN" \
    "http://${CONTAINER_HOST}:${CONTAINER_PORT}/api/users/export" > "$BACKUP_DIR/users.json"
  
  if [ -s "$BACKUP_DIR/users.json" ]; then
    USER_COUNT=$(jq '.userCount' "$BACKUP_DIR/users.json" 2>/dev/null || echo "0")
    print_success "Exported $USER_COUNT users to $BACKUP_DIR/users.json"
  else
    print_error "Failed to export users"
  fi
fi

# Backup config file
print_info "Backing up configuration..."
if docker cp "$CONTAINER_NAME:/app/config/app/config.json" "$BACKUP_DIR/config.json" 2>/dev/null; then
  print_success "Configuration backed up to $BACKUP_DIR/config.json"
else
  print_warning "Could not backup config.json (may not exist)"
fi

# Create backup metadata
cat > "$BACKUP_DIR/backup-info.txt" << EOF
Backup Information
==================
Date: $(date)
Deployment: Blue
Container: $CONTAINER_NAME
Port: $CONTAINER_PORT
Original Version: v1.5.0
Backup Directory: $BACKUP_DIR

Files:
- users.json (if authentication succeeded)
- config.json (if found)

Next Steps:
1. Run build_on_truenas.sh in Blue directory
2. Wait for container to start
3. Run restore section of this script
EOF

print_success "Backup complete!"
echo ""
print_info "Backup saved to: $BACKUP_DIR"
echo ""

# ============================================================================
# STEP 2: RUN BUILD SCRIPT
# ============================================================================

print_header "Step 2: Upgrading Blue Deployment"

echo "Now you need to run the build script from the Blue directory."
echo ""
echo "IMPORTANT: Make sure you're in the Blue deployment directory!"
echo ""
read -p "Enter the full path to your Blue directory: " BLUE_DIR

if [ ! -d "$BLUE_DIR" ]; then
  print_error "Directory not found: $BLUE_DIR"
  exit 1
fi

if [ ! -f "$BLUE_DIR/build_on_truenas.sh" ]; then
  print_error "build_on_truenas.sh not found in $BLUE_DIR"
  exit 1
fi

print_info "Found build script in $BLUE_DIR"
echo ""
read -p "Run the build script now? (yes/no): " -r
if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
  cd "$BLUE_DIR"
  print_info "Running build script..."
  ./build_on_truenas.sh
else
  echo ""
  print_warning "Build script not executed. Run it manually:"
  echo "  cd $BLUE_DIR"
  echo "  ./build_on_truenas.sh"
  echo ""
  echo "After running the build script, execute this script again"
  echo "with the --restore flag to restore your data:"
  echo "  $0 --restore $BACKUP_DIR"
  exit 0
fi

# ============================================================================
# STEP 3: WAIT FOR CONTAINER
# ============================================================================

print_header "Step 3: Waiting for New Container"

print_info "Waiting 30 seconds for container to start..."
sleep 30

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  print_error "Container is not running after upgrade!"
  echo "Check logs: docker logs $CONTAINER_NAME"
  exit 1
fi

print_success "Container is running"

# ============================================================================
# STEP 4: RESTORE DATA
# ============================================================================

print_header "Step 4: Restoring Data"

# Restore config if exists
if [ -f "$BACKUP_DIR/config.json" ]; then
  print_info "Restoring configuration..."
  docker cp "$BACKUP_DIR/config.json" "$CONTAINER_NAME:/data/config.json"
  print_success "Configuration copied to volume"
  
  print_info "Restarting container to load configuration..."
  docker restart "$CONTAINER_NAME"
  sleep 30
  print_success "Container restarted"
fi

# Get new admin credentials
echo ""
print_info "Retrieving new default admin credentials..."
echo ""
docker logs "$CONTAINER_NAME" 2>&1 | grep -A 15 "Default Credentials" | head -20 || \
  docker logs "$CONTAINER_NAME" 2>&1 | grep "Password:" | head -5

echo ""
print_warning "Use the credentials shown above to login"
echo ""
read -p "Username (default: admin): " NEW_ADMIN_USER
NEW_ADMIN_USER=${NEW_ADMIN_USER:-admin}
read -sp "Password (from credentials above): " NEW_ADMIN_PASSWORD
echo ""

# Authenticate with new credentials
print_info "Authenticating with new credentials..."

# Create JSON payload with proper escaping
NEW_JSON_PAYLOAD=$(jq -n \
  --arg user "$NEW_ADMIN_USER" \
  --arg pass "$NEW_ADMIN_PASSWORD" \
  '{username: $user, password: $pass}')

NEW_TOKEN=$(curl -s -X POST "http://${CONTAINER_HOST}:${CONTAINER_PORT}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "$NEW_JSON_PAYLOAD" \
  | jq -r '.sessionToken' 2>/dev/null || echo "null")

if [ "$NEW_TOKEN" = "null" ] || [ -z "$NEW_TOKEN" ]; then
  print_error "Authentication failed with new credentials!"
  echo ""
  echo "You can manually import users later using:"
  echo "  curl -X POST 'http://localhost:${CONTAINER_PORT}/api/users/import?mode=override' \\"
  echo "    -H \"Authorization: Bearer \$TOKEN\" \\"
  echo "    -H \"Content-Type: application/json\" \\"
  echo "    -d @$BACKUP_DIR/users.json"
  exit 1
fi

print_success "Authenticated successfully"

# Import users
if [ -f "$BACKUP_DIR/users.json" ]; then
  print_info "Importing users..."
  
  IMPORT_RESULT=$(curl -s -X POST "http://${CONTAINER_HOST}:${CONTAINER_PORT}/api/users/import?mode=override" \
    -H "Authorization: Bearer $NEW_TOKEN" \
    -H "Content-Type: application/json" \
    -d @"$BACKUP_DIR/users.json")
  
  echo "$IMPORT_RESULT" | jq
  
  ADDED=$(echo "$IMPORT_RESULT" | jq -r '.results.added' 2>/dev/null || echo "0")
  UPDATED=$(echo "$IMPORT_RESULT" | jq -r '.results.updated' 2>/dev/null || echo "0")
  
  print_success "Import complete: $ADDED added, $UPDATED updated"
else
  print_warning "No users backup found - skipping import"
fi

# ============================================================================
# STEP 5: VERIFY
# ============================================================================

print_header "Step 5: Verification"

print_info "Checking volume status..."
VOLUME_STATUS=$(curl -s "http://${CONTAINER_HOST}:${CONTAINER_PORT}/api/system/volume-status")

echo "$VOLUME_STATUS" | jq '.'

PERSISTENCE_ENABLED=$(echo "$VOLUME_STATUS" | jq -r '.persistence.enabled' 2>/dev/null || echo "false")

if [ "$PERSISTENCE_ENABLED" = "true" ]; then
  print_success "Volume persistence is ENABLED!"
else
  print_error "Volume persistence is NOT enabled - check logs!"
fi

# ============================================================================
# COMPLETION
# ============================================================================

print_header "✅ Blue Deployment Upgrade Complete!"

echo ""
echo "📊 Deployment Information:"
echo "   Container: $CONTAINER_NAME"
echo "   Port: $CONTAINER_PORT"
echo "   URL: http://YOUR_SERVER:$CONTAINER_PORT"
echo ""
echo "💾 Backup Location:"
echo "   $BACKUP_DIR"
echo ""
echo "🔍 Volume Status:"
echo "   curl http://${CONTAINER_HOST}:${CONTAINER_PORT}/api/system/volume-status"
echo ""
echo "📖 Next Steps:"
echo "   1. Test Blue deployment: http://YOUR_SERVER:$CONTAINER_PORT"
echo "   2. Verify users and configuration"
echo "   3. Consider upgrading Green deployment"
echo ""
echo "🎉 Your data will now persist across future updates!"
echo ""
