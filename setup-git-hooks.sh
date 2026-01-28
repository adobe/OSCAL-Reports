#!/bin/bash
#
# Setup Git Hooks for OSCAL Report Generator
#
# This script configures Git to use custom hooks from .githooks directory
# These hooks ensure version consistency and proper versioning workflow
#

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Git Hooks Setup for OSCAL Reports${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if we're in a git repository
if [ ! -d ".git" ]; then
  echo -e "${YELLOW}⚠${NC}  Not in a git repository root"
  exit 1
fi

# Check if .githooks directory exists
if [ ! -d ".githooks" ]; then
  echo -e "${YELLOW}⚠${NC}  .githooks directory not found"
  exit 1
fi

# Configure Git to use .githooks directory
echo -e "${BLUE}ℹ${NC}  Configuring Git to use .githooks directory..."
git config core.hooksPath .githooks

echo -e "${GREEN}✓${NC} Git hooks path configured"

# Make hooks executable
echo -e "${BLUE}ℹ${NC}  Making hooks executable..."
chmod +x .githooks/*
echo -e "${GREEN}✓${NC} Hooks are now executable"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Installed hooks:"
echo ""

for hook in .githooks/*; do
  if [ -f "$hook" ]; then
    hook_name=$(basename "$hook")
    echo -e "  ${GREEN}✓${NC} $hook_name"
    
    # Show what each hook does
    case "$hook_name" in
      pre-push)
        echo "    → Validates version increment before pushing to Pre_Prod/main"
        echo "    → Checks package.json consistency across all files"
        echo "    → Verifies changelog is updated"
        ;;
      *)
        echo "    → Custom hook for OSCAL workflow"
        ;;
    esac
    echo ""
  fi
done

echo ""
echo -e "${BLUE}ℹ${NC}  These hooks will help ensure:"
echo "  • Version is incremented before pushing to Pre_Prod or main"
echo "  • All package.json files have consistent versions"
echo "  • Changelog is kept up to date"
echo ""
echo -e "${BLUE}💡 TIP:${NC} Use ${GREEN}./bump_version.sh${NC} to automatically handle version updates"
echo ""

exit 0
