#!/bin/bash

###############################################################################
# Best Practices & Security Validation Script
# OSCAL Report Generator V2
# 
# This script validates code against best practices and security rules
# defined in .validation/ directory
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Get project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

# Validation rules
BEST_PRACTICES_FILE=".validation/best_practices.json"
SECURITY_RULES_FILE=".validation/security_rules.json"

# Counters
CRITICAL_COUNT=0
ERROR_COUNT=0
WARNING_COUNT=0
INFO_COUNT=0

# Results storage
declare -a FINDINGS

###############################################################################
# Helper Functions
###############################################################################

log_finding() {
    local severity="$1"
    local rule_id="$2"
    local file="$3"
    local line="$4"
    local message="$5"
    
    case "$severity" in
        CRITICAL)
            ((CRITICAL_COUNT++))
            echo -e "${RED}[CRITICAL]${NC} $rule_id: $message"
            ;;
        ERROR)
            ((ERROR_COUNT++))
            echo -e "${RED}[ERROR]${NC} $rule_id: $message"
            ;;
        WARNING)
            ((WARNING_COUNT++))
            echo -e "${YELLOW}[WARNING]${NC} $rule_id: $message"
            ;;
        INFO)
            ((INFO_COUNT++))
            echo -e "${BLUE}[INFO]${NC} $rule_id: $message"
            ;;
    esac
    
    if [ -n "$file" ]; then
        echo -e "  ${CYAN}File:${NC} $file"
        if [ -n "$line" ]; then
            echo -e "  ${CYAN}Line:${NC} $line"
        fi
    fi
    echo ""
    
    FINDINGS+=("$severity|$rule_id|$file|$line|$message")
}

check_file_against_pattern() {
    local pattern="$1"
    local exclude_pattern="$2"
    local severity="$3"
    local rule_id="$4"
    local message="$5"
    
    # Get staged files
    local files=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || echo "")
    
    if [ -z "$files" ]; then
        return 0
    fi
    
    # Check each file
    while IFS= read -r file; do
        if [ ! -f "$file" ]; then
            continue
        fi
        
        # Check if file should be excluded
        if [ -n "$exclude_pattern" ]; then
            if echo "$file" | grep -qE "$exclude_pattern"; then
                continue
            fi
        fi
        
        # Search for pattern in file
        local matches=$(grep -nE "$pattern" "$file" 2>/dev/null || true)
        if [ -n "$matches" ]; then
            while IFS= read -r match; do
                local line_num=$(echo "$match" | cut -d: -f1)
                log_finding "$severity" "$rule_id" "$file" "$line_num" "$message"
            done <<< "$matches"
        fi
    done <<< "$files"
}

###############################################################################
# Security Checks
###############################################################################

run_security_checks() {
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║     🔒 SECURITY VALIDATION                                           ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # Check for hardcoded secrets
    echo -e "${YELLOW}▶ Checking for hardcoded secrets...${NC}"
    check_file_against_pattern \
        "(password|secret|api_key|apikey|apitoken|private_key|access_token)\s*=\s*['\"][a-zA-Z0-9]{16,}['\"]" \
        "(test_cases/|\.test\.|\.spec\.|\.md|setup\.sh|bump_version\.sh|\.github/workflows/|node_modules/)" \
        "CRITICAL" \
        "SEC-001" \
        "Hardcoded secret detected - use environment variables"
    
    # Check for eval()
    echo -e "${YELLOW}▶ Checking for dangerous eval() usage...${NC}"
    check_file_against_pattern \
        "\beval\s*\(" \
        "(test_cases/|node_modules/)" \
        "CRITICAL" \
        "SEC-002" \
        "eval() is dangerous and should never be used"
    
    # Check for SQL injection risks
    echo -e "${YELLOW}▶ Checking for SQL injection vulnerabilities...${NC}"
    check_file_against_pattern \
        "\$\{.*\}.*INTO|INSERT.*\$\{" \
        "(test_cases/|node_modules/)" \
        "ERROR" \
        "SEC-003" \
        "Potential SQL injection - use parameterized queries"
    
    # Check for XSS vulnerabilities
    echo -e "${YELLOW}▶ Checking for XSS vulnerabilities...${NC}"
    check_file_against_pattern \
        "innerHTML\s*=" \
        "(test_cases/|node_modules/)" \
        "WARNING" \
        "SEC-004" \
        "innerHTML can lead to XSS - use textContent or sanitize"
    
    check_file_against_pattern \
        "dangerouslySetInnerHTML" \
        "(test_cases/|node_modules/)" \
        "WARNING" \
        "SEC-005" \
        "React XSS risk - sanitize content before rendering"
    
    # Check for weak crypto
    echo -e "${YELLOW}▶ Checking for weak cryptography...${NC}"
    check_file_against_pattern \
        "crypto\.createHash\(['\"]md5['\"]|['\"]sha1['\"]" \
        "(test_cases/|node_modules/)" \
        "ERROR" \
        "SEC-006" \
        "Weak hash algorithm - use SHA-256 or stronger"
    
    # Check for path traversal
    echo -e "${YELLOW}▶ Checking for path traversal vulnerabilities...${NC}"
    check_file_against_pattern \
        "fs\.(readFile|writeFile|unlink)[^)]*\$\{" \
        "(test_cases/|node_modules/)" \
        "CRITICAL" \
        "SEC-007" \
        "Path traversal risk - validate and sanitize paths"
    
    # Check for sensitive file commits
    echo -e "${YELLOW}▶ Checking for sensitive files...${NC}"
    local sensitive_files=$(git diff --cached --name-only --diff-filter=ACMR | \
        grep -E '\.(env|pem|key)$|credentials\.json|secrets\.json|private\.key|id_rsa|id_dsa' || true)
    
    if [ -n "$sensitive_files" ]; then
        while IFS= read -r file; do
            log_finding "CRITICAL" "SEC-008" "$file" "" "Sensitive file should not be committed"
        done <<< "$sensitive_files"
    fi
    
    echo ""
}

###############################################################################
# Code Quality Checks
###############################################################################

run_code_quality_checks() {
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║     ✨ CODE QUALITY VALIDATION                                       ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # Check for console.log
    echo -e "${YELLOW}▶ Checking for console.log statements...${NC}"
    check_file_against_pattern \
        "console\.log" \
        "(test_cases/|\.test\.|\.spec\.|node_modules/|dist/|build/)" \
        "WARNING" \
        "CQ-001" \
        "console.log should not be in production code"
    
    # Check for debugger
    echo -e "${YELLOW}▶ Checking for debugger statements...${NC}"
    check_file_against_pattern \
        "debugger;" \
        "(test_cases/|node_modules/)" \
        "ERROR" \
        "CQ-002" \
        "debugger statement must be removed"
    
    # Check for empty catch blocks
    echo -e "${YELLOW}▶ Checking for empty error handling...${NC}"
    check_file_against_pattern \
        "catch\s*\(\w+\)\s*\{\s*\}" \
        "(test_cases/|node_modules/)" \
        "WARNING" \
        "CQ-003" \
        "Empty catch block - add error handling or logging"
    
    # Check for TODO/FIXME
    echo -e "${YELLOW}▶ Checking for TODO/FIXME comments...${NC}"
    check_file_against_pattern \
        "(TODO|FIXME):" \
        "(\.md|test_cases/|docs/|node_modules/)" \
        "INFO" \
        "CQ-004" \
        "TODO/FIXME comment - consider creating a GitHub issue"
    
    echo ""
}

###############################################################################
# Performance Checks
###############################################################################

run_performance_checks() {
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║     ⚡ PERFORMANCE VALIDATION                                        ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # Check for synchronous operations
    echo -e "${YELLOW}▶ Checking for blocking synchronous operations...${NC}"
    check_file_against_pattern \
        "Sync\s*\(" \
        "(test_cases/|node_modules/|setup\.sh)" \
        "WARNING" \
        "PERF-001" \
        "Synchronous operation can block - consider async alternative"
    
    echo ""
}

###############################################################################
# File Management Checks
###############################################################################

run_file_checks() {
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║     📁 FILE MANAGEMENT VALIDATION                                    ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # Check file sizes
    echo -e "${YELLOW}▶ Checking file sizes...${NC}"
    local large_files=$(git diff --cached --name-only --diff-filter=ACMR | while read file; do
        if [ -f "$file" ]; then
            # Skip certain file types
            if echo "$file" | grep -qE '\.(jpg|png|pdf|zip|tar\.gz|pptx|gif|ico|woff|woff2|ttf|eot)$'; then
                continue
            fi
            
            local size=$(wc -c < "$file" 2>/dev/null || echo 0)
            if [ $size -gt 1048576 ]; then  # 1MB
                echo "$file|$(($size / 1024))KB"
            fi
        fi
    done)
    
    if [ -n "$large_files" ]; then
        while IFS='|' read -r file size; do
            log_finding "WARNING" "FM-001" "$file" "" "Large file ($size) - consider optimization"
        done <<< "$large_files"
    fi
    
    echo ""
}

###############################################################################
# Version Consistency Check
###############################################################################

run_version_check() {
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║     📦 VERSION CONSISTENCY CHECK                                     ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    echo -e "${YELLOW}▶ Checking version synchronization...${NC}"
    
    if [ -f "package.json" ] && [ -f "backend/package.json" ] && [ -f "frontend/package.json" ]; then
        local root_ver=$(grep '"version":' package.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
        local backend_ver=$(grep '"version":' backend/package.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
        local frontend_ver=$(grep '"version":' frontend/package.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
        
        if [ "$root_ver" != "$backend_ver" ] || [ "$root_ver" != "$frontend_ver" ]; then
            log_finding "ERROR" "VER-001" "package.json" "" \
                "Version mismatch: root=$root_ver, backend=$backend_ver, frontend=$frontend_ver"
        else
            echo -e "${GREEN}✓${NC} All versions synchronized: $root_ver"
        fi
    fi
    
    echo ""
}

###############################################################################
# Documentation Structure Check
###############################################################################

run_documentation_check() {
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║     📚 DOCUMENTATION STRUCTURE CHECK                                 ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    echo -e "${YELLOW}▶ Checking for misplaced documentation files...${NC}"
    
    # Define allowed .md files in root directory
    local ALLOWED_ROOT_MD_FILES=(
        "README.md"
        "LICENSE.md"
        "CONTRIBUTING.md"
        "CODE_OF_CONDUCT.md"
        "SECURITY.md"
    )
    
    # Get all .md files in root (not in subdirectories)
    local root_md_files=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null | \
        grep -E '^[^/]+\.md$' || true)
    
    # If no staged files, check all existing root .md files
    if [ -z "$root_md_files" ]; then
        root_md_files=$(find . -maxdepth 1 -type f -name "*.md" | sed 's|^\./||')
    fi
    
    if [ -n "$root_md_files" ]; then
        while IFS= read -r file; do
            local is_allowed=0
            
            # Check if file is in allowed list
            for allowed in "${ALLOWED_ROOT_MD_FILES[@]}"; do
                if [ "$file" = "$allowed" ]; then
                    is_allowed=1
                    break
                fi
            done
            
            # If not allowed, log a finding
            if [ $is_allowed -eq 0 ]; then
                log_finding "ERROR" "DOC-001" "$file" "" \
                    "Documentation file must be in docs/ folder - move this file to docs/ directory"
            fi
        done <<< "$root_md_files"
    fi
    
    # Check for .md files in .github (except specific allowed files)
    local ALLOWED_GITHUB_MD_FILES=(
        "CONTRIBUTING.md"
        "PULL_REQUEST_TEMPLATE.md"
        "ISSUE_TEMPLATE.md"
        "BRANCHING_QUICKSTART.md"
        "DEPLOYMENT_QUICKSTART.md"
    )
    
    local github_md_files=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null | \
        grep -E '^\.github/[^/]+\.md$' || true)
    
    if [ -z "$github_md_files" ]; then
        github_md_files=$(find .github -maxdepth 1 -type f -name "*.md" 2>/dev/null | sed 's|^\./||' || true)
    fi
    
    if [ -n "$github_md_files" ]; then
        while IFS= read -r file; do
            local filename=$(basename "$file")
            local is_allowed=0
            
            # Check if file is in allowed list
            for allowed in "${ALLOWED_GITHUB_MD_FILES[@]}"; do
                if [ "$filename" = "$allowed" ]; then
                    is_allowed=1
                    break
                fi
            done
            
            # If not allowed, log a finding
            if [ $is_allowed -eq 0 ]; then
                log_finding "ERROR" "DOC-002" "$file" "" \
                    "Non-standard GitHub documentation file - move to docs/ directory"
            fi
        done <<< "$github_md_files"
    fi
    
    # Count properly placed docs
    local docs_count=$(find docs -type f -name "*.md" 2>/dev/null | wc -l)
    echo -e "${GREEN}✓${NC} Found $docs_count documentation files in docs/ directory"
    
    echo ""
}

###############################################################################
# Main Execution
###############################################################################

echo ""
echo -e "${MAGENTA}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${MAGENTA}║     🔍 BEST PRACTICES & SECURITY VALIDATION                          ║${NC}"
echo -e "${MAGENTA}╚══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Run all checks
run_security_checks
run_code_quality_checks
run_performance_checks
run_file_checks
run_version_check
run_documentation_check

# Summary
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     📊 VALIDATION SUMMARY                                            ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "  ${RED}Critical: ${CRITICAL_COUNT}${NC}"
echo -e "  ${RED}Errors:   ${ERROR_COUNT}${NC}"
echo -e "  ${YELLOW}Warnings: ${WARNING_COUNT}${NC}"
echo -e "  ${BLUE}Info:     ${INFO_COUNT}${NC}"
echo ""

# Exit based on findings
if [ $CRITICAL_COUNT -gt 0 ] || [ $ERROR_COUNT -gt 0 ]; then
    echo -e "${RED}╔══════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║     ❌ VALIDATION FAILED                                             ║${NC}"
    echo -e "${RED}╚══════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}Please fix critical and error issues before committing.${NC}"
    echo ""
    echo -e "${BLUE}To bypass validation (NOT RECOMMENDED):${NC}"
    echo -e "  ${CYAN}git commit --no-verify${NC}"
    echo ""
    exit 1
else
    if [ $WARNING_COUNT -gt 0 ]; then
        echo -e "${YELLOW}╔══════════════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${YELLOW}║     ⚠️  VALIDATION PASSED WITH WARNINGS                              ║${NC}"
        echo -e "${YELLOW}╚══════════════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        echo -e "${YELLOW}Consider addressing warnings before committing.${NC}"
        echo ""
    else
        echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║     ✅ ALL VALIDATIONS PASSED                                        ║${NC}"
        echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════════╝${NC}"
        echo ""
    fi
    exit 0
fi
