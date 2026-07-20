---
concept: Mukesh Kesharwani
contact: mukesh.kesharwani@adobe.com
---

# Release 1.7.27 (July 20, 2026) — Job auth, deploy resilience, API guard tests

Permanent record for **Development → Quality** promotion. Prevents regression of **VULN-37000** and production **502** incidents during AMI/ASG refresh.

**Related:** [CHANGELOG.md](CHANGELOG.md) · [SECURITY.md](SECURITY.md) · [AWS_OPERATIONS.md](AWS_OPERATIONS.md)

---

## Executive summary

| Area | Ticket / driver | Outcome |
|------|-----------------|--------|
| Job auth / IDOR / DoS | VULN-37000 (pentest) | Auth + ownership on all async job routes; rate limits; metadata redaction |
| Deploy 502 | Production incident (Jul 2026) | Passive-first Blue/Green deploy; maintenance state dir fix; post-refresh S3 deploy |
| API auth inventory | Proactive | Static route audit test + public-endpoint allowlist |
| Footer / manifest | Version drift | Reconcile all `package.json` copies from S3 installer manifest |

---

## 1. Async job authorization (VULN-37000)

### Root cause

- `POST /api/jobs/pdf`, `/excel`, `/ccm` used `optionalAuth` (anonymous job creation).
- `GET /api/jobs/:jobId` and `/download` had no auth or ownership check (IDOR via UUID).
- Status responses included `metadata.ip` and full job `data`.

### Fix (code)

| Component | Change |
|-----------|--------|
| `backend/utils/jobAccess.js` | `canAccessJob`, `sanitizeJobForClient`, structured security logging |
| `backend/server.js` | `authenticate` on create/status/download; `jobCreationRateLimiter`; concurrent cap middleware |
| `backend/jobQueue.js` | `countActiveJobsForUser`, `MAX_CONCURRENT_JOBS_PER_USER = 5` |
| Tests | `jobs-auth-idor.test.js`, `jobAccess.test.js` |

### Prevention

- [ ] Unauthenticated `POST /api/jobs/pdf` → **401**
- [ ] User B cannot `GET /api/jobs/{userA-jobId}` → **403**
- [ ] Status JSON must not contain `metadata.ip` or `data`
- [ ] `npm test -- jobs-auth-idor jobAccess api-auth-inventory` passes in CI

---

## 2. Deploy resilience (502 prevention)

### Root cause

- ASG AMI refresh replaced active Blue without S3 installer deploy.
- Default deploy targeted passive role only while ALB pointed at replaced instance.
- `deploy-maintenance.sh` wrote state files before creating role subdirectories.

### Fix

| Component | Change |
|-----------|--------|
| `scripts/deploy-to-ec2.sh` | `deploy_passive_first_both()`; manifest reconcile for root/backend/frontend `package.json` |
| `scripts/lib/deploy-maintenance.sh` | Safe state dir creation and read |
| `scripts/oscal-staggered-ami-refresh.sh` | Pre-failover + optional post-refresh deploy |

### Prevention

- [ ] After AMI refresh: `/health/ready` **200** on production URL
- [ ] Footer shows installer manifest version (all three `package.json` aligned)

---

## 3. Proactive API auth inventory

| Component | Change |
|-----------|--------|
| `test_cases/backend/unit/api-auth-inventory.test.js` | Parses `server.js`; fails on unauthenticated `:param` routes and mutating `/api/*` |
| `test_cases/backend/fixtures/public-api-allowlist.json` | Documents intentionally public endpoints |

Sync export routes (`/api/generate-pdf`, etc.) remain allowlisted — track separately if pentest scope expands.

---

## 4. Release checklist (Quality → main)

- [ ] `grep '"version":' package.json backend/package.json frontend/package.json test_cases/backend/package.json` → **1.7.27**
- [ ] UI footer shows **v1.7.27** (reads `frontend/package.json` via `buildInfo.js`)
- [ ] `./scripts/deploy-to-ec2.sh --update-s3` writes `installer/.installer-build.json` with **1.7.27**
- [ ] Pentest retest VULN-37000 steps 1–4 on staging/production
- [ ] Jira VULN-37000 → **Remediated – Pending Retest** after deploy

---

**Version:** 1.7.27 · **Last updated:** July 20, 2026
