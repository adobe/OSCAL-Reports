# OSCAL Report Generator

Generate **Statement of Applicability (SOA)**, **System Security Plans (SSP)**, and **Cloud Control Matrix (CCM)** from OSCAL catalogs. React frontend, Node.js backend; AI suggestions via **AWS Bedrock** or Mistral API.

---

## Quick start

```bash
# Install dependencies (root, backend, frontend)
npm run install:all

# Run locally: backend (port 3020) + frontend (port 3021)
npm run dev
```

Open **http://localhost:3021**. Backend API: **http://localhost:3020**.

---

## Design and configuration

- **AI:** AWS Bedrock (default) or Mistral API. No self-hosted Ollama. Configure in **Settings → AI Integration** or via `config/app/config.json` (see [docs/AI_INTEGRATION.md](docs/AI_INTEGRATION.md)).
- **Auth:** Session-based; users in `config/app/users.json` (PBKDF2). Optional OIDC/SSO e.g. Okta (see [docs/OIDC_SSO_INTEGRATION.md](docs/OIDC_SSO_INTEGRATION.md)).
- **Database (optional):** PostgreSQL or AWS RDS for storing custom/organisational fields. Configure in **Settings → Database**; export data is synced when enabled (see [docs/DATABASE_INTEGRATION.md](docs/DATABASE_INTEGRATION.md)).
- **Branching:** `Development` (default) → `Quality` → `main` / `Prod`. **`Pre_Prod` retired.** See [docs/GIT_AND_RELEASE.md](docs/GIT_AND_RELEASE.md#branching-strategy).
- **AWS (Terraform):** ALB, Green/Blue EC2 (ASG + EBS), S3 (`installer/` app snapshot, `config/` & `logs/` per role). Resources tagged (Project, Environment, Stack). See [terraform/README.md](terraform/README.md) and [docs/DEPLOYMENT_AND_OPERATIONS.md](docs/DEPLOYMENT_AND_OPERATIONS.md).
- **EC2 / S3 deploy:** Application bits are **`s3://<logs-bucket>/installer/`** (not rsync from the laptop by default). **`./scripts/deploy-to-ec2.sh --update-s3`** uploads the repo to that prefix (with excludes for `.cursor`, `terraform/`, `docs/`, etc.); **`./scripts/deploy-to-ec2.sh`**, **`--blue`**, or **`--both`** only pull from S3 on the instances, run **`dnf upgrade -y`** or **`yum update -y`** first, then install/build/restart. AWS credentials for upload come from **Pass** (same entry shape as `terraform/run-with-aws-pass.sh`). Cron on instances: **`scripts/ec2_automation.sh`** (S3 backup; optional installer sync / OS updates via `ec2_automation.env`). Details: [docs/DEPLOYMENT_AND_OPERATIONS.md](docs/DEPLOYMENT_AND_OPERATIONS.md), [docs/DEPLOYMENT_AND_OPERATIONS.md](docs/DEPLOYMENT_AND_OPERATIONS.md#ec2-web-hosting-best-practices).

---

## Directory structure

```
OSCAL_Reports/
├── backend/                 # Node.js + Express (port 3020)
│   ├── auth/                # Authentication, user management
│   ├── server.js            # Main server
│   ├── configManager.js     # Config (config.json, users.json)
│   ├── mistralService.js    # Mistral/Bedrock AI
│   ├── gemmaService.js      # Gemma (Bedrock/Google AI)
│   ├── controlSuggestionEngine.js
│   └── ...
├── frontend/                # React + Vite (dev port 3021)
│   └── src/
│       ├── components/      # UI (AIIntegration, CatalogChoice, etc.)
│       ├── contexts/
│       └── services/
├── config/
│   └── app/                 # Runtime config (gitignored in practice)
│       ├── config.json.example
│       └── users.json.example
├── scripts/                 # Deploy, EC2 automation, SSH, debug
│   ├── deploy-to-ec2.sh     # S3 installer/ + SSH deploy (Green/Blue; see header in script)
│   ├── ec2_automation.sh    # Cron: S3 backup, optional installer pull / OS updates
│   ├── ssh-ec2.sh           # SSH to Green or Blue via Terraform outputs
│   ├── lib/                 # Shared helpers (e.g. Pass + Terraform paths)
│   └── debug/               # e.g. alb-target-health.sh, EC2 diagnostics
├── terraform/               # AWS (ALB, Green/Blue, S3)
│   ├── envs/                # Per-account (e.g. aws4403)
│   └── ...
├── test_cases/              # Backend tests (Jest)
├── docs/                    # Documentation
├── package.json             # Root scripts (dev, install:all, lint, lint:all, probe-bedrock-gemma)
├── docker-compose.yml       # Single service (no Ollama)
└── Dockerfile
```

---

## Configuration parameters

| Source | Purpose |
|--------|--------|
| **config/app/config.json** | AI (Bedrock/Mistral), messaging, SSO. Use examples in `config/app/*.example`. |
| **config/app/users.json** | Users and PBKDF2 hashes. Populated from `users.json.example` or Settings. |
| **.env** (root) | Optional: `USERS_PATH`, `CONFIG_PATH`, `PORT`; backend loads from repo root in development. |
| **Environment** | `NODE_ENV`, `PORT`, `AWS_REGION` / AWS credentials for Bedrock when not using IAM role. |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DEPLOYMENT_AND_OPERATIONS.md](docs/DEPLOYMENT_AND_OPERATIONS.md#amazon-bedrock-integration-step-by-step-aws-setup) for full configuration and deployment.

---

## Documentation index

| Topic | Document |
|-------|----------|
| **Start** | [docs/README.md](docs/README.md) – doc index & project overview (purpose, stack, layout) |
| **Deploy** | [docs/DEPLOYMENT_AND_OPERATIONS.md](docs/DEPLOYMENT_AND_OPERATIONS.md) |
| **Architecture** | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| **AWS / Terraform** | [docs/DEPLOYMENT_AND_OPERATIONS.md](docs/DEPLOYMENT_AND_OPERATIONS.md), [terraform/README.md](terraform/README.md) |
| **Branching / Git / release** | [docs/GIT_AND_RELEASE.md](docs/GIT_AND_RELEASE.md) |
| **AI (Bedrock/Mistral)** | [docs/AI_INTEGRATION.md](docs/AI_INTEGRATION.md), [docs/DEPLOYMENT_AND_OPERATIONS.md](docs/DEPLOYMENT_AND_OPERATIONS.md#amazon-bedrock-integration-step-by-step-aws-setup) |
| **Database (optional)** | [docs/DATABASE_INTEGRATION.md](docs/DATABASE_INTEGRATION.md) – PostgreSQL/RDS, export sync, extended_data |

---

## Recent releases

Summary of the five most recent versions. Full history — including every prior release and the
operational runbooks — is in **[docs/CHANGELOG.md](docs/CHANGELOG.md)**.

- **1.8.00** — Catalogue library expansion (+8: FedRAMP Rev 5 ×4, CMS ARS 5.0 ×4; 25 across 7 publishers), BSI/ISM URL fixes, New/Updated badges + non-English flag, and an app-wide single-source-of-truth refactor (`config/constants/`) for control-status/roles/classification/system-status/service-model — fixing the ControlsList 4/7-status and SAR `alternate-control` bugs. [Details](docs/CHANGELOG.md#1800---2026-09-08).
- **1.7.31** — Responsive full-width UI: shared layout + surface tokens (`styles/layout.css`), single shared Feature Comparison table, background bleed fixes. [Details](docs/CHANGELOG.md#1731---2026-09-08).
- **1.7.30** — Restored fixes documented but never committed (drift correction): SSAAU-212 Splunk→SCC delivery (`emissary = "trusted"` VPC/subnet tag — the real root cause; errno-104 mutual-TLS resets), Bedrock auth-mode precedence, Bedrock `[object Object]` roleArn + Secrets Manager bundle-write no-op, and a `/health` `version` field. [Details](docs/CHANGELOG.md#1730---2026-09-08).
- **1.7.29** — Pass vault removed as a runtime dependency; config secrets stored as `_cfgenc` (local) / `_sm` (EC2); docs consolidated. [Details](docs/CHANGELOG.md#1729---2026-09-08).
- **1.7.28** — Ops/CI/security-maintenance: `Main`-only branching, Node.js 24.9.0+ floor, CI on `Main`, AMI-drift check via GitHub OIDC (no static keys). [Details](docs/CHANGELOG.md#1728---2026-08-09).

---

## License

MIT. See [LICENSE](LICENSE).

---

**Version:** 1.8.01 (see root `package.json`) · **Last updated:** September 2026
