# Testing Guide - OSCAL Report Generator V2

## Table of Contents

1. [Overview](#overview)
2. [Test Structure](#test-structure)
3. [Running Tests](#running-tests)
4. [Pre-Commit Testing](#pre-commit-testing)
5. [CI/CD Pipeline](#cicd-pipeline)
6. [Writing Tests](#writing-tests)
7. [Test Coverage](#test-coverage)
8. [Troubleshooting](#troubleshooting)

---

## Overview

The OSCAL Report Generator V2 implements a comprehensive automated testing system to ensure code quality and prevent regressions. All tests must pass before code can be committed to the repository.

### Testing Philosophy

- **Automated**: Tests run automatically on every commit and push
- **Comprehensive**: Unit, integration, and E2E tests cover all critical functionality
- **Fast**: Tests are optimized to run quickly for rapid feedback
- **Reliable**: Tests are deterministic and don't depend on external services
- **Maintainable**: Tests are well-organized and easy to update

---

## Test Structure

```
OSCAL_Reports/
├── backend/
│   └── tests/
│       ├── jest.config.js        # Jest configuration
│       ├── setup.js              # Test setup and global helpers
│       ├── unit/                 # Unit tests
│       │   ├── auth.test.js      # Authentication tests
│       │   └── roles.test.js     # RBAC tests
│       ├── integration/          # Integration tests
│       │   └── api.test.js       # API endpoint tests
│       └── e2e/                  # End-to-end tests
│           └── userflow.test.js  # User workflow tests
├── frontend/
│   └── tests/
│       ├── setup.js              # Frontend test setup
│       ├── unit/                 # Component unit tests
│       │   └── AuthContext.test.jsx
│       └── integration/          # Integration tests
│           └── login.test.jsx
├── run_tests.sh                  # Main test runner script
└── .github/
    └── workflows/
        ├── ci-cd.yml             # CI/CD pipeline
        └── release.yml           # Release automation
```

---

## Running Tests

### Prerequisites

Install test dependencies:

```bash
# Backend dependencies
cd backend
npm install

# Frontend dependencies
cd frontend
npm install
```

### Backend Tests

```bash
cd backend

# Run all tests
npm test

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run only E2E tests
npm run test:e2e

# Run tests in watch mode (auto-rerun on changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

### Frontend Tests

```bash
cd frontend

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Full Test Suite

Run all tests (backend + frontend + quality checks):

```bash
./run_tests.sh
```

This script runs:
1. ✅ Backend unit tests
2. ✅ Backend integration tests
3. ✅ Code quality checks (console.log, TODO/FIXME)
4. ✅ Security checks (hardcoded secrets)
5. ✅ File size checks

---

## Pre-Commit Testing

### How It Works

The pre-commit hook (`.git/hooks/pre-commit`) automatically runs tests before allowing a commit:

```bash
git add .
git commit -m "feat: Add new feature"
# ↓ Automatically runs tests
# ✅ Tests pass → Commit proceeds
# ❌ Tests fail → Commit blocked
```

### What Gets Tested

1. **Automated Test Suite**: All unit and integration tests
2. **Version Consistency**: Ensures version numbers are synchronized
3. **Code Quality**: Checks for console.log, TODO/FIXME comments
4. **Security**: Scans for hardcoded secrets
5. **File Sizes**: Warns about large files

### Bypassing Pre-Commit Tests (NOT RECOMMENDED)

```bash
git commit --no-verify -m "Emergency fix"
```

⚠️ **Warning**: Only use `--no-verify` in emergencies. All tests will still run in CI/CD.

---

## CI/CD Pipeline

### GitHub Actions Workflows

#### 1. CI/CD Pipeline (`.github/workflows/ci-cd.yml`)

Runs on every push and pull request:

**Jobs:**
- **Backend Tests**: Runs on Node.js 18.x and 20.x
  - Unit tests
  - Integration tests
  - Coverage report
- **Frontend Tests**: Runs on Node.js 18.x and 20.x
  - Build verification
  - Component tests
- **Code Quality**: Security and quality checks
  - Hardcoded secret detection
  - console.log detection
  - File size checks
  - npm audit
- **Version Check**: Ensures version synchronization
- **Integration Test**: Full stack integration test
- **Deploy**: Automatic deployment (main branch only)

#### 2. Release Pipeline (`.github/workflows/release.yml`)

Runs when a version tag is pushed:

```bash
git tag v2.0.1
git push origin v2.0.1
```

**Actions:**
- Creates GitHub Release
- Generates release archives
- Extracts changelog
- Uploads build artifacts

### Viewing CI/CD Results

1. Go to your GitHub repository
2. Click on "Actions" tab
3. View workflow runs and results

---

## Writing Tests

### Backend Unit Tests

**Location**: `backend/tests/unit/`

**Example**: Testing a utility function

```javascript
import { describe, test, expect } from '@jest/globals';
import { myFunction } from '../../utils/myModule.js';

describe('My Module', () => {
  describe('myFunction', () => {
    test('should return correct result', () => {
      const result = myFunction('input');
      expect(result).toBe('expected output');
    });

    test('should handle edge cases', () => {
      expect(myFunction('')).toBe('');
      expect(myFunction(null)).toBe(null);
    });

    test('should throw error for invalid input', () => {
      expect(() => myFunction(undefined)).toThrow();
    });
  });
});
```

### Backend Integration Tests

**Location**: `backend/tests/integration/`

**Example**: Testing API endpoints

```javascript
import { describe, test, expect } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';

describe('API Endpoints', () => {
  test('GET /api/users should require authentication', async () => {
    const response = await request(app)
      .get('/api/users')
      .expect(401);

    expect(response.body).toHaveProperty('error');
  });

  test('POST /api/auth/login should return token', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testuser', password: 'testpass' })
      .expect(200);

    expect(response.body).toHaveProperty('sessionToken');
  });
});
```

### Frontend Component Tests

**Location**: `frontend/tests/unit/`

**Example**: Testing a React component

```javascript
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect } from '@jest/globals';
import MyComponent from '../../src/components/MyComponent';

describe('MyComponent', () => {
  test('should render correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  test('should handle button click', () => {
    render(<MyComponent />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(screen.getByText('Clicked')).toBeInTheDocument();
  });
});
```

### Test Best Practices

1. **Use Descriptive Names**: Test names should clearly describe what they test
2. **Follow AAA Pattern**: Arrange, Act, Assert
3. **Test One Thing**: Each test should verify one specific behavior
4. **Use Test Helpers**: Leverage `testHelpers` from `setup.js`
5. **Mock External Dependencies**: Don't rely on external services
6. **Clean Up**: Reset state between tests

---

## Test Coverage

### Viewing Coverage Reports

```bash
# Backend coverage
cd backend
npm run test:coverage

# Open HTML report
open coverage/index.html
```

### Coverage Goals

- **Statements**: > 80%
- **Branches**: > 75%
- **Functions**: > 80%
- **Lines**: > 80%

### Files Excluded from Coverage

- `node_modules/`
- `tests/`
- `public/`
- `dist/`
- `server.js` (main entry point)

---

## Troubleshooting

### Common Issues

#### 1. Tests Fail Locally But Pass in CI

**Cause**: Environment differences

**Solution**:
```bash
# Ensure clean install
rm -rf node_modules package-lock.json
npm install
npm test
```

#### 2. "Module not found" Errors

**Cause**: Missing dependencies or incorrect imports

**Solution**:
```bash
# Check if dependencies are installed
npm install

# Verify import paths use .js extension for ES modules
import { func } from './module.js';  // ✅ Correct
import { func } from './module';     // ❌ Wrong
```

#### 3. Tests Timeout

**Cause**: Async operations not completing

**Solution**:
```javascript
// Increase timeout for specific test
test('slow operation', async () => {
  // test code
}, 30000); // 30 second timeout

// Or in jest.config.js
testTimeout: 10000
```

#### 4. Mock Not Working

**Cause**: Mock defined after import

**Solution**:
```javascript
// ✅ Correct: Mock before import
jest.mock('module');
import { func } from 'module';

// ❌ Wrong: Import before mock
import { func } from 'module';
jest.mock('module');
```

#### 5. Pre-Commit Hook Not Running

**Cause**: Hook not executable

**Solution**:
```bash
chmod +x .git/hooks/pre-commit
chmod +x run_tests.sh
```

### Getting Help

1. **Check test output**: Read error messages carefully
2. **Run with verbose**: `npm test -- --verbose`
3. **Check CI logs**: View GitHub Actions logs
4. **Isolate the test**: Run single test file
5. **Debug mode**: Use `console.log` or debugger

---

## Continuous Improvement

### Adding New Tests

When adding new features:

1. **Write tests first** (TDD approach)
2. **Add unit tests** for new functions
3. **Add integration tests** for new endpoints
4. **Update E2E tests** for new workflows
5. **Verify coverage** doesn't decrease

### Maintaining Tests

- **Review failing tests** immediately
- **Update tests** when requirements change
- **Refactor tests** to reduce duplication
- **Document complex test scenarios**
- **Keep test data realistic**

---

## Summary

✅ **Automated testing** ensures code quality  
✅ **Pre-commit hooks** prevent bad commits  
✅ **CI/CD pipeline** validates all changes  
✅ **Comprehensive coverage** catches bugs early  
✅ **Easy to run** with simple commands  

**Remember**: Good tests are an investment in code quality and developer productivity!

---

## Quick Reference

```bash
# Run all tests
./run_tests.sh

# Backend tests
cd backend && npm test

# Frontend tests
cd frontend && npm test

# Coverage
npm run test:coverage

# Watch mode
npm run test:watch

# Skip pre-commit (emergency only)
git commit --no-verify
```

---

**Last Updated**: December 29, 2025  
**Version**: 2.0.0

