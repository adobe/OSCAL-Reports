---
concept: Mukesh Kesharwani
contact: mukesh.kesharwani@adobe.com
---

# Release 1.7.25 (July 18, 2026) — Security, InfraSec, and AMS Non-Prod

Permanent record of work completed on **2026-07-18** for the OSCAL Report Generator (`adobe/OSCAL-Reports`, branch **Development**). Use this document during **Quality → main** promotion so identified issues do not regress in future releases.

**Related:** [CHANGELOG.md](CHANGELOG.md) · [SECURITY.md](SECURITY.md) · [GIT_AND_RELEASE.md](GIT_AND_RELEASE.md#ams-non-prod-regression-prevention) · [terraform/envs/aws4403/README.md](../terraform/envs/aws4403/README.md)

---

## Executive summary

| Area | Ticket / driver | Outcome |
|------|-----------------|--------|
| Dependencies | Dependabot (#45–#61 lineage) | Accept latest proposed library versions; lockfiles updated |
| SSRF | VULN-36986 (pentest) | Strict URL validation, auth on proxy endpoints, no redirects |
| Settings disclosure | VULN-36998 (pentest) | Admin-only full settings; runtime allowlist endpoint; SMTP retired |
| Bedrock abuse | VULN-37020 | Settings redaction, Terraform ExternalId gate, hardened runbook |
| Image Factory AMI | SSAAU-216 | Dynamic EMR lookup → **IF 3.0.2** (`ami-036bb3d5f242f68c0`), staggered ASG refresh |
| Splunk SCC | SSAAU-212 | Idempotent UF bootstrap (`deploymentclient.conf` + secops metadata) |
| Registry / paths | Release 1.7.25 baseline | GHCR `ghcr.io/adobe/oscal-report-generator`, canonical repo URLs |

---

## 1. Dependency updates (Dependabot)

### What changed

- Root, `backend/`, and `frontend/` `package.json` / `package-lock.json` aligned with Dependabot bumps on **Development** (AWS SDK, `express-rate-limit` 8.x, React toolchain, GitHub Actions, security overrides e.g. `exceljs` → `uuid@14.0.1` for CVE-2026-41907).
- Resolve merge conflicts by **accepting the newer Dependabot version** unless a breaking API change is documented in CHANGELOG.

### Prevention

- [ ] Before release PR: `npm audit --audit-level=high` in root, `backend/`, `frontend/`.
- [ ] Run `cd test_cases/backend && npm test` after any Dependabot merge.
- [ ] Do not hand-edit one lockfile without updating sibling manifests.

---

## 2. SSRF remediation (VULN-36986)

### Root cause

- `/api/proxy-fetch` and `/api/fetch-catalogue` were reachable without session auth.
- `allowLocalhost` / `allowPrivateIPs` applied to public proxy paths; hex-encoded IPs bypassed checks.
- Axios followed redirects without re-validation (IMDS / internal pivot).

### Fix (code)

| Component | Change |
|-----------|--------|
| `backend/utils/securityConfig.js` | `SSRF_VALIDATION_PROFILES`: `strictUserFetch`, `strictCatalogueFetch`, `aiIntegration` |
| `backend/utils/urlValidator.js` | Encoded-IP rejection, optional `requireTrustedDomain`, `ipaddr.js` parsing |
| `backend/utils/safeAxios.js` | SSRF-strict interceptor; reject redirects on protected calls |
| `backend/utils/proxyFetchHelpers.js` | GET/HEAD only, header allowlist, no IMDS token forwarding |
| `backend/server.js` | `authenticate` on proxy-fetch / fetch-catalogue; `maxRedirects: 0` |
| Frontend | `authenticatedFetch.js`; auth headers on settings/catalogue/proxy callers |
| Tests | `urlValidator-ssrf-remediation.test.js`, `proxyFetchHelpers.test.js`, `ssrf-auth-endpoints.test.js` |

### Prevention

- [ ] Never add `allowPrivateIPs: true` to **public** URL fetch endpoints.
- [ ] All new server-side fetch of user URLs must use `validateUrl()` with the correct profile and `safeAxios`.
- [ ] Regression tests in `test_cases/backend/unit/urlValidator-ssrf-remediation.test.js` must pass in CI.
- [ ] Pen-test retest: unauthenticated `POST /api/proxy-fetch` → **401**; `http://0x7f000001/` → **400** / `SSRF_BLOCKED`.

---

## 3. Cross-account Bedrock access control (VULN-37020)

### Root cause

Chained from SSRF: stolen IMDS creds → `sts:AssumeRole` → unscoped Bedrock invoke with weak logging.

### Fix (code)

| Component | Change |
|-----------|--------|
| `GET /api/settings` | Requires `authenticate` + **`EDIT_SETTINGS` (Platform Admin)**; secrets masked; non-admin → **403** |
| `GET /api/settings/runtime` | Authenticated allowlist only (`databaseConfig.enabled`, `publishedSoaUrl`) |
| `backend/utils/resolveStoredSecret.js` | `applyRoleBasedConfigRedaction()` |
| `terraform/bedrock_cross_account.tf` | IAM assume policy gated on `bedrock_cross_account_ready` (needs `bedrock_external_id`) |
| `docs/CROSS_ACCOUNT_BEDROCK_PHASE1.md` | Trust policy, invoke scope, logging, Guardrails, CloudTrail guidance |

### Prevention

- [ ] **`bedrock_external_id` must be set** in `terraform.tfvars` when `bedrock_cross_account_enabled = true` (Terraform validation enforces this).
- [ ] Non-admin users must not receive `bedrockAssumeRoleArn` / `bedrockExternalId` from API (test: `settingsRedaction.test.js`).
- [ ] Account B: enable Bedrock model invocation logging and review CloudTrail for `oscal-bedrock-session`.
- [ ] After SSRF fixes deploy, rotate instance credentials if pentest occurred on production paths.

---

## 4. Settings disclosure and SMTP retirement (VULN-36998)

### Root cause

- Production `GET /api/settings` returned the **full application configuration** without authentication (CWE-200 / CVSS 8.2), exposing database parameters, OIDC/SSO settings, group-to-role mappings, Bedrock ARNs, and legacy SMTP configuration.
- Authenticated non-admin users could still receive full settings metadata before hardening.
- `POST /api/settings` success responses included unredacted config and server filesystem paths.

### Fix (code)

| Component | Change |
|-----------|--------|
| `GET /api/settings` | `authenticate` + `authorize(EDIT_SETTINGS)` — Platform Admin only |
| `GET /api/settings/runtime` | Authenticated allowlist: `databaseConfig.enabled`, `publishedSoaUrl` |
| `backend/utils/settingsClientResponse.js` | Admin/runtime/save response builders + structured audit logging |
| `POST /api/settings` | Redacted `config` in response; `verification.configPath` server-side only |
| Frontend | Settings UI gated to Platform Admin; runtime callers use `/api/settings/runtime` |
| `backend/messagingService.js` | **Slack-only** credential delivery; SMTP/email removed |
| `backend/server.js` | Removed `POST /api/messaging/test-email` and `POST /api/auth/self-register` |
| `backend/configManager.js` | Strips legacy `messagingConfig.email` on load; Slack-only defaults |
| `terraform/security_groups.tf` | Removed SMTP egress (TCP 25/465/587) |

### Removed (product)

- SMTP/email notifications and `nodemailer` backend dependency.
- Self-registration endpoint — use SSO JIT or admin user creation.

### Prevention

- [ ] Pen-test retest: unauthenticated `GET /api/settings` → **401**; User/Assessor token → **403**; `GET /api/settings/runtime` with auth → **200** with allowlist only (no `ssoConfig`, DB host, etc.).
- [ ] Regression tests: `settings-auth-disclosure.test.js`, `settingsRedaction.test.js`, updated `csrf-api.test.js`.
- [ ] After deploy: **rotate** any credentials exposed in the pentest report (legacy SMTP app password, OIDC client secrets); review OAuth redirect URIs in Okta Admin Console (remove localhost/private IP patterns from production).

---

## 5. Image Factory EMR AMI (SSAAU-216)

### Root cause

Blue ASG instance ran stale EMR **1.12.1** AMI (`ami-04cc19ba379e0e7b6`) while Image Factory published **3.0.2**.

### Fix (infra)

- `image_factory_dynamic_emr_lookup_enabled = true` (newest shared EMR at plan/apply).
- `oscal_ami_auto_refresh_on_change = true` → staggered Green then Blue refresh via `scripts/oscal-staggered-ami-refresh.sh`.
- **Deployed (2026-07-18):** `ami-036bb3d5f242f68c0` — `IF_Amazon-Linux-2023-EMR_aws_3.0.2`.

### Verification

```bash
export TERRAFORM_DIR=$PWD/terraform/envs/aws4403 AWS_PASS_ENTRY=AWS/AMS_4403-STG
./scripts/check-ami-drift.sh
terraform output oscal_resolved_ami_id   # must match latest EMR candidate
```

### Prevention

- [ ] Weekly: `./scripts/check-ami-drift.sh` (or `.github/workflows/ami-drift-check.yml` on fork).
- [ ] On InfraSec ticket: `terraform plan` → confirm launch template AMI change → apply with `oscal_ami_auto_refresh_on_change = true`.
- [ ] Never pin stale `ami-*` when dynamic lookup is available unless freezing for a documented exception.
- [ ] Post-refresh: `./scripts/deploy-to-ec2.sh --both` and ALB `/health/ready`.

---

## 6. Splunk SCC syslog (SSAAU-212)

### Root cause (diagnosis on `i-06c2d9fd5aa19e872`, 2026-07-18)

- Splunk UF **9.3.11** installed (Image Factory EMR) but **`DC-seclogs/local/deploymentclient.conf` missing**.
- UF could not phone home to `ds2.splunk.adobe.net:443`; Security SCC reported **"No log found in Splunk"**.
- Meta fields existed in journald stanzas but not the required `00-secops_meta_app` deployment-client path.

### Fix (code)

| File | Purpose |
|------|---------|
| `terraform/templates/oscal-splunk-uf-bootstrap.sh.tftpl` | Idempotent UF config (IMDS instance id, deployment server, restart) |
| `terraform/oscal_splunk.tf` | Variables + user-data + SSM post-boot integration |
| `terraform/oscal_instances.tf` | Bootstrap at first boot (after SSM agent start) |
| `terraform/oscal_ssm.tf` | Re-run bootstrap + handshake check every 30 min (when association enabled) |

**Terraform variables (defaults):**

```hcl
oscal_splunk_uf_bootstrap_enabled = true
oscal_splunk_deployment_server    = "ds2.splunk.adobe.net:443"
oscal_splunk_client_name          = "DC-ue1-journald_seclogs-ams-oscal"  # AL2023 journald
oscal_splunk_uf_min_version       = "9.3.9"
```

### Verification

On instance (SSM Session Manager):

```bash
cat /opt/splunkforwarder/etc/apps/DC-seclogs/local/deploymentclient.conf
cat /opt/splunkforwarder/etc/apps/00-secops_meta_app/local/inputs.conf
grep 'DC:HandshakeReplyHandler - Handshake done' /opt/splunkforwarder/var/log/splunk/splunkd.log
```

Allow **up to 30 minutes** after bootstrap for deployment-server handshake.

### Prevention

- [ ] Keep `oscal_splunk_uf_bootstrap_enabled = true` in `terraform/envs/aws4403/terraform.tfvars`.
- [ ] Enable `oscal_ssm_post_boot_association_enabled = true` so existing instances self-heal without full ASG recycle.
- [ ] After every ASG instance replacement, confirm `deploymentclient.conf` exists before closing SSAAU-212.
- [ ] `clientName` must include **`journald_seclogs`** on Amazon Linux 2023 (no rsyslog).
- [ ] `_meta` must include `meta_cloud_id::<account-id>` and `meta_instance_id::<i-...>` (not `unknown`).
- [ ] If UF cannot reach `hf3`/`ds2` (errno 104): verify egress SG and Emissary whitelist (account-level; already satisfied for AWS4403).

---

## 7. Release checklist (must pass before Quality → main)

### Application

- [ ] `npm test` in `test_cases/backend` (include SSRF, settings auth disclosure, settings redaction, securityConfig suites).
- [ ] No direct `import axios from 'axios'` in `backend/` (except `safeAxios.js`).
- [ ] Version aligned: root, `backend/`, `frontend/`, `test_cases/backend/` `package.json`.

### AWS4403 Non-Prod

- [ ] `check-ami-drift.sh` → OK (deployed AMI = latest EMR).
- [ ] ALB `https://<alb>/health/ready` → 200.
- [ ] Splunk: `deploymentclient.conf` + handshake or pending (<30 min) documented.
- [ ] `bedrock_external_id` set before re-enabling cross-account Bedrock in tfvars.

### Documentation

- [ ] [CHANGELOG.md](CHANGELOG.md) entry for release version.
- [ ] [SECURITY.md](SECURITY.md) vulnerability history updated.
- [ ] This file reviewed and still accurate.

---

## 8. Open follow-ups

| Item | Owner | Notes |
|------|-------|-------|
| Zeus auto-close SSAAU-216 / SSAAU-212 | Security scan | ~2–4 days after fix verification |
| Rotate pentest-exposed credentials (VULN-36998) | Platform / IdP admin | SMTP app password (legacy), OIDC secrets; Okta redirect URI cleanup |
| `bedrock_external_id` in tfvars | Platform / Account B | Required to re-enable `bedrock_cross_account_enabled` |
| Account B Bedrock logging + trust policy tighten | Account B ops | See `CROSS_ACCOUNT_BEDROCK_PHASE1.md` |
| Splunk handshake on fresh instances | Ops | Wait 30 min; open LOGREQ if persistent errno 104 to hf3 |

---

**Version:** 1.7.25 · **Last updated:** July 18, 2026
