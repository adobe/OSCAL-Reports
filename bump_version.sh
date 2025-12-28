#!/bin/bash
#
# OSCAL Report Generator V2 - Automated Version Bumping Script
#
# Author: Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
# Copyright (c) 2025 Mukesh Kesharwani
# License: MIT
#
# Usage: ./bump_version.sh [major|minor|patch] "changelog message"
# Example: ./bump_version.sh minor "Add new AI integration features"
#
# This script:
# - Updates version in all 3 package.json files (root, backend, frontend)
# - Appends changelog entry to CHANGELOG.md
# - Creates a git commit with the version bump
# - Optionally creates a git tag

set -e  # Exit on error

# ============================================================================
# COLOR DEFINITIONS
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'  # No Color

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

print_success() {
  echo -e "${GREEN}✓${NC} $1"
}

print_error() {
  echo -e "${RED}✗${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}⚠${NC}  $1"
}

print_info() {
  echo -e "${BLUE}ℹ${NC}  $1"
}

print_header() {
  echo ""
  echo -e "${CYAN}========================================${NC}"
  echo -e "${CYAN}$1${NC}"
  echo -e "${CYAN}========================================${NC}"
  echo ""
}

# ============================================================================
# VERSION BUMP LOGIC
# ============================================================================

get_current_version() {
  local package_file="$1"
  if [ ! -f "$package_file" ]; then
    print_error "File not found: $package_file"
    exit 1
  fi
  grep '"version":' "$package_file" | head -1 | sed 's/.*"version": "\(.*\)".*/\1/'
}

bump_version() {
  local current_version="$1"
  local bump_type="$2"
  
  IFS='.' read -r major minor patch <<< "$current_version"
  
  case "$bump_type" in
    major)
      major=$((major + 1))
      minor=0
      patch=0
      ;;
    minor)
      minor=$((minor + 1))
      patch=0
      ;;
    patch)
      patch=$((patch + 1))
      ;;
    *)
      print_error "Invalid bump type: $bump_type"
      print_info "Valid types: major, minor, patch"
      exit 1
      ;;
  esac
  
  echo "$major.$minor.$patch"
}

update_package_json() {
  local file="$1"
  local new_version="$2"
  
  if [ ! -f "$file" ]; then
    print_warning "File not found: $file (skipping)"
    return
  fi
  
  # Use sed to update version in package.json
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$new_version\"/" "$file"
  else
    # Linux
    sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$new_version\"/" "$file"
  fi
  
  print_success "Updated: $file"
}

update_changelog() {
  local new_version="$1"
  local message="$2"
  local date=$(date +"%Y-%m-%d")
  
  # Create CHANGELOG.md if it doesn't exist
  if [ ! -f "CHANGELOG.md" ]; then
    cat > CHANGELOG.md << EOF
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

EOF
    print_info "Created CHANGELOG.md"
  fi
  
  # Create temporary file with new entry
  local temp_file=$(mktemp)
  
  # Read existing changelog
  cat CHANGELOG.md > "$temp_file"
  
  # Insert new entry after the header (after first empty line following headers)
  local new_entry="
## [$new_version] - $date

### Changed
- $message
"
  
  # Find the insertion point (after the header section)
  awk -v entry="$new_entry" '
    BEGIN { found_header = 0; inserted = 0 }
    {
      print
      if (!inserted && found_header && /^$/) {
        print entry
        inserted = 1
      }
      if (/^# Changelog/ || /^All notable changes/) {
        found_header = 1
      }
    }
    END {
      if (!inserted) print entry
    }
  ' "$temp_file" > CHANGELOG.md
  
  rm "$temp_file"
  print_success "Updated: CHANGELOG.md"
}

# ============================================================================
# MAIN SCRIPT
# ============================================================================

print_header "OSCAL Version Bumping Script"

# Check arguments
if [ $# -lt 2 ]; then
  print_error "Usage: ./bump_version.sh [major|minor|patch] \"changelog message\""
  print_info "Example: ./bump_version.sh minor \"Add new features\""
  exit 1
fi

BUMP_TYPE="$1"
CHANGELOG_MESSAGE="$2"

# Validate bump type
if [[ ! "$BUMP_TYPE" =~ ^(major|minor|patch)$ ]]; then
  print_error "Invalid bump type: $BUMP_TYPE"
  print_info "Valid types: major, minor, patch"
  exit 1
fi

# Check if we're in the project root
if [ ! -f "package.json" ]; then
  print_error "Not in project root directory (package.json not found)"
  exit 1
fi

# Get current version from root package.json
CURRENT_VERSION=$(get_current_version "package.json")
print_info "Current version: $CURRENT_VERSION"

# Calculate new version
NEW_VERSION=$(bump_version "$CURRENT_VERSION" "$BUMP_TYPE")
print_info "New version: $NEW_VERSION"
print_info "Bump type: $BUMP_TYPE"

# Confirm with user
echo ""
read -p "$(echo -e ${YELLOW}Continue with version bump to ${NEW_VERSION}? [y/N]:${NC} )" -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  print_warning "Version bump cancelled"
  exit 0
fi

echo ""
print_header "Updating Version Numbers"

# Update all package.json files
update_package_json "package.json" "$NEW_VERSION"
update_package_json "backend/package.json" "$NEW_VERSION"
update_package_json "frontend/package.json" "$NEW_VERSION"

echo ""
print_header "Updating Changelog"

# Update CHANGELOG.md
update_changelog "$NEW_VERSION" "$CHANGELOG_MESSAGE"

echo ""
print_header "Git Operations"

# Check if git is available and we're in a git repository
if command -v git &> /dev/null && [ -d .git ]; then
  # Stage changes
  git add package.json backend/package.json frontend/package.json CHANGELOG.md 2>/dev/null || true
  print_success "Staged version files"
  
  # Create commit
  COMMIT_MESSAGE="chore(release): bump version to v$NEW_VERSION

$CHANGELOG_MESSAGE

Updated files:
- package.json
- backend/package.json
- frontend/package.json
- CHANGELOG.md"
  
  git commit -m "$COMMIT_MESSAGE" 2>/dev/null || print_warning "No changes to commit (files may be unchanged)"
  print_success "Created commit"
  
  # Ask about creating a tag
  echo ""
  read -p "$(echo -e ${YELLOW}Create git tag v${NEW_VERSION}? [y/N]:${NC} )" -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION: $CHANGELOG_MESSAGE"
    print_success "Created tag: v$NEW_VERSION"
    print_info "Push tags with: git push origin v$NEW_VERSION"
  fi
else
  print_warning "Git not available or not a git repository"
  print_info "Files updated but not committed"
fi

echo ""
print_header "Version Bump Complete!"

print_success "Version bumped from $CURRENT_VERSION to $NEW_VERSION"
print_info "Changelog updated with: $CHANGELOG_MESSAGE"

echo ""
print_info "Next steps:"
echo "  1. Review changes: git diff HEAD~1"
echo "  2. Test the application"
echo "  3. Push changes: git push"
if git tag -l "v$NEW_VERSION" &> /dev/null; then
  echo "  4. Push tag: git push origin v$NEW_VERSION"
fi

echo ""

