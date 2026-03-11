# Pull Request Submission Checklist

## Purpose
This document provides comprehensive checklists for submitting Pull Requests:
1. **Internal PRs**: Within this OSCAL Report Generator repository
2. **External PRs**: To external repositories (like TrueNAS apps catalog)

---

## 🏠 Internal Repository PRs

### Branch Protection Rules

**Allowed:** PRs to main may come from **Development**, **Quality_Test**, or **Pre_Prod**. Enforced by GitHub Actions (`.github/workflows/branch-protection-check.yml`). Feature/custom branches targeting main are blocked.

### Creating PRs to main Branch

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

### Why Some PRs Get Rejected

**Error when using a feature/custom branch:**
```
❌ ERROR: PRs to main must be from Development, Quality_Test, or Pre_Prod.
Current PR: feature/my-branch → main
Allowed: Development, Quality_Test, or Pre_Prod → main
```

**Solution:** Either create a PR from Development, Quality_Test, or Pre_Prod to main, or merge your branch into one of those first, then open the PR to main.

### Internal PR Checklist

Before creating PR to Pre_Prod or main:

- [ ] **Version bumped** using `./bump_version.sh`
- [ ] **All package.json files** have matching versions
- [ ] **CHANGELOG.md** updated with version entry
- [ ] **Tests passing** locally (`npm run test`)
- [ ] **Linting clean** (if configured: `npm run lint`)
- [ ] **Branch flow correct**:
  - To Pre_Prod: From Development or Quality_Test ✅
  - To main: From Development, Quality_Test, or Pre_Prod ✅
- [ ] **No hardcoded credentials** or sensitive data
- [ ] **GitHub Actions passing** on source branch

### Branch Flow Diagram

```
Development  ────┐
                 ├──> Pre_Prod ────> main (Production)
Quality_Test ────┘

✅ Development/Quality_Test/Pre_Prod → main (allowed)
❌ Feature/custom branch → main (blocked)
```

**See [BRANCHING_STRATEGY.md](BRANCHING_STRATEGY.md) for complete internal workflow details.**

---

## 🌐 External Repository PRs

This section covers Pull Requests to external repositories (like TrueNAS apps catalog) to avoid common pitfalls and ensure clean, reviewable PRs.

## Lessons Learned from PR #4144

### Problem Summary
- **Issue**: PR #4144 initially contained 100+ unrelated files instead of the expected 9 OSCAL app files
- **Root Cause**: Branch was created from an outdated commit (June 2024), and conflict resolution brought in thousands of upstream commits
- **Impact**: Made PR difficult to review, risked rejection, required force-push cleanup
- **Resolution**: Clean branch from latest upstream main + cherry-pick only relevant commit

---

## ✅ PRE-SUBMISSION CHECKLIST

### 1. Fork Setup (One-time)
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

### 2. Always Start Fresh

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

### 3. Make Your Changes

```bash
# Make your changes to files
# ...

# Stage and commit
git add <files>
git commit -m "feat: descriptive commit message"
```

### 4. Pre-Push Verification (MANDATORY)

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

### 5. Push to Your Fork

```bash
# First time pushing the branch
git push -u origin feature-branch-name

# Subsequent pushes
git push
```

### 6. Create Pull Request on GitHub

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

### 7. Post-Submission Verification

**Immediately after creating PR**:
- Check PR shows correct number of files (not 100+!)
- Verify "Files changed" tab shows only your files
- Check that all changed files are relevant to your feature

---

## 🚨 CONFLICT RESOLUTION

If you get merge conflicts:

### Option A: Rebase (Recommended)
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

### Option B: If Rebase Gets Messy
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

## 🔄 CLEANUP SCRIPT (If PR Gets Messy)

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

## 📋 QUICK REFERENCE

### Daily Workflow
1. ✅ `git fetch upstream`
2. ✅ `git checkout -b new-feature upstream/main`
3. ✅ Make changes
4. ✅ `git log upstream/main..HEAD` (verify commits)
5. ✅ `git diff upstream/main --name-status` (verify files)
6. ✅ `git push -u origin new-feature`
7. ✅ Create PR
8. ✅ Verify PR file count on GitHub

### Red Flags 🚩
- PR shows 100+ files changed → Branch based on old commit
- PR includes unrelated apps → Incorrect merge/rebase
- `git log` shows hundreds of commits → Branch from old point
- Conflicts with dozens of files → Need to rebase/start fresh

### Emergency Commands
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

## 🎯 SUCCESS CRITERIA

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

## 📚 Related Documentation

- [CONTRIBUTING.md](../.github/CONTRIBUTING.md) - General contribution guidelines
- [BRANCHING_STRATEGY.md](BRANCHING_STRATEGY.md) - Internal repository branching rules
- [Git Workflow Guide](https://git-scm.com/book/en/v2) - Official Git documentation

---

## 🔍 PR #4144 Cleanup Example

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
