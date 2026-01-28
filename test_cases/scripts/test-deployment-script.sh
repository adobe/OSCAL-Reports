#!/bin/bash

# Automated Test Suite for deploy_from_dockerhub.sh
# Tests all deployment scenarios automatically
#
# Author: Mukesh Kesharwani
# Version: 1.0.0

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Test counters
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Helper functions
print_test_header() {
  echo ""
  echo -e "${CYAN}════════════════════════════════════════${NC}"
  echo -e "${CYAN}TEST $1: $2${NC}"
  echo -e "${CYAN}════════════════════════════════════════${NC}"
  echo ""
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
}

print_pass() {
  echo -e "${GREEN}✓ PASS:${NC} $1"
  TESTS_PASSED=$((TESTS_PASSED + 1))
}

print_fail() {
  echo -e "${RED}✗ FAIL:${NC} $1"
  TESTS_FAILED=$((TESTS_FAILED + 1))
}

print_skip() {
  echo -e "${YELLOW}⊘ SKIP:${NC} $1"
  TESTS_SKIPPED=$((TESTS_SKIPPED + 1))
}

print_info() {
  echo -e "${BLUE}ℹ${NC}  $1"
}

# Validation functions
check_container_running() {
  local container_name=$1
  if docker ps --format '{{.Names}}' | grep -q "^${container_name}$"; then
    return 0
  else
    return 1
  fi
}

check_container_exists() {
  local container_name=$1
  if docker ps -a --format '{{.Names}}' | grep -q "^${container_name}$"; then
    return 0
  else
    return 1
  fi
}

check_health_endpoint() {
  local port=$1
  local max_attempts=${2:-12}
  local attempt=0
  
  while [ $attempt -lt $max_attempts ]; do
    if curl -sf "http://localhost:${port}/health" > /dev/null 2>&1; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 5
  done
  return 1
}

cleanup_test_environment() {
  local name=$1
  print_info "Cleaning up $name..."
  docker stop $name 2>/dev/null || true
  docker rm $name 2>/dev/null || true
  rm -f /tmp/oscal-deploy-*.lock
}

# ============================================================================
# MAIN TEST SUITE
# ============================================================================

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  OSCAL Deployment Script - Automated Test Suite          ║"
echo "║  Version 1.0.0                                            ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check prerequisites
print_info "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
  echo -e "${RED}ERROR: Docker not found${NC}"
  exit 1
fi

if ! docker info &> /dev/null; then
  echo -e "${RED}ERROR: Docker daemon not running${NC}"
  exit 1
fi

if ! ping -c 1 hub.docker.com &> /dev/null && ! ping -c 1 8.8.8.8 &> /dev/null; then
  echo -e "${YELLOW}WARNING: No internet connectivity - some tests will be skipped${NC}"
  OFFLINE_MODE=true
else
  OFFLINE_MODE=false
fi

print_info "Prerequisites check: OK"
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && cd ../.. && pwd)"
DEPLOY_SCRIPT="$SCRIPT_DIR/scripts/deploy_from_dockerhub.sh"

if [ ! -f "$DEPLOY_SCRIPT" ]; then
  echo -e "${RED}ERROR: Deployment script not found: $DEPLOY_SCRIPT${NC}"
  exit 1
fi

print_info "Deployment script found: $DEPLOY_SCRIPT"
print_info "Starting tests..."

# ============================================================================
# TEST 1: Blue Instance Detection
# ============================================================================

print_test_header "1" "Blue Instance Detection"

# Create test directory
TEST_BLUE_DIR="/tmp/OSCAL_Test_Blue"
mkdir -p "$TEST_BLUE_DIR/scripts"
cp "$DEPLOY_SCRIPT" "$TEST_BLUE_DIR/scripts/"

cleanup_test_environment "oscal-report-generator-blue"

if [ "$OFFLINE_MODE" = true ]; then
  print_skip "Skipped (offline mode)"
else
  cd "$TEST_BLUE_DIR"
  
  # Run deployment and capture output
  if timeout 300 ./scripts/deploy_from_dockerhub.sh --skip-backup > /tmp/test1.log 2>&1; then
    # Check detection
    if grep -q "Blue" /tmp/test1.log; then
      print_pass "Blue instance detected correctly"
    else
      print_fail "Blue instance not detected"
      cat /tmp/test1.log | tail -20
    fi
    
    # Check port
    if docker port oscal-report-generator-blue | grep -q "3020"; then
      print_pass "Port 3020 assigned correctly"
    else
      print_fail "Port 3020 not assigned"
    fi
    
    # Check health
    if check_health_endpoint 3020 24; then
      print_pass "Health check passed"
    else
      print_fail "Health check failed"
    fi
  else
    print_fail "Deployment script failed"
    cat /tmp/test1.log | tail -30
  fi
fi

# ============================================================================
# TEST 2: Green Instance Detection
# ============================================================================

print_test_header "2" "Green Instance Detection"

TEST_GREEN_DIR="/tmp/OSCAL_Test_Green"
mkdir -p "$TEST_GREEN_DIR/scripts"
cp "$DEPLOY_SCRIPT" "$TEST_GREEN_DIR/scripts/"

cleanup_test_environment "oscal-report-generator-green"

if [ "$OFFLINE_MODE" = true ]; then
  print_skip "Skipped (offline mode)"
else
  cd "$TEST_GREEN_DIR"
  
  if timeout 300 ./scripts/deploy_from_dockerhub.sh --skip-backup > /tmp/test2.log 2>&1; then
    # Check detection
    if grep -q "Green" /tmp/test2.log; then
      print_pass "Green instance detected correctly"
    else
      print_fail "Green instance not detected"
    fi
    
    # Check port
    if docker port oscal-report-generator-green | grep -q "3019"; then
      print_pass "Port 3019 assigned correctly"
    else
      print_fail "Port 3019 not assigned"
    fi
    
    # Check health
    if check_health_endpoint 3019 24; then
      print_pass "Health check passed"
    else
      print_fail "Health check failed"
    fi
    
    # Check both running
    BLUE_RUNNING=$(check_container_running "oscal-report-generator-blue" && echo "yes" || echo "no")
    GREEN_RUNNING=$(check_container_running "oscal-report-generator-green" && echo "yes" || echo "no")
    
    if [ "$BLUE_RUNNING" = "yes" ] && [ "$GREEN_RUNNING" = "yes" ]; then
      print_pass "Both Blue and Green running simultaneously"
    else
      print_fail "Both containers not running (Blue: $BLUE_RUNNING, Green: $GREEN_RUNNING)"
    fi
  else
    print_fail "Deployment script failed"
  fi
fi

# ============================================================================
# TEST 3: Concurrent Deployment Protection
# ============================================================================

print_test_header "3" "Concurrent Deployment Protection"

if [ "$OFFLINE_MODE" = true ]; then
  print_skip "Skipped (offline mode)"
else
  cd "$TEST_BLUE_DIR"
  
  # Create a lock file
  echo "12345" > /tmp/oscal-deploy-blue.lock
  echo "$(date)" >> /tmp/oscal-deploy-blue.lock
  
  # Try deployment (should fail)
  if ./scripts/deploy_from_dockerhub.sh --skip-backup > /tmp/test3.log 2>&1; then
    print_fail "Deployment proceeded despite lock file"
  else
    if grep -q "already in progress" /tmp/test3.log; then
      print_pass "Lock file prevented concurrent deployment"
    else
      print_fail "Wrong error message"
    fi
  fi
  
  # Try with --force (should succeed)
  rm -f /tmp/oscal-deploy-blue.lock
  echo "12345" > /tmp/oscal-deploy-blue.lock
  
  if timeout 300 ./scripts/deploy_from_dockerhub.sh --skip-backup --force > /tmp/test3b.log 2>&1; then
    print_pass "--force flag overrides lock successfully"
  else
    print_fail "--force flag did not work"
  fi
  
  # Check lock is removed
  if [ ! -f /tmp/oscal-deploy-blue.lock ]; then
    print_pass "Lock file cleaned up after deployment"
  else
    print_fail "Lock file not cleaned up"
  fi
fi

# ============================================================================
# TEST 4: Backup Creation
# ============================================================================

print_test_header "4" "Backup Creation"

if [ "$OFFLINE_MODE" = true ]; then
  print_skip "Skipped (offline mode)"
else
  cd "$TEST_BLUE_DIR"
  
  # Ensure container is running
  if ! check_container_running "oscal-report-generator-blue"; then
    timeout 300 ./scripts/deploy_from_dockerhub.sh --skip-backup > /dev/null 2>&1 || true
  fi
  
  # Run deployment to create backup
  BEFORE_COUNT=$(ls -1 backups/dockerhub-deploy-* 2>/dev/null | wc -l || echo "0")
  
  if timeout 300 ./scripts/deploy_from_dockerhub.sh --skip-backup > /tmp/test4.log 2>&1; then
    AFTER_COUNT=$(ls -1 backups/dockerhub-deploy-* 2>/dev/null | wc -l || echo "0")
    
    if [ "$AFTER_COUNT" -gt "$BEFORE_COUNT" ]; then
      print_pass "Backup directory created"
      
      # Check backup contents
      LATEST_BACKUP=$(ls -t backups/dockerhub-deploy-* | head -1)
      
      if [ -f "$LATEST_BACKUP/volume-backup.tar.gz" ]; then
        print_pass "Volume backup file created"
      else
        print_fail "Volume backup file not found"
      fi
      
      # Check credentials extraction
      if [ -f "$LATEST_BACKUP/credentials.txt" ]; then
        print_pass "Credentials file extracted"
      else
        print_fail "Credentials file not extracted"
      fi
    else
      print_fail "Backup directory not created"
    fi
  else
    print_fail "Deployment failed"
  fi
fi

# ============================================================================
# TEST 5: Architecture Detection
# ============================================================================

print_test_header "5" "Architecture Detection"

SYSTEM_ARCH=$(uname -m)
print_info "System architecture: $SYSTEM_ARCH"

if [ "$OFFLINE_MODE" = true ]; then
  print_skip "Skipped (offline mode)"
else
  # Check image architecture
  if docker inspect keekar/oscal_reports:latest >/dev/null 2>&1; then
    IMAGE_ARCH=$(docker inspect keekar/oscal_reports:latest --format='{{.Architecture}}')
    print_info "Image architecture: $IMAGE_ARCH"
    
    case "$SYSTEM_ARCH" in
      x86_64)
        if [ "$IMAGE_ARCH" = "amd64" ]; then
          print_pass "Architecture matches (x86_64/amd64)"
        else
          print_fail "Architecture mismatch"
        fi
        ;;
      aarch64|arm64)
        if [ "$IMAGE_ARCH" = "arm64" ]; then
          print_pass "Architecture matches (arm64)"
        else
          print_fail "Architecture mismatch"
        fi
        ;;
      *)
        print_skip "Unknown architecture: $SYSTEM_ARCH"
        ;;
    esac
  else
    print_fail "Image not found locally"
  fi
fi

# ============================================================================
# TEST 6: Health Check Validation
# ============================================================================

print_test_header "6" "Health Check Validation"

if ! check_container_running "oscal-report-generator-blue"; then
  print_skip "Container not running (previous tests may have failed)"
else
  # Test Blue health endpoint
  if curl -sf "http://localhost:3020/health" | grep -q "healthy"; then
    print_pass "Blue health endpoint responding"
  else
    print_fail "Blue health endpoint not responding"
  fi
  
  # Test volume status endpoint
  if curl -sf "http://localhost:3020/api/system/volume-status" | grep -q "enabled"; then
    print_pass "Volume persistence enabled"
  else
    print_fail "Volume persistence check failed"
  fi
fi

if check_container_running "oscal-report-generator-green"; then
  # Test Green health endpoint
  if curl -sf "http://localhost:3019/health" | grep -q "healthy"; then
    print_pass "Green health endpoint responding"
  else
    print_fail "Green health endpoint not responding"
  fi
fi

# ============================================================================
# TEST 7: Volume Persistence
# ============================================================================

print_test_header "7" "Volume Persistence"

if ! check_container_running "oscal-report-generator-blue"; then
  print_skip "Container not running"
else
  # Check volume mount
  VOLUME_MOUNTS=$(docker inspect oscal-report-generator-blue --format='{{json .Mounts}}' | grep -c '/data' || echo "0")
  
  if [ "$VOLUME_MOUNTS" -gt 0 ]; then
    print_pass "Volume mounted to /data"
  else
    print_fail "Volume not mounted"
  fi
  
  # Check volume directory exists
  if [ -d "$TEST_BLUE_DIR/data-blue" ] || [ -d "$TEST_BLUE_DIR/data" ]; then
    print_pass "Volume directory exists on host"
  else
    print_fail "Volume directory not found on host"
  fi
fi

# ============================================================================
# TEST 8: Script Execution Permissions
# ============================================================================

print_test_header "8" "Script Permissions"

if [ -x "$DEPLOY_SCRIPT" ]; then
  print_pass "Deployment script is executable"
else
  print_fail "Deployment script is not executable"
fi

# Check script syntax
if bash -n "$DEPLOY_SCRIPT" 2>/dev/null; then
  print_pass "Script syntax is valid"
else
  print_fail "Script has syntax errors"
fi

# ============================================================================
# TEST 9: Error Handling
# ============================================================================

print_test_header "9" "Error Handling"

cd "$TEST_BLUE_DIR"

# Test invalid option
if ./scripts/deploy_from_dockerhub.sh --invalid-option > /tmp/test9.log 2>&1; then
  print_fail "Script accepted invalid option"
else
  if grep -q "Unknown option" /tmp/test9.log; then
    print_pass "Invalid option rejected correctly"
  else
    print_fail "Wrong error for invalid option"
  fi
fi

# ============================================================================
# TEST 10: Cleanup Verification
# ============================================================================

print_test_header "10" "Cleanup Verification"

# Check for dangling containers
DANGLING=$(docker ps -a --filter "name=oscal-report-generator" --filter "status=exited" --format '{{.Names}}' | wc -l)

if [ "$DANGLING" -eq 0 ]; then
  print_pass "No dangling containers"
else
  print_fail "$DANGLING dangling containers found"
fi

# Check lock files
STALE_LOCKS=$(ls /tmp/oscal-deploy-*.lock 2>/dev/null | wc -l)

if [ "$STALE_LOCKS" -eq 0 ]; then
  print_pass "No stale lock files"
else
  print_fail "$STALE_LOCKS stale lock files found"
fi

# ============================================================================
# TEST SUMMARY
# ============================================================================

echo ""
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo -e "${CYAN}TEST SUMMARY${NC}"
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo ""
echo "Total Tests:  $TESTS_TOTAL"
echo -e "${GREEN}Passed:       $TESTS_PASSED${NC}"
echo -e "${RED}Failed:       $TESTS_FAILED${NC}"
echo -e "${YELLOW}Skipped:      $TESTS_SKIPPED${NC}"
echo ""

# Calculate success rate
if [ $TESTS_TOTAL -gt 0 ]; then
  SUCCESS_RATE=$((TESTS_PASSED * 100 / TESTS_TOTAL))
  echo "Success Rate: ${SUCCESS_RATE}%"
fi

echo ""

# Cleanup question
echo -e "${YELLOW}═══════════════════════════════════════${NC}"
read -p "Clean up test containers? (y/n): " -r
echo -e "${YELLOW}═══════════════════════════════════════${NC}"

if [[ $REPLY =~ ^[Yy]$ ]]; then
  print_info "Cleaning up test environment..."
  
  # Stop and remove containers
  docker stop oscal-report-generator-blue oscal-report-generator-green 2>/dev/null || true
  docker rm oscal-report-generator-blue oscal-report-generator-green 2>/dev/null || true
  
  # Remove test directories
  rm -rf "$TEST_BLUE_DIR" "$TEST_GREEN_DIR"
  
  # Remove lock files
  rm -f /tmp/oscal-deploy-*.lock
  
  # Remove test logs
  rm -f /tmp/test*.log
  
  print_info "Cleanup complete"
else
  print_info "Test containers preserved for inspection"
  echo ""
  echo "To inspect:"
  echo "  docker logs oscal-report-generator-blue"
  echo "  docker logs oscal-report-generator-green"
  echo ""
  echo "To cleanup manually:"
  echo "  docker stop oscal-report-generator-blue oscal-report-generator-green"
  echo "  docker rm oscal-report-generator-blue oscal-report-generator-green"
  echo "  rm -rf /tmp/OSCAL_Test_*"
  echo "  rm -f /tmp/oscal-deploy-*.lock"
fi

echo ""

# Exit with appropriate code
if [ $TESTS_FAILED -gt 0 ]; then
  echo -e "${RED}Some tests failed. Please review the output above.${NC}"
  exit 1
else
  echo -e "${GREEN}All tests passed successfully!${NC}"
  exit 0
fi
