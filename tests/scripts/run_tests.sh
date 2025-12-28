#!/bin/bash

###############################################################################
# Automated Test Runner for OSCAL Report Generator V2
# Runs all tests before allowing code commits
###############################################################################

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results tracking
TESTS_PASSED=0
TESTS_FAILED=0
TEST_RESULTS=()

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     🧪 OSCAL REPORT GENERATOR V2 - TEST SUITE                       ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

###############################################################################
# Function to run a test suite
###############################################################################
run_test_suite() {
    local test_name="$1"
    local test_command="$2"
    local directory="$3"
    
    echo -e "${YELLOW}▶ Running: ${test_name}${NC}"
    echo "  Directory: ${directory}"
    echo "  Command: ${test_command}"
    echo ""
    
    cd "$directory"
    
    if eval "$test_command"; then
        echo -e "${GREEN}✅ PASSED: ${test_name}${NC}"
        TEST_RESULTS+=("✅ ${test_name}")
        ((TESTS_PASSED++))
    else
        echo -e "${RED}❌ FAILED: ${test_name}${NC}"
        TEST_RESULTS+=("❌ ${test_name}")
        ((TESTS_FAILED++))
    fi
    
    echo ""
    echo "─────────────────────────────────────────────────────────────────────"
    echo ""
}

###############################################################################
# Get project root directory
###############################################################################
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "📂 Project Root: ${PROJECT_ROOT}"
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

###############################################################################
# 1. Check if dependencies are installed
###############################################################################
echo -e "${YELLOW}▶ Checking Dependencies...${NC}"
echo ""

# Check backend dependencies
if [ ! -d "backend/node_modules" ]; then
    echo -e "${YELLOW}⚠️  Backend dependencies not found. Installing...${NC}"
    cd backend
    npm install
    cd ..
fi

# Check frontend dependencies
if [ ! -d "frontend/node_modules" ]; then
    echo -e "${YELLOW}⚠️  Frontend dependencies not found. Installing...${NC}"
    cd frontend
    npm install
    cd ..
fi

echo -e "${GREEN}✅ Dependencies OK${NC}"
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

###############################################################################
# 2. Run Backend Unit Tests
###############################################################################
run_test_suite \
    "Backend Unit Tests" \
    "npm run test:unit 2>&1" \
    "${PROJECT_ROOT}/backend"

cd "$PROJECT_ROOT"

###############################################################################
# 3. Run Backend Integration Tests
###############################################################################
run_test_suite \
    "Backend Integration Tests" \
    "npm run test:integration 2>&1" \
    "${PROJECT_ROOT}/backend"

cd "$PROJECT_ROOT"

###############################################################################
# 4. Code Quality Checks
###############################################################################
echo -e "${YELLOW}▶ Running Code Quality Checks...${NC}"
echo ""

# Check for console.log statements (excluding test files and built files)
echo "  Checking for console.log statements..."
CONSOLE_LOGS=$(git diff --cached --name-only | \
    grep -E '\.(js|jsx)$' | \
    grep -v -E '(test|spec|\.test\.|\.spec\.|dist/|build/|public/|node_modules/)' | \
    xargs grep -n "console\.log" 2>/dev/null || true)

if [ -n "$CONSOLE_LOGS" ]; then
    echo -e "${YELLOW}⚠️  Warning: Found console.log statements in code${NC}"
    echo "$CONSOLE_LOGS"
    echo "  Consider removing them or using proper logging"
    TEST_RESULTS+=("⚠️  Console.log statements found")
else
    echo -e "${GREEN}✅ No console.log statements found${NC}"
fi

# Check for TODO/FIXME comments in staged files (excluding docs and test files)
echo ""
echo "  Checking for TODO/FIXME comments..."
TODO_FOUND=$(git diff --cached --name-only | \
    grep -v -E '(\.md$|test|spec|\.test\.|\.spec\.|docs/)' | \
    xargs grep -n -E "TODO|FIXME" 2>/dev/null || true)

if [ -n "$TODO_FOUND" ]; then
    echo -e "${YELLOW}⚠️  Warning: Found TODO/FIXME comments${NC}"
    echo "$TODO_FOUND"
    TEST_RESULTS+=("⚠️  TODO/FIXME comments found")
else
    echo -e "${GREEN}✅ No TODO/FIXME comments found${NC}"
fi

echo ""
echo "─────────────────────────────────────────────────────────────────────"
echo ""

###############################################################################
# 5. Security Checks
###############################################################################
echo -e "${YELLOW}▶ Running Security Checks...${NC}"
echo ""

# Check for hardcoded secrets/passwords (excluding test files, docs, and false positives)
echo "  Checking for hardcoded secrets..."
SECRETS_FOUND=$(git diff --cached --name-only | \
    grep -v -E '(test|spec|\.test\.|\.spec\.|dist/|build/|public/|node_modules/|docs/|\.md$|\.github/workflows/|setup\.sh|bump_version\.sh)' | \
    xargs grep -n -iE "(password|secret|api_key|apikey|apitoken)\\s*=\\s*['\"][a-zA-Z0-9]{16,}['\"]" 2>/dev/null | \
    grep -v -E "(//|#|/\\\*|\\\*).*=.*" | \
    grep -v -E "(const|let|var|function|export|import).*=.*\\{" || true)

if [ -n "$SECRETS_FOUND" ]; then
    echo -e "${RED}❌ CRITICAL: Possible hardcoded secrets found!${NC}"
    echo "$SECRETS_FOUND"
    TEST_RESULTS+=("❌ Hardcoded secrets detected")
    ((TESTS_FAILED++))
else
    echo -e "${GREEN}✅ No hardcoded secrets found${NC}"
    ((TESTS_PASSED++))
fi

echo ""
echo "─────────────────────────────────────────────────────────────────────"
echo ""

###############################################################################
# 6. File Size Checks
###############################################################################
echo -e "${YELLOW}▶ Checking File Sizes...${NC}"
echo ""

# Check for large files (> 1MB)
LARGE_FILES=$(git diff --cached --name-only | while read file; do
    if [ -f "$file" ]; then
        size=$(wc -c < "$file")
        if [ $size -gt 1048576 ]; then
            echo "$file ($(($size / 1024))KB)"
        fi
    fi
done)

if [ -n "$LARGE_FILES" ]; then
    echo -e "${YELLOW}⚠️  Warning: Large files detected:${NC}"
    echo "$LARGE_FILES"
    TEST_RESULTS+=("⚠️  Large files detected")
else
    echo -e "${GREEN}✅ No large files detected${NC}"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

###############################################################################
# Summary
###############################################################################
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     📊 TEST SUMMARY                                                  ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

for result in "${TEST_RESULTS[@]}"; do
    echo "  $result"
done

echo ""
echo "─────────────────────────────────────────────────────────────────────"
echo ""
echo -e "  ${GREEN}Passed: ${TESTS_PASSED}${NC}"
echo -e "  ${RED}Failed: ${TESTS_FAILED}${NC}"
echo ""

if [ $TESTS_FAILED -gt 0 ]; then
    echo -e "${RED}╔══════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║     ❌ TESTS FAILED - COMMIT BLOCKED                                 ║${NC}"
    echo -e "${RED}╚══════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Please fix the failing tests before committing."
    echo ""
    exit 1
else
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║     ✅ ALL TESTS PASSED - READY TO COMMIT                            ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    exit 0
fi

