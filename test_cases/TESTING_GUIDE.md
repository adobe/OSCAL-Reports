# 🧪 Complete Testing Guide

**OSCAL Report Generator V2 - Comprehensive Testing Documentation**

Last Updated: January 2026  
Total Test Cases: 86+

---

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Running Tests](#running-tests)
3. [Writing Tests](#writing-tests)
4. [Playwright E2E Testing](#playwright-e2e-testing)
5. [Test Coverage](#test-coverage)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)

---

## Quick Start

### 🚀 Quick Commands

```bash
# Run ALL tests (recommended before commit)
./test_cases/scripts/run_tests.sh

# Backend unit tests only
cd backend && npm run test:unit

# Backend integration tests only
cd backend && npm run test:integration

# Watch mode for TDD
cd backend && npm run test:watch

# Coverage report
cd backend && npm run test:coverage
open backend/coverage/index.html
```

### 📝 Commit Workflow

```bash
# 1. Make your changes
vim backend/server.js

# 2. Stage changes
git add .

# 3. Commit (tests run automatically!)
git commit -m "feat: Add new feature"

# What runs automatically:
# ✅ Best practices validation (70+ rules)
# ✅ Security checks (50+ patterns)
# ✅ All 86+ test cases
# ✅ Code quality checks
# ✅ Version consistency

# 4. If all pass → Commit succeeds
# 5. If any fail → Fix issues and try again

# 6. Push to GitHub
git push
```

### 🧪 What Gets Tested

✅ **Unit Tests** (42 tests) - Individual functions in isolation  
✅ **Integration Tests** (19 tests) - API endpoints and databases  
✅ **E2E Tests** (12 tests) - Complete user workflows  
✅ **Frontend Tests** (13 tests) - React components and UI  
✅ **Code Quality** - No console.log, empty catch blocks  
✅ **Security** - No hardcoded secrets, XSS/SQL injection  
✅ **Performance** - No blocking sync operations  
✅ **Version Consistency** - All package.json files synchronized  

---

## Running Tests

### Test Suite Structure

```
test_cases/
├── backend/
│   ├── unit/                  # 42 tests
│   │   ├── auth.test.js       # 16 tests
│   │   ├── roles.test.js      # 15 tests
│   │   └── async-handlers.test.js # 11 tests
│   ├── integration/           # 19 tests
│   │   ├── api.test.js        # 7 tests
│   │   └── settings-api.test.js # 12 tests
│   └── e2e/                   # 6 tests
│       └── userflow.test.js
├── frontend/
│   ├── unit/                  # 9 tests
│   │   └── AuthContext.test.jsx
│   └── integration/           # 4 tests
│       └── login.test.jsx
└── e2e/                       # 6 tests
    └── example-recorded.spec.js
```

### Run Specific Test Suites

**Backend Unit Tests** (Fast - ~2 seconds):
```bash
cd backend
npm run test:unit

# What it tests:
# - Authentication & password hashing
# - RBAC permissions
# - Async/await patterns
```

**Backend Integration Tests** (~5 seconds):
```bash
cd backend
npm run test:integration

# What it tests:
# - API endpoints
# - Settings persistence
# - Database operations
```

**Backend E2E Tests** (~10 seconds):
```bash
cd backend
npm run test:e2e

# What it tests:
# - Complete user workflows
# - Login → Create SSP → Export
```

**All Backend Tests**:
```bash
cd backend
npm test  # Runs all backend tests
```

**Frontend Tests**:
```bash
cd frontend
npm test
# Runs React component and integration tests
```

**Playwright E2E Tests**:
```bash
cd test_cases/e2e
npx playwright test

# Run in UI mode
npx playwright test --ui

# Run specific test
npx playwright test example-recorded.spec.js
```

### Test Modes

**Watch Mode** (for TDD):
```bash
cd backend
npm run test:watch

# Features:
# - Auto-reruns tests on file change
# - Only reruns failed tests
# - Press 'a' to run all tests
# - Press 'q' to quit
```

**Coverage Mode**:
```bash
cd backend
npm run test:coverage

# Generates:
# - HTML report: backend/coverage/index.html
# - LCOV report: backend/coverage/lcov.info
# - Text summary in terminal
```

**Debug Mode**:
```bash
# Add debugger statement in test
test('debug this', () => {
  debugger;
  expect(result).toBe(expected);
});

# Run with inspect
node --inspect-brk node_modules/.bin/jest --runInBand
```

---

## Writing Tests

### Unit Test Template

```javascript
// test_cases/backend/unit/myfeature.test.js
import { describe, test, expect } from '@jest/globals';
import { myFunction } from '../../../backend/myModule.js';

describe('My Feature', () => {
  // Group related tests
  describe('Normal Cases', () => {
    test('should handle valid input', () => {
      // Arrange
      const input = 'valid data';
      
      // Act
      const result = myFunction(input);
      
      // Assert
      expect(result).toBe('expected output');
    });
  });
  
  describe('Edge Cases', () => {
    test('should handle null input', () => {
      const result = myFunction(null);
      expect(result).toBeNull();
    });
    
    test('should handle empty input', () => {
      const result = myFunction('');
      expect(result).toBe('');
    });
  });
  
  describe('Error Cases', () => {
    test('should throw on invalid input', () => {
      expect(() => {
        myFunction(undefined);
      }).toThrow('Invalid input');
    });
  });
});
```

### Integration Test Template

```javascript
// test_cases/backend/integration/myapi.test.js
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';

describe('My API Integration Tests', () => {
  let app;
  let server;
  
  beforeAll(async () => {
    // Setup test server
    app = express();
    app.use(express.json());
    // Import routes...
    server = app.listen(0); // Random port
  });
  
  afterAll(async () => {
    await server.close();
  });
  
  test('GET /api/resource should return data', async () => {
    const response = await request(app)
      .get('/api/resource')
      .expect(200)
      .expect('Content-Type', /json/);
    
    expect(response.body).toHaveProperty('data');
    expect(Array.isArray(response.body.data)).toBe(true);
  });
  
  test('POST /api/resource should create resource', async () => {
    const newResource = { name: 'Test' };
    
    const response = await request(app)
      .post('/api/resource')
      .send(newResource)
      .expect(201);
    
    expect(response.body).toHaveProperty('id');
    expect(response.body.name).toBe('Test');
  });
});
```

### Async/Await Testing

```javascript
test('should handle async operations', async () => {
  // Use async/await for promises
  const result = await asyncFunction();
  expect(result).toBe('expected');
  
  // Test promise rejection
  await expect(failingAsyncFunction()).rejects.toThrow('Error message');
});

test('should timeout appropriately', async () => {
  // ...test code...
}, 10000); // 10 second timeout
```

### Mocking

```javascript
// Mock external dependencies
import { jest } from '@jest/globals';

test('should use mocked function', () => {
  const mockFn = jest.fn();
  mockFn.mockReturnValue('mocked value');
  
  const result = myFunction(mockFn);
  
  expect(mockFn).toHaveBeenCalledTimes(1);
  expect(mockFn).toHaveBeenCalledWith('expected arg');
  expect(result).toBe('mocked value');
});

// Mock modules
jest.mock('../../../backend/database.js', () => ({
  query: jest.fn().mockResolvedValue({ rows: [] })
}));
```

---

## Playwright E2E Testing

### Installation

```bash
# Install Playwright
cd test_cases/e2e
npm install

# Install browsers
npx playwright install

# Install system dependencies (Linux)
npx playwright install-deps
```

### Recording Tests with Playwright

**Step 1**: Start your application
```bash
cd /Users/mkesharw/Documents/OSCAL_Reports
npm run dev
# Wait for: http://localhost:3021
```

**Step 2**: Open Playwright Inspector
```bash
cd test_cases/e2e
npx playwright codegen http://localhost:3021
```

**What Opens**:
- Browser window (left) - Interact with your app
- Playwright Inspector (right) - Shows generated code

**Step 3**: Interact with your app
- Click buttons, fill forms, navigate pages
- Code is generated automatically in real-time

**Step 4**: Add assertions
- Click "Assert" button in inspector
- Select element to verify
- Choose assertion type (visible, has text, etc.)

**Step 5**: Copy and save test
```bash
# 1. Click "Copy" button in inspector
# 2. Create new test file
vim test_cases/e2e/my-new-test.spec.js
# 3. Paste and modify as needed
```

### Example Playwright Test

```javascript
// test_cases/e2e/login-flow.spec.js
import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test('should successfully login', async ({ page }) => {
    // Navigate to app
    await page.goto('http://localhost:3021');
    
    // Fill login form
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'admin');
    
    // Click login button
    await page.click('button[type="submit"]');
    
    // Verify redirect to dashboard
    await expect(page).toHaveURL(/.*dashboard/);
    
    // Verify user name displayed
    await expect(page.locator('.user-name')).toContainText('admin');
  });
  
  test('should show error on invalid login', async ({ page }) => {
    await page.goto('http://localhost:3021');
    
    await page.fill('input[name="username"]', 'invalid');
    await page.fill('input[name="password"]', 'wrong');
    await page.click('button[type="submit"]');
    
    // Verify error message
    await expect(page.locator('.error-message')).toBeVisible();
    await expect(page.locator('.error-message')).toContainText('Invalid credentials');
  });
});
```

### Running Playwright Tests

```bash
# Run all tests
npx playwright test

# Run in headed mode (see browser)
npx playwright test --headed

# Run in UI mode (interactive)
npx playwright test --ui

# Run specific test
npx playwright test login-flow.spec.js

# Run with specific browser
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit

# Debug mode
npx playwright test --debug

# Generate report
npx playwright show-report
```

### Playwright Best Practices

1. **Use data-testid attributes**:
```html
<button data-testid="submit-button">Submit</button>
```
```javascript
await page.click('[data-testid="submit-button"]');
```

2. **Wait for navigation**:
```javascript
await Promise.all([
  page.waitForNavigation(),
  page.click('a[href="/dashboard"]')
]);
```

3. **Handle dynamic content**:
```javascript
await page.waitForSelector('.loading-spinner', { state: 'hidden' });
await page.waitForSelector('.content', { state: 'visible' });
```

4. **Take screenshots on failure**:
```javascript
test('test name', async ({ page }) => {
  try {
    // ... test code ...
  } catch (error) {
    await page.screenshot({ path: 'failure.png' });
    throw error;
  }
});
```

---

## Test Coverage

### Current Coverage

Run coverage report:
```bash
cd backend
npm run test:coverage
```

**Current Metrics**:
- **Statements**: ~85%
- **Branches**: ~75%
- **Functions**: ~80%
- **Lines**: ~85%

**Target Goals**:
- **Statements**: > 90%
- **Branches**: > 80%
- **Functions**: > 85%
- **Lines**: > 90%

### View Coverage Report

```bash
# Generate and open HTML report
cd backend
npm run test:coverage
open coverage/index.html
```

**Report includes**:
- File-by-file coverage breakdown
- Highlighted uncovered lines
- Branch coverage details
- Function coverage summary

### Improving Coverage

**Identify uncovered code**:
```bash
# Files with low coverage highlighted in red
# Click on file to see uncovered lines
```

**Add tests for uncovered areas**:
1. Find untested functions in coverage report
2. Write unit tests for those functions
3. Re-run coverage to verify improvement

---

## Best Practices

### Test Naming

✅ **Good**:
```javascript
test('should successfully authenticate user with valid credentials', () => {
  // ...
});

test('should return 400 error when email is missing', () => {
  // ...
});
```

❌ **Bad**:
```javascript
test('test1', () => { /* ... */ });
test('auth test', () => { /* ... */ });
```

### Test Structure

**AAA Pattern** (Arrange, Act, Assert):
```javascript
test('should calculate total correctly', () => {
  // Arrange - Setup test data
  const items = [{ price: 10 }, { price: 20 }];
  
  // Act - Execute the function
  const total = calculateTotal(items);
  
  // Assert - Verify the result
  expect(total).toBe(30);
});
```

### Test Independence

✅ **Good** - Tests don't depend on each other:
```javascript
test('test 1', () => {
  const result = function1();
  expect(result).toBe('expected');
});

test('test 2', () => {
  const result = function2();
  expect(result).toBe('expected');
});
```

❌ **Bad** - Tests depend on order:
```javascript
let sharedState;

test('test 1', () => {
  sharedState = setup();
});

test('test 2', () => {
  // Fails if test 1 doesn't run first!
  expect(sharedState).toBeDefined();
});
```

### Test Speed

- **Keep tests fast** - Unit tests should run in milliseconds
- **Mock external services** - Don't make real API calls
- **Use test databases** - Don't test against production
- **Parallelize when possible** - Jest runs tests in parallel by default

---

## Troubleshooting

### Common Issues

#### "Module not found"
```bash
# Install dependencies
cd backend && npm install
cd frontend && npm install
cd test_cases/e2e && npm install
```

#### "Permission denied"
```bash
# Make scripts executable
chmod +x test_cases/scripts/*.sh
chmod +x .git/hooks/pre-commit
```

#### "Tests timeout"
```javascript
// Increase timeout for slow tests
test('slow test', async () => {
  // ... test code ...
}, 30000); // 30 seconds
```

#### "Port already in use"
```bash
# Find and kill process
lsof -i :3020
kill -9 <PID>

# Or use different port in tests
```

#### "Playwright browser not found"
```bash
# Install browsers
npx playwright install

# Install dependencies (Linux)
npx playwright install-deps
```

### Debug Tips

**1. Use console.log in tests**:
```javascript
test('debug test', () => {
  console.log('Debug info:', someVariable);
  expect(result).toBe(expected);
});
```

**2. Use .only to run single test**:
```javascript
test.only('focus on this test', () => {
  // Only this test runs
});
```

**3. Use .skip to ignore test**:
```javascript
test.skip('temporarily skip this', () => {
  // This test won't run
});
```

**4. Check test output**:
```bash
# Verbose output
npm test -- --verbose

# Show all test names
npm test -- --listTests
```

---

## CI/CD Integration

Tests run automatically:

### Pre-Commit (Local)
```bash
git commit
# ↓ Automatically runs:
# 1. Best practices validation
# 2. Security checks
# 3. All 86+ tests
# 4. Code quality checks
```

### GitHub Actions (Remote)
```yaml
# Runs on every push/PR
- Backend unit tests (42 tests)
- Backend integration tests (19 tests)
- Code quality checks
- Security validation
- npm audit
```

### Bypassing Tests (Emergency Only)

```bash
# Skip pre-commit hook (NOT RECOMMENDED)
git commit --no-verify -m "hotfix: Critical fix"
```

⚠️ **Warning**: Tests still run in GitHub Actions!

---

## Additional Resources

- **Test Coverage Report**: See `test_cases/TEST_COVERAGE_REPORT.md`
- **Validation System**: See `docs/VALIDATION_SYSTEM.md`
- **Best Practices**: See `docs/BEST_PRACTICES.md`
- **Architecture**: See `docs/ARCHITECTURE.md`

---

## Summary

### Quick Reference

| Command | Purpose |
|---------|---------|
| `./test_cases/scripts/run_tests.sh` | Run all tests |
| `cd backend && npm run test:unit` | Backend unit tests |
| `cd backend && npm run test:integration` | Backend integration tests |
| `cd backend && npm run test:watch` | Watch mode (TDD) |
| `cd backend && npm run test:coverage` | Coverage report |
| `npx playwright test` | E2E tests |
| `npx playwright codegen` | Record new E2E tests |

### Test Stats

- **Total Tests**: 86+
- **Backend Unit**: 42 tests
- **Backend Integration**: 19 tests
- **Backend E2E**: 6 tests
- **Frontend**: 13 tests
- **E2E Playwright**: 6 tests

### Key Points

✅ Tests run automatically on commit  
✅ All tests must pass before merging  
✅ Write tests as you code (TDD)  
✅ Aim for 90%+ coverage  
✅ Keep tests fast and independent  

---

**Need Help?** Contact the development team or check additional documentation!

---

**Last Updated**: January 2026  
**Maintainer**: Development Team
