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
- **Request limits**: Max 1000 controls per SAR/SSP request; 100KB metadata limit.
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

*Last updated: February 2026*
