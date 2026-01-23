# Testing Quick Start Guide

**Last Updated:** 2026-01-23

---

## 🚀 Quick Commands

### Run All Tests
```bash
cd backend
npm run test
```

### Run Specific Test Suite
```bash
# Security tests
npm run test -- --testPathPattern=csrf-protection.test.js
npm run test -- --testPathPattern=ssrf-protection.test.js
npm run test -- --testPathPattern=urlValidator.test.js

# Integration tests
npm run test -- --testPathPattern=email-functionality.test.js
npm run test -- --testPathPattern=ai-integration.test.js
npm run test -- --testPathPattern=api.test.js

# Unit tests
npm run test:unit

# All integration tests
npm run test:integration

# E2E tests
npm run test:e2e
```

### Run with Coverage
```bash
npm run test:coverage
```

### Watch Mode (Development)
```bash
npm run test:watch
```

---

## 🎯 What Gets Tested Automatically

### When You Push to Development:
✅ Security Tests (CSRF, SSRF)  
✅ Email Functionality  
✅ AI Integration  
✅ Unit Tests  
✅ Integration Tests  
✅ Build Test  

**Duration:** ~15 minutes

---

### When You Push to Quality_Test:
✅ All Development tests  
✅ Security Audit  
✅ E2E Tests  
✅ Performance Tests  
✅ Coverage Analysis  

**Duration:** ~30 minutes  
**Output:** Quality Gate Report

---

### When You Push to Pre_Prod:
✅ All Quality tests  
✅ Production Readiness  
✅ Smoke Tests  
✅ Stress Tests  
✅ Regression Tests  

**Duration:** ~35 minutes  
**Output:** Pre-Prod Gate Report

---

### When You Push to main:
✅ All Pre-Prod tests  
✅ Final Security Audit  
✅ Production Build  
✅ Docker Build  

**Duration:** ~40 minutes  
**Output:** Production Deployment Report

---

## ✅ Test Status Badges

Add to your README.md:

```markdown
![Development Tests](https://github.com/AdobeManagedServices/OSCAL-Reports/workflows/Development%20Branch%20Tests/badge.svg?branch=Development)

![Quality Tests](https://github.com/AdobeManagedServices/OSCAL-Reports/workflows/Quality_Test%20Branch%20Tests/badge.svg?branch=Quality_Test)

![Pre-Prod Tests](https://github.com/AdobeManagedServices/OSCAL-Reports/workflows/Pre_Prod%20Branch%20Tests/badge.svg?branch=Pre_Prod)

![Production Tests](https://github.com/AdobeManagedServices/OSCAL-Reports/workflows/Main%20Branch%20Production%20Tests/badge.svg?branch=main)

[![codecov](https://codecov.io/gh/AdobeManagedServices/OSCAL-Reports/branch/main/graph/badge.svg)](https://codecov.io/gh/AdobeManagedServices/OSCAL-Reports)
```

---

## 🔍 Checking Test Results

### In GitHub:
1. Go to: **Actions** tab
2. Click on: Latest workflow run
3. View: Test results and reports

### Locally:
```bash
# Check coverage
open backend/coverage/lcov-report/index.html

# View test output
cd backend
npm run test
```

---

## 📊 Test Coverage

### Current Coverage:
- **Security Tests:** 216+ test cases
- **Email Tests:** 15+ test cases
- **AI Tests:** 12+ test cases
- **Total:** 243+ test cases

### Coverage Targets:
- Development: > 60%
- Quality_Test: > 70%
- Pre_Prod: > 75%
- main: > 75%

---

## 🐛 Troubleshooting

### Tests Failing Locally?

```bash
# 1. Clean and reinstall
cd backend
rm -rf node_modules package-lock.json
npm install

# 2. Check environment
echo $NODE_ENV  # Should be 'test' or empty

# 3. Start fresh
npm run test
```

### Tests Passing Locally but Failing in CI?

- Check GitHub Actions logs
- Verify environment variables in workflow
- Ensure all dependencies in package.json

### Coverage Too Low?

```bash
# See which files lack coverage
npm run test:coverage
open coverage/lcov-report/index.html
```

---

## 📚 Documentation

- **Complete Guide:** `docs/TESTING_STRATEGY.md`
- **Security Tests:** `docs/SECURITY_FIXES_KODIAK.md`
- **AI Security:** `docs/AI_ARCHITECTURE_SECURITY.md`
- **This Guide:** `TESTING_QUICK_START.md`

---

## 🎉 Success Criteria

### Your Code is Ready When:

✅ All tests pass locally  
✅ Coverage meets threshold  
✅ GitHub Actions checks pass  
✅ No linter errors  
✅ Security tests pass  

---

## 💡 Tips

1. **Run tests before pushing:**
   ```bash
   npm run test
   ```

2. **Fix failing tests immediately:**
   Don't push broken code to shared branches

3. **Add tests for new features:**
   Every new feature should have tests

4. **Check coverage:**
   Aim for > 80% on new code

5. **Review test reports:**
   Check GitHub Actions after each push

---

## 🔒 Security Test Checklist

Before merging to Quality_Test:

- [ ] CSRF protection tests pass
- [ ] SSRF protection tests pass
- [ ] URL validator tests pass
- [ ] Email functionality verified
- [ ] AI integration verified
- [ ] No new security vulnerabilities

---

## 🚀 Quick Start

```bash
# 1. Install dependencies (if needed)
cd backend && npm install

# 2. Run all tests
npm run test

# 3. Check coverage
npm run test:coverage

# 4. If all pass, push your code!
git push origin Development
```

**GitHub Actions will automatically test your code!** ✅

---

**Questions?** Check `docs/TESTING_STRATEGY.md` for complete documentation.
