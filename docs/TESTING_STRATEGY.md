# Automated Testing Strategy

**Version:** 1.0  
**Date:** 2026-01-23  
**Status:** Active

---

## Overview

This document describes the comprehensive automated testing strategy for the OSCAL Report Generator application across all branches in the development workflow.

---

## Branch Workflow

```
Development → Quality_Test → Pre_Prod → main (Production)
```

Each branch has specific testing requirements and quality gates.

---

## Test Categories

### 1. Security Tests
**Priority:** Critical  
**Coverage:** All branches

- **CSRF Protection Tests** (`csrf-protection.test.js`)
  - Login/register/logout exemption
  - Protected endpoints validation
  - Token generation and validation
  - Attack scenario simulation

- **SSRF Protection Tests** (`ssrf-protection.test.js`)
  - URL validation for 6 protected endpoints
  - Cloud metadata blocking
  - Dangerous protocol blocking
  - Trusted domain verification

- **URL Validator Tests** (`urlValidator.test.js`)
  - Private IP validation
  - Localhost validation
  - Protocol validation
  - Malformed URL handling

### 2. Integration Tests
**Priority:** High  
**Coverage:** Quality_Test, Pre_Prod, main

- **Email Functionality** (`email-functionality.test.js`)
  - SMTP connection (port 587 & 465)
  - Authentication and authorization
  - TLS/SSL configuration
  - Error handling

- **AI Integration** (`ai-integration.test.js`)
  - Private IP support (architectural decision)
  - Cloud metadata protection
  - Mistral API support
  - AWS Bedrock support

- **API Tests** (`api.test.js`)
  - Multi-report comparison
  - Settings management
  - Authentication flows

### 3. Unit Tests
**Priority:** Medium  
**Coverage:** All branches

- Authentication (`auth.test.js`)
- Role-based access control (`roles.test.js`)
- Async handlers (`async-handlers.test.js`)

### 4. End-to-End Tests
**Priority:** High  
**Coverage:** Quality_Test, Pre_Prod

- User workflows (`userflow.test.js`)
- Complete application flows
- Browser-based testing with Playwright

### 5. Performance Tests
**Priority:** Medium  
**Coverage:** Quality_Test, Pre_Prod

- Load testing with Autocannon
- Response time measurement
- Stress testing under load

---

## Branch-Specific Testing

### Development Branch
**Focus:** Fast feedback, core functionality

#### Tests Run:
- ✅ CSRF Protection
- ✅ SSRF Protection
- ✅ URL Validator
- ✅ Email Functionality
- ✅ AI Integration
- ✅ Unit Tests
- ✅ Integration Tests
- ✅ Build Test

####Trigger:** Every push/PR to Development

**Duration:** ~10-15 minutes

**Gate:** All tests must pass

---

### Quality_Test Branch
**Focus:** Comprehensive validation, quality assurance

#### Tests Run:
- ✅ All Development tests
- ✅ Security Audit (npm audit)
- ✅ Full Integration Suite
- ✅ E2E Tests (Playwright)
- ✅ Performance Tests
- ✅ Code Coverage Analysis

**Trigger:** Every push/PR to Quality_Test

**Duration:** ~25-35 minutes

**Gate:** 
- All tests must pass
- Coverage > 70%
- No high/critical vulnerabilities

**Output:** Quality Gate Report

---

### Pre_Prod Branch
**Focus:** Production readiness, regression prevention

#### Tests Run:
- ✅ Production Readiness Check
- ✅ Security Regression Tests
- ✅ Full Test Suite with Coverage
- ✅ Smoke Tests (production config)
- ✅ Stress Tests
- ✅ Configuration Validation

**Trigger:** Every push/PR to Pre_Prod

**Duration:** ~30-40 minutes

**Gate:**
- All tests must pass
- Security config verified
- Performance benchmarks met
- Documentation complete

**Output:** Pre-Prod Gate Report

---

### main Branch (Production)
**Focus:** Final validation, deployment approval

#### Tests Run:
- ✅ Production Validation
- ✅ Final Security Audit
- ✅ Production Test Suite
- ✅ Integration Verification
- ✅ Production Build
- ✅ Docker Build Test

**Trigger:** Every push/PR to main

**Duration:** ~35-45 minutes

**Gate:**
- All critical tests must pass
- Security audit clean
- Production build successful
- Docker image builds

**Output:** Production Deployment Report

---

## Test Environment Configuration

### Environment Variables

```bash
# Common
NODE_ENV=test
API_URL=http://localhost:3020

# Authentication
TEST_ADMIN_PASSWORD=Admin@2026
TEST_USER_PASSWORD=User@2026
TEST_ASSESSOR_PASSWORD=Assessor@2026

# Security (Production)
SESSION_SECRET=<strong-random-secret>
CSRF_ENABLED=true
ALLOW_PRIVATE_IPS=true  # AI architectural decision
ALLOW_LOCALHOST=true    # Development only
```

---

## Running Tests Locally

### All Tests
```bash
cd backend
npm run test
```

### Unit Tests Only
```bash
cd backend
npm run test:unit
```

### Integration Tests Only
```bash
cd backend
npm run test:integration
```

### E2E Tests Only
```bash
cd backend
npm run test:e2e
```

### With Coverage
```bash
cd backend
npm run test:coverage
```

### Watch Mode (Development)
```bash
cd backend
npm run test:watch
```

### Specific Test File
```bash
cd backend
npm run test -- --testPathPattern=csrf-protection.test.js
```

---

## Coverage Requirements

| Branch | Minimum Coverage | Recommended |
|--------|------------------|-------------|
| Development | 60% | 70% |
| Quality_Test | 70% | 80% |
| Pre_Prod | 75% | 85% |
| main | 75% | 90% |

---

## Security Test Matrix

| Security Feature | Test Coverage | Status |
|------------------|---------------|--------|
| CSRF Protection | 43+ test cases | ✅ Complete |
| SSRF Protection | 42+ test cases | ✅ Complete |
| URL Validation | 54+ test cases | ✅ Complete |
| Email Security | 15+ test cases | ✅ Complete |
| AI Security | 12+ test cases | ✅ Complete |

---

## Quality Gates

### Development → Quality_Test
**Requirements:**
- ✅ All unit tests pass
- ✅ All integration tests pass
- ✅ Security tests pass
- ✅ Build successful

### Quality_Test → Pre_Prod
**Requirements:**
- ✅ All Development requirements
- ✅ E2E tests pass
- ✅ Performance tests acceptable
- ✅ Code coverage > 70%
- ✅ No critical vulnerabilities

### Pre_Prod → main
**Requirements:**
- ✅ All Quality_Test requirements
- ✅ Production config validated
- ✅ Smoke tests pass
- ✅ Stress tests acceptable
- ✅ Security regression tests pass
- ✅ Documentation complete

---

## Test Artifacts

### Generated Reports

1. **Coverage Reports**
   - `backend/coverage/`
   - Uploaded to Codecov

2. **Test Results**
   - JUnit XML format
   - Available in GitHub Actions artifacts

3. **Quality Reports**
   - Quality Gate Report (Quality_Test)
   - Pre-Prod Gate Report (Pre_Prod)
   - Production Deployment Report (main)

4. **Performance Reports**
   - Stress test results
   - Load test metrics
   - Response time analysis

---

## Failure Handling

### Test Failure Process

1. **Development Branch:**
   - Block PR merge
   - Developer fixes immediately
   - Re-run tests

2. **Quality_Test Branch:**
   - Block promotion to Pre_Prod
   - QA team investigates
   - Fix in Development, re-test

3. **Pre_Prod Branch:**
   - Block promotion to main
   - Critical fix required
   - Full regression test

4. **main Branch:**
   - Deployment blocked
   - Rollback plan activated
   - Emergency fix process

---

## Continuous Improvement

### Test Maintenance

- **Weekly:** Review test coverage
- **Bi-weekly:** Update test cases
- **Monthly:** Performance baseline update
- **Quarterly:** Strategy review

### Adding New Tests

1. Create test file in appropriate directory:
   - `test_cases/backend/unit/` - Unit tests
   - `test_cases/backend/integration/` - Integration tests
   - `test_cases/backend/e2e/` - End-to-end tests

2. Follow naming convention: `feature-name.test.js`

3. Add to appropriate workflow if needed

4. Update this document

---

## Test Data Management

### Test Users

```javascript
// Default test accounts
admin:    Admin@2026     (Platform Admin)
user:     User@2026      (User)
assessor: Assessor@2026  (Assessor)
```

### Test Configuration

```javascript
// Email test config
smtpHost: smtp.gmail.com
smtpPort: 587
smtpSecure: false

// AI test config
provider: ollama
url: http://192.168.1.111:11434
```

---

## Monitoring and Alerts

### GitHub Actions Notifications

- ✅ Test failures → GitHub PR comments
- ✅ Coverage drops → Codecov comments
- ✅ Security issues → GitHub Security tab
- ✅ Performance degradation → Manual review

### Metrics Tracked

- Test execution time
- Test pass rate
- Code coverage trend
- Security vulnerabilities
- Performance benchmarks

---

## Best Practices

### Writing Tests

1. **Follow AAA Pattern:**
   - Arrange: Setup
   - Act: Execute
   - Assert: Verify

2. **Test Isolation:**
   - Each test is independent
   - No shared state
   - Clean up after tests

3. **Descriptive Names:**
   ```javascript
   it('should block cloud metadata endpoint (SSRF protection)', ...)
   ```

4. **Error Messages:**
   ```javascript
   expect(result).toBe(true, 'CSRF token should be required');
   ```

5. **Test Coverage:**
   - Test happy paths
   - Test error cases
   - Test edge cases
   - Test security scenarios

---

## Troubleshooting

### Common Issues

**Issue:** Tests timeout
**Solution:** Increase timeout in test file or workflow

**Issue:** Environment variables not set
**Solution:** Check workflow env section and local .env file

**Issue:** Database connection fails
**Solution:** Ensure test database is available or use mocks

**Issue:** ECONNREFUSED errors
**Solution:** Ensure server is running before tests

---

## Related Documentation

- **Security:** `docs/SECURITY_FIXES_KODIAK.md`
- **AI Architecture:** `docs/AI_ARCHITECTURE_SECURITY.md`
- **Email Configuration:** `EMAIL_FIXED_SUMMARY.txt`
- **Deployment:** `docs/DEPLOYMENT_GUIDE.md` (if exists)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-23 | Initial testing strategy document |

---

**Maintained By:** Development Team  
**Review Cycle:** Quarterly  
**Next Review:** 2026-04-23
