# 🌳 Branching Strategy

**OSCAL Report Generator V2 - Git Workflow**

---

## 📋 Overview

This project follows a **three-tier branching model** to ensure code quality and stability through progressive testing stages.

```
Development  ─────┐
                  ├──> Pre_Prod ─────> main (Production)
Quality_Test ─────┘
```

---

## 🌿 Branch Hierarchy

### 1. **Development** (Active Development)

**Purpose**: Primary development branch for new features and bug fixes

**Who commits here**: Developers

**Lifecycle**:
- Created from: `Pre_Prod` or `main`
- Merges to: `Pre_Prod` ONLY
- Never merges directly to: `main`

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

### 2. **Quality_Test** (QA Testing)

**Purpose**: Quality assurance and testing branch

**Who commits here**: QA Engineers, Testers

**Lifecycle**:
- Created from: `Pre_Prod` or `main`
- Merges to: `Pre_Prod` ONLY
- Never merges directly to: `main`

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

### 3. **Pre_Prod** (Pre-Production)

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

### 4. **main** (Production)

**Purpose**: Production-ready code

**Who merges here**: Release Manager, Admin

**Lifecycle**:
- Accepts merges from: `Pre_Prod` ONLY
- Protected branch with strict controls
- Every merge triggers production deployment
- Automatically tagged with version numbers

**Protection Rules**:
- ✅ Requires pull request reviews (1 approval)
- ✅ Dismisses stale reviews
- ✅ No force pushes allowed
- ✅ No deletions allowed
- ⚠️ Only accepts PRs from `Pre_Prod`

---

## 🔒 Branch Protection Rules

### main (Production)

| Rule | Status | Description |
|------|--------|-------------|
| Require PR | ✅ Enabled | Direct pushes blocked |
| Require 1 approval | ✅ Enabled | Needs review before merge |
| Dismiss stale reviews | ✅ Enabled | Re-approval after changes |
| Allow force push | ❌ Disabled | Prevents history rewriting |
| Allow deletion | ❌ Disabled | Cannot delete production branch |
| **Source restriction** | ⚠️ Manual | Only merge from `Pre_Prod` |

### Pre_Prod (Staging)

| Rule | Status | Description |
|------|--------|-------------|
| Require PR | ✅ Enabled | Direct pushes blocked |
| Require 1 approval | ✅ Enabled | Needs review before merge |
| Dismiss stale reviews | ✅ Enabled | Re-approval after changes |
| Allow force push | ❌ Disabled | Prevents history rewriting |
| Allow deletion | ❌ Disabled | Cannot delete staging branch |
| **Source restriction** | ⚠️ Manual | Only merge from `Development` or `Quality_Test` |

### Development & Quality_Test

| Rule | Status | Description |
|------|--------|-------------|
| Require PR | ⚠️ Recommended | Use feature/test branches |
| No restrictions | ✅ Open | Active development branches |

---

## 🚀 Workflow Examples

### Example 1: New Feature Development

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

### Example 2: Bug Fix

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

### Example 3: QA Testing Workflow

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

## 📊 Branching Flow Diagram

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

## ⚠️ Important Rules

### 🔒 CRITICAL RULE - STRICTLY ENFORCED:

**⛔ Only Pre_Prod can merge to main**

This is the ONE hard rule that is strictly enforced:
- ❌ Development → main (BLOCKED)
- ❌ Quality_Test → main (BLOCKED)
- ❌ Any other branch → main (BLOCKED)
- ✅ Pre_Prod → main (ALLOWED)

All PRs to `main` must come from `Pre_Prod` - no exceptions.

---

### ❌ NEVER Do These:

1. **Never merge ANY branch → main directly**
   - ONLY Pre_Prod can merge to main
   - This rule is strictly enforced by automated checks

2. **Never push directly to main**
   - Always use Pull Requests

3. **Never push directly to Pre_Prod**
   - Always use Pull Requests

4. **Never force push to protected branches**
   - main, Pre_Prod are protected

### ✅ ALWAYS Do These:

1. **Always create feature/fix branches**
   - Branch from Development or Quality_Test
   - Use descriptive names: `feature/`, `fix/`, `test/`

2. **Always create PRs for review**
   - Even small changes need review

3. **Always test in Pre_Prod before main**
   - Validate in staging environment

4. **Always follow the recommended hierarchy**
   - Recommended: Development/Quality_Test → Pre_Prod → main
   - Critical: ONLY Pre_Prod → main (strictly enforced)

5. **Always add meaningful commit messages**
   - Describe what and why, not how

---

### ✨ Flexible Cross-Branch Merging

While we recommend the standard flow (Development/Quality_Test → Pre_Prod → main), you have flexibility for other cross-branch merges:

**Allowed (with guidance):**
- ✅ Development ↔ Quality_Test (if intentional)
- ✅ Feature branches → Development/Quality_Test/Pre_Prod
- ✅ Any branch → Pre_Prod (recommended for hotfixes)
- ✅ Sync merges (main → Pre_Prod → Development/Quality_Test)

**BLOCKED:**
- ❌ ANY branch (except Pre_Prod) → main

**Best Practice:**
Follow the recommended flow for better tracking and organization, but cross-branch merges are not blocked if you have a valid reason.

---

## 🏷️ Version Tagging

### main (Production) Tags

Every merge to `main` should be tagged:

```bash
# After merging to main
git checkout main
git pull
git tag -a v1.7.0 -m "Release v1.7.0 - Add EKS deployment support"
git push origin v1.7.0
```

**Tag Format**: `vMAJOR.MINOR.PATCH`
- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes

---

## 🔄 Keeping Branches in Sync

### Sync Development with Pre_Prod

```bash
git checkout Development
git pull
git merge Pre_Prod
git push
```

### Sync Quality_Test with Pre_Prod

```bash
git checkout Quality_Test
git pull
git merge Pre_Prod
git push
```

### Sync Pre_Prod with main

```bash
git checkout Pre_Prod
git pull
git merge main
git push
```

---

## 🚨 Emergency Hotfix Process

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

## 📋 CI/CD Integration

### Automated Workflows

- **Development branch**: Runs all tests, no deployment
- **Quality_Test branch**: Runs all tests + security scans
- **Pre_Prod branch**: Tests + builds Docker image + deploys to staging
- **main branch**: Full CI/CD + production deployment + tagging

### GitHub Actions Configuration

Workflows are configured in `.github/workflows/`:
- `ci-cd.yml`: Main CI/CD pipeline (triggers on main and Pre_Prod)
- `pr-validation.yml`: PR checks for Development and Quality_Test
- `release.yml`: Automatic releases when tags are pushed

---

## 📚 Quick Reference

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

## 🎯 Summary

| Branch | Purpose | Merges From | Merges To | Deployment |
|--------|---------|-------------|-----------|------------|
| **Development** | Active development | feature/fix branches | Pre_Prod | None |
| **Quality_Test** | QA testing | test branches | Pre_Prod | None |
| **Pre_Prod** | Staging/validation | Development, Quality_Test | main | Staging server |
| **main** | Production | Pre_Prod only | N/A | Production |

---

**Questions?** Contact: mukesh.kesharwani@adobe.com

---

**Last Updated**: January 22, 2026  
**Version**: 1.0  
**Status**: Active
