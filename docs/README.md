# 📚 OSCAL Report Generator Documentation

**Organized documentation for development, deployment, and maintenance.**

---

## 📖 Quick navigation

### 🚀 Getting started

| Document | Description | For |
|----------|-------------|-----|
| [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) | One-page project purpose, stack, layout, and doc links | **Overview** |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Complete deployment guide (Docker, local, cloud overview) | **Start here** |
| [DOCKER_HUB_GUIDE.md](DOCKER_HUB_GUIDE.md) | Docker Hub image (pull, run, CI/CD, troubleshooting) | Docker users |

---

### 🏗️ Architecture & development

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture and design |
| [BEST_PRACTICES.md](BEST_PRACTICES.md) | Coding standards and best practices |
| [AI_INTEGRATION.md](AI_INTEGRATION.md) | **Consolidated:** AI security/architecture, models (Mistral, Gemma), Bedrock/Mistral config, token limits, troubleshooting |
| [BSI_CATALOGUE_INTEGRATION.md](BSI_CATALOGUE_INTEGRATION.md) | German BSI security standards integration |
| [DATABASE_INTEGRATION.md](DATABASE_INTEGRATION.md) | Optional PostgreSQL/RDS, export sync, `extended_data` fields |

---

### 🔧 Git, release, and workflow

| Document | Description |
|----------|-------------|
| [GIT_AND_RELEASE.md](GIT_AND_RELEASE.md) | **Consolidated:** version bumping & release, branching (Dev/QA/Pre_Prod → main), dual remotes (Adobe + personal), GitHub accounts, PR checklist |
| [VALIDATION_SYSTEM.md](VALIDATION_SYSTEM.md) | Pre-commit validation system |
| [CHANGELOG.md](CHANGELOG.md) | Version history |

**Current release:** **1.7.23** (2026-06-29) — Dependabot dependency updates (#45–#61), CI/test stabilization, version alignment. See [CHANGELOG.md](CHANGELOG.md#1723---2026-06-29).

---

### ☁️ AWS & cloud

| Document | Description |
|----------|-------------|
| [AWS_OPERATIONS.md](AWS_OPERATIONS.md) | **Consolidated:** Terraform (ALB, Green/Blue ASG + EBS, S3 `installer/`/`config`/`logs`, RDS), Image Factory AMIs, Amazon Bedrock setup, EC2/S3 deploy scripts, cost estimates |
| [TLS_CERTIFICATE_AND_PKI.md](TLS_CERTIFICATE_AND_PKI.md) | Corporate PKI / PLM CSR, `OSCAL_Reports_data/tls/` paths, ACM import, replace Let's Encrypt on ALB |
| [CROSS_ACCOUNT_BEDROCK_PHASE1.md](CROSS_ACCOUNT_BEDROCK_PHASE1.md) | Cross-account Bedrock Phase 1: Account B IAM runbook, Terraform AssumeRole, validation (no app change) |
| [TERRAFORM_NETWORK_PCL_AND_TAGS.md](TERRAFORM_NETWORK_PCL_AND_TAGS.md) | **Portability:** VPC segments, SG allow lists, Australia prefix lists, **ALB tags** (`Adobe:PublicPorts`, `Adobe:PortJustification`), PCL notes — copy to other projects |
| [CLOUD_DEPLOYMENT.md](CLOUD_DEPLOYMENT.md) | Cloud platforms (Azure, AWS, GCP) |

---

### 🐳 Docker & migration

| Document | Description |
|----------|-------------|
| [DOCKER_HUB_GUIDE.md](DOCKER_HUB_GUIDE.md) | Docker Hub guide (same as above quick link) |
| [CONFIG_AND_USER_MIGRATION.md](CONFIG_AND_USER_MIGRATION.md) | Local dev paths, config migration, user consolidation (Blue/Green) |

---

### 👥 User documentation

| Document | Description |
|----------|-------------|
| [USER_GUIDE.md](USER_GUIDE.md) | Application features |
| [OSCAL_SAR.md](OSCAL_SAR.md) | OSCAL Security Assessment Results (SAR) |

---

### 🔐 Authentication / SSO

| Document | Description |
|----------|-------------|
| [OIDC_SSO_INTEGRATION.md](OIDC_SSO_INTEGRATION.md) | OIDC/SSO: Okta (EC2/production), **Generic_OIDC / Authentik** (local/Docker), login page policy |

---

### 🔒 Security & quality

| Document | Description |
|----------|-------------|
| [SECURITY.md](SECURITY.md) | OWASP alignment, security features, vulnerability notes |
| [QUALITY_ASSURANCE.md](QUALITY_ASSURANCE.md) | QA processes and testing |

---

### 📐 Diagrams

| Document | Description |
|----------|-------------|
| [diagrams/README.md](diagrams/README.md) | Architecture diagrams and generators |

---

## 📊 Documentation statistics

- **Core guides in `docs/`:** consolidated where topics overlapped (Git/release, AI, AWS).
- **Categories:** Getting started, architecture, Git/release, AWS/cloud, Docker, users, SSO, security/QA.

---

## 🎯 Quick links by role

### 👨‍💻 Developer

[ARCHITECTURE.md](ARCHITECTURE.md) → [BEST_PRACTICES.md](BEST_PRACTICES.md) → [GIT_AND_RELEASE.md](GIT_AND_RELEASE.md)

From repo root: **`npm run install:all`**, **`npm run dev`**, **`npm run lint:all`** (ESLint root + backend + frontend). Backend tests: **`cd backend && npm test`** (Jest config under `test_cases/backend/`).

### 🚀 DevOps / deployment

[DEPLOYMENT.md](DEPLOYMENT.md) → [DOCKER_HUB_GUIDE.md](DOCKER_HUB_GUIDE.md) → [AWS_OPERATIONS.md](AWS_OPERATIONS.md)

### 👤 End user

[USER_GUIDE.md](USER_GUIDE.md) → [OSCAL_SAR.md](OSCAL_SAR.md)

### 🔐 Security reviewer / assessor

[USER_GUIDE.md](USER_GUIDE.md) → [OSCAL_SAR.md](OSCAL_SAR.md) → [AI_INTEGRATION.md](AI_INTEGRATION.md) → [BEST_PRACTICES.md](BEST_PRACTICES.md)

### ✅ QA / tester

[QUALITY_ASSURANCE.md](QUALITY_ASSURANCE.md) → [DEPLOYMENT.md](DEPLOYMENT.md)

---

## 📝 Documentation guidelines

1. **Location:** All permanent docs live under `/docs/` (see repository rules for `logs/` vs `docs/`).
2. **Naming:** `DESCRIPTIVE_NAME.md` (UPPERCASE for major guides).
3. **Format:** Table of contents and clear headings for long guides.
4. **Index:** Update this file when adding a **new** top-level guide.

### What not to add

- Session logs or one-off troubleshooting dumps in `docs/`
- Duplicate content—extend an existing guide or add a section with a link from this index

---

## 🔄 Consolidation (2026-04)

The following former files are merged (edit the **consolidated** doc only):

| Former files | Now |
|--------------|-----|
| `VERSION_AND_RELEASE.md`, `BRANCHING_STRATEGY.md`, `DUAL_REPO_SETUP.md`, `GITHUB_ACCOUNT_GUIDE.md`, `PR_SUBMISSION_CHECKLIST.md` | [GIT_AND_RELEASE.md](GIT_AND_RELEASE.md) |
| `AI_ARCHITECTURE_SECURITY.md`, `AI_MODELS_AND_CONFIG.md` | [AI_INTEGRATION.md](AI_INTEGRATION.md) |
| `AWS_TERRAFORM.md`, `IMAGE_FACTORY.md`, `AWS_BEDROCK_SETUP.md`, `EC2_WEB_HOSTING_BEST_PRACTICES.md`, `AWS_COST_ESTIMATE.md` | [AWS_OPERATIONS.md](AWS_OPERATIONS.md) |

To regenerate merged files from historical sources (only if those sources exist in a branch), use git history on the consolidated docs listed above (the one-time `build-consolidated-docs.py` helper was removed in **1.7.20**).

---

## 🆘 Need help?

- **Issue:** Open a GitHub issue on the repository you use (Adobe or personal remote).
- **Updates:** Submit a PR with documentation changes.

---

**Version:** 1.7.23 · **Last updated:** June 2026
