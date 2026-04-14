# Security – OWASP Compliance and Implementation

**Unified security documentation: OWASP compliance, implementation review, and vulnerability history.**

---

## Table of Contents

- [OWASP Compliance Summary](#owasp-compliance-summary)
- [Security Features](#security-features)
- [Vulnerability History](#vulnerability-history)
- [References](#references)

---

## OWASP Compliance Summary

| Standard | Status | Notes |
|----------|--------|--------|
| **OWASP Top 10 2025** | ✅ 10/10 | All categories addressed |
| **OWASP API Security Top 10** | ✅ 10/10 | Including DoS prevention |
| **OWASP GenAI Top 10** | ✅ 10/10 | No new AI attack surface |

---

## Security Features

### Access Control (A01)
- **RBAC**: Testing Objective and Testing Method require Assessor role.
- **Enforcement**: Frontend disables fields; backend validates with `authenticate`, `authorize`, `requireRole`.
- **Auth**: Session-based + Bearer token; role checked on every request.

### Cryptography & Session (A02, A07)
- **HTTPS** in production; secure cookies: `httpOnly`, `sameSite: 'strict'`, `secure` in production.
- No sensitive data in cookies; session timeout configured.

#### Password storage (PBKDF2 and legacy SHA-256 migration)

- **Current storage format**: New and rotated passwords are stored as **PBKDF2-SHA256** with random salt and **100,000 iterations** (`pbkdf2$sha256$...` prefix). Implementation: `backend/auth/userManager.js` (`hashPassword` / `verifyPassword`).
- **Legacy format**: Older rows may still hold a **single-round SHA-256 hex** of the password (64 hex characters, no `pbkdf2$` prefix). Verifying those rows **requires** the same digest algorithm until each user successfully signs in once with the correct password.
- **Automatic upgrade**: On successful password authentication, if the stored value is legacy format, **`migratePasswordToPBKDF2`** rewrites the stored hash to PBKDF2. No user action beyond normal login.
- **Removal gate**: When **no** users remain on legacy format in all environments you operate (see Platform Admin **GET `/api/users/legacy-password-hash-stats`**), the legacy verification branch in `verifyPassword` may be deleted; until then, removing it would lock out any account still on legacy hashes.
- **Static analysis (CodeQL `js/insufficient-password-hash`)**: Tools flag any `createHash('sha256')` used with password material. Here that call exists **only** for backward-compatible verification of **already stored** legacy digests, not for new storage. **Governance**: document this transitional behavior; use GitHub “won’t fix” / dismissal with the same narrative if the alert persists until the legacy branch is removed after migration completes.

### Injection & Input (A03, A05)
- **Sanitization**: User input sanitized for OSCAL; no raw user input in queries or commands.
- **No SQL**: Data in JSON files and client storage; no command execution with user input.
- **Output encoding** for context (HTML, OSCAL).

### Design & Misconfiguration (A04, A05)
- Secure defaults; optional fields; separation of SAR vs SSP.
- No stack traces to users; generic error messages in production.

### Logging & Errors (A09, A10)
- **Security logging**: Auth success/failure, access denied, validation failures.
- **Structured logs** with OpenTelemetry-style attributes; no secrets in logs.
- **Error handling**: Specific exceptions; generic user-facing messages.

### API & DoS (API4)
- **Request limits**: Export payloads use configurable caps (default 10,000 controls, 512KB metadata); set `OSCAL_EXPORT_MAX_CONTROLS` and `OSCAL_EXPORT_MAX_METADATA_BYTES` for large catalogs. Same checks apply to CCM/Excel/PDF and async job routes.
- **Rate limiting**: 100 requests per 15 minutes per IP.
- **Timeout**: 240-second server timeout.

### CSRF
- **Token-based** CSRF for state-changing browser requests.
- **API endpoints** use Bearer token (CSRF not applicable); architecture documented for scanner suppression.

---

## Vulnerability History

### v1.6.7 – AWS SDK / fast-xml-parser DoS (February 2026)
- **Issue**: fast-xml-parser DoS (CVE-2026-25128); transitive via `@aws-sdk/xml-builder`.
- **Scope**: AWS Bedrock integration only (optional).
- **Fix**: `fast-xml-parser` 5.2.5 → 5.3.4; `@aws-sdk/xml-builder` updated. `npm audit`: 0 vulnerabilities.
- **Action**: If using AWS Bedrock, run integration tests after upgrade.

### v1.6.5 – CSRF Refinement (January 2026)
- **Issue**: CSRF middleware caused 403 on many API endpoints.
- **Fix**: API routes under `/api/` exempted; Bearer token used for API (CSRF not applicable). State-changing browser flows still use CSRF tokens.

---

## References

- [OWASP Top 10 2025](https://owasp.org/Top10/)
- [OWASP API Security Top 10](https://owasp.org/API-Security/)
- [OWASP GenAI Top 10](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
- [AI Architecture and Security](AI_ARCHITECTURE_SECURITY.md)

---

*Last updated: April 2026*
