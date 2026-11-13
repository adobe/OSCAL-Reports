#!/bin/bash
# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# GitHub account helper for adobe/OSCAL-Reports.
# Run: ./scripts/switch-github-account.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT" || true

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║              GitHub Account Switcher                          ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

echo "📊 Current Account Status:"
gh auth status
echo ""

echo "Canonical repository: adobe/OSCAL-Reports"
echo "Use mkesharw_adobe for push/PR operations on this project."
echo ""
echo "Select action:"
echo "  1) Switch to mkesharw_adobe (Adobe — for adobe/OSCAL-Reports)"
echo "  2) Show current status"
echo "  3) Exit"
echo ""
read -rp "Enter choice [1-3]: " choice

case $choice in
    1)
        echo ""
        echo "🔄 Switching to mkesharw_adobe..."
        gh auth switch --user mkesharw_adobe
        echo "✅ Switched to Adobe account (mkesharw_adobe)"
        echo ""
        echo "You can now access:"
        echo "  - adobe/OSCAL-Reports (https://github.com/adobe/OSCAL-Reports)"
        ;;
    2)
        echo ""
        echo "📊 Current GitHub Account Status:"
        gh auth status
        ;;
    3)
        echo "Exiting..."
        exit 0
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Done"
