# Security Fixes - Kodiak Bot Findings

**Date**: January 23, 2026  
**Status**: ✅ RESOLVED  
**Severity**: Critical  
**Related PR**: AdobeManagedServices/OSCAL-Reports#9

## Executive Summary

This document details the security vulnerabilities identified by the Kodiak security bot and the comprehensive fixes implemented to address them. All **6 SSRF vulnerabilities** and **1 CSRF vulnerability** have been resolved with proper validation, middleware, and test coverage.

---

## 🔍 Issues Identified by Kodiak Bot

### 1. SSRF (Server-Side Request Forgery) - 6 Findings

**Severity**: Critical  
**CWE**: CWE-918  
**OWASP**: A10:2021 – Server-Side Request Forgery

#### Vulnerable Locations:
1. `backend/server.js:1048` - SAML metadata URL endpoint
2. `backend/server.js:1302` - API proxy fetch endpoint
3. `backend/server.js:1394` - OSCAL catalogue fetch endpoint
4. `backend/server.js:3657` - Mistral AI API test endpoint
5. `backend/server.js:3787` - Ollama test endpoint (tags)
6. `backend/server.js:3819` - Ollama test endpoint (generate)

#### Risk Description:
These endpoints accepted user-supplied URLs without validation, allowing attackers to:
- Access internal network resources (private IPs)
- Read cloud metadata endpoints (AWS: 169.254.169.254)
- Scan internal ports and services
- Bypass firewall rules
- Access localhost services
- Read local files (if file:// protocol allowed)

### 2. CSRF (Cross-Site Request Forgery) - 1 Finding

**Severity**: Critical  
**CWE**: CWE-352  
**OWASP**: A01:2021 – Broken Access Control

#### Vulnerable Location:
- `backend/server.js:1258` - API proxy endpoint and other state-changing endpoints

#### Risk Description:
State-changing endpoints lacked CSRF protection, allowing attackers to:
- Submit malicious requests on behalf of authenticated users
- Modify application settings
- Perform unauthorized actions
- Change user configurations

---

## ✅ Implemented Fixes

### 1. SSRF Prevention

#### A. URL Validation Utility (`backend/utils/urlValidator.js`)

Created comprehensive URL validation module with:

**Features:**
- ✅ Protocol validation (only HTTP/HTTPS allowed)
- ✅ Private IP range blocking (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
- ✅ Localhost blocking (127.0.0.1, ::1, localhost)
- ✅ Cloud metadata endpoint blocking (169.254.169.254)
- ✅ Link-local address blocking
- ✅ Dangerous protocol blocking (file://, gopher://, dict://, ftp://)
- ✅ DNS resolution with validation
- ✅ Credential-in-URL detection
- ✅ IPv6 support
- ✅ Configurable allowlist for development environments

**API:**
```javascript
// Async validation with DNS resolution
const result = await validateUrl(url, {
  allowPrivateIPs: false,
  allowLocalhost: false,
  skipDNSCheck: false,
});

// Sync validation (no DNS)
const result = validateUrlSync(url);

// Express middleware
app.post('/api/endpoint', validateUrlMiddleware('body', 'url'), handler);
```

**Blocked Ranges:**
- `10.0.0.0/8` - Private Class A
- `172.16.0.0/12` - Private Class B
- `192.168.0.0/16` - Private Class C
- `127.0.0.0/8` - Loopback
- `169.254.0.0/16` - Link-local / Cloud Metadata
- `0.0.0.0/8` - Current network
- `224.0.0.0/4` - Multicast
- `240.0.0.0/4` - Reserved
- `::1` - IPv6 loopback
- `fe80::/10` - IPv6 link-local
- `fc00::/7` - IPv6 unique local

#### B. Security Configuration (`backend/utils/securityConfig.js`)

Centralized security settings:
```javascript
export const SECURITY_CONFIG = {
  csrf: { enabled: true, ... },
  session: { secret: '...', ... },
  urlValidation: {
    allowLocalhost: process.env.ALLOW_LOCALHOST === 'true',
    allowPrivateIPs: process.env.ALLOW_PRIVATE_IPS === 'true',
    trustedDomains: ['github.com', 'nist.gov', ...],
  },
};

export const SSRF_PROTECTED_ENDPOINTS = [
  '/api/fetch-catalogue',
  '/api/proxy-fetch',
  '/api/saml/metadata-url',
  '/api/ai/test',
];
```

#### C. Updated Vulnerable Endpoints

**1. SAML Metadata Fetch** (`/api/sso/saml/fetch-metadata`)
```javascript
// BEFORE (Vulnerable)
const response = await axios.get(metadataUrl, { ... });

// AFTER (Protected)
const urlValidation = await validateUrl(metadataUrl, SECURITY_CONFIG.urlValidation);
if (!urlValidation.valid) {
  return res.status(400).json({
    error: 'Invalid or blocked URL',
    details: urlValidation.error,
    securityReason: 'SSRF_PREVENTION',
  });
}
const response = await axios.get(urlValidation.url, { ... });
```

**2. API Proxy** (`/api/proxy-fetch`)
```javascript
// BEFORE (Vulnerable)
const response = await axios({ url: url, ... });

// AFTER (Protected)
const urlValidation = await validateUrl(url, SECURITY_CONFIG.urlValidation);
if (!urlValidation.valid) {
  console.warn('🚫 SSRF attempt blocked:', url);
  return res.status(400).json({ ... securityReason: 'SSRF_PREVENTION' });
}
const response = await axios({ url: urlValidation.url, ... });
```

**3. Fetch Catalogue** (`/api/fetch-catalogue`)
```javascript
// BEFORE (Vulnerable)
const response = await axios.get(url, { ... });

// AFTER (Protected)
const urlValidation = await validateUrl(url, SECURITY_CONFIG.urlValidation);
if (!urlValidation.valid) {
  return res.status(400).json({ ... securityReason: 'SSRF_PREVENTION' });
}
const response = await axios.get(urlValidation.url, { ... });
```

**4-6. AI Test Endpoints** (`/api/ai/test-connection`)
- Mistral API test: URL validated before POST request
- Ollama tags test: URL validated before GET request
- Ollama generate test: Uses validated URL from previous step

### 2. CSRF Prevention

#### A. Dependencies Added
```json
{
  "dependencies": {
    "cookie-parser": "^1.4.6",
    "express-session": "^1.18.1",
    "csurf": "^1.11.0"
  }
}
```

**Note**: `csurf` is deprecated. Future enhancement should migrate to:
- `csrf-csrf` - Modern CSRF library
- `@fastify/csrf-protection` - For Fastify
- Custom double-submit cookie implementation

#### B. Middleware Setup (`backend/server.js`)

```javascript
// Cookie parser (required for CSRF)
app.use(cookieParser());

// Session management
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-in-production',
  name: 'oscal.sid',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 3600000, // 1 hour
  },
}));

// CSRF Protection
const csrfProtection = csrf({ cookie: { httpOnly: true, sameSite: 'strict' } });

// Conditional CSRF middleware
app.use((req, res, next) => {
  // Skip CSRF for exempted paths
  if (CSRF_EXEMPT_PATHS.includes(req.path)) return next();
  
  // Skip CSRF for safe methods (GET, HEAD, OPTIONS)
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  
  // Apply CSRF protection
  if (SECURITY_CONFIG.csrf.enabled) {
    csrfProtection(req, res, next);
  } else {
    next();
  }
});

// CSRF token endpoint
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});
```

#### C. Exempted Paths

The following paths do NOT require CSRF tokens:
- `/health` - Health check
- `/api/login` - Login endpoint
- `/api/register` - Registration endpoint
- `/api/csrf-token` - CSRF token fetch
- `/api/logout` - Logout endpoint

All GET/HEAD/OPTIONS requests are exempt (safe HTTP methods).

#### D. Frontend Integration (Required)

**Step 1**: Fetch CSRF token on app load
```javascript
const response = await fetch('/api/csrf-token');
const { csrfToken } = await response.json();
```

**Step 2**: Include token in POST/PUT/DELETE/PATCH requests
```javascript
fetch('/api/endpoint', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken,
  },
  credentials: 'include', // Important: include cookies
  body: JSON.stringify(data),
});
```

---

## 🧪 Test Coverage

### 1. Unit Tests (`test_cases/backend/unit/urlValidator.test.js`)

**Coverage**: 
- ✅ Valid public URLs acceptance
- ✅ Localhost blocking
- ✅ Private IP blocking
- ✅ Cloud metadata endpoint blocking
- ✅ Dangerous protocol blocking
- ✅ URL with credentials blocking
- ✅ Malformed URL rejection
- ✅ Configuration options (allowLocalhost, allowPrivateIPs)
- ✅ DNS resolution
- ✅ Synchronous validation
- ✅ IPv6 support
- ✅ Edge cases and bypass attempts

**Stats**: 50+ test cases covering all attack vectors

### 2. Integration Tests

#### A. SSRF Protection (`test_cases/backend/integration/ssrf-protection.test.js`)

Tests all 6 vulnerable endpoints:
- ✅ `/api/fetch-catalogue`
- ✅ `/api/proxy-fetch`
- ✅ `/api/sso/saml/fetch-metadata`
- ✅ `/api/ai/test-connection` (Ollama)
- ✅ `/api/ai/test-connection` (Mistral)

**Attack Scenarios Tested**:
- AWS metadata endpoint (169.254.169.254)
- Internal network scanning
- File system access attempts
- Redis/Memcached attacks (gopher://)
- URL encoding bypasses
- Credential injection

#### B. CSRF Protection (`test_cases/backend/integration/csrf-protection.test.js`)

**Coverage**:
- ✅ CSRF token generation
- ✅ Cookie security attributes
- ✅ Token validation
- ✅ Exempt endpoints
- ✅ Session management
- ✅ Attack scenario testing

**Stats**: 40+ test cases

### 3. Running Tests

```bash
# Unit tests
cd backend
npm run test:unit

# Integration tests
npm run test:integration

# All tests with coverage
npm run test:coverage

# Specific security tests
npm test -- urlValidator
npm test -- ssrf-protection
npm test -- csrf-protection
```

---

## 📋 Best Practices Validation

### Added to `.validation/best_practices.json`

**New Rules**:

1. **BP-SEC-006**: SSRF Prevention - Validate User-Supplied URLs
   - Pattern: Detects axios calls with user input
   - Severity: Critical
   - Mitigation: Use `validateUrl()` function

2. **BP-SEC-007**: SSRF Prevention - No Direct fetch() with User Input
   - Pattern: Detects fetch calls with user input
   - Severity: Critical

3. **BP-SEC-008**: CSRF Protection - Require CSRF Tokens
   - Pattern: Detects state-changing endpoints without CSRF
   - Severity: Critical
   - Mitigation: Use csrfProtection middleware

4. **BP-SEC-009**: SSRF Prevention - Dangerous IP Ranges
   - Pattern: Detects hardcoded private IPs
   - Severity: Critical

5. **BP-SEC-010**: Certificate Validation Disabled
   - Pattern: Detects rejectUnauthorized: false
   - Severity: Warning
   - Mitigation: Conditional based on NODE_ENV

### Running Validation

```bash
# Check for security issues
./validate_best_practices.sh

# Update validation rules
./update_best_practices.sh
```

---

## 🔒 Security Configuration

### Environment Variables

#### Development Environment (`.env.local`)
```bash
# Allow localhost for development
ALLOW_LOCALHOST=true
ALLOW_PRIVATE_IPS=true

# CSRF (optional disable for testing)
CSRF_ENABLED=true

# Session secret (change in production!)
SESSION_SECRET=dev-secret-change-me

# Node environment
NODE_ENV=development
```

#### Production Environment (`.env.production`)
```bash
# Production security - strict mode
ALLOW_LOCALHOST=false
ALLOW_PRIVATE_IPS=false

# CSRF protection (always enabled)
CSRF_ENABLED=true

# Strong session secret (use random 32+ char string)
SESSION_SECRET=<generate-secure-random-string>

# Production mode
NODE_ENV=production

# HTTPS required
FORCE_HTTPS=true
```

### Generating Secure Session Secret

```bash
# Generate random secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 🚀 Deployment Checklist

### Before Deploying to Production:

- [ ] Set `NODE_ENV=production`
- [ ] Generate and set strong `SESSION_SECRET`
- [ ] Ensure `ALLOW_LOCALHOST=false`
- [ ] Ensure `ALLOW_PRIVATE_IPS=false`
- [ ] Ensure `CSRF_ENABLED=true`
- [ ] Enable HTTPS (set `FORCE_HTTPS=true`)
- [ ] Run security tests: `npm run test:integration`
- [ ] Run validation: `./validate_best_practices.sh`
- [ ] Review logs for SSRF attempt warnings
- [ ] Update frontend to include CSRF tokens
- [ ] Test CSRF protection in staging
- [ ] Monitor for 400 errors (blocked SSRF attempts)

---

## 📊 Impact Assessment

### Before Fixes:
- ❌ 6 SSRF vulnerabilities (Critical)
- ❌ 1 CSRF vulnerability (Critical)
- ❌ No URL validation
- ❌ No CSRF protection
- ❌ Exposed to internal network attacks
- ❌ Cloud metadata access possible

### After Fixes:
- ✅ All SSRF vulnerabilities resolved
- ✅ CSRF protection implemented
- ✅ Comprehensive URL validation
- ✅ Private IP blocking
- ✅ Cloud metadata protection
- ✅ Test coverage: 90+ test cases
- ✅ Validation rules added
- ✅ Logging of attack attempts
- ✅ Configurable security levels
- ✅ Environment-based configuration

---

## 🔧 Future Enhancements

### Short-term:
1. **Migrate CSRF library**: Replace deprecated `csurf` with modern alternative
2. **Rate limiting**: Add rate limits to URL-based endpoints
3. **IP allowlisting**: Add trusted IP ranges for specific endpoints
4. **URL caching**: Cache validated URLs to improve performance

### Medium-term:
1. **Request signing**: Implement request signature verification
2. **Content Security Policy**: Add CSP headers
3. **Subresource Integrity**: Add SRI for external resources
4. **Security headers**: Helmet.js integration

### Long-term:
1. **Web Application Firewall**: Consider WAF integration
2. **Intrusion Detection**: Log analysis and alerting
3. **Security audit**: Regular third-party security audits
4. **Bug bounty**: Consider bug bounty program

---

## 📖 References

### OWASP Resources:
- [SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- [CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)

### CWE References:
- [CWE-918: Server-Side Request Forgery](https://cwe.mitre.org/data/definitions/918.html)
- [CWE-352: Cross-Site Request Forgery](https://cwe.mitre.org/data/definitions/352.html)

### Security Standards:
- OWASP Top 10 2021
- NIST SP 800-53 (SI-10: Information Input Validation)
- PCI DSS 6.5.10 (Broken Authentication and Session Management)

---

## ✍️ Change Log

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2026-01-23 | 1.0.0 | Initial security fixes implementation | Mukesh Kesharwani |
| | | - Added URL validator utility | |
| | | - Implemented CSRF protection | |
| | | - Updated 6 vulnerable endpoints | |
| | | - Added 90+ test cases | |
| | | - Added validation rules | |

---

## 👥 Contact

**Security Issues**: Report to security team immediately  
**Questions**: Refer to `docs/CONTRIBUTING.md`  
**Kodiak Bot**: See PR #9 for original findings

---

**Document Status**: ✅ COMPLETE  
**Security Status**: ✅ RESOLVED  
**Test Coverage**: ✅ COMPREHENSIVE  
**Production Ready**: ✅ YES (with deployment checklist completed)
