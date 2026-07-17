# Changelog

## [1.7.25] - 2026-07-18

Release **1.7.25** merges Dependabot dependency updates on **Development**, remediates pentest findings (**VULN-36986** SSRF, **VULN-37020** Bedrock access control), closes AMS Non-Prod InfraSec tickets (**SSAAU-216**, **SSAAU-212**), and aligns Terraform/GHCR paths with the canonical [adobe/OSCAL-Reports](https://github.com/adobe/OSCAL-Reports) repository.

**Full release record and regression-prevention checklist:** [docs/RELEASE_1.7.25.md](RELEASE_1.7.25.md).

### Security

- **SSRF (VULN-36986):** Strict URL validation profiles; `authenticate` on `/api/proxy-fetch` and `/api/fetch-catalogue`; encoded-IP and redirect blocking; frontend authenticated fetch helpers; regression tests.
- **Bedrock (VULN-37020):** `GET /api/settings` requires auth; redact `bedrockAssumeRoleArn` / `bedrockExternalId` for non-admin; Terraform gates cross-account IAM on `bedrock_external_id`; hardened Account B runbook.

### Infrastructure (AWS4403 / AMS Non-Prod)

- **SSAAU-216:** Dynamic Image Factory **Amazon Linux 2023 EMR** lookup; staggered ASG refresh to **IF 3.0.2** (`ami-036bb3d5f242f68c0`); `check-ami-drift.sh` workflow.
- **SSAAU-212:** Splunk UF SCC bootstrap (`deploymentclient.conf`, `00-secops_meta_app` metadata, journald client name) via user-data and SSM post-boot (`terraform/oscal_splunk.tf`).

### Changed

- **Terraform / GHCR:** `oscal_container_image` default `ghcr.io/adobe/oscal-report-generator:latest`; EC2 Docker user_data uses the variable instead of legacy paths.
- **Dependencies (Dependabot #8–#12):** AWS SDK **3.1086**, `fast-xml-parser` **5.10.1**, `nodemailer` **9.0.3**, `lucide-react` **1.24**, `vite` **8.1.4**, React toolchain, security overrides (`exceljs` → `uuid@14.0.1` for CVE-2026-41907).
- **CI:** Docker publish workflow pushes to **GHCR** and Docker Hub.
- **Tests:** `secretsManager` unit test nesting fix; `urlValidator-ssrf-remediation.test.js`, `proxyFetchHelpers.test.js`, `ssrf-auth-endpoints.test.js`, `settingsRedaction.test.js`; updated `csrf-api.test.js`, `securityConfig.test.js`.

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

## [Unreleased] - Secrets hardening (_cfgenc / SM-only)

### Added

- **`backend/utils/configSecretMigration.js`:** Startup and CLI migration of plaintext / legacy `_pass` to `_cfgenc` (local) or `_sm` (EC2); S3 upload validation helper.
- **`backend/scripts/migrate-config-to-cfgenc.mjs`:** Offline migration for local/Docker config.
- **`scripts/debug/audit-config-secrets.sh`:** Audit config secret storage shapes on S3 or local path (no secret values printed).
- **`scripts/lib/config-secrets-plaintext-check.mjs`:** Blocks S3 backup when `config.json` contains plaintext secrets.
- **Unit tests:** `cfgencConfigSave.test.js`, `configSecretMigration.test.js`, `failSecureSmSave.test.js`.

### Changed

- **Local/Docker:** GUI save stores secrets as **`_cfgenc`** (PBKDF2 + AES-256-GCM); pass vault **not required**. Docker entrypoint bootstraps `OSCAL_CONFIG_FIELD_SECRET` and `SESSION_SECRET` under `/data/`.
- **EC2:** Removed plaintext fallback when AWS SM put fails; settings/SSO save returns **503**; startup auto-migrates plaintext secrets to SM (refuses start on EC2 if migration fails).
- **Dockerfile:** Removed pass/gnupg and build-time `credentials.txt` (default user passwords generated at runtime in app logs).
- **Docs:** SECURITY, DEPLOYMENT, AWS_OPERATIONS, OIDC updated for _cfgenc-first model.

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
- **`docs/TLS_CERTIFICATE_AND_PKI.md`:** Corporate PKI / ACM import runbook (replaces ad-hoc LE notes where applicable).
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
