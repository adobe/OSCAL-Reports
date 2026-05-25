---
concept: Mukesh Kesharwani
contact: mukesh.kesharwani@adobe.com
---

# Project summary — OSCAL Report Generator

**Application:** Keekar’s OSCAL SOA / SSP / CCM Generator (npm: `keekars-oscal-soa-ssp-ccm-generator`).  
**Version:** See root `package.json` (currently **1.7.18**).  
**Last updated:** May 2026

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
