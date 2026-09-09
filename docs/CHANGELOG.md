# Changelog

## [1.8.02] - 2026-09-09

### Changed
- Added filters in Multireport Comparision and fixed the long running githb actions workflows
Full release history. Deep operational reference material previously kept in standalone
`RELEASE_1.7.*.md` files is consolidated here — see the Appendices at the end for the Splunk /
Security SCC runbook (SSAAU-212) and the cross-account Bedrock SCP escalation.

## [1.8.01] - 2026-09-08

### Fixed

- **Docker production image crash-loop on startup** (`ENOENT: /config/constants/roles.json`): the 1.8.00 Dockerfile only copied `config/constants/` into the discarded `frontend-builder` stage, never into the `production` stage that actually ships. `backend/auth/roles.js` loads `getRoles()` at module import time, so every 1.8.00 container crashed immediately, before the HTTP server could bind — taking down both direct (`:3019`) and reverse-proxied access. Also fixed the same latent gap for `config/catalogues/sample-catalogues.json` (not yet crashing, since `sampleCatalogues.js` lazy-loads it, but would 500 on first catalogue-list request). The production stage now copies both `config/constants/` and `config/catalogues/` to the absolute paths (`/config/constants`, `/config/catalogues`) that `backend/utils/constants.js` and `backend/utils/sampleCatalogues.js` resolve to at runtime.

## [1.8.00] - 2026-09-08

Catalogue library expansion + an app-wide "single source of truth" refactor for shared
reference data. (Builds on the 1.7.31 responsive-UI work below.)

### Added

- **New sample catalogues (+8):** FedRAMP Rev 5 (High/Moderate/Low/LI-SaaS) from the OSCAL Foundation repo, and CMS ARS 5.0 (Full catalog + High/Moderate/Low) — all fetch-validated. The preset list is now **25 catalogues across 7 publishers** (ACSC, BSI, CCCS, CMS, FedRAMP, GovTech SG, NIST).
- **"New" / "Updated" badges** and a **country flag** for non-English catalogues (🇩🇪 BSI Grundschutz++) in both catalogue pickers, driven by `status`/`flag` fields in the manifest.
- **Shared constants module** `config/constants/*.json` (control-status, classification-levels, system-status, service-models, roles), read by both tiers via `backend/utils/constants.js` and `frontend/src/constants/*` — the single-source pattern already used for catalogues.

### Fixed

- **BSI Grundschutz++ catalogue URL** was 404 (repo restructured) → repointed to `control_layer/Grundschutz++/Grundschutz++-resolved_catalog.json`.
- **Australian ISM baselines** updated from `v2025.10.8` to the latest release `v2026.09.4`; the Protected baseline was pinned off a moving branch onto the tag (consistent with the others).
- **"Supported Catalogs" copy no longer drifts** — the 3 hardcoded prose lists on the landing/choice screens are now derived from the catalogue manifest.
- **Control-status duplication removed** (was defined 6+ times FE+BE). Two latent bugs fixed in the process: the bulk-status list in `ControlsList` only mapped 4 of 7 statuses; and SAR generation classified **`alternate-control` as not-satisfied** — it now maps to satisfied via the shared OSCAL mapping.

### Changed

- **De-duplicated shared reference data** onto the new constants module: classification levels + framework detection (`SystemInfoForm`), role name strings (`backend/auth/roles.js` + frontend `AuthContext`), system lifecycle status (dropdown, PDF labels, and 6 scattered `under-development` defaults), and cloud service models (`MultiReportComparison`, `comparisonReportPrefs`).

## [1.7.31] - 2026-09-08

### Changed

- **Responsive layout system (frontend):** added `frontend/src/styles/layout.css` — fluid, viewport-relative design tokens (`--content-wide`, `--content-readable`, `--gutter`, `--section-gap`, `--panel-max-h`, `--tile-min`), utility classes (`.container-wide` / `.container-readable` / `.fluid-grid` / `.panel-scroll`), and an optional `<PageSection>` wrapper. All screens now use the full viewport width and auto-adapt to monitor size; the hard-coded 1400px width caps and fixed scroll-box heights are removed. Width/spacing is now a single-token change, and new screens inherit it automatically (they fill `.app-main`).
- **Centralized surface tokens:** added `--surface-card`, `--surface-card-translucent`, `--surface-info` and routed 24 component stylesheets (83 usages) through them. Card / panel / info backgrounds are now one-knob and fully opaque — fixes the page-background bleed-through on boxes like "Keep Current Catalog" and the catalog update-info banner.
- **Use-case hub:** the Feature Comparison table is now a single shared pop-up shown on hover of any tile (previously duplicated inside all four cards and jumping between them); updated the *Control Documentation × Multi-Report Comparison* cell from ❌ to "✅ First report only".

## [1.7.30] - 2026-09-08

Restores fixes that were documented as shipped in `RELEASE_1.7.29`/`RELEASE_1.7.30` and the
reopened SSAAU-212 work but, per a drift audit, were never actually committed — the original
buggy code was still live in the tree. Also consolidates all standalone release notes into this
file (the `RELEASE_1.7.*.md` files are retired; see Appendices A/B).

### Fixed

- **SSAAU-212 (Splunk → Security Splunk SCC):** confirmed live root cause was the VPC/subnets never being tagged for Adobe's Emissary network allowlist (causing `errno 104` mutual-TLS resets to the indexer tier `hf3.splunk.adobe.net`), **not** deployment-client config. Tagged `aws_vpc.main`/`aws_subnet.public` with `emissary = "trusted"` (`terraform/vpc.tf`); added a defensive `etc/system/local/deploymentclient.conf` override + `splunk btool`/errno-104 visibility in the periodic SSM check; fixed a bootstrap bug that would clobber Image Factory's `00-secops_meta_app` meta fields; added `scripts/debug/diagnose-splunk-uf-on-ec2.sh`. Full incident narrative and runbook: **Appendix A**.
- **Bedrock auth-mode precedence (was RELEASE_1.7.30):** `applyBedrockEnvOverrides` (`backend/configManager.js`) no longer flips an explicit `access-keys` selection to `iam-role`. `BEDROCK_ASSUME_ROLE_ARN`/`BEDROCK_EXTERNAL_ID` now only *populate* ARN/ExternalId when `iam-role` is already the selected mode; they never change the mode. Added `test_cases/backend/unit/bedrockEnvOverrides.test.js`.
- **Bedrock "Test Connection" `[object Object]` roleArn (was RELEASE_1.7.29):** `pick()` in `buildBedrockAiConfigFromRequest` used `return` instead of `continue` (dropping every field after the first empty one) and stored the raw un-trimmed value — both fixed; added an IAM-role ARN format check in `resolveBedrockCredentials` so a coerced/malformed value can't reach STS; `applyRoleBasedConfigRedaction` (`resolveStoredSecret.js`) now resolves `{_sm}`/`{_cfgenc}`/`{_pass}` pointer envelopes to plaintext for admins and masks them for non-admins (both paths previously leaked the raw pointer object); frontend `normalizeAiConfigFromApi` guards `bedrockAssumeRoleArn`/`bedrockExternalId` against pointer objects.
- **Secrets Manager bundle write was a silent no-op (was RELEASE_1.7.29):** `canonicalBundleJson` (`backend/utils/bundleSchema.js`) used a top-level-only `JSON.stringify(obj, Object.keys(obj).sort())` replacer that dropped every nested bundle entry, so change-detection always reported "no change" and skipped `PutSecretValueCommand` — every Settings-UI secret save in `aws-sm` mode appeared to succeed but never persisted. Fixed with recursive key sorting.
- **`/health` and `/health/ready`** now report a `version` field read from `backend/package.json` at startup, so operators can confirm which build a Blue/Green instance is running without the UI footer.

### Known issue (infrastructure, not code)

- Cross-account Bedrock `iam-role` mode remains blocked by a suspected AWS Organizations SCP on account `442277170733` — running config stays on `access-keys`. Escalation ticket template and evidence: **Appendix B**.

### Operator actions (cannot be scripted / committed)

- Set `bedrock_cross_account_enabled = false` in `terraform/envs/aws4403/terraform.tfvars` (gitignored, environment-specific).
- Verify/re-apply the `emissary = "trusted"` VPC/subnet tag via `terraform plan`/`apply` in `terraform/envs/aws4403`.

## [1.7.29] - 2026-09-08

### Security

- **Pass vault removed as a runtime dependency:** the running server no longer resolves `_pass` pointers or falls back to the pass bundle. `secretsManager.resolveSecretPointer` resolves only `_sm`/plaintext; `configManager` no longer calls `passShow`/`resolvePassPointers` on config resolve or save (dead `prepareConfigWithPassPointers` removed). Legacy `_pass` pointers are preserved verbatim; migrating them now requires the opt-in operator CLI (`migrate-config-to-cfgenc.mjs`, `allowPassResolution` — default off, so boot never shells out to `pass`). `pass` stays a laptop-only deploy/migration helper. Completes the earlier `_cfgenc`/SM-only hardening.

### Added

- **`backend/utils/configSecretMigration.js`:** Startup and CLI migration of plaintext / legacy `_pass` to `_cfgenc` (local) or `_sm` (EC2); S3 upload validation helper.
- **`backend/scripts/migrate-config-to-cfgenc.mjs`:** Offline migration for local/Docker config.
- **`scripts/debug/audit-config-secrets.sh`:** Audit config secret storage shapes on S3 or local path (no secret values printed).
- **`scripts/lib/config-secrets-plaintext-check.mjs`:** Blocks S3 backup when `config.json` contains plaintext secrets.
- **Unit tests:** `cfgencConfigSave.test.js`, `configSecretMigration.test.js`, `failSecureSmSave.test.js`.

### Removed

- **Obsolete debug/legacy scripts:** deleted completed one-time migrations, self-declared one-off incident fixes, orphaned code, and deprecated helpers — `scripts/debug/{merge-ec2-sso-config.mjs, fix-blue-no-cron.sh, fix-ec2-generic-oidc-secret.mjs, migrate-pass-entries-to-bundle.sh, migrate-config-secrets-to-sm.sh, pull-secrets-manager-to-pass.sh, push-pass-to-secrets-manager.sh, restore-blue-config.sh}` and `scripts/remove-legacy-os-patch-cron.sh`.
- **Consolidated docs (26 → 17):** retired `PROJECT_SUMMARY.md` (→ `README.md` index), `RELEASE_1.7.25.md`/`RELEASE_1.7.27.md` (→ `CHANGELOG.md`), `VALIDATION_SYSTEM.md` (→ `QUALITY_ASSURANCE.md` Part 4), `DUAL_REPO_QUALITY_MIRROR_PLAYBOOK.md` (retired), and `TERRAFORM_NETWORK_PCL_AND_TAGS.md` + `TLS_CERTIFICATE_AND_PKI.md` (→ `BEST_PRACTICES.md` Part 5). Merged `AWS_OPERATIONS.md` + `DEPLOYMENT.md` + `CLOUD_DEPLOYMENT.md` into new `DEPLOYMENT_AND_OPERATIONS.md` (CLOUD_DEPLOYMENT content dropped as stale). Rewrote `docs/README.md` as a categorized/role-based index and repointed all inbound references repo-wide.

### Changed

- **Local/Docker:** GUI save stores secrets as **`_cfgenc`** (PBKDF2 + AES-256-GCM); pass vault **not required**. Docker entrypoint bootstraps `OSCAL_CONFIG_FIELD_SECRET` and `SESSION_SECRET` under `/data/`.
- **EC2:** Removed plaintext fallback when AWS SM put fails; settings/SSO save returns **503**; startup auto-migrates plaintext secrets to SM (refuses start on EC2 if migration fails).
- **Dockerfile:** Removed pass/gnupg and build-time `credentials.txt` (default user passwords generated at runtime in app logs).
- **Docs sync:** refreshed `scripts/README.md` to the current Terraform/EC2 model (dropped the retired Docker volume-persistence upgrade flow), rewrote `docs/README.md` as a categorized/role-based index, and pruned references to removed scripts/docs across `docs/` and `README.md`.
- **Deploy:** `deploy-to-ec2.sh` no longer copies the deprecated pass-sync scripts to instances or prints the secrets-migration fallback hint.

## [1.7.28] - 2026-08-09

Operations, CI, and security-maintenance release (no new end-user report workflow).

### Changed

- **Repository:** `Main` is the only active long-lived branch and the default PR target.
- **Node.js:** **24.9.0 or newer** required by root, backend, frontend, tests, and release builds.
- **CI:** Validation, quality, shell, Codacy, and SBOM workflows target `Main`.
- **AWS auth:** The scheduled AMI drift check assumes a role via GitHub OIDC; static AWS access-key secrets are no longer used. Enable by applying `terraform/envs/aws4403`, then add the `terraform output -raw github_actions_ami_drift_role_arn` value as GitHub Actions variable `AWS4403_AMI_DRIFT_ROLE_ARN` (OIDC trust restricted to the canonical repo's `Main` branch; role is read-only for `ec2:DescribeImages`).
- **Snyk:** Placeholder workflows disabled until a real Snyk project/token is configured.
- **Security:** Dependency remediation and encrypted-example fixture cleanup.

### Deploy

- **Docker Hub:** `keekar/oscal_reports:v1.7.28`; **GHCR:** `ghcr.io/adobe/oscal-report-generator:v1.7.28`.

## [1.7.27] - 2026-07-20

Release **1.7.27** remediates async job authorization (**VULN-37000**), hardens Blue/Green deploy to prevent ALB 502 during AMI refresh, and adds proactive API auth inventory tests.

Permanent record for **Development → Quality** promotion. Prevents regression of **VULN-37000** and the production **502** incident during AMI/ASG refresh.

**Regression prevention:**

- Unauthenticated `POST /api/jobs/pdf` → **401**; user B `GET /api/jobs/{userA-jobId}` → **403**; status JSON must not contain `metadata.ip` or `data`.
- `npm test -- jobs-auth-idor jobAccess api-auth-inventory` passes in CI.
- After AMI refresh: `/health/ready` **200** on production URL; footer version matches the installer manifest (root/backend/frontend `package.json` aligned).
- Sync export routes (`/api/generate-pdf`, etc.) stay in `test_cases/backend/fixtures/public-api-allowlist.json`; revisit if pentest scope expands.
- Release gate: version = 1.7.27 across all `package.json`; `./scripts/deploy-to-ec2.sh --update-s3` writes `installer/.installer-build.json`; pentest retest VULN-37000; Jira → **Remediated – Pending Retest**.

### Security

- **Job auth / IDOR / DoS (VULN-37000):** `authenticate` required on `POST /api/jobs/pdf`, `/excel`, `/ccm` and on `GET /api/jobs/:jobId` / `/download`; owner-or-Platform-Admin authorization via `backend/utils/jobAccess.js`; job status responses redacted (no requester IP or export payload); per-user rate limit (10/15 min) and concurrent job cap (5).
- **Proactive guard:** `test_cases/backend/unit/api-auth-inventory.test.js` + `fixtures/public-api-allowlist.json` fail CI when object-access or mutating `/api/*` routes lack auth.

### Changed

- **Deploy resilience:** Passive-first Blue/Green rollout (`deploy_passive_first_both`), pre-AMI ALB failover, post-refresh S3 deploy hook, and safe maintenance state dir handling in `scripts/lib/deploy-maintenance.sh` (502 prevention during ASG refresh).
- **Version reconcile:** `deploy-to-ec2.sh` reconciles root, `backend/`, and `frontend/` `package.json` from S3 installer manifest (fixes footer version drift).

### Tests

- `jobs-auth-idor.test.js`, `jobAccess.test.js`, `api-auth-inventory.test.js`.

### Deploy

- **Docker Hub:** `keekar/oscal_reports:v1.7.27` when published.
- **GHCR:** `ghcr.io/adobe/oscal-report-generator:v1.7.27` when published.
## [1.7.25] - 2026-07-18

Release **1.7.25** merges Dependabot dependency updates on **Development**, remediates pentest findings (**VULN-36986** SSRF, **VULN-36998** settings disclosure, **VULN-37020** Bedrock access control), closes AMS Non-Prod InfraSec tickets (**SSAAU-216**, **SSAAU-212**), and aligns Terraform/GHCR paths with the canonical [adobe/OSCAL-Reports](https://github.com/adobe/OSCAL-Reports) repository.

Permanent record for **Quality → main** promotion (work completed 2026-07-18, AMS Non-Prod / AWS4403).

**Regression prevention:**

- **SSRF (VULN-36986):** never set `allowPrivateIPs: true` on public URL-fetch endpoints; all server-side user-URL fetches use `validateUrl()` + `safeAxios`; retest unauthenticated `POST /api/proxy-fetch` → **401**, `http://0x7f000001/` → **400/`SSRF_BLOCKED`**.
- **Settings disclosure (VULN-36998):** unauthenticated `GET /api/settings` → **401**, non-admin → **403**; `GET /api/settings/runtime` returns allowlist only; rotate any pentest-exposed credentials (legacy SMTP app password, OIDC client secrets) and clean Okta redirect URIs.
- **Bedrock (VULN-37020):** `bedrock_external_id` must be set in `terraform.tfvars` when `bedrock_cross_account_enabled = true` (Terraform validation enforces); non-admins must not receive `bedrockAssumeRoleArn`/`bedrockExternalId` (test `settingsRedaction.test.js`); enable Account B model-invocation logging.
- **Image Factory AMI (SSAAU-216):** weekly `./scripts/check-ami-drift.sh`; never pin a stale `ami-*` when dynamic EMR lookup is available; post-refresh `./scripts/deploy-to-ec2.sh --both` + ALB `/health/ready`.
- **Splunk SCC (SSAAU-212):** keep `oscal_splunk_uf_bootstrap_enabled = true`; after every ASG replacement confirm `deploymentclient.conf` exists (handshake ≤30 min); `clientName` must include `journald_seclogs` on AL2023; `_meta` must carry real `meta_cloud_id`/`meta_instance_id`.
- Dependencies: resolve Dependabot conflicts by accepting the newer version unless a breaking change is documented here; run `npm audit --audit-level=high` and `cd test_cases/backend && npm test` after merges; never hand-edit one lockfile without its sibling manifests.

### Security

- **SSRF (VULN-36986):** Strict URL validation profiles; `authenticate` on `/api/proxy-fetch` and `/api/fetch-catalogue`; encoded-IP and redirect blocking; frontend authenticated fetch helpers; regression tests.
- **Settings disclosure (VULN-36998):** `GET /api/settings` requires **Platform Admin** (`EDIT_SETTINGS`); new `GET /api/settings/runtime` for allowlisted runtime flags only; POST save response redacts secrets and omits server paths; structured settings access logging; Platform Settings UI admin-only.
- **Bedrock (VULN-37020):** Redact `bedrockAssumeRoleArn` / `bedrockExternalId` for non-admin; Terraform gates cross-account IAM on `bedrock_external_id`; hardened Account B runbook.

### Removed

- **SMTP / email notifications:** Backend `nodemailer` dependency, SMTP config (`messagingConfig.email`), `POST /api/messaging/test-email`, and EC2 security-group SMTP egress (25/465/587). Credential delivery is **Slack-only** when messaging is enabled.
- **Self-registration:** `POST /api/auth/self-register` removed; use SSO JIT provisioning or admin-created accounts.

### Infrastructure (AWS4403 / AMS Non-Prod)

- **SSAAU-216:** Dynamic Image Factory **Amazon Linux 2023 EMR** lookup; staggered ASG refresh to **IF 3.0.2** (`ami-036bb3d5f242f68c0`); `check-ami-drift.sh` workflow.
- **SSAAU-212:** Splunk UF SCC bootstrap (`deploymentclient.conf`, `00-secops_meta_app` metadata, journald client name) via user-data and SSM post-boot (`terraform/oscal_splunk.tf`).

### Changed

- **Terraform / GHCR:** `oscal_container_image` default `ghcr.io/adobe/oscal-report-generator:latest`; EC2 Docker user_data uses the variable instead of legacy paths.
- **Dependencies (Dependabot #8–#12):** AWS SDK **3.1086**, `fast-xml-parser` **5.10.1**, `lucide-react` **1.24**, `vite` **8.1.4**, React toolchain, security overrides (`exceljs` → `uuid@14.0.1` for CVE-2026-41907). Backend **removed** `nodemailer` (SMTP retired).
- **CI:** Docker publish workflow pushes to **GHCR** and Docker Hub.
- **Tests:** `secretsManager` unit test nesting fix; `urlValidator-ssrf-remediation.test.js`, `proxyFetchHelpers.test.js`, `ssrf-auth-endpoints.test.js`, `settings-auth-disclosure.test.js`, `settingsRedaction.test.js`; updated `csrf-api.test.js`, `securityConfig.test.js`.

### Deploy

- **Docker Hub:** `keekar/oscal_reports:v1.7.25` when published.
- **GHCR:** `ghcr.io/adobe/oscal-report-generator:v1.7.25` when published.

## [1.7.24] - 2026-06-29

### Changed
- ci: Quality mirror sync and Adobe Development retirement
## [1.7.23] - 2026-06-29

Release **1.7.23** merges Dependabot dependency updates into Quality, stabilizes CI unit tests, and aligns version markers across manifests and documentation. Docker image tag **`keekar/oscal_reports:v1.7.23`** when published.

### Changed

- **Dependencies (Dependabot #45–#61):** AWS SDK packages, `express-rate-limit` 8.x, `pdfkit` 0.19, `pg`, `react`/`react-dom`, `fast-xml-parser`, `ajv`, `uuid`, `qs`, frontend toolchain, and GitHub Actions (`checkout` v7, `setup-node` v6).
- **Quality Gates:** Personal-fork workflow action versions aligned with Dependabot bumps.
- **Tests:** CI-stable config paths for `dockerBootstrapSecrets` and `defaultGenericOidcConfig`; live Authentik OIDC probe gated behind `OSCAL_RUN_OIDC_PROBE=1`.

### Documentation

- Version footers, README release notes, and deployment examples updated to **1.7.23**.

## [1.7.22] - 2026-06-26

Release **1.7.22** hardens EC2 deploy and config retention, consolidates laptop pass secrets into a single bundle entry (`PROD/OSCAL/AWS_SM`), and fixes Generic OIDC / SSO config edge cases. EC2 production remains AWS Secrets Manager primary; Docker image `keekar/oscal_reports:v1.7.22` is multi-arch (`linux/amd64`, `linux/arm64`).

### Added

- **`backend/utils/passBundle.js`**, **`bundleSchema.js`**, **`passOAuthSecret.js`:** Single pass entry **`PROD/OSCAL/AWS_SM`** (override `OSCAL_PASS_BUNDLE_ENTRY`) with the same `{ entries, _meta }` JSON shape as AWS SM; batch GUI saves via `mergePassBundlePartial`.
- **`scripts/lib/pass-bundle-common.sh`:** Shared bundle entry name and legacy key list for shell tooling.
- **`scripts/debug/migrate-pass-entries-to-bundle.sh`:** One-time migration from legacy per-key `OSCAL/*` pass entries into the bundle (`--dry-run` default, `--apply` to write).
- **Golden config.default on S3:** `s3://<bucket>/config/default/` (`config.json`, `users.json`, `manifest.json`) for known-good restore; **`scripts/debug/publish-config-default-to-s3.sh`**, **`scripts/debug/restore-config-from-s3-default.sh`**; Terraform placeholder under `config/default/`.
- **Deploy env flags:** `DEPLOY_CONFIG_S3_SKIP`, `DEPLOY_CONFIG_S3_FORCE` (default 0), `DEPLOY_MIGRATE_CONFIG_SM` (default 0), `DEPLOY_RDS_BOOTSTRAP_SKIP` — safe code-only deploy without overwriting local config or re-running SM migration every time.
- **Unit tests:** `passBundle.test.js`, `passBundleConfigSave.test.js`; updated pass-sync shell tests for whole-bundle model.

### Fixed

- **EC2 SSO/config wipe on deploy:** Deploy no longer force-overwrites `/opt/oscal/data/config.json` from S3; auto-restore from `config/default/` when local config is missing or &lt; 256 bytes; validates JSON before accepting S3 copies.
- **`migrate-config-to-sm.mjs`:** Refuses tiny/invalid config; writes `_sm` pointers only when SM has or receives the secret; atomic write with backup.
- **Generic OIDC orphan `_sm` pointers:** `migrateGenericOidcSecretForAwsSm` avoids leaving `_sm` when SM is empty (fixes missing Generic SSO button on login page).
- **RDS bootstrap on routine deploy:** Faster path when schema unchanged (`scripts/lib/rds-bootstrap-on-instance.sh`).

### Changed

- **Laptop pass model:** Per-key `OSCAL/*.gpg` deprecated; **`push-pass-to-secrets-manager.sh`** / **`pull-secrets-manager-to-pass.sh`** operate on the single bundle entry; **`ec2-automation-pass-sync.sh`** whole-bundle compare (still disabled on EC2 deploy).
- **`passShow` / `resolveSecretPointer`:** Logical `OSCAL/*` keys resolve from pass bundle; SM fallback uses bundle on laptop during local testing.
- **`config-s3-sync.sh`:** Min config size 256, JSON validation, backup/restore helpers for `config/default/`.

### Documentation

- Version footers, deployment examples, and Docker Hub tags updated to **1.7.22**.
- **`docs/AWS_OPERATIONS.md`:** Golden config.default, safe deploy flags, pass bundle (`PROD/OSCAL/AWS_SM`), troubleshooting SSO/config restore.
- **`docs/DEPLOYMENT.md`:** Pass bundle logical keys and migration script reference.
- **`scripts/README.md`:** Pass bundle sync script inventory.
- **Repo cleanup:** Removed stale binary docs (`docs/OSCAL_Compliance_Tool_Demo.pptx`, `docs/1.15.2025_GovTechSingapore.pdf`) and superseded test meta-docs (`test_cases/CHANGES_SUMMARY.md`, `test_cases/TESTING_QUICK_REFERENCE.md`); use `test_cases/scripts/README.md` and `test_cases/README.md` instead.

### Deployment

- **EC2 (recommended routine):** `DEPLOY_RDS_BOOTSTRAP_SKIP=1 DEPLOY_CONFIG_S3_SKIP=1 ./scripts/deploy-to-ec2.sh --update-s3` then `DEPLOY_RDS_BOOTSTRAP_SKIP=1 DEPLOY_CONFIG_S3_SKIP=1 ./scripts/deploy-to-ec2.sh --both`.
- **EC2 config restore:** `sudo bash /opt/oscal/scripts/debug/restore-config-from-s3-default.sh` on each instance.
- **Laptop pass:** `./scripts/debug/migrate-pass-entries-to-bundle.sh --apply` then `./scripts/debug/push-pass-to-secrets-manager.sh --discover-only`.
- **Docker Hub:** `./scripts/build-and-push-dockerhub.sh v1.7.22` → `keekar/oscal_reports:v1.7.22` and `latest`.

---

## [1.7.21] - 2026-06-25

Release **1.7.21** ships Multi-Report Comparison (MRC) export reliability, unified SSP export with the main application, richer AI control suggestions, and Generic OIDC TLS options for Docker/NAS. EC2 (AMS Gov Cloud) continues Okta-first SSO; Docker image `keekar/oscal_reports:v1.7.21` is multi-arch (`linux/amd64`, `linux/arm64`).

### Added

- **`backend/utils/controlPromptContext.js`:** Shared helpers to build per-control prompt context (catalog title/description, statement parts, implementation status) for AI services.
- **`frontend/src/utils/exportSsp.js`:** Shared client for `POST /api/generate-ssp` and `POST /api/prepare-ssp-export` used by the main app and MRC.
- **`POST /api/prepare-ssp-export`:** Accepts baseline SSP JSON plus MRC control edits; returns the same payload shape the main export path uses before `generate-ssp`.
- **`backend/sspComparisonV3.js`:** `buildCatalogControlsForExport`, `applyMrcControlEdits`, `prepareSspExportPayload` for full-fidelity MRC exports.
- **`frontend/src/utils/comparisonReportPrefs.js`:** Browser-local MRC work-session autosave (`oscal_mrc_work_v1_<userId>`) so export can proceed without re-uploading slots.
- **Generic_OIDC `tlsRelaxed`:** Provider flag and `OSCAL_GENERIC_OIDC_TLS_RELAXED` env override (`backend/utils/oidcHttpsAgent.js`) when the IdP serves an incomplete TLS chain (common with some Let's Encrypt deployments in Node.js Alpine).
- **Unit tests:** `controlPromptContext.test.js`, `prepareSspExport.test.js`.

### Fixed

- **MRC export 504 / gateway timeout:** Export no longer blocks on full OSCAL validation; work session is autosaved before export; client timeout extended to five minutes.
- **MRC validation modal:** Close (X), Escape, and backdrop dismiss work after validation (`ValidationStatus` `onClose` wired in MRC).
- **MRC export filename:** Restored `_ComplianceReport` suffix (e.g. `ReportName_ComplianceReport_2026-06-25.json`).
- **MRC export fidelity:** MRC uses the same `generate-ssp` pipeline as the main SSP workflow so catalog metadata and edited controls are not dropped on export.
- **Generic OIDC on Docker/NAS:** Discovery and token calls succeed when `tlsRelaxed: true` is set for Authentik (`sso.keekar.au`) where Node/OpenSSL cannot verify the issuer chain.
- **EC2 SSO / config retention:** Follow-up to 1.7.20 shared S3 config sync and AWS Secrets Manager bundle behaviour so Okta SSO settings persist across deploy and cron sync (operators should keep `config/active/` backups current before force deploy).

### Changed

- **AI suggestions (`gemmaService.js`, `mistralService.js`, `controlSuggestionEngine.js`):** Prompts include catalog description, control parts, and diverse implementation examples so suggestions vary by control instead of generic boilerplate.
- **Mistral:** Reuses shared prompt context from `controlPromptContext.js` (aligned with Gemma).

### Documentation

- Version footers, deployment examples, and Docker Hub tags updated to **1.7.21**.
- **`docs/OIDC_SSO_INTEGRATION.md`:** `tlsRelaxed` troubleshooting for Generic_OIDC.
- **`docs/AI_INTEGRATION.md`:** Per-control prompt context (1.7.21).
- **`docs/CHANGELOG.md`:** This release entry.

### Deployment

- **EC2:** `./scripts/deploy-to-ec2.sh --update-s3` then `./scripts/deploy-to-ec2.sh --both` (installer manifest **1.7.21**).
- **Docker Hub:** `./scripts/build-and-push-dockerhub.sh v1.7.21` → `keekar/oscal_reports:v1.7.21` and `latest`.

---

## [1.7.20] - 2026-06-03

Development baseline for release **1.7.20**.

### Added

- **Generic_OIDC (Authentik):** Built-in Generic SSO provider (`backend/auth/genericOidc.js`) with PKCE, discovery, signed state, redirect allowlist, and `{ "_cfgenc" }` / SM secret resolution.
- **`frontend/src/components/GenericOidcCallback.jsx`:** Browser callback route `/auth/callback` for Generic_OIDC.
- **Corporate PKI / ACM import runbook** (replaces ad-hoc LE notes where applicable); now in `docs/BEST_PRACTICES.md` Part 5.
- **Debug/ops scripts:** `migrate-config-secrets-to-sm.sh`, `backup-config-to-s3.sh`, `sync-config-from-s3-newest.sh`, `scp-to-ec2.sh`, and shared `scripts/lib/config-s3-sync.sh`, `deploy-maintenance.sh`, `installer-s3-reconcile.sh`.
- **Unit tests:** `genericOidc.test.js`, `configFieldCrypto.test.js`, `defaultGenericOidcConfig.test.js`, `secretsManager.test.js`, `bedrockCredentials.test.js`.

### Changed

- **Login page:** Self-registration UI replaced with Generic SSO button and access policy copy; **Expedited entry** paragraph hidden on EC2 (`OSCAL_SECRETS_MODE=aws-sm` via `/api/auth/sso/login-providers`).
- **User lifecycle:** Inactivity deactivation and email blocklist cooldown aligned from 45 to 30 days (`userCleanup.js`, `emailBlocklist.js`).
- **SSO Integration UI:** Read-only Generic_OIDC card; Okta remains primary on EC2 deployments.
- **Cross-account Bedrock:** `bedrockCredentials.js` and Terraform/bootstrap drop-in updates.

### Removed

- Obsolete debug scripts: `import-alb-http-redirect-listener.sh`, `remove-stale-ollama-state.sh`, `build-consolidated-docs.py`.
- Tracked Terraform plan snapshots `terraform/envs/aws4403/depatt04`, `depatt05` (local artifacts; gitignore expanded).

### Documentation

- **`docs/OIDC_SSO_INTEGRATION.md`:** Generic_OIDC (Authentik) and login-page policy.
- **`docs/AWS_OPERATIONS.md`**, **`scripts/README.md`:** EC2 secrets, debug script inventory, version footers.

## [1.7.19] - 2026-06-03

### Added

- **`backend/utils/secretsManager.js`:** EC2 AWS Secrets Manager bundle (single JSON secret) with in-memory cache, CAS merge on GUI save, and `{ "_sm": "..." }` pointer resolution.
- **`backend/scripts/migrate-config-to-sm.mjs`** and **`scripts/debug/migrate-config-secrets-to-sm.sh`:** one-time migration of plaintext / `_pass` config secrets into SM + `_sm` pointers.
- **Unit tests:** `test_cases/backend/unit/secretsManager.test.js`.

### Changed

- **EC2 secrets:** Drop `pass` on instances; systemd uses `OSCAL_SECRETS_MODE=aws-sm` and `OSCAL_SECRETS_MANAGER_ARN` instead of `PASSWORD_STORE_DIR`.
- **`configManager`:** `prepareConfigForSave()` writes to SM on EC2; local/Docker keeps `OSCAL_SECRETS_MODE=config` (plaintext or optional pass).
- **`ec2_automation.sh`:** Removed Pass ↔ SM cron sync (app manages SM directly).
- **`config/app/config.json.example`:** `_pass` → `_sm` for EC2 pointer shape (local dev may use plaintext).

### Documentation

- **`docs/AWS_OPERATIONS.md`:** EC2 secrets runbook updated for AWS SM bundle (replaces pass vault section).

## [1.7.18] - 2026-05-26

### Added
- Per-user Multi-Report Comparison report URL preferences (`localStorage`); legacy baseline URL pre-fill from settings API.
- CSRF protection middleware using `csrf` package (replaces removed `csurf`); unit tests in `test_cases/backend/unit/csrfProtection.test.js`.
- Comparison report prefs and URL verification utilities with unit tests.

### Changed
- **qs** pinned via direct dependency `>=6.15.2` (CVE-2026-8723 / GHSA-q8mj-m7cp-5q26); removed conflicting `qs` npm `overrides` so Dependabot can resolve updates.
- **ControlsList** toolbar: vertical Classes / Status / Responsible Parties row; Search, Groups, Control Types, Bulk Actions on second row.
- **Multi-Report Comparison**: export panel at page bottom (aligned with main use case `ExportButtons` card); full validation options grid; URL notice copy; slot labels and upload button text; Settings published SOA URL removed (browser-local prefs only).
- **axios** bumped to `>=1.15.2` (root, backend, frontend); **safeAxios** tests updated for axios 1.16 CRLF handling.
- Dependabot grouped dependency updates (fast-xml-parser, uuid, fast-uri, brace-expansion, etc.).

### Documentation
- Version footers and indexes aligned to **1.7.18**; deployment and comparison workflow docs updated.

## [1.7.17] - 2026-05-25

### Added
- **SSM Patch Manager** for OSCAL Green/Blue: Amazon Linux 2023 patch baseline, patch groups (`ams-oscal-reports-blue` / `-green`), staggered maintenance windows (1st/3rd Monday Blue, 2nd/4th Monday Green), and `Patch Group` tags on launch templates ([`terraform/oscal_ssm_patch.tf`](terraform/oscal_ssm_patch.tf)).
- [`scripts/remove-legacy-os-patch-cron.sh`](scripts/remove-legacy-os-patch-cron.sh) to remove manual OS patch crontab entries after migrating to Patch Manager.

### Changed
- Pre_Prod: merge Development (CI consolidation, Quality fixes, deploy script hardening).
- Terraform variables: `oscal_os_patch_enabled`, `oscal_os_patch_hour`, `oscal_os_patch_reboot_option`, `oscal_os_patch_approval_days`; new outputs for baseline and maintenance windows.

### Documentation
- **AWS_OPERATIONS.md**: OS patching (SSM Patch Manager) runbook, compliance checks, and scan/install verification steps.

## [1.7.16] - 2026-04-13

### Changed
- Adobe Pre_Prod: merge Development (workflows, deploy/terraform/scripts, UseCases and run-all-tests fixes) and CI preflight for personal-repo sync.

### Documentation
- Aligned version footers and indexes with **1.7.16**; refreshed **Architecture** technology stack (React 19, Vite 8, Express 5, AI/RDS capabilities); added **AWS EC2 + S3 `installer/`** deploy section to **DEPLOYMENT.md**; updated **`config/app/config.json.example`** to match current `aiConfig` / `databaseConfig` shape (Bedrock-first template with Pass pointers).

## [1.7.14] - 2026-04-15

### Changed
- Deploy: S3 `installer/` flow, optional OS updates on instances and before `deploy_one`, script layout under `scripts/`, docs and Terraform cleanup (personal Pre_Prod).

## [1.7.13] - 2026-04-14

### Changed
- chore: promote merge to Pre_Prod and main (personal)
## [1.7.12] - 2026-04-14

### Changed
- Release 1.7.12
## [1.7.12] - 2026-04-13

### Changed
- Release 1.7.12

## [1.7.11] - 2026-03-13

### Changed
- Release 1.7.11

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.7.10] - 2026-03-12

### Changed
- Version bump (current wins for PR to main)

## [1.7.9] - 2026-03-13

### Changed
- Release: merge adobe/main into main (version bump for pre-push)

## [1.7.8] - 2026-03-09

### Fixed
- Docker build: use npm install in frontend stage (frontend package-lock is gitignored)

## [1.7.6] - 2026-03-06

### Changed
- Fix AI telemetry logging (ESM require fix)

---

# Appendices — operational reference

Durable runbook / escalation material consolidated from the retired `RELEASE_1.7.*.md` files.

## Appendix A — Reusable runbook: Splunk UF logs not reaching Security Splunk SCC (SSAAU-212 pattern)

Portable checklist for any Adobe AWS project on an Image Factory AMI with the Splunk Universal
Forwarder (UF). Full OSCAL incident detail is in the **1.7.25** and **1.7.30** entries above.

### Symptom

Security Splunk SCC shows "No log found" / missing device logs for hosts that otherwise look
correctly configured — `deploymentclient.conf` present, UF running, journald inputs configured.

### Diagnosis order (cheapest / most-likely-wrong-assumption first)

1. **Is UF actually running and healthy?**
   ```bash
   sudo /opt/splunkforwarder/bin/splunk status
   ps aux | grep splunkd
   ```
   If not installed/running, that's a separate (simpler) problem — Image Factory AMI issue or base image drift.

2. **Which deployment-client config is actually effective?** Don't trust file presence — Splunk merges `deploymentclient.conf` across apps by app-name precedence, and Image Factory AMIs ship their own pre-wired app (`xif-deployment_client_app`) that can silently win.
   ```bash
   sudo /opt/splunkforwarder/bin/splunk btool deploymentclient list --debug
   ```
   Prints the winning `targetUri`/`clientName` **and its source file**. If it's not what you expect, write your config to `$SPLUNK_HOME/etc/system/local/deploymentclient.conf` — `system/local` always wins over any app. (On OSCAL this was a red herring; the Image-Factory app already had the right target — but it's a 30-second check and a real cause elsewhere.)

3. **Are the required journald input stanzas enabled?** (Per Adobe's "Missing Device Logs" wiki, §Logging Requirement.) For AL2023/journald:
   ```bash
   sudo /opt/splunkforwarder/bin/splunk btool inputs list --debug | grep -A5 'journald://messages\|journald://audit'
   ```
   Expect `journalctl-facility = 1,2,3,5,6,7,8,9` (messages/syslog) and `= 4,10` (audit), both `disabled = 0` — normally shipped by Image Factory's `TA-journald_input-syslogs`.

4. **Are meta fields already populated by Image Factory?** Check before writing anything:
   ```bash
   cat /opt/splunkforwarder/etc/apps/00-secops_meta_app/local/inputs.conf
   ```
   The wiki: *"If you are using an imagefactory server, then you do not need to setup these fields as they have already been setup."* If it already has `meta_application_uai`/`meta_location`/etc., **do not overwrite it** — automation touching this file should `[ -s "$file" ]`-guard and skip if populated.

5. **Is the actual data-plane connection failing?** The check most likely to reveal the real problem if 1–4 look fine:
   ```bash
   grep -c 'sock_error = 104' /opt/splunkforwarder/var/log/splunk/splunkd.log
   grep -i -E 'AutoLoadBalancedConnectionStrategy|TcpOutputFd' /opt/splunkforwarder/var/log/splunk/splunkd.log | tail -20
   ```
   A nonzero, growing `errno 104` (reset) count on the **output** connection to `hf3.splunk.adobe.net` — while a bare `openssl s_client -connect hf3.splunk.adobe.net:443` *succeeds* — is the signature of a network-perimeter block on the mutual-TLS forwarding path. A present/valid client cert is not sufficient evidence the connection works.

6. **Check the Adobe Emissary allowlist tag.** The actual OSCAL root cause. Emissary dynamically allowlists AWS resources for Vault/LDAP/Splunk based on a tag; dynamic EC2 public IPs (not just static EIPs) are supported for Splunk.
   ```bash
   aws ec2 describe-tags --filters "Name=resource-id,Values=<vpc-id>" "Name=key,Values=emissary"
   ```
   If empty, tag the VPC and/or subnet/ENI/EIP with key `emissary` (lowercase), value `trusted` (Adobe-managed internal; `dmz` for customer-facing) — see `wiki.corp.adobe.com/spaces/CES/pages/3174993327/2.+Emissary+for+Service+Consumers`. Allow ~20 min to propagate, then re-check the errno-104 count. **Verify the tag directly — don't trust a prior "Emissary already satisfied" claim.**

### Why this keeps happening: an Image Factory / Emissary process gap, not a code bug

The `emissary` tag is a property of AWS **networking** resources (VPC/Subnet/ENI/EIP), set at
instance-launch via each project's own Terraform — it *cannot* be baked into an AMI (an AMI has no
VPC association until launched). Image Factory bakes in Splunk UF + a working
`xif-deployment_client_app` pointed at `ds2.splunk.adobe.net`, which makes logging *look* fully
configured — and that false completeness is exactly what let this go unnoticed for months (a prior
diagnosis assumed Emissary was "already satisfied" without checking). Worth raising with Image
Factory / Logging Platform as a standing gap: (1) docs should call out the Emissary tag as a
separate required step even on Image Factory AMIs; (2) a startup diagnostic could surface a
distinct "Emissary not tagged" warning instead of a bare `errno 104`.

### Fix pattern to replicate

- Add `tags = { emissary = "trusted" }` to the `aws_vpc` and public `aws_subnet` resources.
- If step 2 found a real precedence conflict, add a defensive `etc/system/local/deploymentclient.conf` write to the UF bootstrap script.
- Guard any script-managed `00-secops_meta_app/local/inputs.conf` write with an "already populated, skip" check.
- Add the `errno 104` count and `btool` output to the project's health/diagnostic script (see `scripts/debug/diagnose-splunk-uf-on-ec2.sh`).

### Evidence to attach to a ticket

Instance-side evidence (btool, errno-104 count before/after, handshake status) supports the
diagnosis, but the evidence the Logging Platform team wants is a **Splunk search in Security Splunk
SCC** for the affected host/instance IDs showing events after the fix — that comes from Splunk SCC
access (`#splunk-users`), not the instance.

## Appendix B — Cross-account Bedrock `iam-role` blocked by suspected AWS Organizations SCP

After the 1.7.29/1.7.30 code fixes, `bedrockAuthMode: iam-role` with the cross-account ARN
`arn:aws:iam::928475551084:role/OSCAL-BedrockCrossAccount` still fails:

```
User: arn:aws:sts::442277170733:assumed-role/ams-oscal-reports-oscal-.../i-...
is not authorized to perform: sts:AssumeRole on resource:
arn:aws:iam::928475551084:role/OSCAL-BedrockCrossAccount
```

Every IAM-level check confirms the call *should* be allowed (Account A identity policy grants it,
Account B trust policy allows the caller with matching `sts:ExternalId`/`aws:SourceAccount`/
`sts:RoleSessionName`, `aws iam simulate-principal-policy` returns `allowed`, no permissions
boundary or explicit `Deny`). Since IAM says allow but the live call is denied, the most likely
cause is an **AWS Organizations Service Control Policy (SCP)** restricting cross-account
`sts:AssumeRole` — SCPs aren't evaluated by the policy simulator and weren't checkable from the
diagnosis session (`AccessDeniedException` on `organizations:ListPoliciesForTarget`). The app owner
reports this worked under 1.7.28 and broke with no app-side change, consistent with an SCP change.
**Workaround in place:** running config reverted to `access-keys`; do not re-enable iam-role until
the SCP is confirmed resolved.

### Ticket template for the AWS Organizations administrator

> **Summary:** Cross-account `sts:AssumeRole` from account `442277170733` to a role in account `928475551084` is denied, even though every IAM-level check (identity policy, trust policy, `simulate-principal-policy`) confirms it should be allowed. Suspect an SCP change on `442277170733` or its OU; this previously worked and is not an application-side change.
>
> **Caller (Account A):** `442277170733`, role `arn:aws:iam::442277170733:role/ams-oscal-reports-oscal-20260310224909155700000001`
> **Target (Account B):** `928475551084`, role `arn:aws:iam::928475551084:role/OSCAL-BedrockCrossAccount`
>
> **Exact error:**
> ```
> User: arn:aws:sts::442277170733:assumed-role/ams-oscal-reports-oscal-20260310224909155700000001/i-00b74ff5741fd43c6
> is not authorized to perform: sts:AssumeRole on resource:
> arn:aws:iam::928475551084:role/OSCAL-BedrockCrossAccount
> ```
>
> **CloudTrail (event `AssumeRole`, `errorCode: AccessDenied`):** 2026-08-28 UTC `07:47:47`, `07:47:48`, `07:47:51` (repeated after an EC2 role restart, ruling out propagation); `sourceIPAddress: 44.220.171.141`.
>
> **Already ruled out (please don't re-check):** Account A identity policy grants `sts:AssumeRole` on the exact target ARN; Account B trust policy allows this exact caller with matching `sts:ExternalId`/`aws:SourceAccount: 442277170733`/`sts:RoleSessionName` (`oscal-bedrock-*`); `simulate-principal-policy` returns `allowed`; no permissions boundary; no explicit `Deny` in any caller-role policy.
>
> **Requested action:** Check the SCPs attached to account `442277170733` (or its parent OU) for any statement restricting `sts:AssumeRole` (e.g. keyed on `aws:ResourceAccount`, `aws:PrincipalAccount`, or a target-account allow-list). If found, add `928475551084` / the target role ARN to the allow-list, or carve out an exception. Note: `organizations:ListPoliciesForTarget` requires AWS Organizations management-account access.
