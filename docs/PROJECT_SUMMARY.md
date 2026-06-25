---
concept: Mukesh Kesharwani
contact: mukesh.kesharwani@adobe.com
---

# Project summary — OSCAL Report Generator

**Application:** Keekar’s OSCAL SOA / SSP / CCM Generator (npm: `keekars-oscal-soa-ssp-ccm-generator`).  
**Version:** See root `package.json` (currently **1.7.22**).  
**Last updated:** June 2026

---

## What it does

Full-stack web app that helps teams produce **Statement of Applicability (SOA)**, **System Security Plan (SSP)**, and **Cloud Control Matrix (CCM)** artefacts from **OSCAL** catalogues and profiles (for example NIST 800-53, Australian ISM, Singapore IM8, German BSI). Users work through a React UI; a Node.js Express backend serves APIs, auth, config, and optional AI-assisted control suggestions.

---

## Technical stack

| Layer | Technology |
|-------|------------|
| Frontend | React, Vite (dev proxy to backend) |
| Backend | Node.js, Express |
| Auth | Session-based users (`config/app/users.json`, PBKDF2); optional OIDC/Okta |
| AI (optional) | AWS Bedrock and/or Mistral API — configured in app settings / `config/app/config.json` |
| Data (optional) | PostgreSQL / AWS RDS for extended/export sync |
| Deploy | Docker; AWS via Terraform (ALB, Green/Blue EC2, S3); see deploy scripts under `scripts/` |

Default local ports: backend **3020**, frontend dev **3021**.

---

## Recent release (1.7.22)

| Area | What changed | Why |
|------|----------------|-----|
| **Pass bundle (laptop)** | Single entry `PROD/OSCAL/AWS_SM`; `passBundle.js`, migrate script | Align laptop pass with AWS SM bundle; one write per Settings save |
| **EC2 deploy / config** | `DEPLOY_CONFIG_S3_SKIP`, golden `config/default/`, auto-restore | Prevent SSO/config wipe on routine code deploys |
| **Generic OIDC / SSO** | No orphan `_sm` when SM empty; safer SM migration | Restore Generic SSO button when secret missing from SM |
| **RDS bootstrap** | Skip when schema unchanged | Faster routine deploys |

Full notes: [CHANGELOG.md](CHANGELOG.md#1722---2026-06-26).

---

## Previous release (1.7.21)

| Area | What changed | Why |
|------|----------------|-----|
| **Multi-Report Comparison** | Shared `generate-ssp` export, work-session autosave, non-blocking validation | Fix ALB 504 timeouts and match main-app export fidelity |
| **AI suggestions** | Per-control prompts via `controlPromptContext.js` | Reduce generic duplicate suggestion text across controls |
| **Generic OIDC** | `tlsRelaxed` for Docker/NAS | Node/OpenSSL TLS chain verification vs Authentik Let's Encrypt |
| **EC2 deploy** | Installer manifest version check | Confirm instances run the intended release after S3 pull |

Full notes: [CHANGELOG.md](CHANGELOG.md#1721---2026-06-25).

---

## Repository layout (short)

- **`backend/`** — API, auth, OSCAL processing, AI services  
- **`frontend/`** — SPA  
- **`config/app/`** — runtime config examples and user store patterns  
- **`terraform/`** — AWS infrastructure (e.g. `envs/aws4403`)  
- **`scripts/`** — EC2 deploy, automation, SSH helpers  
- **`test_cases/backend/`** — Jest tests  
- **`docs/`** — permanent documentation (this file, architecture, deployment, security)

---

## Where to read next

| Need | Document |
|------|----------|
| Doc index | [docs/README.md](README.md) |
| Deep architecture | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Run and deploy | [DEPLOYMENT.md](DEPLOYMENT.md) |
| AWS / Terraform / Bedrock | [AWS_OPERATIONS.md](AWS_OPERATIONS.md) |
| AI configuration | [AI_INTEGRATION.md](AI_INTEGRATION.md) |
| Git branches and remotes | [GIT_AND_RELEASE.md](GIT_AND_RELEASE.md) |
| End-user features | [USER_GUIDE.md](USER_GUIDE.md) |
| Security posture | [SECURITY.md](SECURITY.md) |

For a one-page **quick start** and directory tree from the repo root, see [../README.md](../README.md).
