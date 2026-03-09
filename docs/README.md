# 📚 OSCAL Report Generator Documentation

**Organized documentation for development, deployment, and maintenance**

---

## 📖 Quick Navigation

### 🚀 Getting Started

| Document | Description | For |
|----------|-------------|-----|
| [DEPLOYMENT.md](DEPLOYMENT.md) | Complete deployment guide (Docker, TrueNAS, Local) | **Start Here** |
| [DOCKER_HUB_README.md](DOCKER_HUB_README.md) | Docker Hub image documentation | Docker Users |

---

### 🏗️ Architecture & Development

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture and design |
| [BEST_PRACTICES.md](BEST_PRACTICES.md) | Coding standards and best practices |
| [AI_ARCHITECTURE_SECURITY.md](AI_ARCHITECTURE_SECURITY.md) | AI integration security design |
| [AI_MODELS_AND_CONFIG.md](AI_MODELS_AND_CONFIG.md) | AI models (Mistral, Gemma), config, and token limits |
| [AWS_BEDROCK_SETUP.md](AWS_BEDROCK_SETUP.md) | Step-by-step AWS setup for Bedrock AI integration (IAM, model access, config) |
| [BSI_CATALOGUE_INTEGRATION.md](BSI_CATALOGUE_INTEGRATION.md) | German BSI security standards integration |

---

### 🔧 Development Workflow

| Document | Description |
|----------|-------------|
| [KEEPING_LOCAL_USERS.md](KEEPING_LOCAL_USERS.md) | Keep your local users.json from being overwritten (USERS_PATH, .env) |
| [VERSION_AND_RELEASE.md](VERSION_AND_RELEASE.md) | Version bumping, workflow, and release checklist |
| [BRANCHING_STRATEGY.md](BRANCHING_STRATEGY.md) | Git branching workflow (Dev → QA → Pre-Prod → Main) |
| [DUAL_REPO_SETUP.md](DUAL_REPO_SETUP.md) | Managing Adobe + Personal repositories |
| [GITHUB_ACCOUNT_GUIDE.md](GITHUB_ACCOUNT_GUIDE.md) | Switching between GitHub accounts |
| [PR_SUBMISSION_CHECKLIST.md](PR_SUBMISSION_CHECKLIST.md) | Pull request submission guide |
| [VALIDATION_SYSTEM.md](VALIDATION_SYSTEM.md) | Pre-commit validation system |
| [CHANGELOG.md](CHANGELOG.md) | Version history and changes |

---

### 🐳 Docker & Deployment

| Document | Description |
|----------|-------------|
| [DOCKER_HUB_GUIDE.md](DOCKER_HUB_GUIDE.md) | Complete Docker Hub guide (includes build vs pull comparison) |
| [DOCKER_HUB_README.md](DOCKER_HUB_README.md) | Docker Hub public documentation |
| [CLOUD_DEPLOYMENT.md](CLOUD_DEPLOYMENT.md) | Cloud platform deployment (Azure, AWS, GCP) |
| [CONFIG_AND_USER_MIGRATION.md](CONFIG_AND_USER_MIGRATION.md) | Config migration and user consolidation (Blue/Green) |
| [AWS_COST_ESTIMATE.md](AWS_COST_ESTIMATE.md) | AWS EC2 cost estimate |
| [AWS_TERRAFORM.md](AWS_TERRAFORM.md) | Terraform for OSCAL on AWS (ALB, Green/Blue; AI via AWS Bedrock) |
| [EC2_WEB_HOSTING_BEST_PRACTICES.md](EC2_WEB_HOSTING_BEST_PRACTICES.md) | EC2 web hosting best practices: directory layout, deploy, cron, Blue/Green, troubleshooting, scripts |
| [IMAGE_FACTORY.md](IMAGE_FACTORY.md) | Adobe Image Factory Amazon Linux 2023 AMIs for Terraform (AMS deployments) |
| [AWS_SANDBOX_REQUEST.md](AWS_SANDBOX_REQUEST.md) | Jira ticket and URL for requesting designated AWS Sandbox account |

---

### 🖥️ TrueNAS (retired)

TrueNAS build–specific scripts and docs have been moved to **[retired/truenas-build/](../retired/truenas-build/)** so they are not mixed with core solution files. They may be removed after 6 months once the project is stable. For TrueNAS deployment, see [DEPLOYMENT.md](DEPLOYMENT.md) (Docker Hub image + Custom App).

---

### 👥 User Documentation

| Document | Description |
|----------|-------------|
| [USER_GUIDE.md](USER_GUIDE.md) | Complete user guide for application features |
| [OSCAL_SAR.md](OSCAL_SAR.md) | OSCAL Security Assessment Results (SAR) guide |

---

### 🔐 Authentication / SSO

| Document | Description |
|----------|-------------|
| [OKTA_OIDC_INTEGRATION.md](OKTA_OIDC_INTEGRATION.md) | Okta OIDC sign-in and groups/role mapping (production: https://keekar.3utilities.com/) |

---

### 🔒 Security & Quality

| Document | Description |
|----------|-------------|
| [SECURITY.md](SECURITY.md) | OWASP compliance, security features, and vulnerability history |
| [QUALITY_ASSURANCE.md](QUALITY_ASSURANCE.md) | QA processes and testing |

---

## 📊 Documentation Statistics

- **Total Documents:** 27 (consolidated from 48+ in Feb 2026)
- **Categories:** 8
- **Last Update:** 2026-02-10

---

## 🎯 Quick Links by Role

### 👨‍💻 **Developer**
Start with: [ARCHITECTURE.md](ARCHITECTURE.md) → [BEST_PRACTICES.md](BEST_PRACTICES.md) → [VERSION_AND_RELEASE.md](VERSION_AND_RELEASE.md)

### 🚀 **DevOps/Deployment**
Start with: [DEPLOYMENT.md](DEPLOYMENT.md) → [DOCKER_HUB_GUIDE.md](DOCKER_HUB_GUIDE.md)

### 👤 **End User**
Start with: [USER_GUIDE.md](USER_GUIDE.md) → [OSCAL_SAR.md](OSCAL_SAR.md)

### 🔐 **Security Reviewer / Assessor**
Start with: [USER_GUIDE.md](USER_GUIDE.md) → [OSCAL_SAR.md](OSCAL_SAR.md) → [AI_ARCHITECTURE_SECURITY.md](AI_ARCHITECTURE_SECURITY.md) → [BEST_PRACTICES.md](BEST_PRACTICES.md)

### ✅ **QA/Tester**
Start with: [QUALITY_ASSURANCE.md](QUALITY_ASSURANCE.md) → [DEPLOYMENT.md](DEPLOYMENT.md)

---

## 📝 Documentation Guidelines

### Creating New Documentation

1. **Location:** All docs go in `/docs/` folder
2. **Naming:** Use `DESCRIPTIVE_NAME.md` (UPPERCASE for major docs)
3. **Format:** Include table of contents, clear headings
4. **Updates:** Update this README index when adding new docs

### What NOT to Document

- ❌ Session logs or temporary troubleshooting files
- ❌ One-time migration guides (remove after completion)
- ❌ Duplicate content across multiple files
- ❌ Test results or execution summaries

### Documentation Lifecycle

- **Active:** Current, maintained documentation
- **Archive:** Move to `/docs/archive/` if historical but valuable
- **Remove:** Delete temporary, outdated, or superseded docs

---

## 🔄 Recent Cleanup (2026-02-10)

**Removed 27 files; added 5 consolidated docs:**
- One-time/outdated: IMMEDIATE_ACTION_REQUIRED, KODIAK_CSRF_RESPONSE, SECURITY_FIX_SUMMARY, SECURITY_FINDINGS_IMPLEMENTATION_SUMMARY, TEST_UPDATES_V1.6.5, GEMMA_IMPLEMENTATION_SUMMARY, VERSION_CONTROL_SETUP_SUMMARY, DOCKER_HUB_DEPLOYMENT_IMPLEMENTATION, DEPLOYMENT_TESTING_GUIDE
- Consolidated: AI (6→1), TrueNAS (3→1), Security (3→1), Version/Release (3→1), Config/User migration (2→1)
- Deployment comparison merged into DOCKER_HUB_GUIDE

**Result:** ~50% fewer .md files; single entry points per topic

---

## 🆘 Need Help?

- **Issue:** Create a GitHub issue
- **Questions:** Check relevant doc first, then ask team
- **Updates:** Submit PR with documentation changes

---

*Last updated: 2026-02-10*
