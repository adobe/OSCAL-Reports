# Test Scripts

This directory contains the unified test script for the OSCAL Report Generator.

## Main Script

### `run-all-tests.sh` - Comprehensive Test Suite

**Purpose:** Single unified script that runs ALL validation before merging code from Development to Quality/Test branch.

**What it tests:**
- ✅ Unit Tests (auth, RBAC, URL validation, security config)
- ✅ Integration Tests (API endpoints, CSRF, settings)
- ✅ End-to-End Tests (complete security workflows)
- ✅ Security Validation (secrets, eval, SSRF, XSS)
- ✅ Code Quality (console.log, debugger, error handling)
- ✅ Version Consistency (package.json synchronization)
- ✅ Documentation Structure (proper file placement)
- ✅ v1.6.5 Features (CSRF exemption, Bearer tokens, AI integration)
- ✅ Test Coverage (>75% requirement)
- ✅ Deployment Validation (script checks, optional Docker tests)
- ✅ EC2 AWS Secrets Manager secrets module (`secretsManager.test.js`; legacy `ec2-automation-pass-sync.sh` shell tests retained for migration tooling)

**Usage:**

```bash
# Run everything (recommended before merge)
./test_cases/scripts/run-all-tests.sh

# Skip deployment tests (faster)
./test_cases/scripts/run-all-tests.sh --skip-deployment

# CI / quick check: only Pass ↔ Secrets Manager sync tests (no Node prerequisites beyond jq)
./test_cases/scripts/run-all-tests.sh --ec2-pass-sync-only
```

**Exit Codes:**
- `0` - All tests passed, ready to merge
- `1` - Tests failed or critical issues found

**Duration:** ~2-5 minutes (depending on coverage generation)

---

## Consolidated Approach

This unified script replaces separate scripts, including:
- ❌ `test-v1.6.5-changes.sh` (removed)
- ❌ `test-ec2-automation-pass-sync.sh` (merged into `run-all-tests.sh`)
- ❌ `test-deployment-script.sh` (removed)
- ❌ `validate_best_practices.sh` (removed)

**Why consolidate?**
- ✅ Single command to run before merge
- ✅ Consistent validation process
- ✅ No duplicate code
- ✅ Easier maintenance
- ✅ Clear pass/fail for merge readiness

---

## When to Run

### Before Merging (Required)

```bash
# From Development branch before creating PR to Quality_Test
./test_cases/scripts/run-all-tests.sh
```

### During Development (Optional)

```bash
# Quick test only
cd backend && npm test

# Watch mode
cd backend && npm run test:watch

# Specific test type
cd backend && npm run test:unit
cd backend && npm run test:integration
```

---

## Output Example

```
╔════════════════════════════════════════════════════════════════════╗
║     OSCAL Report Generator - Comprehensive Test Suite v1.6.5      ║
╚════════════════════════════════════════════════════════════════════╝

This script validates ALL code before merging to Quality/Test branch

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Phase 1: Checking Prerequisites
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Node.js: v18.x.x
✓ npm: 9.x.x
✓ Git: git version 2.x.x
✓ Backend dependencies installed

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Phase 2: Unit Tests
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ PASSED - Authentication Tests
✓ PASSED - Role-Based Access Control Tests
✓ PASSED - Security Configuration Tests
...

╔════════════════════════════════════════════════════════════════════╗
║     📊 FINAL SUMMARY                                               ║
╚════════════════════════════════════════════════════════════════════╝

  Total Checks:     45
  Passed:           45
  Failed:           0
  Warnings:         0
  Critical Issues:  0

  Duration:         125s
  Pass Rate:        100%

╔════════════════════════════════════════════════════════════════════╗
║     ✅ ALL TESTS PASSED - READY TO MERGE                           ║
╚════════════════════════════════════════════════════════════════════╝

Code is ready to merge from Development → Quality/Test branch
```

---

## Troubleshooting

### Tests Hang
```bash
# Kill any running processes
lsof -ti:3020,3021 | xargs kill -9
```

### Node Modules Issues
```bash
cd backend
rm -rf node_modules
npm install
```

### Coverage Generation Issues
```bash
cd backend
npm test -- --clearCache
npm run test:coverage
```

---

## References

- [Test Suite README](../README.md) - Complete test documentation
- [Testing Quick Reference](../TESTING_QUICK_REFERENCE.md) - Quick commands
- [Test Updates v1.6.5](../../docs/TEST_UPDATES_V1.6.5.md) - Version-specific changes

---

**Last Updated:** April 2026  
**Maintainer:** Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
