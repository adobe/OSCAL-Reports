# Changelog

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
