# 📚 OSCAL Report Generator Documentation

**Organized documentation for development, deployment, and maintenance**

---

## 📖 Quick Navigation

### 🚀 Getting Started

| Document | Description | For |
|----------|-------------|-----|
| [DEPLOYMENT.md](DEPLOYMENT.md) | Complete deployment guide (Docker, TrueNAS, Local) | **Start Here** |
| [TRUENAS_QUICK_REFERENCE.md](TRUENAS_QUICK_REFERENCE.md) | 5-minute TrueNAS installation guide | Quick Setup |
| [DOCKER_HUB_README.md](DOCKER_HUB_README.md) | Docker Hub image documentation | Docker Users |

---

### 🏗️ Architecture & Development

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture and design |
| [BEST_PRACTICES.md](BEST_PRACTICES.md) | Coding standards and best practices |
| [AI_ARCHITECTURE_SECURITY.md](AI_ARCHITECTURE_SECURITY.md) | AI integration security design |
| [BSI_CATALOGUE_INTEGRATION.md](BSI_CATALOGUE_INTEGRATION.md) | German BSI security standards integration |

---

### 🔧 Development Workflow

| Document | Description |
|----------|-------------|
| [VERSION_CONTROL_WORKFLOW.md](VERSION_CONTROL_WORKFLOW.md) | Automated version bumping and release workflow |
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
| [DOCKER_HUB_GUIDE.md](DOCKER_HUB_GUIDE.md) | Complete Docker Hub publishing guide |
| [DEPLOYMENT_COMPARISON.md](DEPLOYMENT_COMPARISON.md) | Build vs Pull deployment comparison |
| [DOCKER_HUB_README.md](DOCKER_HUB_README.md) | Docker Hub public documentation |
| [CLOUD_DEPLOYMENT.md](CLOUD_DEPLOYMENT.md) | Cloud platform deployment (Azure, AWS, GCP) |

---

### 🖥️ TrueNAS Deployment

| Document | Description |
|----------|-------------|
| [TRUENAS_QUICK_REFERENCE.md](TRUENAS_QUICK_REFERENCE.md) | Quick reference card (5-min setup) |
| [TRUENAS_INSTALLATION.md](TRUENAS_INSTALLATION.md) | Detailed installation guide |
| [TRUENAS_APP_CATALOG.md](TRUENAS_APP_CATALOG.md) | Custom app catalog integration |

---

### 🔒 Quality

| Document | Description |
|----------|-------------|
| [QUALITY_ASSURANCE.md](QUALITY_ASSURANCE.md) | QA processes and testing |

---

## 📊 Documentation Statistics

- **Total Documents:** 21
- **Categories:** 6
- **Last Update:** 2026-02-03

---

## 🎯 Quick Links by Role

### 👨‍💻 **Developer**
Start with: [ARCHITECTURE.md](ARCHITECTURE.md) → [BEST_PRACTICES.md](BEST_PRACTICES.md) → [VERSION_CONTROL_WORKFLOW.md](VERSION_CONTROL_WORKFLOW.md)

### 🚀 **DevOps/Deployment**
Start with: [DEPLOYMENT.md](DEPLOYMENT.md) → [DOCKER_HUB_GUIDE.md](DOCKER_HUB_GUIDE.md) → [TRUENAS_QUICK_REFERENCE.md](TRUENAS_QUICK_REFERENCE.md)

### 👤 **End User**
Start with: [DOCKER_HUB_README.md](DOCKER_HUB_README.md) → [TRUENAS_QUICK_REFERENCE.md](TRUENAS_QUICK_REFERENCE.md)

### 🔐 **Security Reviewer**
Start with: [AI_ARCHITECTURE_SECURITY.md](AI_ARCHITECTURE_SECURITY.md) → [BEST_PRACTICES.md](BEST_PRACTICES.md)

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

## 🔄 Recent Cleanup (2026-01-28)

**Removed 18 files:**
- Session summaries and workflow analyses
- Outdated test automation documentation
- Completed migration guides
- Duplicate deployment guides
- Specific PR and bug fix logs

**Result:** 48% reduction in file count, cleaner organization

---

## 🆘 Need Help?

- **Issue:** Create a GitHub issue
- **Questions:** Check relevant doc first, then ask team
- **Updates:** Submit PR with documentation changes

---

*Last updated: 2026-01-28*
