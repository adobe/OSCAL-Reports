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

- **AI:** AWS Bedrock (default) or Mistral API. No self-hosted Ollama. Configure in **Settings → AI Integration** or via `config/app/config.json` (see [docs/AI_MODELS_AND_CONFIG.md](docs/AI_MODELS_AND_CONFIG.md)).
- **Auth:** Session-based; users in `config/app/users.json` (PBKDF2). Optional OIDC/SSO e.g. Okta (see [docs/OIDC_SSO_INTEGRATION.md](docs/OIDC_SSO_INTEGRATION.md)).
- **Branching:** Development / Quality_Test / Pre_Prod → main. PRs to **main** allowed from any of these three branches (see [docs/BRANCHING_STRATEGY.md](docs/BRANCHING_STRATEGY.md)).
- **AWS (Terraform):** ALB, Green/Blue EC2 instances, S3 (logs, config, users). All resources tagged (Project, Environment, Stack) for easy add/remove per account. See [terraform/README.md](terraform/README.md) and [docs/AWS_TERRAFORM.md](docs/AWS_TERRAFORM.md).

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
├── scripts/                 # Deploy, EC2, debug
│   ├── deploy-to-ec2.sh     # Deploy to Green/Blue
│   └── debug/               # SSH, EC2 helpers
├── terraform/               # AWS (ALB, Green/Blue, S3)
│   ├── envs/                # Per-account (e.g. aws4403)
│   └── ...
├── test_cases/              # Backend tests (Jest)
├── docs/                    # Documentation
├── retired/                 # Retired assets (e.g. truenas-build)
├── package.json             # Root scripts (dev, install:all, lint)
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

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/AWS_BEDROCK_SETUP.md](docs/AWS_BEDROCK_SETUP.md) for full configuration and deployment.

---

## Documentation index

| Topic | Document |
|-------|----------|
| **Start** | [docs/README.md](docs/README.md) – doc index |
| **Deploy** | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| **Architecture** | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| **AWS / Terraform** | [docs/AWS_TERRAFORM.md](docs/AWS_TERRAFORM.md), [terraform/README.md](terraform/README.md) |
| **Branching** | [docs/BRANCHING_STRATEGY.md](docs/BRANCHING_STRATEGY.md) |
| **AI (Bedrock/Mistral)** | [docs/AI_MODELS_AND_CONFIG.md](docs/AI_MODELS_AND_CONFIG.md), [docs/AWS_BEDROCK_SETUP.md](docs/AWS_BEDROCK_SETUP.md) |

---

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).

---

**Version:** 1.7.10 · **Last updated:** March 2026
