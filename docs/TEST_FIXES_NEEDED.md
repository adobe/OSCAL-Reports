# Test Fixes Required

**Date:** 2026-01-23  
**Status:** Action Required  
**Priority:** High

---

## 🐛 Issue Summary

Integration tests are failing due to:
1. Tests expect OLD security behavior (blocking private IPs)
2. Tests don't match ACTUAL architectural decisions
3. Tests need server running but don't wait properly
4. Email endpoint tests timing out

**Current Status:**
- ✅ 57 tests passing
- ❌ 31 tests failing
- Total: 88 tests

---

## 🔧 Required Fixes

### 1. **SSRF Protection Tests** (11 failures)

**Issue:** Tests expect private IPs to be BLOCKED, but we changed security config to ALLOW them for AI services.

**Location:** `test_cases/backend/integration/ssrf-protection.test.js`

**Required Changes:**
```javascript
// OLD TEST (expecting block):
it('should block private IP ranges', async () => {
  const response = await request(API_URL)
    .post('/api/fetch-catalogue')
    .set('Authorization', `Bearer ${authToken}`)
    .send({ url: 'http://192.168.1.1/catalog.json' });
  
  expect(response.status).toBe(400); // ❌ WRONG - should be 200!
});

// NEW TEST (expecting allow):
it('should ALLOW private IP ranges (architectural decision)', async () => {
  const response = await request(API_URL)
    .post('/api/fetch-catalogue')
    .set('Authorization', `Bearer ${authToken}`)
    .send({ url: 'http://192.168.1.1/catalog.json' });
  
  expect(response.status).toBe(200); // ✅ CORRECT
  // Note: May fail with connection error, but should NOT be blocked by SSRF
});
```

**Tests to Update:**
- ❌ "should block localhost URLs"
- ❌ "should block private IP ranges"
- ❌ "should block internal network IPs"
- ❌ "should respect ALLOW_LOCALHOST environment variable"
- ❌ "should respect ALLOW_PRIVATE_IPs environment variable"

**Keep as-is (should still block):**
- ✅ "should block cloud metadata endpoint" (169.254.169.254)
- ✅ "should block file:// protocol"
- ✅ "should block gopher:// protocol"

---

### 2. **AI Integration Tests** (5 failures with timeouts)

**Issue:** Tests timeout waiting for AI service responses.

**Location:** `test_cases/backend/integration/ai-integration.test.js`

**Root Cause:** No actual Ollama/Mistral/Bedrock service running during tests.

**Solution Options:**

**Option A:** Mock AI services (Recommended for CI/CD)
```javascript
// Add timeout and expect connection errors, not SSRF blocks
it('should allow Ollama on private Class C network', async () => {
  const response = await request(API_URL)
    .post('/api/ai/test-connection')
    .set('Authorization', `Bearer ${authToken}`)
    .send({
      provider: 'ollama',
      url: 'http://192.168.1.111:11434'
    })
    .timeout(5000); // Shorter timeout
  
  // Should NOT be blocked by SSRF (status 400 with securityReason)
  expect(response.body).not.toHaveProperty('securityReason', 'SSRF_PREVENTION');
  
  // May fail with connection error, which is OK for test
  // We're testing SSRF doesn't block, not that Ollama responds
});
```

**Option B:** Skip in CI, run manually with real service
```javascript
describe.skip('AI Integration Tests', () => {
  // Only run when AI services are available
});
```

---

### 3. **Email Functionality Tests** (13 failures)

**Issue:** Tests are working but slow, causing timeouts in CI.

**Location:** `test_cases/backend/integration/email-functionality.test.js`

**Solution:** Increase timeout and use mock SMTP when possible
```javascript
it('should handle invalid SMTP host', async () => {
  const response = await request(API_URL)
    .post('/api/messaging/test-email')
    .set('Authorization', `Bearer ${authToken}`)
    .send({
      emailConfig: {
        enabled: true,
        smtpHost: 'invalid.smtp.server.that.does.not.exist.com',
        // ...
      }
    })
    .timeout(15000); // Increase timeout to 15 seconds
  
  expect(response.status).toBe(200);
  expect(response.body.success).toBe(false);
});
```

---

### 4. **CSRF Session Tests** (2 failures)

**Issue:** Session cookies not being properly handled with supertest + running server.

**Location:** `test_cases/backend/integration/csrf-protection.test.js`

**Root Cause:** supertest with URL doesn't automatically handle cookies like importing app does.

**Solution:** Use cookie jar or import app directly
```javascript
import express from 'express';
// Import the actual app, don't use URL
const app = require('../../backend/server.js'); // If app is exported

// OR properly handle cookies:
const agent = request.agent(API_URL); // Use agent to maintain session
```

---

## 📋 Recommended Action Plan

### Phase 1: Quick Fixes (30 minutes)
1. ✅ Update SSRF tests to expect ALLOW for private IPs
2. ✅ Add `.skip()` to AI tests that need real services
3. ✅ Increase timeouts for email tests

### Phase 2: Proper Fixes (1-2 hours)
1. Refactor tests to import Express app directly (not use URLs)
2. Add proper cookie/session handling
3. Add mock AI services for testing
4. Add mock SMTP server for email tests

### Phase 3: CI/CD Integration (30 minutes)
1. Update GitHub Actions to start server before tests
2. Add test environment variables
3. Configure proper test timeouts

---

## 🚀 Immediate Actions

### For Local Testing:
```bash
# 1. Start server
cd backend
NODE_ENV=test npm start &

# 2. Wait for server
sleep 5

# 3. Run tests
npm run test:integration
```

### For GitHub Actions:
Already configured in workflows:
- `test-development.yml`
- `test-quality.yml`
- `test-preprod.yml`
- `test-main.yml`

**Need to add:** Server startup before running tests.

---

## 📝 Test Environment Variables Needed

```bash
# Test credentials
TEST_ADMIN_PASSWORD=Admin@2026
TEST_USER_PASSWORD=User@2026
TEST_ASSESSOR_PASSWORD=Assessor@2026

# API configuration
API_URL=http://localhost:3020
NODE_ENV=test

# Security settings (for tests)
ALLOW_PRIVATE_IPS=true
ALLOW_LOCALHOST=true
```

---

## 🎯 Expected Results After Fixes

**Before:**
- 57 passing, 31 failing

**After:**
- Should have 85+ passing
- Only 3-5 failing (due to external service unavailability)

---

## 📖 Related Documentation

- `test_cases/README.md` - Test overview
- `test_cases/TESTING_GUIDE.md` - How to run tests
- `docs/TESTING_STRATEGY.md` - Testing strategy
- `docs/AI_ARCHITECTURE_SECURITY.md` - Why private IPs are allowed

---

## ⚠️ Critical Note

**DO NOT** change the security implementation to make tests pass.  
**DO** update tests to match the correct security architecture.

**Architectural Decision:** Private IPs are ALLOWED for AI services.  
**Tests Must Reflect:** This architectural reality.

---

**Next Steps:**
1. Review this document
2. Decide: Quick fixes or proper refactor?
3. Execute chosen approach
4. Re-run tests
5. Update GitHub Actions if needed

---

**Status:** 📋 **Action Required**  
**Owner:** Development Team  
**Priority:** High (blocking CI/CD)
