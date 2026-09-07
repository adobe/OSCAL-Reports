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

#### Config secrets (_cfgenc and AWS SM)

- **EC2 (production):** Sensitive platform settings (Slack webhook URL, AI tokens, SSO client secrets) use **`OSCAL_SECRETS_MODE=aws-sm`** and a single AWS Secrets Manager JSON bundle; `config.json` holds `{ "_sm": "OSCAL/..." }` pointers only. Saves **fail** if SM is unavailable (no plaintext fallback). Startup auto-migrates any plaintext to SM. See **`backend/utils/secretsManager.js`** and **`backend/utils/configSecretMigration.js`**.
- **Local / Docker / offline:** Secrets are stored as **`{ "_cfgenc": "v1$..." }`** envelopes in `config.json` using PBKDF2-SHA256 + AES-256-GCM (`backend/utils/configFieldCrypto.js`). Set **`OSCAL_CONFIG_FIELD_SECRET`** or **`SESSION_SECRET`**. Docker entrypoint generates and persists keys under `/data/.field-secret` and `/data/.session-secret`. **Pass vault is not required.**
- **Optional operator tooling:** The laptop pass vault is optional; set **`OSCAL_PASS_DISABLED=1`** in Docker (default in compose).
- **Never commit** plaintext secrets; use `config.json.example` pointers or `_cfgenc` placeholders only.

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
- **Settings API (VULN-36998):** `GET /api/settings` requires authentication and **Platform Admin** (`EDIT_SETTINGS`); returns full config with secret masking only. `GET /api/settings/runtime` requires authentication and returns an allowlisted subset (`databaseConfig.enabled`, `publishedSoaUrl`) for non-admin app features. Unauthenticated requests receive **401**; non-admin full-settings requests receive **403**. POST `/api/settings` responses omit server filesystem paths and redact secrets in returned `config`.

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

### CSRF Refinement (January 2026)
- **Issue**: CSRF middleware caused 403 on many API endpoints.
- **Fix**: API routes under `/api/` exempted; Bearer token used for API (CSRF not applicable). State-changing browser flows still use CSRF tokens.

### v1.7.27 – Async job auth / IDOR / DoS (VULN-37000) (July 2026)
- **Issue:** Unauthenticated async job creation (`optionalAuth`); job status/download accessible by UUID without ownership check; requester IP in status JSON; job flooding DoS.
- **Fix:** `authenticate` on all job routes; `canAccessJob` owner-or-Platform-Admin checks; `sanitizeJobForClient`; per-user rate limit and concurrent job cap. See [CHANGELOG.md](CHANGELOG.md#1727---2026-07-20).
- **Post-deploy:** Pentest retest steps 1–4; Jira → Remediated – Pending Retest.

### v1.7.25 – Settings disclosure (VULN-36998) (July 2026)
- **Issue:** Unauthenticated `GET /api/settings` returned full platform configuration (DB, SSO, group mappings, Bedrock ARNs, legacy SMTP). CWE-200; CVSS 8.2 on production pentest.
- **Fix:** Platform Admin required for full settings; `GET /api/settings/runtime` for allowlisted runtime flags; POST save responses redacted; SMTP/email and self-registration removed. See [CHANGELOG.md](CHANGELOG.md#1725---2026-07-18).
- **Post-deploy:** Rotate exposed credentials; review OAuth redirect URIs in Okta Admin Console.

### v1.7.25 – SSRF and proxy endpoints (VULN-36986) (July 2026)
- **Issue**: Unauthenticated `/api/proxy-fetch` and `/api/fetch-catalogue` allowed SSRF (hex IP bypass, redirect to IMDS).
- **Fix**: Session auth required; `strictUserFetch` / `strictCatalogueFetch` profiles; no redirects on protected axios calls; encoded-IP rejection. See [CHANGELOG.md](CHANGELOG.md#1725---2026-07-18).

### v1.7.25 – Cross-account Bedrock exposure (VULN-37020) (July 2026)
- **Issue**: Stolen instance creds could assume cross-account Bedrock role; settings API leaked role ARN to non-admins.
- **Fix**: Settings redaction; Terraform requires `bedrock_external_id` when cross-account enabled; Account B runbook for logging and trust policy. See [CROSS_ACCOUNT_BEDROCK_PHASE1.md](CROSS_ACCOUNT_BEDROCK_PHASE1.md).

### v1.7.25 – AMS Non-Prod InfraSec (SSAAU-216 / SSAAU-212) (July 2026)
- **SSAAU-216:** Stale Image Factory EMR AMI → dynamic lookup + ASG refresh to IF **3.0.2**.
- **SSAAU-212:** Splunk UF installed but missing `deploymentclient.conf` → automated bootstrap in Terraform user-data/SSM. See [terraform/envs/aws4403/README.md](../terraform/envs/aws4403/README.md).

---

## References

- [OWASP Top 10 2025](https://owasp.org/Top10/)
- [OWASP API Security Top 10](https://owasp.org/API-Security/)
- [OWASP GenAI Top 10](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
- [AI integration – architecture and security](AI_INTEGRATION.md#ai-integration-architecture-security-design)

---

**Version:** 1.7.27 · **Last updated:** July 2026
