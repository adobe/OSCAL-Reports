#!/bin/bash
# GitHub Account Switcher — switch between personal and Adobe GitHub accounts.
# Run: ./scripts/switch-github-account.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT" || true

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║              GitHub Account Switcher                          ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Show current status
echo "📊 Current Account Status:"
gh auth status
echo ""

# Menu
echo "Select account to switch to:"
echo "  1) keekar2022 (Personal - for personal repo)"
echo "  2) mkesharw_adobe (Adobe EMU - for Adobe repo)"
echo "  3) Show current status"
echo "  4) Exit"
echo ""
read -rp "Enter choice [1-4]: " choice

case $choice in
    1)
        echo ""
        echo "🔄 Switching to keekar2022..."
        gh auth switch --user keekar2022
        echo "✅ Switched to personal account (keekar2022)"
        echo ""
        echo "You can now access:"
        echo "  - Personal repo: keekar2022/OSCAL-Reports (private)"
        ;;
    2)
        echo ""
        echo "🔄 Switching to mkesharw_adobe..."
        gh auth switch --user mkesharw_adobe
        echo "✅ Switched to Adobe EMU account (mkesharw_adobe)"
        echo ""
        echo "You can now access:"
        echo "  - Adobe repo: AdobeManagedServices/OSCAL-Reports"
        ;;
    3)
        echo ""
        echo "📊 Current GitHub Account Status:"
        gh auth status
        ;;
    4)
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
echo "✅ Account switch complete"
echo ""
