# Testing Quick Reference Guide

**Version:** 1.6.5  
**For:** Developers and QA Engineers

---

## 🚀 Quick Commands

```bash
# Run EVERYTHING before merging (recommended)
./test_cases/scripts/run-all-tests.sh

# Run all tests only (faster)
cd backend && npm test

# Run with coverage
cd backend && npm run test:coverage

# Run specific type
cd backend && npm run test:unit          # Unit tests
cd backend && npm run test:integration   # Integration tests
cd backend && npm run test:e2e          # E2E tests
cd backend && npm run test:security     # v1.6.5 security tests

# Watch mode (development)
cd backend && npm run test:watch
```

---

## 📁 Test File Locations

```
test_cases/backend/
├── unit/                   # Unit tests (individual functions)
├── integration/            # Integration tests (API endpoints)
└── e2e/                   # End-to-end tests (complete workflows)
```

---

## 🆕 v1.6.5 New Tests

| Test File | Purpose | Command |
|-----------|---------|---------|
| `securityConfig.test.js` | Security configuration | `npm test -- securityConfig` |
| `urlValidator-options.test.js` | AI integration options | `npm test -- urlValidator-options` |
| `csrf-api.test.js` | CSRF exemption | `npm test -- csrf-api` |
| `security-flow.test.js` | Complete security workflows | `npm test -- security-flow` |

---

## ✅ Pre-Merge Checklist

```bash
# 1. Run comprehensive test suite (ALL checks)
./test_cases/scripts/run-all-tests.sh

# 2. If all pass, safe to merge
git push origin <branch>
# Then create PR: Development → Quality_Test

# Quick test only (if you already ran full suite recently)
cd backend && npm test
```

---

## 🐛 Troubleshooting

### Tests Won't Run

```bash
# Reinstall dependencies
cd backend
rm -rf node_modules
npm install
```

### Tests Hang

```bash
# Force exit
cd backend
npm test -- --forceExit
```

### Port Issues

```bash
# Kill processes on test ports
lsof -ti:3020 | xargs kill -9
lsof -ti:3021 | xargs kill -9
```

### Cache Issues

```bash
# Clear Jest cache
cd backend
npm test -- --clearCache
```

---

## 📝 Writing New Tests

### Template

```javascript
import { describe, test, expect } from '@jest/globals';

describe('Feature Name', () => {
  test('should do something specific', () => {
    // Arrange
    const input = 'test';
    
    // Act
    const result = someFunction(input);
    
    // Assert
    expect(result).toBe('expected');
  });
});
```

### Best Practices

✅ **DO:**
- Use descriptive test names
- Test both success and failure cases
- Keep tests isolated
- Mock external dependencies
- Follow AAA pattern (Arrange, Act, Assert)

❌ **DON'T:**
- Make tests depend on each other
- Make real HTTP requests
- Test implementation details
- Use hardcoded sleeps
- Skip error cases

---

## 🔒 Security Testing

### What to Test

- ✅ Authentication (Bearer tokens)
- ✅ Authorization (RBAC)
- ✅ Input validation
- ✅ CSRF protection
- ✅ SSRF prevention
- ✅ Error messages (no sensitive data)

### Example

```javascript
test('should reject invalid Bearer token', async () => {
  const response = await request(app)
    .post('/api/protected-endpoint')
    .set('Authorization', 'Bearer invalid-token')
    .expect(401);
  
  expect(response.body).toHaveProperty('error');
});
```

---

## 📊 Coverage Goals

| Category | Target | Check |
|----------|--------|-------|
| Overall | > 75% | `npm run test:coverage` |
| Security | > 90% | Check coverage report |
| APIs | > 80% | Check coverage report |

---

## 🔗 Quick Links

- [Full Test Documentation](./README.md)
- [v1.6.5 Test Updates](../docs/TEST_UPDATES_V1.6.5.md)
- [Security](../docs/SECURITY.md)
- [CHANGELOG](../docs/CHANGELOG.md)

---

## 🆘 Getting Help

1. Check this guide
2. Read [Full Test Documentation](./README.md)
3. Review existing test files for examples
4. Check [Jest Documentation](https://jestjs.io/)

---

**Last Updated:** January 28, 2026  
**Maintainer:** Mukesh Kesharwani
