# Security Quick Reference Card

**For Developers** - Quick guide to security best practices in this project

---

## 🚨 When Adding New Endpoints

### Rule 1: ALWAYS Validate User-Supplied URLs

```javascript
import { validateUrl } from './utils/urlValidator.js';
import { SECURITY_CONFIG } from './utils/securityConfig.js';

app.post('/api/your-endpoint', async (req, res) => {
  const { url } = req.body;
  
  // ✅ CORRECT: Validate URL
  const urlValidation = await validateUrl(url, SECURITY_CONFIG.urlValidation);
  
  if (!urlValidation.valid) {
    return res.status(400).json({
      error: 'Invalid or blocked URL',
      details: urlValidation.error,
      securityReason: 'SSRF_PREVENTION',
    });
  }
  
  // Use validated URL
  const response = await axios.get(urlValidation.url);
  // ... rest of logic
});
```

### Rule 2: Use CSRF Protection for State-Changing Endpoints

```javascript
// ✅ CORRECT: POST/PUT/DELETE automatically protected
app.post('/api/endpoint', authenticate, async (req, res) => {
  // CSRF automatically checked by middleware
});

// ⚠️ EXCEPTION: If endpoint needs to bypass CSRF, add to CSRF_EXEMPT_PATHS
// in backend/utils/securityConfig.js (rare!)
```

---

## ❌ What NOT to Do

### ❌ NEVER: Use user input in URLs without validation

```javascript
// ❌ DANGEROUS - SSRF Vulnerability!
app.post('/api/fetch', async (req, res) => {
  const { url } = req.body;
  const response = await axios.get(url); // NO VALIDATION!
});
```

### ❌ NEVER: Allow these in user-supplied URLs

- `localhost`, `127.0.0.1`, `::1`
- Private IPs: `10.x.x.x`, `172.16.x.x`, `192.168.x.x`
- Cloud metadata: `169.254.169.254`
- Protocols: `file://`, `gopher://`, `dict://`, `ftp://`
- Credentials: `http://user:pass@...`

### ❌ NEVER: Disable SSL verification without good reason

```javascript
// ❌ BAD in production
httpsAgent: new https.Agent({
  rejectUnauthorized: false
});

// ✅ BETTER: Conditional
httpsAgent: new https.Agent({
  rejectUnauthorized: process.env.NODE_ENV === 'production'
});
```

---

## ✅ Quick Checklist for PRs

Before submitting a PR, ensure:

- [ ] No user-supplied URLs without `validateUrl()`
- [ ] No `axios.get/post(req.body.url)` without validation
- [ ] No `fetch(req.body.url)` without validation
- [ ] State-changing endpoints use POST/PUT/DELETE/PATCH
- [ ] Added tests if touching security-sensitive code
- [ ] No hardcoded private IPs in production code
- [ ] `rejectUnauthorized: false` only in development
- [ ] Ran `./validate_best_practices.sh`
- [ ] Tests pass: `npm test`

---

## 🧪 Testing Your Changes

### Run Security Tests

```bash
cd backend

# All security tests
npm test -- security

# SSRF tests
npm test -- ssrf

# CSRF tests
npm test -- csrf

# URL validator tests
npm test -- urlValidator
```

### Manual Testing

```bash
# Test SSRF protection (should be blocked)
curl -X POST http://localhost:3020/api/fetch-catalogue \
  -H "Content-Type: application/json" \
  -d '{"url": "http://169.254.169.254/"}'

# Expected: 400 with "SSRF_PREVENTION"
```

---

## 🔧 Common Scenarios

### Scenario 1: Fetching External OSCAL Catalogs

```javascript
app.post('/api/fetch-catalog', async (req, res) => {
  const { url } = req.body;
  
  // Validate
  const validation = await validateUrl(url, SECURITY_CONFIG.urlValidation);
  if (!validation.valid) {
    return res.status(400).json({
      error: validation.error,
      securityReason: 'SSRF_PREVENTION'
    });
  }
  
  // Safe to use
  const response = await axios.get(validation.url);
  res.json(response.data);
});
```

### Scenario 2: Proxy Requests (with extra caution)

```javascript
app.post('/api/proxy', async (req, res) => {
  const { url, method = 'GET' } = req.body;
  
  // Extra strict validation for proxies
  const validation = await validateUrl(url, {
    allowPrivateIPs: false,  // Never allow in proxies
    allowLocalhost: false,   // Never allow in proxies
  });
  
  if (!validation.valid) {
    console.warn('🚫 Proxy SSRF attempt blocked:', url);
    return res.status(400).json({ ... });
  }
  
  const response = await axios({ method, url: validation.url });
  res.json(response.data);
});
```

### Scenario 3: AI Service Configuration (development only)

```javascript
app.post('/api/ai/test', authenticate, requireRole(ADMIN), async (req, res) => {
  const { url } = req.body;
  
  // Allow localhost in development for testing local AI services
  const validation = await validateUrl(url, {
    allowLocalhost: SECURITY_CONFIG.urlValidation.allowLocalhost,
    allowPrivateIPs: SECURITY_CONFIG.urlValidation.allowPrivateIPs,
  });
  
  if (!validation.valid) {
    return res.status(400).json({ ... });
  }
  
  // ... test connection
});
```

---

## 🌍 Environment Configuration

### Development (`.env.local`)
```bash
# Development mode - more permissive
ALLOW_LOCALHOST=true
ALLOW_PRIVATE_IPS=true
CSRF_ENABLED=true
NODE_ENV=development
```

### Production (`.env.production`)
```bash
# Production - strict security
ALLOW_LOCALHOST=false
ALLOW_PRIVATE_IPS=false
CSRF_ENABLED=true
NODE_ENV=production
SESSION_SECRET=<32-char-random-string>
```

---

## 🚩 Red Flags in Code Review

When reviewing code, watch for:

🚩 `axios.get(req.body.url)` without validation  
🚩 `fetch(req.body.url)` without validation  
🚩 `new URL(userInput)` without subsequent validation  
🚩 `rejectUnauthorized: false` without conditional  
🚩 Hardcoded IPs like `192.168.x.x`  
🚩 Hardcoded credentials  
🚩 Empty catch blocks  
🚩 `eval()` usage  
🚩 `innerHTML` assignments  

---

## 📚 Documentation

- **Full Details**: [SECURITY_FIXES_KODIAK.md](SECURITY_FIXES_KODIAK.md)
- **Summary**: [../SECURITY_FIXES_SUMMARY.md](../SECURITY_FIXES_SUMMARY.md)
- **Tests**: [../test_cases/backend/](../test_cases/backend/)
- **Validation**: [../.validation/best_practices.json](../.validation/best_practices.json)

---

## 🆘 Need Help?

1. Check [SECURITY_FIXES_KODIAK.md](SECURITY_FIXES_KODIAK.md)
2. Look at existing implementations in `backend/server.js`
3. Review test cases for examples
4. Ask security team if unsure

---

## 🎯 Golden Rules

1. **Trust no input** - Validate everything from users
2. **Fail securely** - Block by default, allow explicitly
3. **Defense in depth** - Multiple layers of protection
4. **Least privilege** - Minimum permissions needed
5. **Log security events** - Track attack attempts
6. **Test security** - Write tests for security features
7. **Keep it simple** - Complex code has more bugs
8. **Update dependencies** - Patch vulnerabilities quickly

---

**Remember**: Security is everyone's responsibility! 🔒

When in doubt, **ASK** before merging. Better safe than sorry!
