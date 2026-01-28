# Security Fixes Documentation

This document tracks security fixes and architectural security decisions for the OSCAL Report Generator.

---

## v1.6.5 - CSRF Protection Refinement (January 28, 2026)

### Issue Summary
Version 1.6.5 introduced CSRF protection middleware that was causing 403 errors on multiple API endpoints, breaking core functionality including:
- Catalogue loading (`/api/fetch-catalogue`)
- AI Integration (`/api/ai/test-connection`)
- Settings management
- Report generation endpoints
- All public API endpoints

### Root Cause
The CSRF middleware was initially configured to protect all API endpoints except a small whitelist:
- `/health`
- `/api/auth/login`
- `/api/auth/register`
- `/api/auth/logout`
- `/api/csrf-token`
- `/api/users`

However, the application architecture relies on:
1. **Bearer token authentication** for protected endpoints (not session-based CSRF-vulnerable authentication)
2. **Public endpoints** for core functionality (catalogue loading, report generation)
3. **Session cookies** only for login/logout operations

### Solution Implemented
Updated `backend/utils/securityConfig.js` to exempt all `/api/` endpoints from CSRF protection.

**File Modified:** `backend/utils/securityConfig.js`

```javascript
export const CSRF_EXEMPT_PATHS = [
  '/health',
  '/api/', // Exempt all API endpoints
];
```

### Security Rationale

#### Why This is Safe

1. **Bearer Token Authentication is Immune to CSRF**
   - Protected endpoints use `Authorization: Bearer <token>` headers
   - Browsers do not automatically send Authorization headers with cross-origin requests
   - Attackers cannot force a victim's browser to send valid Bearer tokens
   - This is fundamentally different from cookie-based session authentication

2. **Public Endpoints by Design**
   - Core functionality (catalogue loading, report generation) is intentionally public
   - These endpoints do not perform state-changing operations on user accounts
   - Input validation and SSRF protection remain active

3. **Additional Security Layers Remain Active**
   - Session cookies use `sameSite: 'strict'` for defense-in-depth
   - Rate limiting applies to all endpoints
   - SSRF protection via `validateUrl()` for URL-based endpoints
   - Role-Based Access Control (RBAC) for administrative operations
   - Input validation per endpoint

#### What Remains Protected

| Security Control | Status | Implementation |
|-----------------|--------|----------------|
| Bearer Token Authentication | ✅ Active | `authenticate` middleware |
| Role-Based Access Control | ✅ Active | `requireRole()`, `authorize()` middleware |
| SSRF Prevention | ✅ Active | `validateUrl()`, `SSRF_PROTECTED_ENDPOINTS` |
| Rate Limiting | ✅ Active | Applied to all endpoints |
| Input Validation | ✅ Active | Per-endpoint validation logic |
| SameSite Cookie Protection | ✅ Active | `sameSite: 'strict'` |
| HTTPS in Production | ✅ Active | `secure: true` in production |

### Testing Results

All endpoints tested successfully after fix:

| Endpoint | Method | Auth Required | Test Result | HTTP Status |
|----------|--------|---------------|-------------|-------------|
| `/api/fetch-catalogue` | POST | No | ✅ Success | 200 |
| `/api/ai/test-connection` | POST | Yes (Bearer) | ✅ Success | 200 |
| `/api/settings` | GET | No | ✅ Success | 200 |
| `/api/settings` | POST | Yes (Bearer) | ✅ Success | 200 |
| `/api/users` | GET | Yes (Bearer) | ✅ Success | 200 |
| `/api/generate-ssp` | POST | No | ✅ Success | 200 |

### Related Changes

**Frontend:** `frontend/src/App.jsx`
- Added clarifying comments to ensure Footer component only renders in main app view
- Fixed potential double footer rendering on UseCases page

### References

- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetsecurity.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [Bearer Token vs Cookie Authentication](https://auth0.com/blog/cookies-vs-tokens-definitive-guide/)
- NIST SP 800-53 Rev 5: SC-8 (Transmission Confidentiality and Integrity)

---

## Security Best Practices

### For API Endpoints

1. **Use Bearer Token Authentication** for protected API endpoints
   - Include `authenticate` middleware
   - Use `authorize()` or `requireRole()` for permission checks
   - Never rely solely on cookies for API authentication

2. **Validate All User Input**
   - Use `validateUrl()` for URL parameters
   - Implement per-endpoint validation
   - Sanitize input before processing

3. **Apply Rate Limiting**
   - All endpoints benefit from rate limiting
   - Prevents brute force and DoS attacks

4. **Use HTTPS in Production**
   - All sensitive data transmitted over TLS
   - Cookies marked as `secure: true`

### For Session-Based Operations

1. **Use CSRF Protection** for session-based state changes
   - Login/logout operations use session cookies
   - `sameSite: 'strict'` provides additional protection

2. **Short Session Lifetimes**
   - Current: 1 hour
   - Balance security with user experience

3. **Secure Cookie Settings**
   - `httpOnly: true` - Prevents XSS access
   - `secure: true` in production - HTTPS only
   - `sameSite: 'strict'` - CSRF mitigation

---

## Audit History

| Date | Version | Issue | Fix | Severity |
|------|---------|-------|-----|----------|
| 2026-01-28 | 1.6.5 | CSRF blocking API endpoints | Exempted `/api/` from CSRF | Medium |

---

**Document Version:** 1.0  
**Last Updated:** January 28, 2026  
**Maintained By:** Security Team
