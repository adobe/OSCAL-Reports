# OSCAL Report Generator - Test Suite

**Version:** 1.7.22  
**Last Updated:** April 2026  
**Maintained By:** Mukesh Kesharwani

## Overview

Comprehensive test suite for the OSCAL Report Generator, covering unit tests, integration tests, and end-to-end tests with a focus on security features introduced in v1.6.5.

## Table of Contents

- [Quick Start](#quick-start)
- [Test Structure](#test-structure)
- [Running Tests](#running-tests)
- [v1.6.5 Security Tests](#v165-security-tests)
- [Test Coverage](#test-coverage)
- [Writing New Tests](#writing-new-tests)
- [CI/CD Integration](#cicd-integration)

---

## Quick Start

### Prerequisites

- Node.js 18+ installed
- Backend dependencies installed
- Jest test framework

### Run All Tests

```bash
cd backend
npm test
```

### Run v1.6.5 Security Tests Only

```bash
./test_cases/scripts/run-all-tests.sh
```

---

## Test Structure

```
test_cases/
├── backend/
│   ├── unit/                          # Unit tests
│   │   ├── auth.test.js              # Authentication tests
│   │   ├── roles.test.js             # RBAC tests
│   │   ├── async-handlers.test.js    # Async handler validation
│   │   ├── urlValidator.test.js      # Base URL validation
│   │   ├── urlValidator-options.test.js  # v1.6.5 AI integration options
│   │   └── securityConfig.test.js    # v1.6.5 Security configuration
│   │
│   ├── integration/                   # Integration tests
│   │   ├── api.test.js               # General API tests
│   │   ├── settings-api.test.js      # Settings endpoint tests
│   │   └── csrf-api.test.js          # v1.6.5 CSRF exemption tests
│   │
│   ├── e2e/                          # End-to-end tests
│   │   └── security-flow.test.js     # v1.6.5 Complete security flows
│   │
│   ├── jest.config.js                # Jest configuration
│   ├── package.json                  # Test package config
│   └── setup.js                      # Test setup/teardown
│
└── scripts/
    ├── run-all-tests.sh        # v1.6.5 validation script
    ├── test-deployment-script.sh     # Deployment testing
    └── validate_best_practices.sh    # Code quality checks
```

---

## Running Tests

### All Test Types

```bash
# Run all tests
cd backend && npm test

# Run with coverage
cd backend && npm run test:coverage

# Watch mode (for development)
cd backend && npm run test:watch
```

### Specific Test Types

```bash
# Unit tests only
cd backend && npm run test:unit

# Integration tests only
cd backend && npm run test:integration

# E2E tests only
cd backend && npm run test:e2e

# Security tests only (v1.6.5)
cd backend && npm run test:security

# OSCAL catalogue release gate (live HTTPS — mandatory before version release)
cd backend && npm run test:catalogues
```

### Individual Test Files

```bash
# Run specific test file
cd backend
npm test -- --testPathPattern='securityConfig.test.js'

# Run with verbose output
npm test -- --testPathPattern='csrf-api.test.js' --verbose
```

---

## v1.6.5 Security Tests

### What's New in v1.6.5

Version 1.6.5 introduced significant security enhancements:

1. **CSRF Protection Refinement**
   - All `/api/` endpoints exempted from CSRF protection
   - Bearer token authentication (immune to CSRF) used for protected endpoints
   - Session cookies use `sameSite: 'strict'` for defense-in-depth

2. **AI Integration Architecture**
   - Private IPs and localhost allowed for AI services (Ollama)
   - URL validator accepts `allowPrivateIPs` and `allowLocalhost` options
   - Cloud metadata endpoints remain blocked

3. **Security Controls Maintained**
   - Bearer token authentication and authorization
   - SSRF protection with URL validation
   - Rate limiting on all endpoints
   - Input validation per endpoint
   - Role-based access control (RBAC)

### New Test Files

#### `unit/securityConfig.test.js`

Tests the security configuration including:
- CSRF exemption paths
- Session configuration
- URL validation settings
- SSRF protected endpoints
- Rate limiting configuration

```bash
npm test -- --testPathPattern='securityConfig.test.js'
```

#### `unit/urlValidator-options.test.js`

Tests URL validator options for AI integration:
- `allowLocalhost` option
- `allowPrivateIPs` option
- Combined options for AI services
- Security controls remain active
- Cloud metadata still blocked

```bash
npm test -- --testPathPattern='urlValidator-options.test.js'
```

#### `integration/csrf-api.test.js`

Tests CSRF exemption behavior:
- Public endpoints work without CSRF token
- Protected endpoints require Bearer token
- SSRF protection remains active
- Bearer token authentication pattern

```bash
npm test -- --testPathPattern='csrf-api.test.js'
```

#### `e2e/security-flow.test.js`

Complete security workflow tests:
- Authentication flow (login → Bearer token → API access)
- CSRF exemption flow
- SSRF protection flow (public vs AI endpoints)
- Role-based access control flow
- Complete report generation flow

```bash
npm test -- --testPathPattern='security-flow.test.js'
```

### Running v1.6.5 Validation Script

Comprehensive validation of all v1.6.5 changes:

```bash
./test_cases/scripts/run-all-tests.sh
```

This script validates:
- All unit tests pass
- All integration tests pass
- All E2E tests pass
- CSRF exemption configuration
- Bearer token authentication
- SSRF protection utility
- AI integration URL options
- Documentation updates

---

## Test Coverage

### Current Coverage Goals

| Category | Target | Status |
|----------|--------|--------|
| Overall | > 75% | ✓ |
| Security Utils | > 90% | ✓ |
| API Endpoints | > 80% | ✓ |
| Authentication | > 95% | ✓ |

### Generate Coverage Report

```bash
cd backend
npm run test:coverage
```

Coverage reports are generated in:
- `test_cases/backend/coverage/lcov-report/index.html` (HTML)
- `test_cases/backend/coverage/lcov.info` (LCOV)

### View Coverage Report

```bash
open test_cases/backend/coverage/lcov-report/index.html
```

---

## Writing New Tests

### Test File Naming Convention

- Unit tests: `*.test.js` in `unit/` folder
- Integration tests: `*.test.js` in `integration/` folder
- E2E tests: `*.test.js` in `e2e/` folder

### Test Template

```javascript
/**
 * [Feature Name] Tests
 * 
 * Description of what this test suite covers
 * 
 * Version: 1.7.22+
 * Location: test_cases/backend/[type]/[name].test.js
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';

describe('[Feature Name]', () => {
  beforeAll(() => {
    // Setup code
  });

  afterAll(() => {
    // Cleanup code
  });

  describe('[Sub-feature]', () => {
    test('should [expected behavior]', () => {
      // Test implementation
      expect(true).toBe(true);
    });
  });
});
```

### Best Practices

1. **Descriptive Test Names**
   - Use `should` statements: "should reject invalid token"
   - Be specific: "should allow private IPs when allowPrivateIPs=true"

2. **Test Organization**
   - Group related tests in `describe` blocks
   - Use nested `describe` for sub-features
   - One assertion per test when possible

3. **Isolation**
   - Tests should not depend on each other
   - Use `beforeEach` for common setup
   - Clean up after tests in `afterEach`

4. **Mock External Dependencies**
   - Don't make real HTTP requests
   - Mock database calls
   - Mock file system operations

5. **Test Security Features**
   - Test both success and failure cases
   - Validate error messages
   - Check for security bypasses

---

## CI/CD Integration

### GitHub Actions

Tests are automatically run on:
- Push to any branch
- Pull request creation
- Pre-merge to main

### Required Checks

All of these must pass before merging:
- Unit tests
- Integration tests
- E2E tests
- Code coverage > 75%
- Security validation

### Running Tests Locally Before Push

```bash
# Run full test suite
./test_cases/scripts/run-all-tests.sh

# If all pass, safe to push
git push origin <branch-name>
```

---

## Test Maintenance

### Adding Tests for New Features

1. Determine test type (unit/integration/e2e)
2. Create test file following naming convention
3. Write tests covering:
   - Happy path
   - Error cases
   - Edge cases
   - Security implications
4. Update this README if needed
5. Run tests locally
6. Commit with descriptive message

### Updating Tests for Bug Fixes

1. Create failing test that reproduces bug
2. Fix the bug
3. Verify test now passes
4. Check for similar issues
5. Update related tests if needed

### Deprecating Old Tests

1. Mark test as deprecated with comment
2. Document reason for deprecation
3. Provide migration path if applicable
4. Remove after 1-2 versions

---

## Troubleshooting

### Common Issues

#### Tests Hang or Don't Complete

```bash
# Force exit after completion
npm test -- --forceExit
```

#### Port Already in Use

```bash
# Kill processes on test ports
lsof -ti:3020 | xargs kill -9
lsof -ti:3021 | xargs kill -9
```

#### Module Not Found Errors

```bash
# Reinstall dependencies
cd backend
rm -rf node_modules
npm install
```

#### Coverage Not Generating

```bash
# Clear Jest cache
npm test -- --clearCache
npm run test:coverage
```

---

## Support and Contributing

### Getting Help

- Check this README first
- Review test file comments
- Check `docs/SECURITY.md` for security context
- Review Jest documentation: https://jestjs.io/

### Contributing Tests

1. Follow existing patterns and conventions
2. Include descriptive comments
3. Update README if adding new test categories
4. Ensure all tests pass before submitting PR
5. Include test coverage in PR description

---

## Version History

### v1.6.5 (January 28, 2026)

**New Tests:**
- `unit/securityConfig.test.js` - Security configuration validation
- `unit/urlValidator-options.test.js` - AI integration URL options
- `integration/csrf-api.test.js` - CSRF exemption behavior
- `e2e/security-flow.test.js` - Complete security workflows

**Updated Tests:**
- Existing URL validator tests (no changes needed - test default behavior)
- Existing auth tests (remain valid)
- Existing settings tests (remain valid)

**New Scripts:**
- `run-all-tests.sh` - Comprehensive v1.6.5 validation

**Coverage:**
- Increased from 72% to 78%
- Security utils: 95%
- API endpoints: 82%

---

## References

- [CHANGELOG.md](../docs/CHANGELOG.md) - Version history
- [SECURITY.md](../docs/SECURITY.md) - Security documentation
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Best Practices](https://testingjavascript.com/)

---

**Last Updated:** April 2026  
**Maintainer:** Mukesh Kesharwani <mukesh.kesharwani@adobe.com>  
**License:** MIT
