#!/bin/bash

# OSCAL Report Generator V2 - Automated Build & Deploy Script for TrueNAS
# This script supports Blue-Green deployment with automatic version detection
# Author: Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
# Copyright (c) 2025 Mukesh Kesharwani
# License: MIT
#
# Deployment Schedule:
#   Green: 1st, 3rd, and 5th Sunday of each month
#   Blue:  2nd and 4th Sunday of each month
#
# Usage: 
#   Manual: ./build_on_truenas.sh [--force]
#   Cron:   See cron examples below for scheduled Sunday deployments
#
# Cron Schedule Examples:
#   Green (1st, 3rd, 5th Sunday): 0 2 1-7,15-21,29-31 * 0
#   Blue (2nd, 4th Sunday):       0 2 8-14,22-28 * 0

set -e  # Exit on error

# ============================================================================
# COLOR DEFINITIONS
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
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

# Git repository configuration
GIT_REPO="https://github.com/keekar2022/OSCAL-Reports.git"
GIT_BRANCH="main"

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Force flag
FORCE_BUILD=false
if [ "$1" = "--force" ] || [ "$1" = "-f" ]; then
  FORCE_BUILD=true
fi

# ============================================================================
# DEPLOYMENT DETECTION (BLUE-GREEN)
# ============================================================================

print_header "🔍 OSCAL Report Generator - Automated Build & Deploy"

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
elif [[ "$DEPLOYMENT_DIR_NAME" == *"Green"* ]] || [[ "$SCRIPT_DIR" == *"Green"* ]]; then
  DEPLOYMENT_TYPE="Green"
  CONTAINER_PORT="3019"
  CONTAINER_NAME="oscal-report-generator-green"
  DOCKER_IMAGE="oscal-report-generator:green"
  DEPLOY_COLOR="${GREEN}GREEN${NC}"
else
  # Default fallback
  DEPLOYMENT_TYPE="Default"
  CONTAINER_PORT="3020"
  CONTAINER_NAME="oscal-report-generator"
  DOCKER_IMAGE="oscal-report-generator:latest"
  DEPLOY_COLOR="${CYAN}DEFAULT${NC}"
fi

echo ""
echo "📋 Deployment Configuration:"
echo "  Instance: $DEPLOY_COLOR"
echo "  Directory: $DEPLOYMENT_DIR_NAME"
echo "  Container Name: $CONTAINER_NAME"
echo "  Docker Image: $DOCKER_IMAGE"
echo "  Container Port: $CONTAINER_PORT"
echo "  Git Repository: $GIT_REPO"
echo "  Git Branch: $GIT_BRANCH"
echo "  Force Build: $FORCE_BUILD"
echo ""

# ============================================================================
# PREREQUISITES CHECK
# ============================================================================

log "Checking prerequisites..."

# Check if Docker is available
if ! command -v docker &> /dev/null; then
  print_error "Docker is not installed or not in PATH"
  exit 1
fi
print_success "Docker is available"

# Check if Git is available
if ! command -v git &> /dev/null; then
  print_error "Git is not installed or not in PATH"
  exit 1
fi
print_success "Git is available"

# Check if we're in a git repository
if [ ! -d ".git" ]; then
  print_warning "Not a git repository. Initializing..."
  git init
  git remote add origin "$GIT_REPO" 2>/dev/null || git remote set-url origin "$GIT_REPO"
fi
print_success "Git repository initialized"

# ============================================================================
# VERSION DETECTION
# ============================================================================

print_header "📊 Version Detection"

# Get current deployed version (from local package.json)
CURRENT_VERSION=""
if [ -f "package.json" ]; then
  CURRENT_VERSION=$(grep '"version":' package.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/' | tr -d ' ')
  print_info "Current deployed version: ${MAGENTA}$CURRENT_VERSION${NC}"
else
  print_warning "package.json not found - first deployment"
  CURRENT_VERSION="0.0.0"
fi

# Get running container version (from Docker container environment)
RUNNING_VERSION=""
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  RUNNING_VERSION=$(docker exec "$CONTAINER_NAME" sh -c 'cat /app/package.json 2>/dev/null | grep "version" | head -1 | cut -d\" -f4' 2>/dev/null || echo "unknown")
  print_info "Running container version: ${MAGENTA}$RUNNING_VERSION${NC}"
else
  print_warning "Container not running: $CONTAINER_NAME"
  RUNNING_VERSION="none"
fi

# ============================================================================
# GIT OPERATIONS (Works with existing cloned repository)
# ============================================================================

print_header "📥 Fetching Latest Code from GitHub"

log "Working with existing repository in: $SCRIPT_DIR"

# Stash any local changes (if any)
if git diff --quiet && git diff --cached --quiet; then
  print_info "No local changes to stash"
else
  print_warning "Stashing local changes..."
  git stash save "Auto-stash before pull at $(date)"
fi

# Fetch latest from remote
log "Fetching latest changes from $GIT_BRANCH branch..."
if ! git fetch origin "$GIT_BRANCH" 2>&1; then
  print_error "Failed to fetch from remote repository"
  exit 1
fi
print_success "Fetched latest changes"

# Get remote version (from GitHub)
log "Checking remote version..."
git checkout origin/$GIT_BRANCH -- package.json 2>/dev/null || true
REMOTE_VERSION=""
if [ -f "package.json" ]; then
  REMOTE_VERSION=$(grep '"version":' package.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/' | tr -d ' ')
  print_info "Remote GitHub version: ${MAGENTA}$REMOTE_VERSION${NC}"
else
  print_error "Could not read remote version"
  exit 1
fi

# Pull latest code (reset to match remote exactly)
log "Pulling latest code..."
if ! git reset --hard origin/$GIT_BRANCH 2>&1; then
  print_error "Failed to pull latest code"
  exit 1
fi
print_success "Code updated to latest version from GitHub"

# ============================================================================
# VERSION COMPARISON
# ============================================================================

print_header "🔄 Version Comparison"

echo "  Current Deployed: $CURRENT_VERSION"
echo "  Running Container: $RUNNING_VERSION"
echo "  GitHub Remote: $REMOTE_VERSION"
echo ""

NEEDS_BUILD=false

if [ "$FORCE_BUILD" = true ]; then
  print_warning "Force build requested - skipping version check"
  NEEDS_BUILD=true
elif [ "$CURRENT_VERSION" != "$REMOTE_VERSION" ]; then
  print_info "Version mismatch detected: $CURRENT_VERSION → $REMOTE_VERSION"
  NEEDS_BUILD=true
elif [ "$RUNNING_VERSION" != "$REMOTE_VERSION" ] && [ "$RUNNING_VERSION" != "unknown" ] && [ "$RUNNING_VERSION" != "none" ]; then
  print_info "Running container has different version: $RUNNING_VERSION → $REMOTE_VERSION"
  NEEDS_BUILD=true
elif [ "$RUNNING_VERSION" = "none" ]; then
  print_info "Container not running - build required"
  NEEDS_BUILD=true
else
  print_success "Versions match - no build needed"
  log "Deployment is up to date with version $REMOTE_VERSION"
  echo ""
  print_success "✨ No action required - system is up to date!"
  exit 0
fi

# ============================================================================
# BUILD PROCESS
# ============================================================================

if [ "$NEEDS_BUILD" = true ]; then
  print_header "🔨 Building Docker Image"
  
  log "Building new Docker image: $DOCKER_IMAGE"
  log "Version: $REMOTE_VERSION"
  
  # Check if Dockerfile exists
  if [ ! -f "Dockerfile" ]; then
    print_error "Dockerfile not found"
    exit 1
  fi
  
  # Remove existing image with the same tag to prevent caching issues
  log "Checking for existing image: $DOCKER_IMAGE"
  if docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^${DOCKER_IMAGE}$"; then
    log "Removing existing image to prevent cache issues: $DOCKER_IMAGE"
    docker rmi -f "$DOCKER_IMAGE" 2>&1 | while IFS= read -r line; do log "  [docker] $line"; done || true
    print_success "Old image removed"
  else
    print_info "No existing image found - proceeding with fresh build"
  fi
  
  # Build the Docker image with --no-cache to ensure fresh build
  log "Running docker build with --no-cache..."
  if docker build \
    --no-cache \
    --build-arg VERSION="$REMOTE_VERSION" \
    --build-arg DEPLOYMENT_TYPE="$DEPLOYMENT_TYPE" \
    --build-arg PORT="$CONTAINER_PORT" \
    -t "$DOCKER_IMAGE" \
    . 2>&1 | while IFS= read -r line; do log "  [docker] $line"; done; then
    
    print_success "Docker image built successfully: $DOCKER_IMAGE"
  else
    print_error "Docker build failed"
    exit 1
  fi
fi

# ============================================================================
# CONTAINER MANAGEMENT
# ============================================================================

print_header "🚀 Deploying Container"

# Stop existing container if running
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  log "Stopping existing container: $CONTAINER_NAME"
  docker stop "$CONTAINER_NAME" 2>&1 | while IFS= read -r line; do log "  [docker] $line"; done
  print_success "Container stopped"
fi

# Remove existing container if exists
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  log "Removing existing container: $CONTAINER_NAME"
  docker rm "$CONTAINER_NAME" 2>&1 | while IFS= read -r line; do log "  [docker] $line"; done
  print_success "Container removed"
fi

# Start new container
log "Starting new container..."
if docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p "${CONTAINER_PORT}:${CONTAINER_PORT}" \
  -e PORT="$CONTAINER_PORT" \
  -e NODE_ENV="production" \
  -e DEPLOYMENT_TYPE="$DEPLOYMENT_TYPE" \
  -v "${SCRIPT_DIR}/config:/app/config" \
  -v "${SCRIPT_DIR}/logs:/app/logs" \
  "$DOCKER_IMAGE" 2>&1 | while IFS= read -r line; do log "  [docker] $line"; done; then
  
  print_success "Container started: $CONTAINER_NAME"
else
  print_error "Failed to start container"
  exit 1
fi

# Wait for container to be healthy
log "Waiting for container to be ready..."
sleep 5

# Check if container is running
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  print_success "Container is running"
  
  # Get container info
  CONTAINER_ID=$(docker ps --filter "name=${CONTAINER_NAME}" --format '{{.ID}}')
  print_info "Container ID: $CONTAINER_ID"
  
  # Test health endpoint
  log "Testing health endpoint..."
  sleep 3
  if curl -s "http://localhost:${CONTAINER_PORT}/health" > /dev/null 2>&1; then
    print_success "Health check passed"
  else
    print_warning "Health check failed (container may still be starting)"
  fi
else
  print_error "Container failed to start"
  log "Showing container logs:"
  docker logs "$CONTAINER_NAME" 2>&1 | tail -20 | while IFS= read -r line; do log "  [logs] $line"; done
  exit 1
fi

# ============================================================================
# CLEANUP
# ============================================================================

print_header "🧹 Comprehensive Docker Cleanup"

# Step 1: Remove old images with the same repository name (but different/no tags)
log "Removing old OSCAL Report Generator images..."
OLD_IMAGES=$(docker images --filter=reference='oscal-report-generator*' --format "{{.ID}} {{.Tag}} {{.CreatedAt}}" | grep -v "^$CONTAINER_ID" | awk '{print $1}' | sort -u)
if [ -n "$OLD_IMAGES" ]; then
  REMOVED_COUNT=0
  for IMAGE_ID in $OLD_IMAGES; do
    # Check if this image is currently being used by any running container
    IN_USE=$(docker ps --format "{{.Image}}" | grep -q "$IMAGE_ID" && echo "yes" || echo "no")
    if [ "$IN_USE" = "no" ]; then
      log "  Removing old image: $IMAGE_ID"
      docker rmi -f "$IMAGE_ID" 2>&1 | while IFS= read -r line; do log "    [docker] $line"; done || true
      REMOVED_COUNT=$((REMOVED_COUNT + 1))
    else
      log "  Skipping in-use image: $IMAGE_ID"
    fi
  done
  if [ $REMOVED_COUNT -gt 0 ]; then
    print_success "Removed $REMOVED_COUNT old OSCAL images"
  else
    print_info "No old OSCAL images to remove (all in use)"
  fi
else
  print_info "No old OSCAL images found"
fi

# Step 2: Remove dangling images (untagged)
log "Removing dangling images..."
DANGLING_IMAGES=$(docker images -f "dangling=true" -q)
if [ -n "$DANGLING_IMAGES" ]; then
  docker rmi $DANGLING_IMAGES 2>&1 | while IFS= read -r line; do log "  [docker] $line"; done || true
  print_success "Removed dangling images"
else
  print_info "No dangling images to remove"
fi

# Step 3: Prune all unused Docker data (images, containers, networks, build cache)
log "Pruning unused Docker resources..."
docker system prune -f --volumes 2>&1 | while IFS= read -r line; do log "  [docker] $line"; done || true
print_success "Docker system prune completed"

# Step 4: Show remaining images
log "Remaining Docker images:"
docker images --filter=reference='oscal-report-generator*' 2>&1 | while IFS= read -r line; do log "  $line"; done

print_success "Cleanup completed - all old images removed"

# ============================================================================
# SUMMARY
# ============================================================================

print_header "✅ Deployment Complete"

echo "📊 Deployment Summary:"
echo "  Instance: $DEPLOY_COLOR"
echo "  Version Deployed: ${MAGENTA}$REMOTE_VERSION${NC}"
echo "  Container Name: $CONTAINER_NAME"
echo "  Container Port: $CONTAINER_PORT"
echo "  Container ID: $CONTAINER_ID"
echo "  Image: $DOCKER_IMAGE"
echo ""
echo "🌐 Access Application:"
echo "  URL: http://localhost:${CONTAINER_PORT}"
echo "  Health: http://localhost:${CONTAINER_PORT}/health"
echo ""
echo "📋 Useful Commands:"
echo "  View logs: docker logs -f $CONTAINER_NAME"
echo "  Stop: docker stop $CONTAINER_NAME"
echo "  Restart: docker restart $CONTAINER_NAME"
echo "  Shell: docker exec -it $CONTAINER_NAME sh"
echo ""

log "Deployment completed successfully at $(date)"

# ============================================================================
# CRON JOB SETUP INSTRUCTIONS
# ============================================================================

if [ "$NEEDS_BUILD" = true ]; then
  echo ""
  echo "💡 To enable automated monthly deployments via cron:"
  echo ""
  echo "Add to crontab (crontab -e):"
  echo ""
  if [ "$DEPLOYMENT_TYPE" = "Green" ]; then
    echo "  # Green: Deploy on 1st, 3rd, and 5th Sunday at 2 AM"
    echo "  0 2 1-7,15-21,29-31 * 0 cd $SCRIPT_DIR && ./build_on_truenas.sh >> /var/log/oscal-green-deploy.log 2>&1"
  elif [ "$DEPLOYMENT_TYPE" = "Blue" ]; then
    echo "  # Blue: Deploy on 2nd and 4th Sunday at 2 AM"
    echo "  0 2 8-14,22-28 * 0 cd $SCRIPT_DIR && ./build_on_truenas.sh >> /var/log/oscal-blue-deploy.log 2>&1"
  fi
  echo ""
  echo "  # Or use a different time (e.g., 3 AM):"
  if [ "$DEPLOYMENT_TYPE" = "Green" ]; then
    echo "  0 3 1-7,15-21,29-31 * 0 cd $SCRIPT_DIR && ./build_on_truenas.sh >> /var/log/oscal-green-deploy.log 2>&1"
  elif [ "$DEPLOYMENT_TYPE" = "Blue" ]; then
    echo "  0 3 8-14,22-28 * 0 cd $SCRIPT_DIR && ./build_on_truenas.sh >> /var/log/oscal-blue-deploy.log 2>&1"
  fi
  echo ""
fi

print_success "✨ All done!"
