#!/bin/bash

# OSCAL Report Generator - Build Script for TrueNAS
# This script builds the Docker image for deployment on TrueNAS
# Author: Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
# Copyright (c) 2025 Mukesh Kesharwani
# License: MIT

# Don't exit on error - we want to show helpful messages
# set -e

# Change to the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🔨 OSCAL Report Generator - Docker Build Script"
echo "================================================"
echo ""
echo "📂 Script directory: $SCRIPT_DIR"
echo ""

# Detect version from current directory path
CURRENT_DIR=$(pwd)
DEPLOY_VERSION=""
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

# Detect version from path (Blue/Green instead of V2/V1)
# Check for Blue first (more specific), then Green
if echo "$CURRENT_DIR" | grep -qi "OSCAL-Report-Generator-Blue\|/blue/"; then
    DEPLOY_VERSION="Blue"
    DEPLOY_DIR="OSCAL-Report-Generator-Blue"
    DOCKER_IMAGE="oscal-report-generator-blue:latest"
    CONTAINER_PORT="3020"
    echo "✅ Detected: Blue deployment"
elif echo "$CURRENT_DIR" | grep -qi "OSCAL-Report-Generator-Green\|/green/"; then
    DEPLOY_VERSION="Green"
    DEPLOY_DIR="OSCAL-Report-Generator-Green"
    DOCKER_IMAGE="oscal-report-generator-green:latest"
    CONTAINER_PORT="3019"
    echo "✅ Detected: Green deployment"
else
    # Fallback: try to detect from directory name
    DIR_NAME=$(basename "$CURRENT_DIR")
    if echo "$DIR_NAME" | grep -qi "blue"; then
        DEPLOY_VERSION="Blue"
        DEPLOY_DIR="OSCAL-Report-Generator-Blue"
        DOCKER_IMAGE="oscal-report-generator-blue:latest"
        CONTAINER_PORT="3020"
        echo "✅ Detected: Blue deployment (from directory name)"
    elif echo "$DIR_NAME" | grep -qi "green"; then
        DEPLOY_VERSION="Green"
        DEPLOY_DIR="OSCAL-Report-Generator-Green"
        DOCKER_IMAGE="oscal-report-generator-green:latest"
        CONTAINER_PORT="3019"
        echo "✅ Detected: Green deployment (from directory name)"
    else
        # Ask user if we can't detect (only if running interactively)
        echo "⚠️  Warning: Cannot detect deployment version (Blue/Green) from path."
        echo "   Current directory: $CURRENT_DIR"
        echo ""
        
        # Check if running interactively (has TTY)
        if [ -t 0 ]; then
            read -p "Select deployment version [Blue/Green] (default: Blue): " USER_CHOICE
            USER_CHOICE=${USER_CHOICE:-Blue}
        else
            # Non-interactive: default to Blue
            echo "   Non-interactive mode: Defaulting to Blue"
            USER_CHOICE="Blue"
        fi
        
        case "$USER_CHOICE" in
            [Bb]lue|BLUE|1|"")
                DEPLOY_VERSION="Blue"
                DEPLOY_DIR="OSCAL-Report-Generator-Blue"
                DOCKER_IMAGE="oscal-report-generator-blue:latest"
                CONTAINER_PORT="3020"
                echo "✅ Selected: Blue deployment"
                ;;
            [Gg]reen|GREEN|2)
                DEPLOY_VERSION="Green"
                DEPLOY_DIR="OSCAL-Report-Generator-Green"
                DOCKER_IMAGE="oscal-report-generator-green:latest"
                CONTAINER_PORT="3019"
                echo "✅ Selected: Green deployment"
                ;;
            *)
                echo "⚠️  Invalid choice. Defaulting to Blue."
                DEPLOY_VERSION="Blue"
                DEPLOY_DIR="OSCAL-Report-Generator-Blue"
                DOCKER_IMAGE="oscal-report-generator-blue:latest"
                CONTAINER_PORT="3020"
                ;;
        esac
    fi
fi

# Validate that CONTAINER_PORT is set
if [ -z "$CONTAINER_PORT" ]; then
    echo "❌ Error: CONTAINER_PORT variable is not set!"
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

