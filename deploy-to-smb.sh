#!/bin/bash

# OSCAL Report Generator - SMB Deployment Script
# Author: Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
# Copyright (c) 2025 Mukesh Kesharwani
# License: MIT

echo "🚀 OSCAL Report Generator - SMB Deployment"
echo "=========================================="
echo ""

# Configuration
# Source is always the current directory (where development happens)
CURRENT_DIR=$(pwd)
SOURCE_DIR="$CURRENT_DIR"

# Destination: Update this path to match your SMB share location
DESTINATION="/Volumes/KACI-Apps/OSCAL-Report-Generator"

echo "📂 Deploying FROM current directory:"
echo "   Source: $SOURCE_DIR"
echo "📁 Deploying TO:"
echo "   Destination: $DESTINATION"
echo ""

# Check if destination is set
if [ -z "$DESTINATION" ]; then
    echo "❌ Error: DESTINATION not set!"
    echo ""
    echo "Please edit this script and set DESTINATION to your SMB share path."
    echo "Example: DESTINATION=\"/Volumes/YourSMBShare/OSCAL-Report-Generator\""
    echo ""
    exit 1
fi

# Check if destination exists
if [ ! -d "$DESTINATION" ]; then
    echo "❌ Error: Destination directory does not exist: $DESTINATION"
    echo ""
    echo "Please ensure:"
    echo "1. Your SMB share is mounted"
    echo "2. The destination path is correct"
    echo ""
    exit 1
fi

# Ask for confirmation
read -p "Continue with deployment? (y/n): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 0
fi

echo ""
echo "📦 Syncing files..."
echo ""

# Use rsync to sync only modified files
# -a: archive mode (preserves permissions, timestamps, etc.)
# -v: verbose
# -z: compress during transfer
# -h: human-readable numbers
# --update: skip files that are newer on the destination
# --progress: show progress
# --exclude: exclude unnecessary files and directories

rsync -avzh --update --progress \
    --exclude 'node_modules/' \
    --exclude '.git/' \
    --exclude '.gitignore' \
    --exclude '*.log' \
    --exclude 'frontend/dist/' \
    --exclude 'backend/public/' \
    --exclude '.DS_Store' \
    --exclude 'npm-debug.log*' \
    --exclude 'yarn-debug.log*' \
    --exclude 'yarn-error.log*' \
    --exclude '.env' \
    --exclude '.env.local' \
    --exclude '.vscode/' \
    --exclude '.idea/' \
    --exclude 'credentials.txt' \
    --exclude '.cache/' \
    --exclude '*.pid' \
    --exclude 'backend/config.json' \
    --exclude 'backend/auth/users.json' \
    "$SOURCE_DIR/" "$DESTINATION/"

# Check if rsync was successful
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Deployment completed successfully!"
    echo ""
    echo "📊 Summary:"
    echo "  - Only modified files were copied"
    echo "  - Unchanged files were skipped"
    echo "  - Excluded: node_modules, build artifacts, credentials.txt, .env files"
    echo "  - Protected: config.json, users.json (environment-specific files)"
    echo ""
    echo "🔧 Next steps on deployment server:"
    echo "  1. cd $DESTINATION"
    echo "  2. npm install (in root, backend, and frontend)"
    echo "  3. cd frontend && npm run build"
    echo "  4. cp -r frontend/dist/* backend/public/"
    echo "  5. Check credentials.txt for admin password (auto-generated on first Docker build)"
    echo "  6. cd backend && node server.js"
else
    echo ""
    echo "❌ Deployment failed!"
    echo "Please check the error messages above."
    exit 1
fi

