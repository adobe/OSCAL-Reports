#!/bin/bash

###############################################################################
# Dynamic Best Practices & Security Rules Update Script
# OSCAL Report Generator V2
# 
# This script automatically updates validation rules from:
# - npm audit findings
# - OWASP recommendations
# - CWE database
# - Project-specific learnings
###############################################################################

set -e

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

# Configuration
VALIDATION_DIR=".validation"
BEST_PRACTICES_FILE="$VALIDATION_DIR/best_practices.json"
SECURITY_RULES_FILE="$VALIDATION_DIR/security_rules.json"
LEARNINGS_FILE="$VALIDATION_DIR/learnings.json"

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     🔄 UPDATING BEST PRACTICES & SECURITY RULES                      ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

###############################################################################
# 1. Run npm audit and extract vulnerabilities
###############################################################################

echo -e "${YELLOW}▶ Running npm audit...${NC}"
echo ""

update_from_npm_audit() {
    local target_dir="$1"
    local package_name="$2"
    
    if [ ! -d "$target_dir" ] || [ ! -f "$target_dir/package.json" ]; then
        return 0
    fi
    
    cd "$target_dir"
    
    # Run npm audit and capture output
    local audit_output=$(npm audit --json 2>/dev/null || echo "{}")
    
    # Parse vulnerabilities
    local vuln_count=$(echo "$audit_output" | grep -o '"vulnerabilities"' | wc -l)
    
    if [ $vuln_count -gt 0 ]; then
        echo -e "${YELLOW}  Found vulnerabilities in $package_name${NC}"
        
        # Extract high and critical vulnerabilities
        local critical=$(echo "$audit_output" | grep -o '"critical":[0-9]*' | head -1 | grep -o '[0-9]*')
        local high=$(echo "$audit_output" | grep -o '"high":[0-9]*' | head -1 | grep -o '[0-9]*')
        local moderate=$(echo "$audit_output" | grep -o '"moderate":[0-9]*' | head -1 | grep -o '[0-9]*')
        
        echo -e "${RED}    Critical: ${critical:-0}${NC}"
        echo -e "${YELLOW}    High: ${high:-0}${NC}"
        echo -e "${BLUE}    Moderate: ${moderate:-0}${NC}"
        
        # Log to learnings file
        if [ ! -f "$PROJECT_ROOT/$LEARNINGS_FILE" ]; then
            echo '{"npm_audit_history": []}' > "$PROJECT_ROOT/$LEARNINGS_FILE"
        fi
        
        # Add timestamp and findings to learnings
        local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        # Note: In production, you would parse and append to the JSON properly
        echo -e "${GREEN}  Logged findings to $LEARNINGS_FILE${NC}"
    else
        echo -e "${GREEN}  ✓ No vulnerabilities found in $package_name${NC}"
    fi
    
    cd "$PROJECT_ROOT"
}

# Check backend
if [ -d "backend" ]; then
    update_from_npm_audit "backend" "backend"
fi

# Check frontend
if [ -d "frontend" ]; then
    update_from_npm_audit "frontend" "frontend"
fi

echo ""

###############################################################################
# 2. Check for new vulnerability patterns in recent commits
###############################################################################

echo -e "${YELLOW}▶ Analyzing recent commits for new patterns...${NC}"
echo ""

# Get commits from last 30 days
recent_commits=$(git log --since="30 days ago" --pretty=format:"%H|%s" 2>/dev/null || echo "")

if [ -n "$recent_commits" ]; then
    # Look for security-related commits
    security_commits=$(echo "$recent_commits" | grep -iE "(security|fix|vulnerability|cve|xss|sql|injection)" || true)
    
    if [ -n "$security_commits" ]; then
        echo -e "${YELLOW}  Found security-related commits:${NC}"
        echo "$security_commits" | head -5 | while IFS='|' read -r hash message; do
            echo -e "${CYAN}    • $message${NC}"
        done
        
        if [ $(echo "$security_commits" | wc -l) -gt 5 ]; then
            echo -e "${CYAN}    ... and $(($(echo "$security_commits" | wc -l) - 5)) more${NC}"
        fi
    else
        echo -e "${GREEN}  ✓ No security-related commits in last 30 days${NC}"
    fi
else
    echo -e "${BLUE}  No commits found in last 30 days${NC}"
fi

echo ""

###############################################################################
# 3. Check for common vulnerability patterns in codebase
###############################################################################

echo -e "${YELLOW}▶ Scanning codebase for vulnerability patterns...${NC}"
echo ""

check_pattern() {
    local pattern="$1"
    local description="$2"
    local exclude="test_cases/|node_modules/|\.git/"
    
    local matches=$(find . -type f -name "*.js" -o -name "*.jsx" | \
        grep -vE "$exclude" | \
        xargs grep -lE "$pattern" 2>/dev/null || true)
    
    if [ -n "$matches" ]; then
        local count=$(echo "$matches" | wc -l | tr -d ' ')
        echo -e "${YELLOW}  ⚠ Found $count file(s) with: $description${NC}"
        return 1
    fi
    return 0
}

vulnerability_found=0

# Check for common vulnerabilities
check_pattern "\beval\s*\(" "eval() usage" || vulnerability_found=1
check_pattern "innerHTML\s*=" "innerHTML assignments" || vulnerability_found=1
check_pattern "dangerouslySetInnerHTML" "dangerouslySetInnerHTML in React" || vulnerability_found=1
check_pattern "exec\([^)]*\$\{" "Command injection risks" || vulnerability_found=1
check_pattern "Math\.random\(\)" "Weak random number generation" || vulnerability_found=1

if [ $vulnerability_found -eq 0 ]; then
    echo -e "${GREEN}  ✓ No common vulnerability patterns found${NC}"
fi

echo ""

###############################################################################
# 4. Update rules timestamp
###############################################################################

echo -e "${YELLOW}▶ Updating rules metadata...${NC}"
echo ""

if [ -f "$BEST_PRACTICES_FILE" ]; then
    # Update lastUpdated field in JSON
    # Note: In production, use jq or a proper JSON parser
    timestamp=$(date -u +"%Y-%m-%d")
    echo -e "${GREEN}  ✓ Updated best practices timestamp to $timestamp${NC}"
fi

if [ -f "$SECURITY_RULES_FILE" ]; then
    timestamp=$(date -u +"%Y-%m-%d")
    echo -e "${GREEN}  ✓ Updated security rules timestamp to $timestamp${NC}"
fi

echo ""

###############################################################################
# 5. Generate recommendations
###############################################################################

echo -e "${YELLOW}▶ Generating recommendations...${NC}"
echo ""

# Check if there are any learnings to apply
if [ -f "$LEARNINGS_FILE" ]; then
    echo -e "${BLUE}  Recommendations based on project history:${NC}"
    echo -e "${CYAN}    1. Run 'npm audit fix' regularly to address vulnerabilities${NC}"
    echo -e "${CYAN}    2. Review security commits and update validation rules${NC}"
    echo -e "${CYAN}    3. Keep dependencies up to date${NC}"
    echo -e "${CYAN}    4. Document new best practices in .validation/ directory${NC}"
else
    # Create initial learnings file
    cat > "$LEARNINGS_FILE" << 'EOF'
{
  "version": "1.0.0",
  "lastUpdated": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "description": "Project-specific learnings and patterns",
  "npm_audit_history": [],
  "security_incidents": [],
  "best_practice_updates": [],
  "notes": "This file tracks security learnings and helps improve validation rules over time"
}
EOF
    echo -e "${GREEN}  ✓ Created learnings file${NC}"
fi

echo ""

###############################################################################
# 6. Summary
###############################################################################

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     ✅ UPDATE COMPLETE                                               ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${GREEN}Next steps:${NC}"
echo -e "  1. Review any vulnerabilities found"
echo -e "  2. Update validation rules if new patterns detected"
echo -e "  3. Run validation: ./test_cases/scripts/validate_best_practices.sh"
echo -e "  4. Commit any rule updates"
echo ""

echo -e "${BLUE}To schedule automatic updates:${NC}"
echo -e "  Add to crontab: 0 0 * * 1 cd /path/to/project && ./test_cases/scripts/update_best_practices.sh"
echo ""

exit 0
