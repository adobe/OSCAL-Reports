# Test Suite - OSCAL Report Generator V2

This folder contains all test-related files for the OSCAL Report Generator V2 project. Tests are organized separately from production code to facilitate clean deployments while maintaining comprehensive testing in the development environment.

## 📁 Directory Structure

```
test_cases/
├── backend/                    # Backend tests
│   ├── unit/                   # Unit tests
│   │   ├── auth.test.js        # Authentication tests
│   │   ├── roles.test.js       # RBAC tests
│   │   └── async-handlers.test.js  # Async/await validation tests
│   ├── integration/            # Integration tests
│   │   ├── api.test.js         # API endpoint tests
│   │   └── settings-api.test.js    # Settings API async tests
│   ├── e2e/                    # End-to-end tests
│   │   └── userflow.test.js    # User workflow tests
│   ├── jest.config.js          # Jest configuration
│   ├── setup.js                # Test setup
│   └── coverage/               # Coverage reports (generated)
├── frontend/                   # Frontend tests
│   ├── unit/                   # Component tests
│   │   └── AuthContext.test.jsx
│   ├── integration/            # Integration tests
│   │   └── login.test.jsx
│   └── setup.js                # Frontend test setup
├── scripts/                    # Test automation scripts
│   └── run_tests.sh            # Main test runner
└── docs/                       # Test documentation
    ├── TESTING.md              # Comprehensive testing guide
    ├── TEST_IMPLEMENTATION_SUMMARY.md
    └── TESTING_QUICK_START.md  # Quick reference
```

---

## 🚀 Running Tests

### Quick Start

From the project root:

```bash
# Run all tests
./test_cases/scripts/run_tests.sh

# Run specific test suites
cd backend && npm run test:unit
cd backend && npm run test:integration
cd backend && npm run test:coverage
```

### Test Commands

#### Backend Tests
```bash
cd backend

# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# E2E tests only
npm run test:e2e

# Watch mode (TDD)
npm run test:watch

# With coverage
npm run test:coverage
```

#### Frontend Tests
```bash
cd frontend

# All tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

---

## 📊 Test Coverage

Current coverage goals:
- **Statements**: > 80%
- **Branches**: > 75%
- **Functions**: > 80%
- **Lines**: > 80%

View coverage reports:
```bash
cd backend
npm run test:coverage
open coverage/index.html
```

---

## 🧪 Test Types

### 1. Unit Tests (`unit/`)
Test individual functions and components in isolation.

**Example**: Password hashing, RBAC permissions, async handler validation

### 2. Integration Tests (`integration/`)
Test how multiple components work together.

**Example**: API endpoints, database operations, settings API async operations

### 3. End-to-End Tests (`e2e/`)
Test complete user workflows.

**Example**: Login → Create SSP → Export

---

## 📝 Writing Tests

### Backend Test Example
```javascript
import { describe, test, expect } from '@jest/globals';
import { myFunction } from '../../../backend/utils/myModule.js';

describe('My Module', () => {
  test('should do something', () => {
    const result = myFunction('input');
    expect(result).toBe('expected');
  });
});
```

### Frontend Test Example
```javascript
import React from 'react';
import { render, screen } from '@testing-library/react';
import MyComponent from '../../../frontend/src/components/MyComponent';

test('renders component', () => {
  render(<MyComponent />);
  expect(screen.getByText('Hello')).toBeInTheDocument();
});
```

---

## 🔄 CI/CD Integration

Tests run automatically:

1. **Pre-commit**: Via git hook (`.git/hooks/pre-commit`)
2. **GitHub Actions**: On push/PR (`.github/workflows/ci-cd.yml`)
3. **Manual**: Via `./test_cases/scripts/run_tests.sh`

---

## 🚫 Excluding from Deployment

### Method 1: .dockerignore
```
test_cases/
*.test.js
*.spec.js
jest.config.js
```

### Method 2: Build Scripts
```json
{
  "scripts": {
    "build": "rsync -av --exclude='test_cases/' . ./dist/"
  }
}
```

### Method 3: CI/CD Pipeline
```yaml
# Only include production files
include:
  - backend/**/*.js
  - frontend/dist/**
exclude:
  - test_cases/**
  - **/*.test.js
```

---

## 📚 Documentation

- **[TESTING_GUIDE.md](TESTING_GUIDE.md)** - Complete testing guide (includes quick start, Playwright, implementation details)

---

## 🛠️ Development Workflow

1. **Write Code** → Write accompanying tests
2. **Run Tests** → `npm test` or `./test_cases/scripts/run_tests.sh`
3. **Check Coverage** → Ensure > 80%
4. **Commit** → Pre-commit hook runs tests automatically
5. **Push** → CI/CD runs full test suite

---

## 🐛 Troubleshooting

### Tests Not Found
```bash
# Ensure you're in the correct directory
cd backend
npm test
```

### Module Not Found
```bash
# Install dependencies
cd backend && npm install
cd frontend && npm install
```

### Permission Denied
```bash
# Make test script executable
chmod +x test_cases/scripts/run_tests.sh
```

---

## 🎯 Best Practices

1. ✅ Write tests as you code (TDD)
2. ✅ Keep tests focused (one behavior per test)
3. ✅ Use descriptive test names
4. ✅ Mock external dependencies
5. ✅ Maintain > 80% coverage
6. ✅ Run tests before committing

---

## 📈 Continuous Improvement

- Add more E2E tests for critical workflows
- Increase coverage to 90%+
- Add performance benchmarks
- Add visual regression tests
- Add accessibility tests

---

## 📞 Support

For questions or issues:
1. Check [TESTING_GUIDE.md](TESTING_GUIDE.md)
2. Review test examples in this folder
3. Contact the development team

---

**Last Updated**: December 29, 2025  
**Version**: 2.0.0  
**Maintainer**: Development Team

