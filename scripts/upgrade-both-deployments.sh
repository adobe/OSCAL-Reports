#!/bin/bash
# Upgrade Both Blue and Green Deployments with Data Backup and Restore
# Author: Mukesh Kesharwani
# Version: 1.0.0

set -e

# ============================================================================
# CONFIGURATION
# ============================================================================

BACKUP_DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_BASE="$HOME/oscal-backup-$BACKUP_DATE"

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

print_header "🔄 Blue-Green Deployment Upgrade"

echo "This script will upgrade BOTH Blue and Green deployments:"
echo ""
echo "  ${BLUE}Blue${NC}  (v1.5.0 → v1.6.5+)"
echo "    - Port: 3020"
echo "    - Container: oscal-report-generator-blue"
echo ""
echo "  ${GREEN}Green${NC} (v1.6.2 → v1.6.5+)"
echo "    - Port: 3019"
echo "    - Container: oscal-report-generator-green"
echo ""
echo "Each deployment will:"
echo "  1. Backup current data"
echo "  2. Upgrade to volume persistence"
echo "  3. Restore users and configuration"
echo ""
echo "⚠️  WARNING: This will cause downtime for BOTH deployments"
echo ""
read -p "Do you want to proceed? (yes/no): " -r
if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
  echo "Upgrade cancelled."
  exit 0
fi

mkdir -p "$BACKUP_BASE"
print_info "Backup directory: $BACKUP_BASE"
echo ""

# ============================================================================
# CONFIGURE HOSTNAMES
# ============================================================================

print_header "🌐 Configure Container Access"

print_info "Enter hostname or IP to access containers"
print_info "Common options: localhost, 127.0.0.1, or your NAS IP (e.g., 192.168.1.200)"
echo ""
read -p "Blue hostname/IP (default: localhost): " BLUE_HOST
BLUE_HOST=${BLUE_HOST:-localhost}
print_info "Blue will use: http://${BLUE_HOST}:3020"

read -p "Green hostname/IP (default: localhost): " GREEN_HOST
GREEN_HOST=${GREEN_HOST:-localhost}
print_info "Green will use: http://${GREEN_HOST}:3019"
echo ""

# ============================================================================
# STEP 1: BACKUP BLUE DEPLOYMENT
# ============================================================================

print_header "📦 Step 1: Backing Up Blue Deployment"

BLUE_BACKUP="$BACKUP_BASE/blue"
mkdir -p "$BLUE_BACKUP"

BLUE_CONTAINER="oscal-report-generator-blue"
BLUE_PORT="3020"

# Check if Blue container exists
if docker ps -a --format '{{.Names}}' | grep -q "^${BLUE_CONTAINER}$"; then
  print_info "Blue container found"
  
  # Start if not running
  if ! docker ps --format '{{.Names}}' | grep -q "^${BLUE_CONTAINER}$"; then
    print_warning "Starting Blue container for backup..."
    docker start "$BLUE_CONTAINER"
    sleep 10
  fi
  
  # Get Blue credentials
  echo ""
  print_info "Enter Blue deployment admin credentials"
  read -p "Username (default: admin): " BLUE_ADMIN_USER
  BLUE_ADMIN_USER=${BLUE_ADMIN_USER:-admin}
  read -sp "Password: " BLUE_ADMIN_PASSWORD
  echo ""
  
  # Export Blue users
  BLUE_JSON=$(jq -n --arg user "$BLUE_ADMIN_USER" --arg pass "$BLUE_ADMIN_PASSWORD" '{username: $user, password: $pass}')
  BLUE_TOKEN=$(curl -s -X POST "http://${BLUE_HOST}:${BLUE_PORT}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "$BLUE_JSON" \
    | jq -r '.sessionToken' 2>/dev/null || echo "null")
  
  if [ "$BLUE_TOKEN" != "null" ] && [ -n "$BLUE_TOKEN" ]; then
    curl -s -H "Authorization: Bearer $BLUE_TOKEN" \
      "http://${BLUE_HOST}:${BLUE_PORT}/api/users/export" > "$BLUE_BACKUP/users.json"
    
    if [ -s "$BLUE_BACKUP/users.json" ]; then
      BLUE_USER_COUNT=$(jq '.userCount' "$BLUE_BACKUP/users.json" 2>/dev/null || echo "0")
      print_success "Blue: Exported $BLUE_USER_COUNT users"
    fi
  else
    print_error "Blue: Authentication failed"
  fi
  
  # Backup Blue config
  docker cp "$BLUE_CONTAINER:/app/config/app/config.json" "$BLUE_BACKUP/config.json" 2>/dev/null && \
    print_success "Blue: Configuration backed up" || \
    print_warning "Blue: Could not backup config"
else
  print_warning "Blue container not found - skipping Blue backup"
fi

echo ""

# ============================================================================
# STEP 2: BACKUP GREEN DEPLOYMENT
# ============================================================================

print_header "📦 Step 2: Backing Up Green Deployment"

GREEN_BACKUP="$BACKUP_BASE/green"
mkdir -p "$GREEN_BACKUP"

GREEN_CONTAINER="oscal-report-generator-green"
GREEN_PORT="3019"

# Check if Green container exists
if docker ps -a --format '{{.Names}}' | grep -q "^${GREEN_CONTAINER}$"; then
  print_info "Green container found"
  
  # Start if not running
  if ! docker ps --format '{{.Names}}' | grep -q "^${GREEN_CONTAINER}$"; then
    print_warning "Starting Green container for backup..."
    docker start "$GREEN_CONTAINER"
    sleep 10
  fi
  
  # Get Green credentials
  echo ""
  print_info "Enter Green deployment admin credentials"
  read -p "Username (default: admin): " GREEN_ADMIN_USER
  GREEN_ADMIN_USER=${GREEN_ADMIN_USER:-admin}
  read -sp "Password: " GREEN_ADMIN_PASSWORD
  echo ""
  
  # Export Green users
  GREEN_JSON=$(jq -n --arg user "$GREEN_ADMIN_USER" --arg pass "$GREEN_ADMIN_PASSWORD" '{username: $user, password: $pass}')
  GREEN_TOKEN=$(curl -s -X POST "http://${GREEN_HOST}:${GREEN_PORT}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "$GREEN_JSON" \
    | jq -r '.sessionToken' 2>/dev/null || echo "null")
  
  if [ "$GREEN_TOKEN" != "null" ] && [ -n "$GREEN_TOKEN" ]; then
    curl -s -H "Authorization: Bearer $GREEN_TOKEN" \
      "http://${GREEN_HOST}:${GREEN_PORT}/api/users/export" > "$GREEN_BACKUP/users.json"
    
    if [ -s "$GREEN_BACKUP/users.json" ]; then
      GREEN_USER_COUNT=$(jq '.userCount' "$GREEN_BACKUP/users.json" 2>/dev/null || echo "0")
      print_success "Green: Exported $GREEN_USER_COUNT users"
    fi
  else
    print_error "Green: Authentication failed"
  fi
  
  # Backup Green config
  docker cp "$GREEN_CONTAINER:/app/config/app/config.json" "$GREEN_BACKUP/config.json" 2>/dev/null && \
    print_success "Green: Configuration backed up" || \
    print_warning "Green: Could not backup config"
else
  print_warning "Green container not found - skipping Green backup"
fi

echo ""
print_success "Backups complete!"
echo ""

# ============================================================================
# STEP 3: UPGRADE BLUE DEPLOYMENT
# ============================================================================

print_header "🔨 Step 3: Upgrading Blue Deployment"

read -p "Enter full path to Blue directory: " BLUE_DIR
if [ ! -d "$BLUE_DIR" ]; then
  print_error "Blue directory not found: $BLUE_DIR"
  exit 1
fi

if [ ! -f "$BLUE_DIR/build_on_truenas.sh" ]; then
  print_error "build_on_truenas.sh not found in Blue directory"
  exit 1
fi

print_info "Found Blue build script"
read -p "Upgrade Blue now? (yes/no): " -r
if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
  cd "$BLUE_DIR"
  print_info "Running Blue build script..."
  ./build_on_truenas.sh
  
  print_info "Waiting for Blue container to start..."
  sleep 30
  
  # Restore Blue config
  if [ -f "$BLUE_BACKUP/config.json" ]; then
    docker cp "$BLUE_BACKUP/config.json" "$BLUE_CONTAINER:/data/config.json"
    docker restart "$BLUE_CONTAINER"
    sleep 30
    print_success "Blue: Config restored"
  fi
  
  # Restore Blue users
  echo ""
  print_info "Blue default credentials:"
  docker logs "$BLUE_CONTAINER" 2>&1 | grep -A 10 "Default Credentials" | head -15
  echo ""
  read -sp "Enter NEW Blue admin password: " NEW_BLUE_PASSWORD
  echo ""
  
  NEW_BLUE_JSON=$(jq -n --arg pass "$NEW_BLUE_PASSWORD" '{username: "admin", password: $pass}')
  NEW_BLUE_TOKEN=$(curl -s -X POST "http://${BLUE_HOST}:${BLUE_PORT}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "$NEW_BLUE_JSON" \
    | jq -r '.sessionToken' 2>/dev/null || echo "null")
  
  if [ "$NEW_BLUE_TOKEN" != "null" ] && [ -n "$NEW_BLUE_TOKEN" ] && [ -f "$BLUE_BACKUP/users.json" ]; then
    curl -s -X POST "http://${BLUE_HOST}:${BLUE_PORT}/api/users/import?mode=override" \
      -H "Authorization: Bearer $NEW_BLUE_TOKEN" \
      -H "Content-Type: application/json" \
      -d @"$BLUE_BACKUP/users.json" | jq
    print_success "Blue: Users restored"
  fi
  
  print_success "Blue upgrade complete!"
else
  print_warning "Blue upgrade skipped"
fi

echo ""

# ============================================================================
# STEP 4: UPGRADE GREEN DEPLOYMENT
# ============================================================================

print_header "🔨 Step 4: Upgrading Green Deployment"

read -p "Enter full path to Green directory: " GREEN_DIR
if [ ! -d "$GREEN_DIR" ]; then
  print_error "Green directory not found: $GREEN_DIR"
  exit 1
fi

if [ ! -f "$GREEN_DIR/build_on_truenas.sh" ]; then
  print_error "build_on_truenas.sh not found in Green directory"
  exit 1
fi

print_info "Found Green build script"
read -p "Upgrade Green now? (yes/no): " -r
if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
  cd "$GREEN_DIR"
  print_info "Running Green build script..."
  ./build_on_truenas.sh
  
  print_info "Waiting for Green container to start..."
  sleep 30
  
  # Restore Green config
  if [ -f "$GREEN_BACKUP/config.json" ]; then
    docker cp "$GREEN_BACKUP/config.json" "$GREEN_CONTAINER:/data/config.json"
    docker restart "$GREEN_CONTAINER"
    sleep 30
    print_success "Green: Config restored"
  fi
  
  # Restore Green users
  echo ""
  print_info "Green default credentials:"
  docker logs "$GREEN_CONTAINER" 2>&1 | grep -A 10 "Default Credentials" | head -15
  echo ""
  read -sp "Enter NEW Green admin password: " NEW_GREEN_PASSWORD
  echo ""
  
  NEW_GREEN_JSON=$(jq -n --arg pass "$NEW_GREEN_PASSWORD" '{username: "admin", password: $pass}')
  NEW_GREEN_TOKEN=$(curl -s -X POST "http://${GREEN_HOST}:${GREEN_PORT}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "$NEW_GREEN_JSON" \
    | jq -r '.sessionToken' 2>/dev/null || echo "null")
  
  if [ "$NEW_GREEN_TOKEN" != "null" ] && [ -n "$NEW_GREEN_TOKEN" ] && [ -f "$GREEN_BACKUP/users.json" ]; then
    curl -s -X POST "http://${GREEN_HOST}:${GREEN_PORT}/api/users/import?mode=override" \
      -H "Authorization: Bearer $NEW_GREEN_TOKEN" \
      -H "Content-Type: application/json" \
      -d @"$GREEN_BACKUP/users.json" | jq
    print_success "Green: Users restored"
  fi
  
  print_success "Green upgrade complete!"
else
  print_warning "Green upgrade skipped"
fi

echo ""

# ============================================================================
# STEP 5: VERIFICATION
# ============================================================================

print_header "🔍 Step 5: Verification"

echo "${BLUE}Blue Volume Status:${NC}"
curl -s http://${BLUE_HOST}:${BLUE_PORT}/api/system/volume-status 2>/dev/null | jq '.persistence' || \
  print_warning "Could not check Blue volume status"
echo ""

echo "${GREEN}Green Volume Status:${NC}"
curl -s http://${GREEN_HOST}:${GREEN_PORT}/api/system/volume-status 2>/dev/null | jq '.persistence' || \
  print_warning "Could not check Green volume status"
echo ""

# ============================================================================
# COMPLETION
# ============================================================================

print_header "✅ Blue-Green Upgrade Complete!"

echo ""
echo "📊 Deployment Information:"
echo ""
echo "  ${BLUE}Blue Deployment:${NC}"
echo "    URL: http://YOUR_SERVER:${BLUE_PORT}"
echo "    Container: $BLUE_CONTAINER"
echo "    Status: $(docker ps --format '{{.Status}}' --filter "name=$BLUE_CONTAINER" 2>/dev/null || echo "Unknown")"
echo ""
echo "  ${GREEN}Green Deployment:${NC}"
echo "    URL: http://YOUR_SERVER:${GREEN_PORT}"
echo "    Container: $GREEN_CONTAINER"
echo "    Status: $(docker ps --format '{{.Status}}' --filter "name=$GREEN_CONTAINER" 2>/dev/null || echo "Unknown")"
echo ""
echo "💾 Backups saved to:"
echo "   $BACKUP_BASE/"
echo "   ├── blue/"
echo "   │   ├── users.json"
echo "   │   └── config.json"
echo "   └── green/"
echo "       ├── users.json"
echo "       └── config.json"
echo ""
echo "📖 Next Steps:"
echo "   1. Test both deployments"
echo "   2. Verify users and configurations"
echo "   3. Consider consolidating users (see consolidate-users.sh)"
echo ""
echo "🎉 Both deployments now have volume persistence!"
echo "   Future updates will preserve your data automatically."
echo ""
