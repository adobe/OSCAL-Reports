# Git, repositories, and releases

**Consolidated guide:** version bumping and release workflow, branching strategy, Adobe + personal dual remotes, GitHub account switching, and the PR submission checklist.

---

## Table of contents

- [Version Control and Release](#version-control-and-release)
- [🌳 Branching Strategy](#branching-strategy)
- [Dual Repository Setup Guide](#dual-repository-setup-guide)
- [GitHub Account Management Guide](#github-account-management-guide)
- [Pull Request Submission Checklist](#pull-request-submission-checklist)

---

<a id="version-control-and-release"></a>

## Version Control and Release

**Unified guide: version bumping, workflow, and release checklist.**

---

### Quick Reference

#### Version Bump (before merging to Pre_Prod/main)

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
Development → Quality_Test → Pre_Prod → main
```

**Current application release:** **1.7.22** (see [CHANGELOG.md](CHANGELOG.md)). Bump with `./scripts/bump_version.sh` before promoting to Pre_Prod/main.

**main** accepts PRs from **Development**, **Quality_Test**, or **Pre_Prod**. Feature/custom branches cannot target main. Recommended: use Pre_Prod for staging validation first.

---

### Components

- **scripts/bump_version.sh** – Updates `package.json` (root, backend, frontend), `docs/CHANGELOG.md`, `.validation/learnings.json`.
- **.githooks/pre-push** – Validates version increment and package consistency before push to Pre_Prod/main.
- **.github/workflows/adobe-preprod-validate.yml** – Adobe repo only: one workflow for Pre_Prod/main (version vs tags, changelog hints, package consistency, YAML/tar/ESLint/docs gates, auto-tag on Pre_Prod push).

---

### Workflow

1. **Develop** on Development or Quality_Test; merge to Pre_Prod via PR.
2. **On Pre_Prod**: Run `./scripts/bump_version.sh [patch|minor|major] "message"` and push. Pre-push hook and GitHub Actions validate.
3. **Release**: Create PR Pre_Prod → main. After merge, release workflow runs (tag, GitHub Release).

---

### Release Checklist (Condensed)

#### Pre-Release
- [ ] Version bumped with `scripts/bump_version.sh`
- [ ] All `package.json` versions match
- [ ] `docs/CHANGELOG.md` has entry for new version
- [ ] Tests pass: `cd backend && npm run test`
- [ ] No debug code or hardcoded credentials
- [ ] Branch flow correct (PR from Pre_Prod to main only)

#### Release Day
- [ ] Create PR: Pre_Prod → main
- [ ] All GitHub Actions green
- [ ] Merge (use merge commit to preserve history)
- [ ] Verify tag created: `git fetch --tags && git tag -l "v*"`
- [ ] Verify GitHub Release and Docker image published

#### Common Pitfalls
- **Tar:** Use `tar --exclude=... -czf archive.tar.gz files` (exclude before file args).
- **Version mismatch:** Always use `scripts/bump_version.sh`, never edit version by hand in one place only.
- **Wrong PR base:** Only Pre_Prod → main; never feature branch → main.

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
- [Dual repository setup](#dual-repository-setup-guide)

---

<a id="branching-strategy"></a>

## 🌳 Branching Strategy

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
- **Pre_Prod branch**: Tests + builds Docker image + deploys to staging
- **main branch**: Full CI/CD + production deployment + tagging

#### GitHub Actions Configuration

Workflows live in `.github/workflows/`. The same files exist in **both** remotes; **each job is gated by `github.repository`** so checks run in one place only:

| Workflow | Where it runs | Purpose |
|----------|----------------|----------|
| `shell-validation.yml` | **Personal** (`keekar2022/OSCAL-Reports`) | Single **shell-gates** job (ShellCheck, hook syntax, light best-practices, dry-run) plus **ec2_automation** pass-sync tests; `Development` / `Quality` / `Quality_Test` / `Pre_Prod` / `main` (PR). |
| `adobe-preprod-validate.yml` | **Adobe** (`AdobeManagedServices/OSCAL-Reports`) | Merged Pre_Prod/main checks: version vs tags, changelog, package consistency, YAML/tar/ESLint config, docs, summary; auto-tag on `Pre_Prod` push. |
| `release.yml` | **Adobe** | GitHub Release on version tags. |
| `codacy.yml` | **Adobe** | Codacy + SARIF upload. |
| `docker-publish.yml` | **Personal** | Docker Hub push (keekar image). |
| `sync-personal-quality-to-adobe-preprod.yml` | **Both** (split jobs) | **Adobe:** `workflow_dispatch` → fast-forward `Pre_Prod` from personal `Quality`. **Personal:** push to `Quality` or `workflow_dispatch` → self-hosted push to Adobe `Pre_Prod`. |
| **CodeQL** (enterprise default setup) | **Adobe** | GitHub-managed dynamic workflow; scans **JavaScript/TypeScript** (required) and **Python** if enabled in repo Code Security settings. |

Develop on **personal** first: shell validation and Docker publish do not wait on Adobe Actions.

#### Adobe CodeQL (enterprise default setup)

OSCAL Report Generator is a **Node.js / React** project. Adobe enables **CodeQL default setup** on `AdobeManagedServices/OSCAL-Reports`, which may include **Python** even when the repo has little or no Python source. If the Python job fails with:

```text
CodeQL could not process any code written in Python
Processed 0 modules
```

that is a **configuration mismatch**, not an application defect. JavaScript/TypeScript analysis can still pass.

**Preferred fix (one-time, repo Settings — requires Code Security admin):**

1. Open [Adobe repo → Settings → Code security and analysis](https://github.com/AdobeManagedServices/OSCAL-Reports/settings/security_analysis) (Adobe SSO).
2. **Code scanning** → **CodeQL analysis** → **View configuration** → **Edit**.
3. Under **Languages**, keep **JavaScript/TypeScript** only; **disable Python**.
4. Save and re-run failed PR checks.

Or run (with sufficient `gh` permissions):

```bash
./scripts/ci/configure-codeql-languages.sh
```

See [GitHub: Edit default setup](https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/manage-your-configuration/edit-default-setup) and [No source code seen during build](https://gh.io/troubleshooting-code-scanning/no-source-code-seen-during-build).

**Repo-side mitigation (no admin required):** `scripts/ci/validate_workflow_yaml.py` is tracked Python used by `adobe-preprod-validate.yml` so CodeQL’s Python extractor has source to analyze when Python remains enabled. Scope is narrowed via `.github/codeql/codeql-config.yml`.

**Before Adobe PRs:** run Quality Gates on the personal fork (`keekar2022/OSCAL-Reports`); Adobe skips those jobs by design.

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

<a id="dual-repository-setup-guide"></a>

## Dual Repository Setup Guide

### Overview

This project is maintained in **two GitHub repositories** due to network access restrictions:

1. **Adobe Repository** (Primary/Corporate)
   - URL: `https://github.com/AdobeManagedServices/oscal`
   - Access: Requires Adobe VPN + SSO authentication
   - Purpose: Corporate codebase, collaboration, CI/CD
   - Branch protection: **Configured in GitHub** (Settings → Rules → Rulesets, or classic branch protection). It is **not** controlled by files in this repository.

2. **Personal Repository** (Mirror/Public)
   - URL: `https://github.com/keekar2022/OSCAL-Reports`
   - Access: Public (no VPN required)
   - Purpose: TrueNAS deployment, backup, public access
   - Branch Protection: Disabled (direct push allowed)

#### Why was `Pre_Prod` rejecting direct `git push`?

If you see **`remote: GH013: ... Changes must be made through a pull request`** when pushing to **`Pre_Prod`**, that comes from a **GitHub ruleset or branch protection rule** on **AdobeManagedServices/OSCAL-Reports** that applies to `Pre_Prod` (for example “require a pull request before merging”).

- **This repo’s** `.githooks/pre-push` only runs **locally**; it does not add that GitHub rule.
- **Who can change it:** an org/repo **admin** in GitHub: **Settings → Rules → Rulesets** (or **Branches → Branch protection rules**), edit the rule that targets `Pre_Prod`.

**Recommended policy (aligns with staging vs production):**

| Branch | Suggested protection |
|--------|----------------------|
| **`Prod`** (and **`main`** if it is production) | Require PR, reviews, and status checks as needed. |
| **`Pre_Prod`** | Allow **direct pushes** for release engineers / maintainers (or require PR only if you want every staging change reviewed). |
| **`Development`**, **`Quality_Test`**, etc. | Match team policy; often lighter than production. |

If `Pre_Prod` should accept **`git push adobe Pre_Prod`** after hooks pass, remove `Pre_Prod` from rules that mandate PRs, or add an exception for your role, and keep **strict PR-only flow on `Prod`** only.

---

### Why Two Repositories?

**TrueNAS servers cannot access the Adobe repository** because:
- Adobe repo requires VPN connection
- TrueNAS servers are not on the Adobe VPN
- SSO authentication is not available on TrueNAS

**Solution**: TrueNAS pulls updates from the personal repository (public), which is kept in sync with the Adobe repository.

---

### Repository Sync Workflow

#### Development Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                    LOCAL DEVELOPMENT                         │
│                                                              │
│  1. Make changes locally                                     │
│  2. Commit changes                                           │
│  3. Push to BOTH repositories                               │
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼
        ┌──────────────────────────────────────┐
        │                                      │
        ▼                                      ▼
┌─────────────────┐                  ┌─────────────────┐
│  Adobe Repo     │                  │  Personal Repo  │
│  (via PR)       │                  │  (direct push)  │
└─────────────────┘                  └─────────────────┘
        │                                      │
        │ Manual merge                         │
        │ (via GitHub UI)                      │
        │                                      │
        ▼                                      ▼
┌─────────────────┐                  ┌─────────────────┐
│  Adobe main     │                  │  Personal main  │
└─────────────────┘                  └─────────────────┘
                                              │
                                              │ git pull
                                              ▼
                                     ┌─────────────────┐
                                     │  TrueNAS        │
                                     │  Deployment     │
                                     └─────────────────┘
```

---

### Local Git Configuration

#### Checking Current Remotes

```bash
git remote -v
```

**Expected output:**
```
adobe     https://github.com/AdobeManagedServices/oscal.git (fetch)
adobe     https://github.com/AdobeManagedServices/oscal.git (push)
personal  https://TOKEN@github.com/keekar2022/OSCAL-Reports.git (fetch)
personal  https://TOKEN@github.com/keekar2022/OSCAL-Reports.git (push)
```

#### Setting Up Dual Remotes

```bash
# Add Adobe remote (if not already configured)
git remote add adobe https://github.com/AdobeManagedServices/oscal.git

# Add personal remote with Personal Access Token
git remote add personal https://YOUR_TOKEN@github.com/keekar2022/OSCAL-Reports.git
```

#### Daily Development Workflow

##### Option A: Push to Personal Repository Directly

```bash
# Make your changes
git add .
git commit -m "feat: your feature description"

# Push to personal repo (direct push, no PR needed)
GIT_TERMINAL_PROMPT=0 git -c credential.helper= push personal main --force
git push personal --tags
```

##### Option B: Push to Adobe Repository via PR

```bash
# Create a feature branch
git checkout -b feature/my-feature

# Make your changes
git add .
git commit -m "feat: your feature description"

# Push branch to Adobe repo
git push adobe feature/my-feature

# Create PR via GitHub web interface
# URL: https://github.com/AdobeManagedServices/oscal/compare/feature/my-feature

# After PR is merged, sync back to local
git checkout main
git pull adobe main

# Sync to personal repo
git push personal main --force
git push personal --tags
```

##### Option C: Push to Both Simultaneously

```bash
# Make your changes
git add .
git commit -m "feat: your feature description"

# Push to personal repo directly
git push personal main
git push personal --tags

# Create branch and push to Adobe repo (for PR)
git checkout -b feature/my-feature
git push adobe feature/my-feature
# Then create PR on GitHub web
```

---

### TrueNAS Configuration

#### Git Remote Setup on TrueNAS

TrueNAS instances **MUST** use the personal repository:

```bash
# On TrueNAS (via SSH)
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green  # or Blue

# Check current remotes
sudo git remote -v

# Add/update origin to personal repo
sudo git remote add origin https://github.com/keekar2022/OSCAL-Reports.git

# Or if origin already exists:
sudo git remote set-url origin https://github.com/keekar2022/OSCAL-Reports.git

# Fetch latest
sudo git fetch origin

# Checkout main branch
sudo git checkout -B main origin/main

# Fix ownership
sudo chown -R mkesharw:mkesharw /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green
```

#### Automated Deployment via Cron

The Docker Hub install script (`scripts/install_from_dockerhub.sh`) pulls the image and deploys; point cron at your clone of the personal repository:

```bash
# Green instance cron (1st, 3rd, 5th Sunday at 2 AM)
0 2 1-7,15-21,29-31 * 0 cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green && ./scripts/install_from_dockerhub.sh >> /var/log/oscal-deploy-green.log 2>&1

# Blue instance cron (2nd, 4th Sunday at 2 AM)
0 2 8-14,22-28 * 0 cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue && ./scripts/install_from_dockerhub.sh >> /var/log/oscal-deploy-blue.log 2>&1
```

---

### Troubleshooting

#### Issue: TrueNAS can't pull from Adobe repo

**Error:**
```
fatal: Authentication failed for 'https://github.com/AdobeManagedServices/oscal.git/'
```

**Solution:**
Update `scripts/install_from_dockerhub.sh` to use personal repo:
```bash
GIT_REPO="https://github.com/keekar2022/OSCAL-Reports.git"
```

#### Issue: Personal repo token expired

**Error:**
```
remote: Permission to keekar2022/OSCAL-Reports.git denied to keekar2022.
```

**Solution:**
1. Create new token: https://github.com/settings/tokens/new
2. Select scopes: `repo`, `workflow`
3. Update remote:
   ```bash
   git remote set-url personal https://NEW_TOKEN@github.com/keekar2022/OSCAL-Reports.git
   ```

#### Issue: Repositories out of sync

**Check versions:**
```bash
# Local version
grep '"version"' package.json

# Adobe repo version (via web)
# https://github.com/AdobeManagedServices/oscal/blob/main/package.json

# Personal repo version (via web)
# https://github.com/keekar2022/OSCAL-Reports/blob/main/package.json

# TrueNAS version
ssh mkesharw@nas.keekar.au "cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green && grep '\"version\"' package.json"
```

**Sync personal repo from Adobe:**
```bash
git checkout main
git pull adobe main
git push personal main --force
git push personal --tags
```

#### Issue: Branch protection prevents direct push to Adobe

**This is expected behavior!** Adobe repo requires Pull Requests:

```bash
# Create a feature branch
git checkout -b fix/my-fix

# Push branch
git push adobe fix/my-fix

# Create PR via web interface
# https://github.com/AdobeManagedServices/oscal/compare/fix/my-fix
```

---

### Security Considerations

#### Personal Access Tokens

- **Never commit tokens** to the repository
- Tokens are stored in `.git/config` (not tracked by git)
- Use tokens with **minimal required scopes** (`repo`, `workflow`)
- **Rotate tokens** every 90 days for security

#### Viewing Stored Credentials

```bash
# View remotes (tokens are visible!)
git remote -v

# Safely view remotes (tokens sanitized)
git config --get-regexp remote.*.url | sed 's/:[^:]*@/:***@/g'
```

---

### Quick Reference

#### Common Commands

| Action | Command |
|--------|---------|
| Check remotes | `git remote -v` |
| Pull from Adobe | `git pull adobe main` |
| Push to personal | `git push personal main` |
| Push tags | `git push personal --tags` |
| Create PR branch | `git checkout -b feature/name && git push adobe feature/name` |
| Sync repos | `git pull adobe main && git push personal main --force` |

#### Repository URLs

| Repository | URL |
|------------|-----|
| Adobe (Primary) | https://github.com/AdobeManagedServices/oscal |
| Personal (Mirror) | https://github.com/keekar2022/OSCAL-Reports |
| Personal (Clone) | `git clone https://github.com/keekar2022/OSCAL-Reports.git` |

---

### Maintenance Schedule

#### Weekly Tasks
- ✅ Verify both repositories are in sync
- ✅ Check TrueNAS deployment logs

#### Monthly Tasks
- ✅ Verify automated deployments (check cron logs)
- ✅ Review Personal Access Token expiration dates
- ✅ Test manual deployment on TrueNAS

#### Quarterly Tasks
- ✅ Rotate Personal Access Tokens
- ✅ Review and update documentation
- ✅ Audit repository access permissions

---

### Support

For issues related to:
- **Adobe repository access**: Contact Adobe IT Support
- **Personal repository**: Contact Mukesh Kesharwani (keekar2022@outlook.com)
- **TrueNAS deployment**: Check logs in `/var/log/oscal-deploy-*.log`

---

**Version**: 1.4.2  
**Last Updated**: April 2026  
**License**: MIT

---

<a id="github-account-management-guide"></a>

## GitHub Account Management Guide

**Date**: January 23, 2026  
**Status**: Repository is PRIVATE ✅

---

### 🔒 Repository Privacy Status

Your personal repository **keekar2022/OSCAL-Reports** is **PRIVATE**.

- ✅ Only you (keekar2022 account) can access it
- ✅ Hidden from public view
- ✅ Not searchable or indexable
- ✅ Secure and protected

---

### 👥 Your GitHub Accounts

You have two GitHub accounts configured:

#### 1. keekar2022 (Personal Account)
- **Type**: Personal GitHub account
- **Use For**: Personal repository (keekar2022/OSCAL-Reports)
- **Access**: Owner of private repository
- **Scopes**: delete_repo, gist, read:org, repo

#### 2. mkesharw_adobe (Adobe EMU)
- **Type**: Enterprise Managed User (EMU)
- **Use For**: Adobe repository (AdobeManagedServices/OSCAL-Reports)
- **Access**: Adobe organization repositories
- **Scopes**: gist, read:org, repo, workflow
- **Limitation**: ❌ Cannot be added to personal repositories

---

### 🔄 Account Switching

#### Quick Switch Commands

```bash
# Switch to personal account (for personal repo)
gh auth switch --user keekar2022

# Switch to Adobe account (for Adobe repo)
gh auth switch --user mkesharw_adobe

# Check current active account
gh auth status
```

#### Using Helper Script

We've created an easy-to-use script for account switching:

```bash
# Run the account switcher
./scripts/switch-github-account.sh
```

This will show you:
- Current account status
- Menu to switch accounts
- Which repositories you can access

---

### 📋 Common Workflows

#### Working with Personal Repository

```bash
# 1. Switch to personal account
gh auth switch --user keekar2022

# 2. View repository
gh repo view keekar2022/OSCAL-Reports

# 3. Git operations
git fetch personal
git pull personal Development
git push personal Development

# 4. Create PR
gh pr create --repo keekar2022/OSCAL-Reports --base Development
```

#### Working with Adobe Repository

```bash
# 1. Switch to Adobe account
gh auth switch --user mkesharw_adobe

# 2. View repository
gh repo view AdobeManagedServices/OSCAL-Reports

# 3. Git operations
git fetch adobe
git pull adobe Development
git push adobe Development

# 4. Create PR
gh pr create --repo AdobeManagedServices/OSCAL-Reports --base Development
```

---

### 🔍 Verify Repository Privacy

#### Test 1: Incognito Browser Test
1. Open a private/incognito browser window
2. Navigate to: https://github.com/keekar2022/OSCAL-Reports
3. **Expected Result**: 404 error (confirms private)

#### Test 2: CLI Verification (as owner)
```bash
gh auth switch --user keekar2022
gh repo view keekar2022/OSCAL-Reports --json visibility
# Output: {"visibility": "PRIVATE"}
```

#### Test 3: Access Test (as non-owner)
```bash
gh auth switch --user mkesharw_adobe
gh repo view keekar2022/OSCAL-Reports
# Output: "Could not resolve to a Repository" (expected)
```

---

### ⚠️ Why Can't I Add Adobe Account as Collaborator?

**Enterprise Managed User (EMU) Restriction**

GitHub's security policy prevents EMUs from accessing personal repositories:

- ❌ Cannot add mkesharw_adobe as collaborator to keekar2022/OSCAL-Reports
- ❌ Cannot transfer personal repo to Adobe organization
- ✅ Can have both accounts on same machine
- ✅ Can switch between accounts easily

**GitHub Policy**: EMUs are managed by the enterprise (Adobe) and can only access:
- Organization repositories within Adobe
- Repositories where the organization has control

**Your personal repository** remains separate for security and compliance.

---

### 📊 Repository Overview

#### Adobe Repository
- **URL**: https://github.com/AdobeManagedServices/OSCAL-Reports
- **Visibility**: Internal to Adobe organization
- **Your Access**: mkesharw_adobe (member)
- **Git Remote**: `adobe`

#### Personal Repository
- **URL**: https://github.com/keekar2022/OSCAL-Reports
- **Visibility**: ✅ PRIVATE
- **Your Access**: keekar2022 (owner)
- **Git Remote**: `personal`

#### Local Configuration
```bash
# Check remotes
git remote -v

# Output:
# adobe    https://github.com/AdobeManagedServices/OSCAL-Reports.git
# personal https://github.com/keekar2022/OSCAL-Reports.git
```

---

### 🛠️ Troubleshooting

#### "Could not resolve to a Repository"
**Cause**: You're using the wrong account for that repository

**Solution**:
```bash
# Check which account is active
gh auth status

# Switch to the correct account
gh auth switch --user [correct-username]
```

#### "404 Not Found" on Repository Page
**Cause**: Repository is private and you're not logged in with the owner account

**Solution**:
1. Log out of GitHub in your browser
2. Log in as `keekar2022`
3. Navigate to the repository

#### Push/Pull Fails with Authentication Error
**Cause**: Git credentials don't match the active gh account

**Solution**:
```bash
# Make sure gh account matches git operation
gh auth switch --user keekar2022  # for personal repo
gh auth switch --user mkesharw_adobe  # for Adobe repo

# Refresh git credentials
gh auth refresh

# Try operation again
git push personal Development
```

---

### 🔐 Security Best Practices

#### 1. Regular Account Verification
```bash
# Check which account is active before operations
gh auth status
```

#### 2. Keep Accounts Separate
- Use `keekar2022` for personal projects
- Use `mkesharw_adobe` for Adobe work
- Don't mix credentials

#### 3. Verify Repository Before Pushing
```bash
# Always check where you're pushing
git remote -v
git remote show [remote-name]
```

#### 4. Use Account Switcher Script
```bash
# Use the helper script to avoid mistakes
./scripts/switch-github-account.sh
```

---

### 📝 Quick Reference

| Task | Account | Command |
|------|---------|---------|
| Access personal repo | keekar2022 | `gh auth switch --user keekar2022` |
| Access Adobe repo | mkesharw_adobe | `gh auth switch --user mkesharw_adobe` |
| Check current account | Either | `gh auth status` |
| View repository | Correct account | `gh repo view [owner/repo]` |
| Push changes | Correct account | `git push [remote] [branch]` |

---

### 🎯 Summary

✅ **Personal repository is PRIVATE and secure**  
✅ **Both accounts configured and working**  
✅ **Easy account switching available**  
✅ **Helper script created**: `./scripts/switch-github-account.sh`  
✅ **EMU restriction understood and documented**  

Your personal repository is protected and only accessible to you (keekar2022 account). Use account switching to work with both repositories seamlessly.

---

**Last Updated**: January 23, 2026  
**Maintained By**: OSCAL Reports Development Team

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

