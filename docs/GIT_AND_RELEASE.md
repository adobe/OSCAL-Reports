# Git, repositories, and releases

**Consolidated guide:** version bumping and release workflow, branching strategy, single canonical remote ([adobe/OSCAL-Reports](https://github.com/adobe/OSCAL-Reports)), GitHub authentication, and the PR submission checklist.

---

## Table of contents

- [Version Control and Release](#version-control-and-release)
- [🌳 Branching Strategy](#branching-strategy)
- [Single Repository Setup Guide](#single-repository-setup-guide)
- [GitHub Account Management Guide](#github-account-management-guide)
- [Pull Request Submission Checklist](#pull-request-submission-checklist)

---

<a id="version-control-and-release"></a>

## Version Control and Release

**Unified guide: version bumping, workflow, and release checklist.**

---

### Quick Reference

#### Version Bump (before merging to Quality/main/Prod)

```bash
# Bug fix: 1.6.4 → 1.6.5
./scripts/bump_version.sh patch "Fix: description"

# New feature: 1.6.4 → 1.7.0
./scripts/bump_version.sh minor "Add: description"

# Breaking change: 1.6.4 → 2.0.0
./scripts/bump_version.sh major "Breaking: description"
```

#### One-Time Setup

```bash
./scripts/setup-git-hooks.sh
git config core.hooksPath   # Should output: .githooks
```

#### Branch Flow

```
Development (default branch)
        │
        v
   Quality (integration + staging validation)
        │
        v
   main / Prod (production)
```

**Canonical repository:** [adobe/OSCAL-Reports](https://github.com/adobe/OSCAL-Reports) — commit and push to **`origin`** only.  
**Default branch:** **`Development`**.  
**Retired branch:** **`Pre_Prod`** (removed; use `Quality` for staging validation).  
**Current application release:** see [CHANGELOG.md](CHANGELOG.md). Bump with `./scripts/bump_version.sh` when promoting **Development → Quality** or **Quality → main/Prod**.

---

### Components

- **scripts/bump_version.sh** – Updates `package.json` (root, backend, frontend), `docs/CHANGELOG.md`, `.validation/learnings.json`.
- **.githooks/pre-push** – Validates version increment and package consistency before push to Quality/main/Prod.
- **.github/workflows/adobe-preprod-validate.yml** – Release validation on Quality/main/Prod (version vs tags, changelog, package consistency, auto-tag on Quality push).

---

### Workflow

1. **Develop** on **`Development`** (default branch). Quality Gates run on `Quality` push/PR.
2. **Integration:** open PR **`Development` → `Quality`**, run `./scripts/bump_version.sh patch` if version equals the latest tag, merge when validation passes.
3. **Release:** PR **`Quality` → `main`** or **`Prod`**. After merge, verify tag and GitHub Release.

---

### Release Checklist (Condensed)

#### Pre-Release
- [ ] Version bumped with `scripts/bump_version.sh`
- [ ] All `package.json` versions match
- [ ] `docs/CHANGELOG.md` has entry for new version
- [ ] Tests pass: `cd backend && npm run test`
- [ ] No debug code or hardcoded credentials
- [ ] Branch flow correct (PR from Quality to main/Prod)

#### Release Day
- [ ] Create PR: Quality → main (or Prod)
- [ ] All GitHub Actions green
- [ ] Merge (use merge commit to preserve history)
- [ ] Verify tag created: `git fetch --tags && git tag -l "v*"`
- [ ] Verify GitHub Release and Docker image published

#### Common Pitfalls
- **Tar:** Use `tar --exclude=... -czf archive.tar.gz files` (exclude before file args).
- **Version mismatch:** Always use `scripts/bump_version.sh`, never edit version by hand in one place only.
- **Wrong PR base:** Prefer Quality → main/Prod for releases; never feature branch → main directly.

---

### Troubleshooting

- **"Version has NOT been incremented"** – Run `./scripts/bump_version.sh patch "message"` then push again.
- **"Version mismatch"** – Run `./scripts/bump_version.sh patch "Sync versions"` to align all package.json files.
- **"Version not in CHANGELOG"** – Use `scripts/bump_version.sh`; it updates CHANGELOG. If you edited versions manually, run bump again with a message.
- **Bypass hook (not recommended):** `git push --no-verify` – validation will still run on GitHub Actions.

---

### Related documentation (this guide)

- [Branching strategy](#branching-strategy)
- [CHANGELOG](CHANGELOG.md)
- [Single repository setup](#single-repository-setup-guide)

---

<a id="branching-strategy"></a>

## 🌳 Branching Strategy

> **Updated July 2026:** Default branch is **`Development`**. Flow is `Development` → `Quality` → `main` / `Prod`. Branch **`Pre_Prod` is retired** — see [Single Repository Setup Guide](#single-repository-setup-guide) for the current model. Sections below that mention `Pre_Prod` are historical unless updated inline.

**OSCAL Report Generator V2 - Git Workflow**

---

### 📋 Overview

This project follows a **three-tier branching model** to ensure code quality and stability through progressive testing stages.

```
Development  ─────┐
                  ├──> Pre_Prod ─────> main (Production)
Quality_Test ─────┘
```

---

### 🌿 Branch Hierarchy

#### 1. **Development** (Active Development)

**Purpose**: Primary development branch for new features and bug fixes

**Who commits here**: Developers

**Lifecycle**:
- Created from: `Pre_Prod` or `main`
- Merges to: `Pre_Prod` (recommended) or `main` (allowed)

**Usage**:
```bash
# Create feature branch from Development
git checkout Development
git pull
git checkout -b feature/my-new-feature

# Work on feature
git add .
git commit -m "Add new feature"
git push origin feature/my-new-feature

# Create PR to Development
gh pr create --base Development --title "Add new feature"

# After review and merge, create PR from Development to Pre_Prod
git checkout Development
git pull
gh pr create --base Pre_Prod --title "Merge features to Pre_Prod"
```

---

#### 2. **Quality_Test** (QA Testing)

**Purpose**: Quality assurance and testing branch

**Who commits here**: QA Engineers, Testers

**Lifecycle**:
- Created from: `Pre_Prod` or `main`
- Merges to: `Pre_Prod` (recommended) or `main` (allowed)

**Usage**:
```bash
# Create test/fix branch from Quality_Test
git checkout Quality_Test
git pull
git checkout -b test/integration-tests

# Work on tests or fixes
git add .
git commit -m "Add integration tests"
git push origin test/integration-tests

# Create PR to Quality_Test
gh pr create --base Quality_Test --title "Add integration tests"

# After validation, create PR from Quality_Test to Pre_Prod
git checkout Quality_Test
git pull
gh pr create --base Pre_Prod --title "Merge QA changes to Pre_Prod"
```

---

#### 3. **Pre_Prod** (Pre-Production)

**Purpose**: Staging environment for final validation before production

**Who merges here**: Team Lead, Release Manager

**Lifecycle**:
- Accepts merges from: `Development` and `Quality_Test`
- Merges to: `main` ONLY
- Protected branch with required reviews

**Usage**:
```bash
# Pre_Prod receives PRs from Development and Quality_Test
# After validation in pre-production environment:

git checkout Pre_Prod
git pull

# Create PR to main (Production)
gh pr create --base main --title "Release v1.6.3 to Production" --body "
## Release Summary
- Feature A
- Feature B
- Bug fixes

## Testing
- [x] Development testing complete
- [x] QA testing complete  
- [x] Pre-production validation complete

## Deployment Checklist
- [ ] Backup current production
- [ ] Review deployment scripts
- [ ] Notify stakeholders
"
```

---

#### 4. **main** (Production)

**Purpose**: Production-ready code

**Who merges here**: Release Manager, Admin

**Lifecycle**:
- Accepts merges from: `Development`, `Quality_Test`, or `Pre_Prod`
- Protected branch with strict controls
- Every merge triggers production deployment
- Automatically tagged with version numbers

**Protection Rules**:
- ✅ Requires pull request reviews (1 approval)
- ✅ Dismisses stale reviews
- ✅ No force pushes allowed
- ✅ No deletions allowed
- ✅ PRs to main allowed from Development, Quality_Test, or Pre_Prod (recommended: Pre_Prod for staging first)

---

### 🔒 Branch Protection Rules

#### main (Production)

| Rule | Status | Description |
|------|--------|-------------|
| Require PR | ✅ Enabled | Direct pushes blocked |
| Require 1 approval | ✅ Enabled | Needs review before merge |
| Dismiss stale reviews | ✅ Enabled | Re-approval after changes |
| Allow force push | ❌ Disabled | Prevents history rewriting |
| Allow deletion | ❌ Disabled | Cannot delete production branch |
| **Source restriction** | ✅ Flexible | Merge from `Development`, `Quality_Test`, or `Pre_Prod` |

#### Pre_Prod (Staging)

| Rule | Status | Description |
|------|--------|-------------|
| Require PR | ✅ Enabled | Direct pushes blocked |
| Require 1 approval | ✅ Enabled | Needs review before merge |
| Dismiss stale reviews | ✅ Enabled | Re-approval after changes |
| Allow force push | ❌ Disabled | Prevents history rewriting |
| Allow deletion | ❌ Disabled | Cannot delete staging branch |
| **Source restriction** | ⚠️ Manual | Only merge from `Development` or `Quality_Test` |

#### Development & Quality_Test

| Rule | Status | Description |
|------|--------|-------------|
| Require PR | ⚠️ Recommended | Use feature/test branches |
| No restrictions | ✅ Open | Active development branches |

---

### 🚀 Workflow Examples

#### Example 1: New Feature Development

```bash
# 1. Create feature branch from Development
git checkout Development
git pull
git checkout -b feature/add-eks-support

# 2. Develop and commit
git add .
git commit -m "Add EKS deployment support"
git push origin feature/add-eks-support

# 3. Create PR to Development
gh pr create --base Development --title "Add EKS deployment support"

# 4. After review & merge, merge Development to Pre_Prod
git checkout Development
git pull
gh pr create --base Pre_Prod --title "Deploy features to Pre_Prod"

# 5. After Pre_Prod validation, merge to main
git checkout Pre_Prod
git pull
gh pr create --base main --title "Release v1.7.0 - Add EKS support"
```

#### Example 2: Bug Fix

```bash
# 1. Create fix branch from Development
git checkout Development
git pull
git checkout -b fix/authentication-issue

# 2. Fix and commit
git add .
git commit -m "Fix authentication token expiry"
git push origin fix/authentication-issue

# 3. Create PR to Development
gh pr create --base Development --title "Fix authentication issue"

# 4. Fast-track through Pre_Prod to main if critical
git checkout Development && git pull
gh pr create --base Pre_Prod --title "Critical fix: Authentication"

git checkout Pre_Prod && git pull
gh pr create --base main --title "Hotfix: Authentication token expiry"
```

#### Example 3: QA Testing Workflow

```bash
# 1. QA creates test branch
git checkout Quality_Test
git pull
git checkout -b test/load-testing

# 2. Add tests and validations
git add .
git commit -m "Add load testing suite"
git push origin test/load-testing

# 3. Merge to Quality_Test
gh pr create --base Quality_Test --title "Add load testing"

# 4. After validation, merge to Pre_Prod
git checkout Quality_Test && git pull
gh pr create --base Pre_Prod --title "Merge QA improvements"
```

---

### 📊 Branching Flow Diagram

```
┌─────────────────┐
│   Development   │ ← Feature branches
│  (dev/test)     │ ← Bug fixes
└────────┬────────┘
         │
         │ PR + Review
         ↓
┌─────────────────┐
│  Quality_Test   │ ← Test branches
│  (QA/Testing)   │ ← Test automation
└────────┬────────┘
         │
         │ PR + Review
         ↓
┌─────────────────┐
│    Pre_Prod     │ ← Development merges
│   (Staging)     │ ← Quality_Test merges
└────────┬────────┘
         │
         │ PR + Review + Validation
         ↓
┌─────────────────┐
│      main       │ ← Production releases
│  (Production)   │ ← Version tags (v1.x.x)
└─────────────────┘
```

---

### ⚠️ Important Rules

#### 🔒 Merging to main

**Allowed:** PRs to `main` may come from **Development**, **Quality_Test**, or **Pre_Prod**. This is enforced by GitHub Actions.

- ✅ Development → main (allowed)
- ✅ Quality_Test → main (allowed)
- ✅ Pre_Prod → main (allowed, recommended for staging validation first)
- ❌ Feature/custom branches → main (blocked)

**Recommended:** Merge via Pre_Prod so changes are validated in staging before production.

#### 📝 How to Create a PR to main

**✅ Option 1 – From Pre_Prod (recommended):**
```bash
git checkout Pre_Prod
git pull origin Pre_Prod
gh pr create --base main --head Pre_Prod --title "Release v1.6.7"
```

**✅ Option 2 – From Development or Quality_Test:**
```bash
git checkout Development   # or Quality_Test
git pull origin Development
gh pr create --base main --head Development --title "Release to Production"
```

**❌ Not allowed – From feature/custom branch:**
```bash
# Blocked by branch protection: only Development, Quality_Test, or Pre_Prod can target main
gh pr create --base main --head feature/my-branch  # ❌ WILL FAIL
```

---

#### ❌ NEVER Do These:

1. **Never merge feature/custom branches → main directly**
   - Only Development, Quality_Test, or Pre_Prod can target main (enforced by automated checks)

2. **Never push directly to main**
   - Always use Pull Requests

3. **Never push directly to Pre_Prod**
   - Always use Pull Requests

4. **Never force push to protected branches**
   - main, Pre_Prod are protected

#### ✅ ALWAYS Do These:

1. **Always create feature/fix branches**
   - Branch from Development or Quality_Test
   - Use descriptive names: `feature/`, `fix/`, `test/`

2. **Always create PRs for review**
   - Even small changes need review

3. **Always test in Pre_Prod before main**
   - Validate in staging environment

4. **Always follow the recommended hierarchy**
   - Recommended: Development/Quality_Test → Pre_Prod → main (validate in staging first)
   - Allowed: Development, Quality_Test, or Pre_Prod → main

5. **Always add meaningful commit messages**
   - Describe what and why, not how

---

#### ✨ Flexible Cross-Branch Merging

While we recommend the standard flow (Development/Quality_Test → Pre_Prod → main), you have flexibility for other cross-branch merges:

**Allowed (with guidance):**
- ✅ Development ↔ Quality_Test (if intentional)
- ✅ Feature branches → Development/Quality_Test/Pre_Prod
- ✅ Any branch → Pre_Prod (recommended for hotfixes)
- ✅ Development, Quality_Test, or Pre_Prod → main
- ✅ Sync merges (main → Pre_Prod → Development/Quality_Test)

**BLOCKED:**
- ❌ Feature/custom branches → main (only long-lived branches allowed)

**Best Practice:**
Follow the recommended flow for better tracking and organization, but cross-branch merges are not blocked if you have a valid reason.

---

### 🏷️ Version Tagging & Release Workflow

#### Automated Version Control

**⚠️ IMPORTANT**: Before merging to Pre_Prod or main, you MUST bump the version number.

The project uses an automated version control workflow to ensure consistency. See [Version control and release](#version-control-and-release) for complete details.

**Quick Start:**

```bash
# Before creating PR to Pre_Prod or main, bump the version
./scripts/bump_version.sh patch "Fix: Your bug fix description"     # 1.6.4 → 1.6.5
./scripts/bump_version.sh minor "Add: Your new feature description"  # 1.6.4 → 1.7.0
./scripts/bump_version.sh major "Breaking: Breaking change"          # 1.6.4 → 2.0.0

# The script automatically:
# - Updates all package.json files (root, backend, frontend)
# - Updates docs/CHANGELOG.md
# - Creates a git commit
# - Optionally creates a git tag
```

#### Version Enforcement

**Local Pre-Push Hook** (install with `./scripts/setup-git-hooks.sh`):
- ✅ Validates version has been incremented
- ✅ Checks package.json consistency
- ✅ Verifies changelog is updated
- ❌ Blocks push if version not bumped

**GitHub Actions** (`.github/workflows/adobe-preprod-validate.yml`):
- Runs automatically on Pre_Prod and main branches (Adobe org repo only)
- Validates version increment from latest tag
- Auto-creates version tags on Pre_Prod
- Fails CI if version not properly bumped

#### main (Production) Tags

Tags are automatically created when pushing to Pre_Prod. Every merge to `main` from Pre_Prod will have a corresponding version tag.

**Manual tagging** (if needed):

```bash
# After merging to main
git checkout main
git pull
git tag -a v1.7.0 -m "Release v1.7.0 - Add EKS deployment support"
git push origin v1.7.0
```

**Tag Format**: `vMAJOR.MINOR.PATCH` (Semantic Versioning)
- **MAJOR**: Breaking changes (1.6.4 → 2.0.0)
- **MINOR**: New features, backward compatible (1.6.4 → 1.7.0)
- **PATCH**: Bug fixes (1.6.4 → 1.6.5)

---

### 🔄 Keeping Branches in Sync

#### Sync Development with Pre_Prod

```bash
git checkout Development
git pull
git merge Pre_Prod
git push
```

#### Sync Quality_Test with Pre_Prod

```bash
git checkout Quality_Test
git pull
git merge Pre_Prod
git push
```

#### Sync Pre_Prod with main

```bash
git checkout Pre_Prod
git pull
git merge main
git push
```

---

### 🚨 Emergency Hotfix Process

For critical production issues:

```bash
# 1. Create hotfix branch from main
git checkout main
git pull
git checkout -b hotfix/critical-security-fix

# 2. Fix the issue
git add .
git commit -m "Hotfix: Critical security vulnerability"
git push origin hotfix/critical-security-fix

# 3. Create PR directly to main (emergency only)
gh pr create --base main --title "HOTFIX: Critical security vulnerability"

# 4. After merge, backport to Pre_Prod and Development
git checkout Pre_Prod
git merge main
git push

git checkout Development
git merge Pre_Prod
git push
```

---

### 📋 CI/CD Integration

#### Automated Workflows

- **Development branch**: Runs all tests, no deployment
- **Quality_Test branch**: Runs all tests + security scans
- **Quality branch**: Integration validation + staging checks
- **main branch**: Full CI/CD + production deployment + tagging

#### GitHub Actions Configuration

All workflows run on **adobe/OSCAL-Reports** (`github.repository == 'adobe/OSCAL-Reports'`):

| Workflow | Purpose |
|----------|---------|
| `quality-gates.yml` | Backend unit tests, catalogue fetch, frontend build, npm audit on `Quality` |
| `shell-validation.yml` | ShellCheck, hook syntax, ec2_automation tests |
| `adobe-preprod-validate.yml` | Quality/main/Prod: version vs tags, changelog, package consistency; auto-tag on `Quality` push |
| `release.yml` | GitHub Release on version tags |
| `codacy.yml` | Codacy + SARIF upload |
| `docker-publish.yml` | Docker Hub push |
| `ami-drift-check.yml` | Scheduled AMI drift check |
| **CodeQL** (enterprise default setup) | JavaScript/TypeScript (and Python if enabled in Code Security settings) |

**Retired (dual-repo mirror):** `dispatch-adobe-quality-sync.yml`, `sync-personal-quality-to-adobe-quality.yml` — removed after migration to adobe/OSCAL-Reports.

#### Adobe CodeQL (enterprise default setup)

OSCAL Report Generator is a **Node.js / React** project. CodeQL default setup on [adobe/OSCAL-Reports](https://github.com/adobe/OSCAL-Reports) may include **Python** even when the repo has little Python source. If the Python job fails with:

```text
CodeQL could not process any code written in Python
Processed 0 modules
```

that is a **configuration mismatch**, not an application defect. JavaScript/TypeScript analysis can still pass.

**Preferred fix (one-time, repo Settings — requires Code Security admin):**

1. Open [adobe/OSCAL-Reports → Settings → Code security and analysis](https://github.com/adobe/OSCAL-Reports/settings/security_analysis) (Adobe SSO).
2. **Code scanning** → **CodeQL analysis** → **View configuration** → **Edit**.
3. Under **Languages**, keep **JavaScript/TypeScript** only; **disable Python**.
4. Save and re-run failed PR checks.

Or run (with sufficient `gh` permissions):

```bash
./scripts/ci/configure-codeql-languages.sh
```

**Repo-side mitigation:** `scripts/ci/validate_workflow_yaml.py` and `.github/codeql/codeql-config.yml` narrow Python scope when Python remains enabled.

#### GHCR container image

Terraform Docker mode (`run_oscal_via_docker = true`) pulls **`ghcr.io/adobe/oscal-report-generator`** (override with `oscal_container_image` in `terraform.tfvars`). Images are published from [adobe/OSCAL-Reports](https://github.com/adobe/OSCAL-Reports) via the Docker publish workflow (Docker Hub + GHCR).

---

### 📚 Quick Reference

| Task | Command |
|------|---------|
| Create feature branch | `git checkout -b feature/name Development` |
| Create test branch | `git checkout -b test/name Quality_Test` |
| Create PR to Pre_Prod | `gh pr create --base Pre_Prod` |
| Create PR to main | `gh pr create --base main` |
| List all branches | `git branch -a` |
| Switch branch | `git checkout <branch-name>` |
| Sync with remote | `git pull origin <branch-name>` |

---

### 🎯 Summary

| Branch | Purpose | Merges From | Merges To | Deployment |
|--------|---------|-------------|-----------|------------|
| **Development** | Active development | feature/fix branches | Pre_Prod | None |
| **Quality_Test** | QA testing | test branches | Pre_Prod | None |
| **Pre_Prod** | Staging/validation | Development, Quality_Test | main | Staging server |
| **main** | Production | Development, Quality_Test, Pre_Prod | N/A | Production |

---

**Questions?** Contact: mukesh.kesharwani@adobe.com

---

**Last Updated**: April 2026  
**Version**: 1.1  
**Status**: Active

---

<a id="single-repository-setup-guide"></a>

## Single Repository Setup Guide

### Overview

OSCAL Report Generator uses one canonical GitHub repository:

| Item | Value |
|------|--------|
| **Repository** | [adobe/OSCAL-Reports](https://github.com/adobe/OSCAL-Reports) |
| **Clone URL** | `https://github.com/adobe/OSCAL-Reports.git` |
| **Git remote** | `origin` |
| **Default branch** | `Development` |
| **Branches** | `Development`, `Quality`, `main`, `Prod` ( **`Pre_Prod` retired** ) |
| **GitHub account** | `mkesharw_adobe` (Adobe Inc. SSO) |
| **Commit author** | Mukesh Kesharwani / mukesh.kesharwani@adobe.com |

Legacy remotes (`adobe`, `personal`, `keekar2022/OSCAL-Reports`, `AdobeManagedServices/OSCAL-Reports`) are **retired**. Do not push to them.

### One-time cutover (local clone)

```bash
./scripts/git/migrate-remote-to-adobe.sh        # reconfigure remotes only
./scripts/git/migrate-remote-to-adobe.sh --push # also push branches (requires auth)
```

Or manually:

```bash
git remote remove adobe personal all 2>/dev/null || true
git remote add origin https://github.com/adobe/OSCAL-Reports.git 2>/dev/null || \
  git remote set-url origin https://github.com/adobe/OSCAL-Reports.git
git config user.name "Mukesh Kesharwani"
git config user.email "mukesh.kesharwani@adobe.com"
git push -u origin Development
```

### GitHub UI setup (maintainer)

After the first push to [adobe/OSCAL-Reports](https://github.com/adobe/OSCAL-Reports):

1. Set **default branch** to `Development`.
2. Enable **branch protection** on `Development`, `Quality`, `main`, and `Prod` (require PR + status checks).
3. Migrate **Actions secrets** from legacy repos (Docker Hub, Snyk, Codacy, etc.).
4. **Do not recreate** mirror-only secrets: `ADOBE_REPO_DISPATCH_TOKEN`, `PERSONAL_REPO_READ_TOKEN`, `ADOBE_REPO_PUSH_TOKEN`.
5. Optionally **archive** `keekar2022/OSCAL-Reports` and `AdobeManagedServices/OSCAL-Reports` with a README pointer to `adobe/OSCAL-Reports`.

### Daily workflow

```bash
git config user.name "Mukesh Kesharwani"
git config user.email "mukesh.kesharwani@adobe.com"

git checkout Development
git pull origin Development
# ... make changes ...
git add <files>
git commit -m "feat: description"
git push origin Development
```

Promote via PR: `Development` → `Quality` → `main` / `Prod`.

### TrueNAS / edge deployments

Point clones at the public canonical repo (no VPN required):

```bash
git remote set-url origin https://github.com/adobe/OSCAL-Reports.git
git fetch origin
git checkout -B main origin/main   # or Quality, per your deploy policy
```

### Quick reference

| Action | Command |
|--------|---------|
| Clone | `git clone https://github.com/adobe/OSCAL-Reports.git` |
| Check remotes | `git remote -v` |
| Push default branch | `git push origin Development` |
| Create PR to Quality | `gh pr create --repo adobe/OSCAL-Reports --base Quality` |
| Switch GitHub CLI account | `./scripts/switch-github-account.sh` |

---

**Version**: 2.0  
**Last Updated**: July 2026  
**License**: MIT

---

<a id="dual-repository-setup-guide"></a>

## Dual Repository Setup Guide (retired)

> **Deprecated July 2026.** This project no longer uses dual remotes. See [Single Repository Setup Guide](#single-repository-setup-guide). Historical mirror automation is documented in [DUAL_REPO_QUALITY_MIRROR_PLAYBOOK.md](DUAL_REPO_QUALITY_MIRROR_PLAYBOOK.md) (also deprecated).

---

<a id="github-account-management-guide"></a>

## GitHub Account Management Guide

Use **mkesharw_adobe** (Adobe Inc. SSO) for all operations on [adobe/OSCAL-Reports](https://github.com/adobe/OSCAL-Reports).

### Quick commands

```bash
gh auth switch --user mkesharw_adobe
gh auth status
gh repo view adobe/OSCAL-Reports
git push origin Development
gh pr create --repo adobe/OSCAL-Reports --base Quality
```

### Helper script

```bash
./scripts/switch-github-account.sh
```

### Authentication troubleshooting

**Push access:** As of cutover, `git push origin` may succeed with **keekar2022** (member of `adobe` org with admin on this repo). If **mkesharw_adobe** returns `403 Permission denied`, use `gh auth switch --user keekar2022` for push operations until EMU access is granted on `adobe/OSCAL-Reports`.

If `git push origin` fails with authentication errors:

```bash
git config --local credential.useHttpPath true
gh auth switch --user mkesharw_adobe
gh auth refresh
git push origin Quality
```

For SSH, authorize your key for the **adobe** organization (Settings → SSH and GPG keys → Configure SSO).

### Commit author

Always set before committing:

```bash
git config user.name "Mukesh Kesharwani"
git config user.email "mukesh.kesharwani@adobe.com"
```

---

**Last Updated**: July 2026

---

<a id="pull-request-submission-checklist"></a>

## Pull Request Submission Checklist

### Purpose
This document provides comprehensive checklists for submitting Pull Requests:
1. **Internal PRs**: Within this OSCAL Report Generator repository
2. **External PRs**: To external repositories (like TrueNAS apps catalog)

---

### 🏠 Internal Repository PRs

#### Branch Protection Rules

**Allowed:** PRs to main may come from **Development**, **Quality_Test**, or **Pre_Prod**. Enforced by GitHub Actions (`.github/workflows/branch-protection-check.yml`). Feature/custom branches targeting main are blocked.

#### Creating PRs to main Branch

**✅ Allowed (any of these):**
```bash
# Option 1: From Pre_Prod (recommended – staging validated first)
git checkout Pre_Prod
git pull origin Pre_Prod
gh pr create --base main --head Pre_Prod --title "Release v1.6.7"

# Option 2: From Development
gh pr create --base main --head Development --title "Release to Production"

# Option 3: From Quality_Test
gh pr create --base main --head Quality_Test --title "Release to Production"
```

**❌ Blocked (will be rejected):**
```bash
# ❌ Feature or custom branch → main
gh pr create --base main --head feature/my-feature  # BLOCKED
gh pr create --base main --head sync-preprod-v1.6.7  # BLOCKED
```

#### Why Some PRs Get Rejected

**Error when using a feature/custom branch:**
```
❌ ERROR: PRs to main must be from Development, Quality_Test, or Pre_Prod.
Current PR: feature/my-branch → main
Allowed: Development, Quality_Test, or Pre_Prod → main
```

**Solution:** Either create a PR from Development, Quality_Test, or Pre_Prod to main, or merge your branch into one of those first, then open the PR to main.

#### Internal PR Checklist

Before creating PR to Pre_Prod or main:

- [ ] **Version bumped** using `./scripts/bump_version.sh`
- [ ] **All package.json files** have matching versions
- [ ] **CHANGELOG.md** updated with version entry
- [ ] **Tests passing** locally (`npm run test`)
- [ ] **Linting clean** (if configured: `npm run lint`)
- [ ] **Branch flow correct**:
  - To Pre_Prod: From Development or Quality_Test ✅
  - To main: From Development, Quality_Test, or Pre_Prod ✅
- [ ] **No hardcoded credentials** or sensitive data
- [ ] **GitHub Actions passing** on source branch

#### Branch Flow Diagram

```
Development  ────┐
                 ├──> Pre_Prod ────> main (Production)
Quality_Test ────┘

✅ Development/Quality_Test/Pre_Prod → main (allowed)
❌ Feature/custom branch → main (blocked)
```

**See [Branching strategy](#branching-strategy) for complete internal workflow details.**

---

### 🌐 External Repository PRs

This section covers Pull Requests to external repositories (like TrueNAS apps catalog) to avoid common pitfalls and ensure clean, reviewable PRs.

### Lessons Learned from PR #4144

#### Problem Summary
- **Issue**: PR #4144 initially contained 100+ unrelated files instead of the expected 9 OSCAL app files
- **Root Cause**: Branch was created from an outdated commit (June 2024), and conflict resolution brought in thousands of upstream commits
- **Impact**: Made PR difficult to review, risked rejection, required force-push cleanup
- **Resolution**: Clean branch from latest upstream main + cherry-pick only relevant commit

---

### ✅ PRE-SUBMISSION CHECKLIST

#### 1. Fork Setup (One-time)
```bash
# Clone your fork
git clone git@github.com:YOUR_USERNAME/apps.git truenas-apps-fork
cd truenas-apps-fork

# Add upstream remote
git remote add upstream https://github.com/truenas/apps.git

# Verify remotes
git remote -v
# Should show:
# origin    git@github.com:YOUR_USERNAME/apps.git
# upstream  https://github.com/truenas/apps.git
```

#### 2. Always Start Fresh

**CRITICAL**: Always create new branches from the latest upstream main, not from your old branches or fork's main.

```bash
# Step 1: Fetch latest upstream changes
git fetch upstream

# Step 2: Create branch directly from upstream/main (NOT from origin/main)
git checkout -b feature-branch-name upstream/main

# WRONG ❌
git checkout main  # This might be outdated!
git pull
git checkout -b feature-branch-name

# RIGHT ✅
git checkout -b feature-branch-name upstream/main
```

#### 3. Make Your Changes

```bash
# Make your changes to files
# ...

# Stage and commit
git add <files>
git commit -m "feat: descriptive commit message"
```

#### 4. Pre-Push Verification (MANDATORY)

**CRITICAL**: Run these checks BEFORE pushing:

```bash
# A. Verify you're ahead by only YOUR commits
git log upstream/main..HEAD --oneline
# Should show ONLY your commits (e.g., 1-3 commits)
# If you see dozens/hundreds, STOP! Something is wrong.

# B. Verify file changes
git diff upstream/main --name-status
# Should show ONLY your new/modified files
# If you see unrelated files (other apps, workflows), STOP!

# C. Count changed files
git diff upstream/main --name-only | wc -l
# Should match expected count (e.g., 9 for OSCAL app)
```

#### 5. Push to Your Fork

```bash
# First time pushing the branch
git push -u origin feature-branch-name

# Subsequent pushes
git push
```

#### 6. Create Pull Request on GitHub

1. Go to https://github.com/truenas/apps
2. Click "New Pull Request"
3. Select:
   - Base repository: `truenas/apps`
   - Base branch: `main`
   - Head repository: `YOUR_USERNAME/apps`
   - Compare branch: `feature-branch-name`
4. **VERIFY**: PR shows correct number of files changed
5. Fill in PR description with:
   - What the PR adds/changes
   - Testing performed
   - Any special considerations

#### 7. Post-Submission Verification

**Immediately after creating PR**:
- Check PR shows correct number of files (not 100+!)
- Verify "Files changed" tab shows only your files
- Check that all changed files are relevant to your feature

---

### 🚨 CONFLICT RESOLUTION

If you get merge conflicts:

#### Option A: Rebase (Recommended)
```bash
# Fetch latest upstream
git fetch upstream

# Rebase your branch onto latest main
git rebase upstream/main

# Resolve conflicts if any
# ... edit conflicted files ...
git add <resolved-files>
git rebase --continue

# Force push (rebase changes history)
git push --force
```

#### Option B: If Rebase Gets Messy
```bash
# 1. Save your commit hash
git log --oneline -1  # Note the commit hash

# 2. Create fresh branch from upstream
git fetch upstream
git checkout -b feature-branch-name-v2 upstream/main

# 3. Cherry-pick your commit(s)
git cherry-pick <your-commit-hash>

# 4. Force push to replace old branch
git push origin feature-branch-name-v2:feature-branch-name --force
```

---

### 🔄 CLEANUP SCRIPT (If PR Gets Messy)

If you've already submitted a PR and it shows too many files:

```bash
cd /path/to/truenas-apps-fork

# 1. Fetch latest upstream
git fetch upstream

# 2. Create clean branch from upstream/main
git checkout -b add-feature-clean upstream/main

# 3. Cherry-pick ONLY your relevant commit(s)
git cherry-pick <your-commit-hash>

# 4. Verify only your files changed
git diff upstream/main --name-status

# 5. Force push to replace PR branch
git push origin add-feature-clean:original-branch-name --force
```

---

### 📋 QUICK REFERENCE

#### Daily Workflow
1. ✅ `git fetch upstream`
2. ✅ `git checkout -b new-feature upstream/main`
3. ✅ Make changes
4. ✅ `git log upstream/main..HEAD` (verify commits)
5. ✅ `git diff upstream/main --name-status` (verify files)
6. ✅ `git push -u origin new-feature`
7. ✅ Create PR
8. ✅ Verify PR file count on GitHub

#### Red Flags 🚩
- PR shows 100+ files changed → Branch based on old commit
- PR includes unrelated apps → Incorrect merge/rebase
- `git log` shows hundreds of commits → Branch from old point
- Conflicts with dozens of files → Need to rebase/start fresh

#### Emergency Commands
```bash
# See what remote branches exist
git branch -r

# Check branch creation point
git merge-base HEAD upstream/main
git log --oneline $(git merge-base HEAD upstream/main)..HEAD

# Abort bad rebase
git rebase --abort

# Abort bad merge
git merge --abort
```

---

### 🎯 SUCCESS CRITERIA

Before submitting PR, ensure:
- [ ] Branch created from latest `upstream/main`
- [ ] `git log upstream/main..HEAD` shows ONLY your commits (1-5 typically)
- [ ] `git diff upstream/main --name-status` shows ONLY your files
- [ ] File count matches expectation (e.g., 9 files for OSCAL app)
- [ ] No unrelated files from other apps or workflows
- [ ] Commit messages follow repository conventions
- [ ] PR description is clear and complete
- [ ] GitHub PR shows correct file count immediately after creation

---

### 📚 Related Documentation

- [CONTRIBUTING.md](../.github/CONTRIBUTING.md) - General contribution guidelines
- [Branching strategy](#branching-strategy) – internal repository branching rules
- [Git Workflow Guide](https://git-scm.com/book/en/v2) - Official Git documentation

---

### 🔍 PR #4144 Cleanup Example

**Date**: January 23, 2026  
**Issue**: PR contained 100+ files instead of 9  
**Solution Applied**:
```bash
cd /Users/mkesharw/Documents/truenas-apps-fork
git fetch upstream
git checkout -b add-oscal-report-generator-clean upstream/main
git cherry-pick fb280543a1
git diff upstream/main --name-status  # Verified 9 files
git push origin add-oscal-report-generator-clean:add-oscal-report-generator --force
```
**Result**: PR updated to show only 9 OSCAL files ✅

---

**Last Updated**: January 23, 2026  
**Applies To**: External repository PRs (TrueNAS, etc.)  
**Status**: Active

---

