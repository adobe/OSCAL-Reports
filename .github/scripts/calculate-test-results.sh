#!/bin/bash
###############################################################################
# Calculate Test Results and Pass Rate
# 
# This script parses Jest test output and calculates the pass rate.
# Used by GitHub Actions workflows to determine if automatic merge should occur.
#
# Usage: ./calculate-test-results.sh <test-output-file> <threshold>
# 
# Output: JSON with test statistics
###############################################################################

set -e

TEST_OUTPUT_FILE="${1:-test-results.txt}"
THRESHOLD="${2:-60}"

echo "📊 Analyzing test results from: $TEST_OUTPUT_FILE"
echo "🎯 Pass threshold: ${THRESHOLD}%"
echo ""

# Check if file exists
if [ ! -f "$TEST_OUTPUT_FILE" ]; then
    echo "❌ Error: Test output file not found: $TEST_OUTPUT_FILE"
    exit 1
fi

# Extract test results from Jest output
# Looking for patterns like:
# "Tests:       67 failed, 25 passed, 92 total"
# "Test Suites: 4 failed, 2 passed, 6 total"

TOTAL_TESTS=$(grep -oP "Tests:.*?(\d+) total" "$TEST_OUTPUT_FILE" | grep -oP "\d+ total" | grep -oP "\d+" | tail -1 || echo "0")
PASSED_TESTS=$(grep -oP "Tests:.*?(\d+) passed" "$TEST_OUTPUT_FILE" | grep -oP "\d+ passed" | grep -oP "\d+" | tail -1 || echo "0")
FAILED_TESTS=$(grep -oP "Tests:.*?(\d+) failed" "$TEST_OUTPUT_FILE" | grep -oP "\d+ failed" | grep -oP "\d+" | tail -1 || echo "0")

# Alternative parsing if first method doesn't work
if [ "$TOTAL_TESTS" == "0" ]; then
    # Try to find "Test Suites" line and extract numbers
    TOTAL_TESTS=$(grep "Test Suites:" "$TEST_OUTPUT_FILE" | tail -1 | grep -oP "\d+ total" | grep -oP "\d+" || echo "0")
    PASSED_TESTS=$(grep "Test Suites:" "$TEST_OUTPUT_FILE" | tail -1 | grep -oP "\d+ passed" | grep -oP "\d+" || echo "0")
    FAILED_TESTS=$(grep "Test Suites:" "$TEST_OUTPUT_FILE" | tail -1 | grep -oP "\d+ failed" | grep -oP "\d+" || echo "0")
fi

# Calculate pass rate
if [ "$TOTAL_TESTS" -gt 0 ]; then
    PASS_RATE=$(awk "BEGIN {printf \"%.2f\", ($PASSED_TESTS / $TOTAL_TESTS) * 100}")
else
    echo "❌ No tests found in output file"
    exit 1
fi

# Determine if threshold is met
THRESHOLD_MET="false"
if (( $(awk "BEGIN {print ($PASS_RATE >= $THRESHOLD)}") )); then
    THRESHOLD_MET="true"
fi

# Output results
echo "📈 Test Results:"
echo "  Total Tests: $TOTAL_TESTS"
echo "  Passed: $PASSED_TESTS"
echo "  Failed: $FAILED_TESTS"
echo "  Pass Rate: ${PASS_RATE}%"
echo ""

if [ "$THRESHOLD_MET" == "true" ]; then
    echo "✅ Pass rate ${PASS_RATE}% meets threshold ${THRESHOLD}%"
    echo "🚀 Auto-merge conditions satisfied!"
else
    echo "❌ Pass rate ${PASS_RATE}% below threshold ${THRESHOLD}%"
    echo "⏸️  Auto-merge will NOT proceed"
fi

# Output JSON for GitHub Actions
cat > test-results.json <<EOF
{
  "total": $TOTAL_TESTS,
  "passed": $PASSED_TESTS,
  "failed": $FAILED_TESTS,
  "pass_rate": $PASS_RATE,
  "threshold": $THRESHOLD,
  "threshold_met": $THRESHOLD_MET
}
EOF

# Set GitHub Actions outputs
if [ -n "$GITHUB_OUTPUT" ]; then
    echo "total=$TOTAL_TESTS" >> "$GITHUB_OUTPUT"
    echo "passed=$PASSED_TESTS" >> "$GITHUB_OUTPUT"
    echo "failed=$FAILED_TESTS" >> "$GITHUB_OUTPUT"
    echo "pass_rate=$PASS_RATE" >> "$GITHUB_OUTPUT"
    echo "threshold_met=$THRESHOLD_MET" >> "$GITHUB_OUTPUT"
fi

# Exit with success if threshold is met, otherwise exit with failure
if [ "$THRESHOLD_MET" == "true" ]; then
    exit 0
else
    exit 1
fi
