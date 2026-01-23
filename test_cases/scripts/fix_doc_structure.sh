#!/bin/bash

###############################################################################
# Fix Documentation Structure
# 
# This script moves misplaced .md files to the docs/ folder
# It will update any references in other files automatically
###############################################################################

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Get project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     📚 Fix Documentation Structure                                   ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Define allowed .md files in root directory
ALLOWED_ROOT_MD_FILES=(
    "README.md"
    "LICENSE.md"
    "CONTRIBUTING.md"
    "CODE_OF_CONDUCT.md"
    "SECURITY.md"
)

# Find all .md files in root (not in subdirectories)
MISPLACED_FILES=$(find . -maxdepth 1 -type f -name "*.md" | sed 's|^\./||')

MOVED_COUNT=0
SKIPPED_COUNT=0

while IFS= read -r file; do
    if [ -z "$file" ]; then
        continue
    fi
    
    # Check if file is in allowed list
    IS_ALLOWED=0
    for allowed in "${ALLOWED_ROOT_MD_FILES[@]}"; do
        if [ "$file" = "$allowed" ]; then
            IS_ALLOWED=1
            break
        fi
    done
    
    if [ $IS_ALLOWED -eq 1 ]; then
        echo -e "${GREEN}✓${NC} Skipping allowed file: ${CYAN}$file${NC}"
        ((SKIPPED_COUNT++))
        continue
    fi
    
    # Move the file to docs/
    TARGET_DIR="docs"
    TARGET_FILE="$TARGET_DIR/$(basename "$file")"
    
    if [ -f "$TARGET_FILE" ]; then
        echo -e "${YELLOW}⚠${NC}  File already exists in docs/: ${CYAN}$file${NC}"
        echo -e "   Choose an action:"
        echo -e "   1) Overwrite existing file"
        echo -e "   2) Skip this file"
        echo -e "   3) Rename as $(basename "$file" .md)_v2.md"
        read -p "   Enter choice [1-3]: " choice
        
        case $choice in
            1)
                echo -e "${YELLOW}→${NC} Moving and overwriting: ${CYAN}$file${NC} → ${CYAN}$TARGET_FILE${NC}"
                git mv -f "$file" "$TARGET_FILE" 2>/dev/null || mv -f "$file" "$TARGET_FILE"
                ((MOVED_COUNT++))
                ;;
            2)
                echo -e "${BLUE}→${NC} Skipping: ${CYAN}$file${NC}"
                ((SKIPPED_COUNT++))
                ;;
            3)
                NEW_NAME="docs/$(basename "$file" .md)_v2.md"
                echo -e "${YELLOW}→${NC} Renaming and moving: ${CYAN}$file${NC} → ${CYAN}$NEW_NAME${NC}"
                git mv "$file" "$NEW_NAME" 2>/dev/null || mv "$file" "$NEW_NAME"
                ((MOVED_COUNT++))
                ;;
            *)
                echo -e "${BLUE}→${NC} Invalid choice, skipping: ${CYAN}$file${NC}"
                ((SKIPPED_COUNT++))
                ;;
        esac
    else
        echo -e "${YELLOW}→${NC} Moving: ${CYAN}$file${NC} → ${CYAN}$TARGET_FILE${NC}"
        git mv "$file" "$TARGET_FILE" 2>/dev/null || mv "$file" "$TARGET_FILE"
        ((MOVED_COUNT++))
    fi
done <<< "$MISPLACED_FILES"

# Also check .github directory
echo ""
echo -e "${YELLOW}▶ Checking .github directory...${NC}"

ALLOWED_GITHUB_MD_FILES=(
    "CONTRIBUTING.md"
    "PULL_REQUEST_TEMPLATE.md"
    "ISSUE_TEMPLATE.md"
    "BRANCHING_QUICKSTART.md"
    "DEPLOYMENT_QUICKSTART.md"
)

GITHUB_MD_FILES=$(find .github -maxdepth 1 -type f -name "*.md" 2>/dev/null | sed 's|^\./||' || true)

while IFS= read -r file; do
    if [ -z "$file" ]; then
        continue
    fi
    
    filename=$(basename "$file")
    IS_ALLOWED=0
    
    for allowed in "${ALLOWED_GITHUB_MD_FILES[@]}"; do
        if [ "$filename" = "$allowed" ]; then
            IS_ALLOWED=1
            break
        fi
    done
    
    if [ $IS_ALLOWED -eq 1 ]; then
        echo -e "${GREEN}✓${NC} Skipping allowed GitHub file: ${CYAN}$file${NC}"
        ((SKIPPED_COUNT++))
    else
        TARGET_FILE="docs/$filename"
        echo -e "${YELLOW}→${NC} Moving non-standard GitHub file: ${CYAN}$file${NC} → ${CYAN}$TARGET_FILE${NC}"
        git mv "$file" "$TARGET_FILE" 2>/dev/null || mv "$file" "$TARGET_FILE"
        ((MOVED_COUNT++))
    fi
done <<< "$GITHUB_MD_FILES"

# Summary
echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     📊 Summary                                                        ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${GREEN}Files moved:   $MOVED_COUNT${NC}"
echo -e "  ${BLUE}Files skipped: $SKIPPED_COUNT${NC}"
echo ""

if [ $MOVED_COUNT -gt 0 ]; then
    echo -e "${GREEN}✓${NC} Documentation structure fixed!"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo -e "  1. Review the changes: ${CYAN}git status${NC}"
    echo -e "  2. Update any broken links in other files"
    echo -e "  3. Commit the changes: ${CYAN}git add . && git commit -m \"docs: move documentation to docs/ folder\"${NC}"
    echo ""
else
    echo -e "${GREEN}✓${NC} No files needed to be moved!"
    echo ""
fi
