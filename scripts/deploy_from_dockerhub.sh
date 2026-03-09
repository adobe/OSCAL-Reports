#!/bin/bash

# OSCAL Report Generator - Docker Hub Pull-Based Deployment Script
# This script pulls pre-built images from Docker Hub and deploys with automatic
# backup, restore, and rollback capabilities for Blue-Green deployments
#
# Author: Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
# Copyright (c) 2025 Mukesh Kesharwani
# License: GPL-3.0-or-later
#
# Usage:
#   ./deploy_from_dockerhub.sh [--force] [--skip-backup]
#
# Options:
#   --force         Force deployment even if lock file exists
#   --skip-backup   Skip API backup (use volume backup only)

set -e  # Exit on error

# ============================================================================
# COLOR DEFINITIONS
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
# shellcheck disable=SC2034
MAGENTA='\033[0;35m'
NC='\033[0m'  # No Color

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC}  $1"; }
print_info() { echo -e "${BLUE}ℹ${NC}  $1"; }
print_header() {
  echo ""
  echo -e "${CYAN}========================================${NC}"
  echo -e "${CYAN}$1${NC}"
  echo -e "${CYAN}========================================${NC}"
  echo ""
}

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# ============================================================================
# CONFIGURATION
# ============================================================================

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && cd .. && pwd)"
cd "$SCRIPT_DIR"

# Parse command line options
FORCE_DEPLOY=false
SKIP_API_BACKUP=false

for arg in "$@"; do
  case $arg in
    --force|-f)
      FORCE_DEPLOY=true
      shift
      ;;
    --skip-backup)
      SKIP_API_BACKUP=true
      shift
      ;;
    *)
      echo "Unknown option: $arg"
      echo "Usage: $0 [--force] [--skip-backup]"
      exit 1
      ;;
  esac
done

# Docker Hub configuration
DOCKER_HUB_IMAGE="keekar/oscal_reports:latest"
# shellcheck disable=SC2034
DOCKER_HUB_REGISTRY="hub.docker.com"

# Persistent data volume base path
DATA_VOLUME_BASE="${SCRIPT_DIR}/data"

# Backup configuration
BACKUP_DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="${SCRIPT_DIR}/backups/dockerhub-deploy-${BACKUP_DATE}"

# ============================================================================
# DEPLOYMENT DETECTION (BLUE-GREEN)
# ============================================================================

print_header "🐳 OSCAL Report Generator - Docker Hub Deployment"

log "Detecting deployment instance..."
print_info "Current directory: $SCRIPT_DIR"

# Detect which deployment instance based on directory name
DEPLOYMENT_TYPE=""
DEPLOYMENT_DIR_NAME=$(basename "$SCRIPT_DIR")

if [[ "$DEPLOYMENT_DIR_NAME" == *"Blue"* ]] || [[ "$SCRIPT_DIR" == *"Blue"* ]]; then
  DEPLOYMENT_TYPE="Blue"
  CONTAINER_PORT="3020"
  CONTAINER_NAME="oscal-report-generator-blue"
  DOCKER_IMAGE="oscal-report-generator:blue"
  DEPLOY_COLOR="${BLUE}BLUE${NC}"
  DATA_VOLUME_PATH="${DATA_VOLUME_BASE}-blue"
  LOCK_FILE="/tmp/oscal-deploy-blue.lock"
elif [[ "$DEPLOYMENT_DIR_NAME" == *"Green"* ]] || [[ "$SCRIPT_DIR" == *"Green"* ]]; then
  DEPLOYMENT_TYPE="Green"
  CONTAINER_PORT="3019"
  CONTAINER_NAME="oscal-report-generator-green"
  DOCKER_IMAGE="oscal-report-generator:green"
  DEPLOY_COLOR="${GREEN}GREEN${NC}"
  DATA_VOLUME_PATH="${DATA_VOLUME_BASE}-green"
  LOCK_FILE="/tmp/oscal-deploy-green.lock"
else
  # Default fallback
  DEPLOYMENT_TYPE="Default"
  CONTAINER_PORT="3020"
  CONTAINER_NAME="oscal-report-generator"
  DOCKER_IMAGE="oscal-report-generator:latest"
  DEPLOY_COLOR="${CYAN}DEFAULT${NC}"
  DATA_VOLUME_PATH="${DATA_VOLUME_BASE}"
  LOCK_FILE="/tmp/oscal-deploy-default.lock"
fi

# Ensure data volume directory exists
if [ ! -d "$DATA_VOLUME_PATH" ]; then
  log "Creating persistent data volume directory: $DATA_VOLUME_PATH"
  mkdir -p "$DATA_VOLUME_PATH"
  chmod 755 "$DATA_VOLUME_PATH"
  print_success "Data volume directory created"
fi

echo ""
echo "📋 Deployment Configuration:"
echo "  Instance: $DEPLOY_COLOR"
echo "  Directory: $DEPLOYMENT_DIR_NAME"
echo "  Container Name: $CONTAINER_NAME"
echo "  Local Image Tag: $DOCKER_IMAGE"
echo "  Container Port: $CONTAINER_PORT"
echo "  Data Volume: $DATA_VOLUME_PATH"
echo "  Docker Hub Image: $DOCKER_HUB_IMAGE"
echo "  Force Deploy: $FORCE_DEPLOY"
echo "  Skip API Backup: $SKIP_API_BACKUP"
echo ""

# ============================================================================
# PREREQUISITES CHECK
# ============================================================================

print_header "🔍 Prerequisites Check"

log "Checking prerequisites..."

# Check if Docker is available
if ! command -v docker &> /dev/null; then
  print_error "Docker is not installed or not in PATH"
  exit 1
fi
print_success "Docker is available"

# Check Docker daemon is running
if ! docker info &> /dev/null; then
  print_error "Docker daemon is not running"
  exit 1
fi
print_success "Docker daemon is running"

# Detect system architecture
SYSTEM_ARCH=$(uname -m)
case "$SYSTEM_ARCH" in
  x86_64)
    DOCKER_PLATFORM="linux/amd64"
    print_success "System architecture: x86_64 (amd64)"
    ;;
  aarch64|arm64)
    DOCKER_PLATFORM="linux/arm64"
    print_success "System architecture: ARM64"
    ;;
  *)
    print_warning "Unknown architecture: $SYSTEM_ARCH, defaulting to amd64"
    DOCKER_PLATFORM="linux/amd64"
    ;;
esac

# Check internet connectivity to Docker Hub
log "Checking connectivity to Docker Hub..."
if ping -c 1 -W 3 hub.docker.com &> /dev/null || ping -c 1 -W 3 8.8.8.8 &> /dev/null; then
  print_success "Internet connectivity available"
else
  print_error "Cannot reach Docker Hub or internet"
  echo ""
  print_info "Docker Hub may be unreachable. Alternative:"
  echo "  Use retired TrueNAS build script to build from source:"
  echo "  ./retired/truenas-build/build_on_truenas.sh"
  echo ""
  exit 1
fi

# Check available disk space
log "Checking available disk space..."
AVAILABLE_SPACE=$(df "$SCRIPT_DIR" | awk 'NR==2 {print $4}')
REQUIRED_SPACE=524288  # 500MB in KB

if [ "$AVAILABLE_SPACE" -lt "$REQUIRED_SPACE" ]; then
  print_error "Insufficient disk space"
  echo "  Available: $((AVAILABLE_SPACE / 1024)) MB"
  echo "  Required:  $((REQUIRED_SPACE / 1024)) MB"
  echo ""
  print_info "Free up space with: docker system prune -a"
  exit 1
else
  print_success "Sufficient disk space: $((AVAILABLE_SPACE / 1024)) MB available"
fi

# Check if container exists
CONTAINER_EXISTS=false
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  CONTAINER_EXISTS=true
  print_info "Existing container found: $CONTAINER_NAME"
else
  print_info "No existing container found (fresh deployment)"
fi

# ============================================================================
# DEPLOYMENT LOCK
# ============================================================================

print_header "🔒 Deployment Lock Check"

# Check for existing lock file
if [ -f "$LOCK_FILE" ]; then
  LOCK_AGE=$(($(date +%s) - $(stat -f%m "$LOCK_FILE" 2>/dev/null || stat -c%Y "$LOCK_FILE" 2>/dev/null)))
  LOCK_AGE_MIN=$((LOCK_AGE / 60))
  
  if [ $LOCK_AGE -gt 1800 ]; then
    # Lock is older than 30 minutes, consider it stale
    print_warning "Stale lock file found (age: ${LOCK_AGE_MIN} minutes)"
    print_info "Removing stale lock..."
    rm -f "$LOCK_FILE"
    print_success "Stale lock removed"
  elif [ "$FORCE_DEPLOY" = true ]; then
    print_warning "Lock file exists but --force specified"
    rm -f "$LOCK_FILE"
    print_success "Lock file removed (forced)"
  else
    print_error "Deployment already in progress for $DEPLOYMENT_TYPE instance"
    echo "  Lock file: $LOCK_FILE"
    echo "  Lock age: ${LOCK_AGE_MIN} minutes"
    echo ""
    print_info "Wait for current deployment to complete, or use --force to override:"
    echo "  $0 --force"
    echo ""
    exit 1
  fi
fi

# Create lock file
log "Creating deployment lock..."
echo "$$" > "$LOCK_FILE"
date >> "$LOCK_FILE"
print_success "Deployment lock created"

# Ensure lock is removed on exit
cleanup_lock() {
  if [ -f "$LOCK_FILE" ]; then
    rm -f "$LOCK_FILE"
    log "Deployment lock removed"
  fi
}
trap cleanup_lock EXIT

# ============================================================================
# API BACKUP (OPTIONAL)
# ============================================================================

print_header "💾 Backup: API Export (Optional)"

API_BACKUP_SUCCESS=false

if [ "$SKIP_API_BACKUP" = true ]; then
  print_info "Skipping API backup (--skip-backup flag)"
elif [ "$CONTAINER_EXISTS" = false ]; then
  print_info "No existing container - skipping API backup"
elif ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  print_warning "Container not running - skipping API backup"
else
  # Container is running, attempt API backup
  mkdir -p "$BACKUP_DIR"
  print_info "Backup directory: $BACKUP_DIR"
  
  # Prompt for admin credentials
  echo ""
  print_info "Enter admin credentials for API export (3 attempts allowed)"
  print_info "Press Enter to skip API backup and use volume backup only"
  
  ATTEMPTS=0
  MAX_ATTEMPTS=3
  
  while [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
    ATTEMPTS=$((ATTEMPTS + 1))
    echo ""
    read -rp "Username (default: admin, Enter to skip): " ADMIN_USER
    
    if [ -z "$ADMIN_USER" ]; then
      print_info "API backup skipped by user"
      break
    fi
    
    ADMIN_USER=${ADMIN_USER:-admin}
    read -rsp "Password: " ADMIN_PASSWORD
    echo ""
    
    if [ -z "$ADMIN_PASSWORD" ]; then
      print_warning "No password entered"
      continue
    fi
    
    # Authenticate
    print_info "Authenticating..."
    if ! JSON_PAYLOAD=$(jq -n \
      --arg user "$ADMIN_USER" \
      --arg pass "$ADMIN_PASSWORD" \
      '{username: $user, password: $pass}' 2>/dev/null); then
      print_error "jq not found - cannot create JSON payload"
      print_info "Install jq or skip API backup"
      break
    fi
    
    TOKEN=$(curl -s -X POST "http://localhost:${CONTAINER_PORT}/api/auth/login" \
      -H "Content-Type: application/json" \
      -d "$JSON_PAYLOAD" \
      | jq -r '.sessionToken' 2>/dev/null || echo "null")
    
    if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
      print_error "Authentication failed (attempt $ATTEMPTS/$MAX_ATTEMPTS)"
      if [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; then
        print_info "Please try again"
      fi
    else
      # Authentication successful - export users
      print_success "Authentication successful"
      print_info "Exporting users..."
      
      curl -s -H "Authorization: Bearer $TOKEN" \
        "http://localhost:${CONTAINER_PORT}/api/users/export" > "$BACKUP_DIR/users.json"
      
      if [ -s "$BACKUP_DIR/users.json" ]; then
        USER_COUNT=$(jq '.userCount' "$BACKUP_DIR/users.json" 2>/dev/null || echo "0")
        print_success "Exported $USER_COUNT users to $BACKUP_DIR/users.json"
        API_BACKUP_SUCCESS=true
      else
        print_warning "Failed to export users (empty response)"
      fi
      
      break
    fi
  done
  
  if [ $ATTEMPTS -ge $MAX_ATTEMPTS ] && [ "$API_BACKUP_SUCCESS" = false ]; then
    print_warning "Maximum authentication attempts reached"
    print_info "Continuing with volume backup only"
  fi
fi

if [ "$API_BACKUP_SUCCESS" = true ]; then
  print_success "API backup completed successfully"
else
  print_info "API backup skipped - will use volume backup"
fi

# ============================================================================
# LEGACY CONFIG MIGRATION
# ============================================================================

print_header "🔄 Legacy Config Migration Check"

LEGACY_CONFIG_DIR="${SCRIPT_DIR}/config/app"
MIGRATED_CONFIG=false

# Check if we need to migrate from old config structure
if [ -d "$LEGACY_CONFIG_DIR" ] && [ -n "$(ls -A "$LEGACY_CONFIG_DIR" 2>/dev/null)" ]; then
  if [ -f "$LEGACY_CONFIG_DIR/users.json" ] || [ -f "$LEGACY_CONFIG_DIR/config.json" ]; then
    log "Legacy config directory found with files"
    
    # Check if data volume is empty (need migration)
    if [ ! -d "$DATA_VOLUME_PATH" ] || [ -z "$(ls -A "$DATA_VOLUME_PATH" 2>/dev/null)" ]; then
      print_info "Migrating legacy config to new volume structure..."
      
      mkdir -p "$DATA_VOLUME_PATH"
      
      # Copy config files to new location
      if [ -f "$LEGACY_CONFIG_DIR/config.json" ]; then
        cp "$LEGACY_CONFIG_DIR/config.json" "$DATA_VOLUME_PATH/config.json"
        print_success "Migrated config.json"
      fi
      
      if [ -f "$LEGACY_CONFIG_DIR/users.json" ]; then
        cp "$LEGACY_CONFIG_DIR/users.json" "$DATA_VOLUME_PATH/users.json"
        print_success "Migrated users.json"
      fi
      
      # Copy other JSON files (rate_limit, email_blacklist, etc)
      for file in "$LEGACY_CONFIG_DIR"/*.json; do
        if [ -f "$file" ]; then
          filename=$(basename "$file")
          if [ "$filename" != "config.json" ] && [ "$filename" != "users.json" ] && [ "$filename" != "config.json.example" ] && [ "$filename" != "users.json.example" ]; then
            cp "$file" "$DATA_VOLUME_PATH/$filename"
            print_info "Migrated $filename"
          fi
        fi
      done
      
      MIGRATED_CONFIG=true
      print_success "Legacy config migration completed"
    else
      print_info "Data volume already has content, skipping migration"
    fi
  else
    print_info "Legacy config directory exists but has no config/user files"
  fi
else
  print_info "No legacy config directory found (fresh deployment or already migrated)"
fi

if [ "$MIGRATED_CONFIG" = true ]; then
  print_success "Configuration migrated from legacy structure"
fi

# ============================================================================
# VOLUME BACKUP
# ============================================================================

print_header "💾 Backup: Volume and Legacy Config"

mkdir -p "$BACKUP_DIR"

BACKUP_SOURCES=()
VOLUME_BACKUP_CREATED=false

# Check primary volume location
if [ -d "$DATA_VOLUME_PATH" ] && [ -n "$(ls -A "$DATA_VOLUME_PATH" 2>/dev/null)" ]; then
  BACKUP_SOURCES+=("$DATA_VOLUME_PATH:data-volume")
  print_info "Found data in volume: $DATA_VOLUME_PATH"
fi

# Check legacy config location as additional backup source
if [ -d "$LEGACY_CONFIG_DIR" ] && [ -n "$(ls -A "$LEGACY_CONFIG_DIR" 2>/dev/null)" ]; then
  # Only add legacy as backup source if it has actual config files
  if [ -f "$LEGACY_CONFIG_DIR/users.json" ] || [ -f "$LEGACY_CONFIG_DIR/config.json" ]; then
    BACKUP_SOURCES+=("$LEGACY_CONFIG_DIR:legacy-config")
    print_info "Found data in legacy config: $LEGACY_CONFIG_DIR"
  fi
fi

if [ ${#BACKUP_SOURCES[@]} -eq 0 ]; then
  print_warning "No data to backup (fresh deployment)"
else
  for SOURCE_INFO in "${BACKUP_SOURCES[@]}"; do
    IFS=':' read -r SOURCE_PATH SOURCE_NAME <<< "$SOURCE_INFO"
    
    log "Backing up $SOURCE_NAME from $SOURCE_PATH..."
    VOLUME_BACKUP_FILE="$BACKUP_DIR/${SOURCE_NAME}-backup.tar.gz"
    
    if tar -czf "$VOLUME_BACKUP_FILE" -C "$SOURCE_PATH" . 2>/dev/null; then
      BACKUP_SIZE=$(du -h "$VOLUME_BACKUP_FILE" | cut -f1)
      print_success "$SOURCE_NAME backup created: $VOLUME_BACKUP_FILE ($BACKUP_SIZE)"
      
      # Show backed up files
      print_info "Backed up files:"
      tar -tzf "$VOLUME_BACKUP_FILE" 2>/dev/null | head -10 | while read -r line; do
        echo "    $line"
      done
      
      VOLUME_BACKUP_CREATED=true
    else
      print_error "Failed to create $SOURCE_NAME backup"
    fi
  done
fi

if [ "$VOLUME_BACKUP_CREATED" = true ]; then
  print_success "Backup phase completed successfully"
else
  print_warning "No backups created - this may be a fresh deployment"
fi

echo ""
print_success "Backup phase completed"
print_info "Backup location: $BACKUP_DIR"
echo ""

# ============================================================================
# SAVE CURRENT IMAGE
# ============================================================================

print_header "📦 Save Current Image for Rollback"

CURRENT_IMAGE_ID=""
BACKUP_IMAGE_TAG=""

if [ "$CONTAINER_EXISTS" = true ]; then
  # Get current container's image ID
  CURRENT_IMAGE_ID=$(docker inspect "$CONTAINER_NAME" --format='{{.Image}}' 2>/dev/null || echo "")
  
  if [ -n "$CURRENT_IMAGE_ID" ]; then
    # Create backup tag
    BACKUP_IMAGE_TAG="${DOCKER_IMAGE}-backup-${BACKUP_DATE}"
    
    log "Tagging current image for rollback..."
    if docker tag "$CURRENT_IMAGE_ID" "$BACKUP_IMAGE_TAG" 2>/dev/null; then
      print_success "Current image saved as: $BACKUP_IMAGE_TAG"
    else
      print_warning "Could not tag current image (may not affect rollback)"
    fi
  else
    print_info "No current image found"
  fi
else
  print_info "No existing container - nothing to save"
fi

# ============================================================================
# DOCKER HUB PULL
# ============================================================================

print_header "📥 Pull Latest Image from Docker Hub"

log "Pulling image: $DOCKER_HUB_IMAGE"
log "Platform: $DOCKER_PLATFORM"
echo ""

# Pull the image
if docker pull --platform "$DOCKER_PLATFORM" "$DOCKER_HUB_IMAGE" 2>&1 | while IFS= read -r line; do
  echo "  [docker] $line"
done; then
  print_success "Image pulled successfully from Docker Hub"
else
  print_error "Failed to pull image from Docker Hub"
  echo ""
  print_info "Possible reasons:"
  echo "  • Docker Hub is down (check https://status.docker.com/)"
  echo "  • Network connectivity issues"
  echo "  • Rate limit exceeded (wait 6 hours or use Docker Hub account)"
  echo ""
  print_info "Alternative: Build from source"
  echo "  ./retired/truenas-build/build_on_truenas.sh"
  echo ""
  exit 1
fi

# Verify image architecture matches system
PULLED_IMAGE_ARCH=$(docker inspect "$DOCKER_HUB_IMAGE" --format='{{.Architecture}}' 2>/dev/null)
log "Pulled image architecture: $PULLED_IMAGE_ARCH"

# Tag the pulled image with local tag
log "Tagging image as $DOCKER_IMAGE..."
if docker tag "$DOCKER_HUB_IMAGE" "$DOCKER_IMAGE"; then
  print_success "Image tagged as: $DOCKER_IMAGE"
else
  print_error "Failed to tag image"
  exit 1
fi

# ============================================================================
# EXTRACT CREDENTIALS
# ============================================================================

print_header "🔑 Extract Default Credentials"

CREDS_FILE="$BACKUP_DIR/credentials.txt"

log "Extracting credentials from image..."

# Create temporary container to extract credentials
TEMP_CONTAINER="temp-oscal-creds-$$"

if docker create --name "$TEMP_CONTAINER" "$DOCKER_HUB_IMAGE" > /dev/null 2>&1; then
  # Try to copy credentials file
  if docker cp "$TEMP_CONTAINER:/app/credentials.txt" "$CREDS_FILE" 2>/dev/null; then
    print_success "Credentials extracted successfully"
    echo ""
    echo "════════════════════════════════════════════════════════════════════"
    cat "$CREDS_FILE"
    echo "════════════════════════════════════════════════════════════════════"
    echo ""
    print_warning "IMPORTANT: Change these default credentials after first login!"
    echo ""
  else
    print_warning "Could not extract credentials.txt from image"
    print_info "Check container logs after deployment:"
    echo "  docker logs $CONTAINER_NAME | grep -A 20 'Default Credentials'"
  fi
  
  # Clean up temporary container
  docker rm "$TEMP_CONTAINER" > /dev/null 2>&1
else
  print_warning "Could not create temporary container for credential extraction"
fi

# ============================================================================
# STOP CURRENT CONTAINER
# ============================================================================

print_header "⏸️  Stop Current Container"

if [ "$CONTAINER_EXISTS" = true ]; then
  if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    log "Stopping container: $CONTAINER_NAME"
    
    if docker stop "$CONTAINER_NAME" --time 30 2>&1 | while IFS= read -r line; do
      log "  [docker] $line"
    done; then
      print_success "Container stopped gracefully"
    else
      print_warning "Container stop may have timed out"
    fi
  else
    print_info "Container not running"
  fi
  
  # Keep the old container for now (for rollback reference)
  # We'll remove it after successful deployment
  print_info "Keeping old container for rollback capability"
else
  print_info "No existing container to stop"
fi

# ============================================================================
# START NEW CONTAINER
# ============================================================================

print_header "🚀 Start New Container"

# Remove old container if it exists (rename it first for safety)
if [ "$CONTAINER_EXISTS" = true ]; then
  BACKUP_CONTAINER_NAME="${CONTAINER_NAME}-backup-${BACKUP_DATE}"
  log "Renaming old container to: $BACKUP_CONTAINER_NAME"
  
  if docker rename "$CONTAINER_NAME" "$BACKUP_CONTAINER_NAME" 2>/dev/null; then
    print_success "Old container renamed for safety"
  else
    print_warning "Could not rename old container (may not exist)"
  fi
fi

# Start new container
log "Starting new container: $CONTAINER_NAME"
print_info "Mounting persistent volume: ${DATA_VOLUME_PATH} -> /data"

if docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p "${CONTAINER_PORT}:${CONTAINER_PORT}" \
  -e PORT="$CONTAINER_PORT" \
  -e NODE_ENV="production" \
  -e DEPLOYMENT_TYPE="$DEPLOYMENT_TYPE" \
  -v "${DATA_VOLUME_PATH}:/data" \
  -v "${SCRIPT_DIR}/logs:/app/logs" \
  "$DOCKER_IMAGE" 2>&1 | while IFS= read -r line; do log "  [docker] $line"; done; then
  
  print_success "Container started: $CONTAINER_NAME"
else
  print_error "Failed to start container"
  
  # Rollback: restore old container name
  if [ -n "$BACKUP_CONTAINER_NAME" ]; then
    print_warning "Attempting to restore old container..."
    docker rename "$BACKUP_CONTAINER_NAME" "$CONTAINER_NAME" 2>/dev/null || true
  fi
  
  exit 1
fi

# ============================================================================
# HEALTH CHECK
# ============================================================================

print_header "🏥 Health Check"

log "Waiting for container to initialize..."
sleep 10

HEALTH_CHECK_PASSED=false
MAX_HEALTH_ATTEMPTS=12
HEALTH_ATTEMPT=0

while [ $HEALTH_ATTEMPT -lt $MAX_HEALTH_ATTEMPTS ]; do
  HEALTH_ATTEMPT=$((HEALTH_ATTEMPT + 1))
  
  log "Health check attempt $HEALTH_ATTEMPT/$MAX_HEALTH_ATTEMPTS..."
  
  # Check if container is still running
  if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    print_error "Container stopped unexpectedly!"
    print_info "Container logs (last 30 lines):"
    docker logs --tail 30 "$CONTAINER_NAME" 2>&1 | while IFS= read -r line; do
      echo "  $line"
    done
    break
  fi
  
  # Check health endpoint
  if curl -sf "http://localhost:${CONTAINER_PORT}/health" > /dev/null 2>&1; then
    print_success "Health check passed!"
    HEALTH_CHECK_PASSED=true
    break
  fi
  
  if [ $HEALTH_ATTEMPT -lt $MAX_HEALTH_ATTEMPTS ]; then
    sleep 5
  fi
done

if [ "$HEALTH_CHECK_PASSED" = false ]; then
  print_error "Health check failed after $MAX_HEALTH_ATTEMPTS attempts"
  
  # ========================================================================
  # AUTOMATIC ROLLBACK
  # ========================================================================
  
  print_header "🔄 Automatic Rollback"
  
  print_warning "New deployment failed health check - initiating rollback..."
  
  # Save logs from failed container
  FAILED_LOGS="$BACKUP_DIR/failed-container-logs.txt"
  docker logs "$CONTAINER_NAME" > "$FAILED_LOGS" 2>&1
  print_info "Failed container logs saved to: $FAILED_LOGS"
  
  # Stop and remove failed container
  log "Stopping failed container..."
  docker stop "$CONTAINER_NAME" > /dev/null 2>&1 || true
  
  log "Removing failed container..."
  docker rm "$CONTAINER_NAME" > /dev/null 2>&1 || true
  
  # Tag failed image for debugging
  FAILED_IMAGE_TAG="${DOCKER_IMAGE}-failed-${BACKUP_DATE}"
  docker tag "$DOCKER_IMAGE" "$FAILED_IMAGE_TAG" 2>/dev/null || true
  print_info "Failed image tagged as: $FAILED_IMAGE_TAG"
  
  # Restore old container
  if [ -n "$BACKUP_CONTAINER_NAME" ] && docker ps -a --format '{{.Names}}' | grep -q "^${BACKUP_CONTAINER_NAME}$"; then
    log "Restoring previous container..."
    
    # Rename backup container back to original name
    if docker rename "$BACKUP_CONTAINER_NAME" "$CONTAINER_NAME" 2>/dev/null; then
      print_success "Old container restored"
      
      # Start old container
      log "Starting previous container..."
      if docker start "$CONTAINER_NAME" > /dev/null 2>&1; then
        print_success "Previous container started"
        
        # Wait and verify
        sleep 10
        if curl -sf "http://localhost:${CONTAINER_PORT}/health" > /dev/null 2>&1; then
          print_success "Rollback successful - previous version is healthy"
        else
          print_error "Rollback completed but health check failed"
          print_warning "Manual intervention required"
        fi
      else
        print_error "Failed to start previous container"
      fi
    else
      print_error "Failed to restore old container name"
    fi
  else
    print_error "No backup container found - cannot rollback"
    print_warning "Manual recovery required"
  fi
  
  echo ""
  print_error "Deployment failed and rolled back"
  echo ""
  print_info "Troubleshooting:"
  echo "  • Check logs: docker logs $CONTAINER_NAME"
  echo "  • Check failed logs: cat $FAILED_LOGS"
  echo "  • Try building from source: ./retired/truenas-build/build_on_truenas.sh"
  echo ""
  
  exit 1
fi

# ============================================================================
# RESTORE CONFIGURATION
# ============================================================================

print_header "♻️  Restore Configuration and Users"

RESTORE_SUCCESS=true
RESTORE_ATTEMPTED=false

# Priority 1: Restore from data-volume backup
if [ -f "$BACKUP_DIR/data-volume-backup.tar.gz" ]; then
  log "Restoring from data volume backup..."
  RESTORE_ATTEMPTED=true
  
  if tar -xzf "$BACKUP_DIR/data-volume-backup.tar.gz" -C "$DATA_VOLUME_PATH" 2>/dev/null; then
    print_success "Data volume backup restored"
    
    # Restart to load config
    log "Restarting container to apply configuration..."
    docker restart "$CONTAINER_NAME" > /dev/null 2>&1
    sleep 15
    
    if curl -sf "http://localhost:${CONTAINER_PORT}/health" > /dev/null 2>&1; then
      print_success "Container healthy after data restore"
    else
      print_warning "Health check failed after restart"
      RESTORE_SUCCESS=false
    fi
  else
    print_error "Failed to restore data volume backup"
    RESTORE_SUCCESS=false
  fi

# Priority 2: Restore from legacy-config backup
elif [ -f "$BACKUP_DIR/legacy-config-backup.tar.gz" ]; then
  log "Restoring from legacy config backup..."
  RESTORE_ATTEMPTED=true
  
  if tar -xzf "$BACKUP_DIR/legacy-config-backup.tar.gz" -C "$DATA_VOLUME_PATH" 2>/dev/null; then
    print_success "Legacy config backup restored"
    
    # Restart to load config
    log "Restarting container to apply configuration..."
    docker restart "$CONTAINER_NAME" > /dev/null 2>&1
    sleep 15
    
    if curl -sf "http://localhost:${CONTAINER_PORT}/health" > /dev/null 2>&1; then
      print_success "Container healthy after legacy restore"
    else
      print_warning "Health check failed after restart"
      RESTORE_SUCCESS=false
    fi
  else
    print_error "Failed to restore legacy config backup"
    RESTORE_SUCCESS=false
  fi

# Priority 3: Check for old volume-backup.tar.gz name (backward compatibility)
elif [ -f "$BACKUP_DIR/volume-backup.tar.gz" ]; then
  log "Restoring from volume backup (legacy name)..."
  RESTORE_ATTEMPTED=true
  
  if tar -xzf "$BACKUP_DIR/volume-backup.tar.gz" -C "$DATA_VOLUME_PATH" 2>/dev/null; then
    print_success "Volume backup restored"
    
    log "Restarting container to apply configuration..."
    docker restart "$CONTAINER_NAME" > /dev/null 2>&1
    sleep 15
    
    if curl -sf "http://localhost:${CONTAINER_PORT}/health" > /dev/null 2>&1; then
      print_success "Container healthy after restore"
    else
      print_warning "Health check failed after restart"
      RESTORE_SUCCESS=false
    fi
  else
    print_error "Failed to restore volume backup"
    RESTORE_SUCCESS=false
  fi

# Priority 4: Check for API backup
elif [ "$API_BACKUP_SUCCESS" = true ] && [ -f "$BACKUP_DIR/users.json" ]; then
  print_info "API backup available but requires manual import"
  print_info "Users can be imported via Admin UI after login"
  print_info "API backup location: $BACKUP_DIR/users.json"
  RESTORE_ATTEMPTED=true
  
# No backups available
else
  print_info "No backups to restore (fresh deployment or all backups failed)"
fi

if [ "$RESTORE_ATTEMPTED" = false ]; then
  print_warning "No configuration restored - using defaults"
  echo ""
  print_info "If this is not a fresh deployment, you may need to:"
  echo "  1. Check backup directory: $BACKUP_DIR"
  echo "  2. Manually restore config files to: $DATA_VOLUME_PATH"
  echo "  3. Restart container: docker restart $CONTAINER_NAME"
fi

# ============================================================================
# FINAL VERIFICATION
# ============================================================================

print_header "✅ Final Verification"

# Test health endpoint
log "Testing health endpoint..."
HEALTH_RESPONSE=$(curl -s "http://localhost:${CONTAINER_PORT}/health" 2>/dev/null)

if echo "$HEALTH_RESPONSE" | grep -q "healthy" 2>/dev/null; then
  print_success "Health endpoint responding correctly"
else
  print_warning "Health endpoint response unexpected"
  echo "  Response: $HEALTH_RESPONSE"
fi

# Check volume status
log "Checking volume status..."
VOLUME_STATUS=$(curl -s "http://localhost:${CONTAINER_PORT}/api/system/volume-status" 2>/dev/null)

if echo "$VOLUME_STATUS" | grep -q "enabled" 2>/dev/null; then
  print_success "Volume persistence is enabled"
else
  print_warning "Could not verify volume persistence"
fi

# Get container info
CONTAINER_ID=$(docker ps --filter "name=${CONTAINER_NAME}" --format '{{.ID}}')
print_info "Container ID: $CONTAINER_ID"

# Show recent logs
echo ""
print_info "Container logs (last 20 lines):"
docker logs --tail 20 "$CONTAINER_NAME" 2>&1 | while IFS= read -r line; do
  echo "  $line"
done

# ============================================================================
# CLEANUP
# ============================================================================

print_header "🧹 Cleanup"

# Remove backup container if it exists
if [ -n "$BACKUP_CONTAINER_NAME" ] && docker ps -a --format '{{.Names}}' | grep -q "^${BACKUP_CONTAINER_NAME}$"; then
  log "Removing backup container..."
  if docker rm "$BACKUP_CONTAINER_NAME" > /dev/null 2>&1; then
    print_success "Backup container removed"
  else
    print_warning "Could not remove backup container"
  fi
fi

# Prune dangling images
log "Pruning dangling images..."
PRUNED=$(docker image prune -f 2>&1)
if echo "$PRUNED" | grep -q "deleted" 2>/dev/null; then
  print_success "Dangling images pruned"
else
  print_info "No dangling images to prune"
fi

# Show remaining OSCAL images
log "Current OSCAL images:"
docker images --filter=reference='oscal-report-generator*' --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}" | head -5

print_success "Cleanup completed"

# ============================================================================
# SUMMARY
# ============================================================================

print_header "🎉 Deployment Complete"

echo "📊 Deployment Summary:"
echo "  Instance: $DEPLOY_COLOR"
echo "  Container Name: $CONTAINER_NAME"
echo "  Container Port: $CONTAINER_PORT"
echo "  Container ID: $CONTAINER_ID"
echo "  Source: Docker Hub ($DOCKER_HUB_IMAGE)"
echo "  Data Volume: $DATA_VOLUME_PATH"
echo ""
echo "🌐 Access Application:"
echo "  URL: http://localhost:${CONTAINER_PORT}"
echo "  Health: http://localhost:${CONTAINER_PORT}/health"
echo ""
echo "💾 Backup Information:"
echo "  Location: $BACKUP_DIR"
echo "  Kept for: 7 days (manual cleanup required)"
if [ -f "$CREDS_FILE" ]; then
  echo "  Credentials: $CREDS_FILE"
fi
echo ""
echo "📋 Useful Commands:"
echo "  View logs:    docker logs -f $CONTAINER_NAME"
echo "  Stop:         docker stop $CONTAINER_NAME"
echo "  Restart:      docker restart $CONTAINER_NAME"
echo "  Shell access: docker exec -it $CONTAINER_NAME sh"
echo ""
echo "🔄 Rollback Information:"
if [ -n "$BACKUP_IMAGE_TAG" ]; then
  echo "  Previous image saved as: $BACKUP_IMAGE_TAG"
  echo "  To rollback manually:"
  echo "    docker stop $CONTAINER_NAME"
  echo "    docker rm $CONTAINER_NAME"
  echo "    docker tag $BACKUP_IMAGE_TAG $DOCKER_IMAGE"
  echo "    ./deploy_from_dockerhub.sh"
fi
echo ""

if [ "$RESTORE_SUCCESS" = false ]; then
  print_warning "Configuration restore had issues - please verify settings"
  echo ""
fi

log "Deployment completed successfully at $(date)"

print_success "✨ All done! Your application is ready."

# ============================================================================
# CLEANUP OLD BACKUPS (Optional reminder)
# ============================================================================

echo ""
print_info "💡 Tip: Clean up old backups after 7 days:"
echo "  find ${SCRIPT_DIR}/backups -name 'dockerhub-deploy-*' -type d -mtime +7 -exec rm -rf {} +"
echo ""
