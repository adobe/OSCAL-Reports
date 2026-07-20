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
- **AWS (Terraform):** ALB, Green/Blue EC2 (ASG + EBS), S3 (`installer/` app snapshot, `config/` & `logs/` per role). Resources tagged (Project, Environment, Stack). See [terraform/README.md](terraform/README.md) and [docs/AWS_OPERATIONS.md](docs/AWS_OPERATIONS.md).
- **EC2 / S3 deploy:** Application bits are **`s3://<logs-bucket>/installer/`** (not rsync from the laptop by default). **`./scripts/deploy-to-ec2.sh --update-s3`** uploads the repo to that prefix (with excludes for `.cursor`, `terraform/`, `docs/`, etc.); **`./scripts/deploy-to-ec2.sh`**, **`--blue`**, or **`--both`** only pull from S3 on the instances, run **`dnf upgrade -y`** or **`yum update -y`** first, then install/build/restart. AWS credentials for upload come from **Pass** (same entry shape as `terraform/run-with-aws-pass.sh`). Cron on instances: **`scripts/ec2_automation.sh`** (S3 backup; optional installer sync / OS updates via `ec2_automation.env`). Details: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), [docs/AWS_OPERATIONS.md](docs/AWS_OPERATIONS.md#ec2-web-hosting-best-practices).

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

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/AWS_OPERATIONS.md](docs/AWS_OPERATIONS.md#amazon-bedrock-integration-step-by-step-aws-setup) for full configuration and deployment.

---

## Documentation index

| Topic | Document |
|-------|----------|
| **Summary** | [docs/PROJECT_SUMMARY.md](docs/PROJECT_SUMMARY.md) – purpose, stack, layout |
| **Start** | [docs/README.md](docs/README.md) – doc index |
| **Deploy** | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| **Architecture** | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| **AWS / Terraform** | [docs/AWS_OPERATIONS.md](docs/AWS_OPERATIONS.md), [terraform/README.md](terraform/README.md) |
| **Branching / Git / release** | [docs/GIT_AND_RELEASE.md](docs/GIT_AND_RELEASE.md) |
| **AI (Bedrock/Mistral)** | [docs/AI_INTEGRATION.md](docs/AI_INTEGRATION.md), [docs/AWS_OPERATIONS.md](docs/AWS_OPERATIONS.md#amazon-bedrock-integration-step-by-step-aws-setup) |
| **Database (optional)** | [docs/DATABASE_INTEGRATION.md](docs/DATABASE_INTEGRATION.md) – PostgreSQL/RDS, export sync, extended_data |

---

## What's new in 1.7.27

- **Security (VULN-37000):** Authentication and ownership on async job create/status/download; per-user job rate limits; status response redaction; regression + proactive API auth inventory tests.
- **Deploy:** Passive-first Blue/Green rollout and 502 prevention during AMI/ASG refresh; installer manifest reconciles root, backend, and frontend `package.json` (footer version fix).
- **Deploy:** `keekar/oscal_reports:v1.7.27` and `ghcr.io/adobe/oscal-report-generator:v1.7.27` when published.
- **Full record:** [docs/RELEASE_1.7.27.md](docs/RELEASE_1.7.27.md).

Details: [docs/CHANGELOG.md](docs/CHANGELOG.md#1727---2026-07-20).

---

## What's new in 1.7.25

- **Security:** SSRF remediation (VULN-36986) — authenticated proxy/catalogue fetch, strict URL profiles, no redirects. Settings disclosure (VULN-36998) — admin-only `/api/settings`, runtime allowlist endpoint, SMTP/email retired, self-registration removed. Bedrock access control (VULN-37020) — settings redaction, Terraform ExternalId gate.
- **AMS Non-Prod:** Image Factory EMR **3.0.2** (SSAAU-216); Splunk UF SCC bootstrap (SSAAU-212).
- **Terraform / GHCR:** Docker mode on EC2 uses `ghcr.io/adobe/oscal-report-generator`; CI publishes to GHCR and Docker Hub.
- **Dependencies:** Dependabot library updates merged on Development (AWS SDK 3.1086, fast-xml-parser 5.10.1, lucide-react 1.24, vite 8.1.4); backend SMTP/`nodemailer` removed.
- **Deploy:** `keekar/oscal_reports:v1.7.25` and `ghcr.io/adobe/oscal-report-generator:v1.7.25` when published.
- **Full record:** [docs/RELEASE_1.7.25.md](docs/RELEASE_1.7.25.md) (checklist so issues do not regress).

Details: [docs/CHANGELOG.md](docs/CHANGELOG.md#1725---2026-07-18).

---

## What's new in 1.7.23

- **Dependencies:** Dependabot updates merged into Quality — AWS SDK, `express-rate-limit` 8.x, `pdfkit` 0.19, `pg`, React 19.2.7, and related security/toolchain bumps (#45–#61).
- **CI / tests:** Quality Gates action updates; OIDC and Docker bootstrap unit tests stable in CI; optional live OIDC probe via `OSCAL_RUN_OIDC_PROBE=1`.
- **Deploy:** `keekar/oscal_reports:v1.7.23` when published to Docker Hub.

Details: [docs/CHANGELOG.md](docs/CHANGELOG.md#1723---2026-06-29).

---

## What's new in 1.7.22

- **Pass bundle (laptop):** All OSCAL app secrets in one pass entry `PROD/OSCAL/AWS_SM` (same JSON as AWS SM); migrate legacy `OSCAL/*` with `migrate-pass-entries-to-bundle.sh`.
- **EC2 deploy safety:** `DEPLOY_CONFIG_S3_SKIP=1` for code-only deploys; golden **`config/default/`** on S3 for restore; no more accidental SSO/config wipe from force S3 sync.
- **Generic OIDC / SSO:** Fixes orphan `_sm` pointers when SM empty; login providers API returns Generic SSO when secret is resolvable.
- **Deploy:** `keekar/oscal_reports:v1.7.22` on Docker Hub; EC2 via safe flags above.

Details: [docs/CHANGELOG.md](docs/CHANGELOG.md#1722---2026-06-26).

---

## What's new in 1.7.21 (previous)

- **Multi-Report Comparison:** Export uses the same `generate-ssp` path as the main app; fixes gateway timeouts, validation modal dismiss, and `_ComplianceReport` filenames.
- **AI suggestions:** Per-control prompts (catalog description, statement parts) so Gemma/Mistral outputs vary by control.
- **Generic OIDC (Docker/NAS):** `tlsRelaxed` when Authentik TLS chain fails Node verification; EC2 production remains Okta-first.
- **Deploy:** `keekar/oscal_reports:v1.7.21` on Docker Hub; EC2 via `./scripts/deploy-to-ec2.sh --update-s3` then `--both`.

Details: [docs/CHANGELOG.md](docs/CHANGELOG.md#1721---2026-06-25).

---

## License

MIT. See [LICENSE](LICENSE).

---

**Version:** 1.7.27 (see root `package.json`) · **Last updated:** July 2026
