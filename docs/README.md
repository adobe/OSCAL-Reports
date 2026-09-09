<!--
Concept: Mukesh Kesharwani
Contact: mukesh.kesharwani@adobe.com
-->

# OSCAL Report Generator — Documentation

Start here. This page is the map for every guide under `docs/`. For a one-page repo quick start and directory tree, see [../README.md](../README.md).

---

## Overview

**Application:** Keekar's OSCAL SOA / SSP / CCM Generator (npm `keekars-oscal-soa-ssp-ccm-generator`). A full-stack web app that produces **Statement of Applicability (SOA)**, **System Security Plan (SSP)**, and **Cloud Control Matrix (CCM)** artefacts from **OSCAL** catalogues and profiles (NIST 800-53, Australian ISM, Singapore IM8, German BSI). A React UI drives a Node.js/Express backend for APIs, auth, config, and optional AI-assisted control suggestions.

| Layer | Technology |
|-------|------------|
| Frontend | React, Vite (dev proxy to backend) |
| Backend | Node.js, Express |
| Auth | Session users (`config/app/users.json`, PBKDF2); optional OIDC/Okta |
| AI (optional) | AWS Bedrock and/or Mistral API — configured in app settings |
| Data (optional) | PostgreSQL / AWS RDS for extended/export sync |
| Deploy | Docker; AWS via Terraform (ALB, Green/Blue EC2, S3) |

Default local ports: backend **3020**, frontend dev **3021**. Current version and release history: [CHANGELOG.md](CHANGELOG.md). Canonical repo: [adobe/OSCAL-Reports](https://github.com/adobe/OSCAL-Reports); default branch **Development**.

**Repository layout:** `backend/` (API, auth, OSCAL processing, AI) · `frontend/` (SPA) · `config/app/` (runtime config/user patterns) · `terraform/` (AWS infra) · `scripts/` (deploy, automation, SSH; see [../scripts/README.md](../scripts/README.md)) · `test_cases/backend/` (Jest) · `docs/` (this folder).

---

## Start here by role

| Role | Read in this order |
|------|--------------------|
| 👨‍💻 **Developer** | [ARCHITECTURE.md](ARCHITECTURE.md) → [BEST_PRACTICES.md](BEST_PRACTICES.md) → [GIT_AND_RELEASE.md](GIT_AND_RELEASE.md) |
| 🚀 **DevOps / deploy** | [DEPLOYMENT_AND_OPERATIONS.md](DEPLOYMENT_AND_OPERATIONS.md) → [DOCKER_HUB_GUIDE.md](DOCKER_HUB_GUIDE.md) → [DEPLOYMENT_AND_OPERATIONS.md](DEPLOYMENT_AND_OPERATIONS.md) |
| 👤 **End user** | [USER_GUIDE.md](USER_GUIDE.md) → [OSCAL_SAR.md](OSCAL_SAR.md) |
| 🔐 **Security reviewer** | [SECURITY.md](SECURITY.md) → [AI_INTEGRATION.md](AI_INTEGRATION.md) → [BEST_PRACTICES.md](BEST_PRACTICES.md) |
| ✅ **QA / tester** | [QUALITY_ASSURANCE.md](QUALITY_ASSURANCE.md) → [DEPLOYMENT_AND_OPERATIONS.md](DEPLOYMENT_AND_OPERATIONS.md) |

From the repo root: `npm run install:all`, `npm run dev`, `npm run lint:all`. Backend tests: `cd backend && npm test`.

---

## Documentation map

### Architecture & development
| Document | What's inside |
|----------|---------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture and design. |
| [BEST_PRACTICES.md](BEST_PRACTICES.md) | Coding standards, security patterns, configuration reference, and infrastructure best practices (network/ALB tags, TLS/PKI — Part 5). |
| [AI_INTEGRATION.md](AI_INTEGRATION.md) | AI security/architecture, models (Mistral, Gemma), Bedrock/Mistral config, token limits, troubleshooting. |
| [DATABASE_INTEGRATION.md](DATABASE_INTEGRATION.md) | Optional PostgreSQL/RDS, export sync, `extended_data` fields. |
| [BSI_CATALOGUE_INTEGRATION.md](BSI_CATALOGUE_INTEGRATION.md) | German BSI security-standards integration. |

### Deployment & Docker
| Document | What's inside |
|----------|---------------|
| [DEPLOYMENT_AND_OPERATIONS.md](DEPLOYMENT_AND_OPERATIONS.md) | Complete deployment guide (Docker, local, cloud overview). **Start here for deploy.** |
| [DOCKER_HUB_GUIDE.md](DOCKER_HUB_GUIDE.md) | Docker Hub image: pull, run, CI/CD publishing, troubleshooting. |
| [DEPLOYMENT_AND_OPERATIONS.md](DEPLOYMENT_AND_OPERATIONS.md) | Cloud platforms (Azure, AWS, GCP) overview. |
| [CONFIG_AND_USER_MIGRATION.md](CONFIG_AND_USER_MIGRATION.md) | Local dev config paths, config migration, Blue/Green user consolidation, S3-default recovery. |

### AWS & infrastructure
| Document | What's inside |
|----------|---------------|
| [DEPLOYMENT_AND_OPERATIONS.md](DEPLOYMENT_AND_OPERATIONS.md) | Terraform (ALB, Green/Blue ASG + EBS, S3, RDS), Image Factory AMIs, Bedrock setup, EC2/S3 deploy runbooks, costs. **Main AWS runbook.** |
| [CROSS_ACCOUNT_BEDROCK_PHASE1.md](CROSS_ACCOUNT_BEDROCK_PHASE1.md) | Cross-account Bedrock Phase 1: Account B IAM runbook, Terraform AssumeRole, validation. |
| [BEST_PRACTICES.md](BEST_PRACTICES.md#part-5-infrastructure-best-practices-network--alb-tags--tls--pki) — Part 5 | Network segments, SG allow lists, prefix lists, ALB tags (`Adobe:PublicPorts`/`Adobe:PortJustification`), and corporate PKI / TLS / ACM import runbook. |

### Authentication / SSO
| Document | What's inside |
|----------|---------------|
| [OIDC_SSO_INTEGRATION.md](OIDC_SSO_INTEGRATION.md) | Okta SSO, Generic OIDC (button, callback, backend flow, config), IdP-group role inheritance, portable checklist. |

### Security & quality
| Document | What's inside |
|----------|---------------|
| [SECURITY.md](SECURITY.md) | OWASP alignment, security features, vulnerability history. |
| [QUALITY_ASSURANCE.md](QUALITY_ASSURANCE.md) | QA checklists, verification report template, BSI testing, **and the pre-commit/CI validation system (Part 4)**. |

### Git, release & history
| Document | What's inside |
|----------|---------------|
| [GIT_AND_RELEASE.md](GIT_AND_RELEASE.md) | Version bumping & release, branching (Development → Quality → main/Prod), single remote, GitHub auth, PR checklist. |
| [CHANGELOG.md](CHANGELOG.md) | Version history + per-release regression-prevention checklists (folds the former `RELEASE_*.md` records). |

### User documentation
| Document | What's inside |
|----------|---------------|
| [USER_GUIDE.md](USER_GUIDE.md) | Application features and workflows. |
| [OSCAL_SAR.md](OSCAL_SAR.md) | OSCAL Security Assessment Results (SAR) export and NIST 800-53 mapping. |

### Diagrams
| Document | What's inside |
|----------|---------------|
| [diagrams/README.md](diagrams/README.md) | Architecture diagrams and generators. |

---

## Documentation guidelines

- **Location:** permanent docs live under `docs/`; only `README.md` sits at the repo root.
- **Naming:** `DESCRIPTIVE_NAME.md` (UPPERCASE for major guides).
- **No duplicates:** extend an existing guide rather than adding a near-duplicate; add a row here only when introducing a new top-level guide.
- **No session logs or one-off troubleshooting dumps** in `docs/`.
- **Release records** go into [CHANGELOG.md](CHANGELOG.md) under the version heading — do not create per-version `RELEASE_*.md` files.

**Need help?** Open an issue or PR on [adobe/OSCAL-Reports](https://github.com/adobe/OSCAL-Reports/issues).

---

**Last updated:** September 2026
