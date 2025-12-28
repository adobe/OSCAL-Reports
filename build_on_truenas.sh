#!/bin/bash

# OSCAL Report Generator - Build Script for TrueNAS
# This script builds the Docker image for deployment on TrueNAS
# Author: Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
# Copyright (c) 2025 Mukesh Kesharwani
# License: MIT

# Don't exit on error - we want to show helpful messages
# set -e

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'  # No Color

# Helper functions
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC}  $1"; }
print_info() { echo -e "${BLUE}ℹ${NC}  $1"; }

# Change to the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${CYAN}🔨 OSCAL Report Generator - Docker Build Script${NC}"
echo -e "${CYAN}================================================${NC}"
echo ""
print_info "Script directory: $SCRIPT_DIR"
echo ""

# Detect version from current directory path
CURRENT_DIR=$(pwd)
DEPLOY_VERSION="V2"
DEPLOY_DIR=""
DOCKER_IMAGE=""
CONTAINER_PORT=""

# Check if running on TrueNAS (detect by hostname, system files, or environment)
IS_TRUENAS=false
if [ -f /etc/version ] || [ -f /usr/local/etc/ix-common.conf ] || [ -d /usr/local/www ] || hostname 2>/dev/null | grep -qi "truenas\|nas" || [ -n "$TRUENAS_VERSION" ]; then
    IS_TRUENAS=true
    echo "📍 Running locally on TrueNAS"
fi

# Check if SSH connection is being attempted (prevent SSH when running locally)
if [ "$IS_TRUENAS" = "true" ] && [ -n "$SSH_CONNECTION" ]; then
    echo "ℹ️  Running via SSH on TrueNAS - proceeding with local build"
fi

# Set deployment configuration
DEPLOY_DIR="OSCAL-Report-Generator"
DOCKER_IMAGE="oscal-report-generator:latest"
CONTAINER_PORT="3020"
print_success "Deployment configuration set"

# Validate that CONTAINER_PORT is set
if [ -z "$CONTAINER_PORT" ]; then
    print_error "CONTAINER_PORT variable is not set!"
    echo "   This should not happen. Please check the script logic."
    exit 1
fi

echo ""
echo "📋 Build Configuration:"
echo "  Version: $DEPLOY_VERSION"
echo "  Directory: $DEPLOY_DIR"
echo "  Docker Image: $DOCKER_IMAGE"
echo "  Container Port: $CONTAINER_PORT"
echo "  Current Directory: $CURRENT_DIR"
echo ""

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed or not in PATH"
    echo "   Please install Docker on TrueNAS"
    exit 1
fi

# Check if docker-compose.yml exists
if [ ! -f "docker-compose.yml" ]; then
    echo "⚠️  Warning: docker-compose.yml not found in current directory"
    echo "   Looking for docker-compose.yml in config/build/..."
    
    if [ -f "config/build/docker-compose.yml" ]; then
        echo "   ✅ Found config/build/docker-compose.yml"
        DOCKER_COMPOSE_FILE="config/build/docker-compose.yml"
    else
        echo "   ❌ docker-compose.yml not found"
        echo "   Please ensure you're in the correct directory"
        exit 1
    fi
else
    DOCKER_COMPOSE_FILE="docker-compose.yml"
fi

# Check if Dockerfile exists
if [ ! -f "Dockerfile" ]; then
    echo "❌ Error: Dockerfile not found in current directory"
    echo "   Please ensure you're in the correct directory"
    exit 1
fi

# Validate that DOCKER_IMAGE is set
if [ -z "$DOCKER_IMAGE" ]; then
    echo "❌ Error: DOCKER_IMAGE variable is not set!"
    echo "   This should not happen. Please check the script logic."
    exit 1
fi

echo ""
echo "🔨 Building Docker image: $DOCKER_IMAGE"
echo "   Deployment Version: $DEPLOY_VERSION"
echo "   Container Port: $CONTAINER_PORT"
echo ""

# Build the Docker image
if docker build -t "$DOCKER_IMAGE" .; then
    echo ""
    echo "✅ Docker image built successfully!"
    echo "   Image Name: $DOCKER_IMAGE"
    echo "   Deployment Version: $DEPLOY_VERSION"
    echo "   Container Port: $CONTAINER_PORT"
    echo ""
    echo "📋 Next steps:"
    echo "  1. Verify image: docker images | grep oscal-report-generator"
    echo "  2. Deploy via TrueNAS GUI: Apps → Launch Docker Image"
    echo "  3. Use image: $DOCKER_IMAGE"
    echo "  4. Set Container Port: $CONTAINER_PORT"
    echo "  5. Set PORT environment variable: $CONTAINER_PORT"
    echo ""
else
    echo ""
    echo "❌ Docker build failed!"
    echo "   Please check the error messages above"
    exit 1
fi

