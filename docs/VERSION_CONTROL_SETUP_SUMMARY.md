# Version Control Workflow - Setup Summary

**Date:** 2025-01-28  
**Created by:** Mukesh Kesharwani

---

## 🎯 What Was Created

This document summarizes the automated version control workflow that was set up for the OSCAL Report Generator project.

---

## 📁 Files Created/Modified

### 1. GitHub Actions Workflow

**File:** `.github/workflows/version-check.yml`

**Purpose:** Automated validation of version increments on Pre_Prod and main branches

**Features:**
- ✅ Validates version has been incremented from latest tag
- ✅ Checks changelog has been updated
- ✅ Verifies all package.json files have consistent versions
- ✅ Auto-creates Git tags for new versions on Pre_Prod
- ✅ Posts helpful comments on PRs with fix instructions

**Triggers:**
- Push to Pre_Prod branch
- Pull requests to Pre_Prod or main branches

### 2. Pre-Push Git Hook

**File:** `.githooks/pre-push`

**Purpose:** Local validation before code leaves developer machine

**Features:**
- ✅ Blocks push if version not incremented (Pre_Prod/main only)
- ✅ Validates package.json consistency
- ✅ Checks for version downgrades
- ⚠️  Warns if changelog not updated

### 3. Setup Script

**File:** `setup-git-hooks.sh`

**Purpose:** Easy installation of Git hooks

**Usage:**
```bash
./setup-git-hooks.sh
```

### 4. Documentation

Created comprehensive documentation:

1. **`docs/VERSION_CONTROL_WORKFLOW.md`** - Complete workflow guide
   - Architecture overview
   - Component descriptions
   - Usage guide
   - Troubleshooting section
   - Best practices

2. **`docs/VERSION_BUMP_QUICK_REFERENCE.md`** - Quick reference card
   - One-page cheat sheet
   - Common commands
   - Error fixes
   - Print-friendly format

3. **`.githooks/README.md`** - Git hooks documentation
   - Hook descriptions
   - Setup instructions
   - Troubleshooting

### 5. Updated Documentation

**Modified files:**
- `docs/README.md` - Added version control to index
- `docs/BRANCHING_STRATEGY.md` - Added version control section

---

## 🚀 How It Works

### Workflow Overview

```
Developer commits code
         ↓
Tries to push to Pre_Prod/main
         ↓
Local pre-push hook runs
         ↓
   Validates version?
         ↓
    ┌────┴────┐
    Yes      No
     ↓        ↓
  Allow    Block
  Push     Push
     ↓        ↓
GitHub      Show
Actions     Error
validates   Message
```

### Version Bump Process

1. **Developer bumps version:**
   ```bash
   ./bump_version.sh minor "Add new AI features"
   ```

2. **Script automatically updates:**
   - package.json (root, backend, frontend)
   - docs/CHANGELOG.md
   - .validation/learnings.json
   - Creates git commit
   - Optionally creates git tag

3. **Developer pushes:**
   ```bash
   git push origin Pre_Prod
   ```

4. **Pre-push hook validates:**
   - Version incremented? ✅
   - Package.json consistent? ✅
   - Changelog updated? ⚠️

5. **GitHub Actions validates:**
   - Runs same checks in cloud
   - Auto-creates version tag
   - Posts PR comments with status

6. **Tag triggers release:**
   - `.github/workflows/release.yml` creates GitHub release
   - Archives are built
   - Release notes from changelog

---

## 🔧 Setup Instructions

### For All Developers

**One-time setup:**

```bash
# 1. Install Git hooks
./setup-git-hooks.sh

# 2. Verify installation
git config core.hooksPath
# Should output: .githooks

# 3. Test version bump (optional)
./bump_version.sh --help
```

### For Repository Admins

The GitHub Actions workflow is already in place and will run automatically. No additional setup needed.

**Optional:** Configure branch protection rules to require workflow pass before merging.

---

## 📖 Usage Guide

### Before Merging to Pre_Prod

```bash
# 1. Ensure you're on Pre_Prod branch
git checkout Pre_Prod
git pull origin Pre_Prod

# 2. Merge your changes
git merge Development

# 3. IMPORTANT: Bump version
./bump_version.sh minor "Add new features"

# 4. Push (hook will validate)
git push origin Pre_Prod
```

### Before Merging to main

```bash
# Pre_Prod should already have incremented version
# Just create the PR

# 1. Create PR: Pre_Prod → main
gh pr create --base main --title "Release v1.7.0"

# 2. Wait for validation
# GitHub Actions will run automatically

# 3. Merge when approved
# Tag is already created from Pre_Prod push
```

---

## ✅ Validation Checklist

Before every release, the system automatically validates:

- [ ] Version number incremented from latest tag
- [ ] All package.json files have same version
- [ ] CHANGELOG.md contains new version entry
- [ ] No version downgrade (e.g., 1.7.0 → 1.6.5)
- [ ] Version follows semantic versioning (X.Y.Z)

---

## 🚨 Common Scenarios

### Scenario 1: Forgot to Bump Version

**Problem:** Tried to push to Pre_Prod without bumping version

**What happens:**
1. Pre-push hook blocks the push
2. Error message shows current vs. expected version
3. Instructions provided

**Solution:**
```bash
./bump_version.sh patch "Bump version"
git push origin Pre_Prod
```

### Scenario 2: Package.json Mismatch

**Problem:** Manual edits caused version inconsistency

**What happens:**
1. Pre-push hook detects mismatch
2. Shows which files have different versions
3. Blocks push

**Solution:**
```bash
./bump_version.sh patch "Sync versions"
git push origin Pre_Prod
```

### Scenario 3: Version Downgrade

**Problem:** Set version lower than latest tag

**What happens:**
1. Pre-push hook detects downgrade
2. Shows current vs. latest tag
3. Blocks push

**Solution:**
```bash
./bump_version.sh minor "Correct version"
git push origin Pre_Prod
```

---

## 📊 Benefits

### 1. Consistency
- All package.json files always in sync
- Changelog always up to date
- Version tags match releases

### 2. Automation
- Reduces manual errors
- Automates repetitive tasks
- Ensures nothing is forgotten

### 3. Quality
- Catches version issues early (local hook)
- Double validation (local + GitHub Actions)
- Clear error messages with fixes

### 4. Traceability
- Every release has a version tag
- Changelog documents all changes
- Git history is clean and organized

### 5. Prevention
- Blocks merges without version bump
- Prevents version mismatches
- Stops downgrades

---

## 🎓 Training Guide

### For New Developers

1. **Read:**
   - [VERSION_CONTROL_WORKFLOW.md](VERSION_CONTROL_WORKFLOW.md)
   - [VERSION_BUMP_QUICK_REFERENCE.md](VERSION_BUMP_QUICK_REFERENCE.md)

2. **Setup:**
   ```bash
   ./setup-git-hooks.sh
   ```

3. **Practice:**
   ```bash
   # Create test branch
   git checkout -b test/version-practice
   
   # Try bumping version
   ./bump_version.sh patch "Test version bump"
   
   # Review changes
   git log -1
   git show HEAD
   ```

4. **Test Hook:**
   ```bash
   # Try pushing without version bump (should fail)
   git checkout Pre_Prod
   echo "test" >> README.md
   git commit -am "Test commit"
   git push origin Pre_Prod  # Will be blocked by hook!
   
   # Now properly
   git reset HEAD~1
   ./bump_version.sh patch "Test version bump"
   git push origin Pre_Prod  # Will succeed!
   ```

---

## 📚 Documentation Links

- **Complete Workflow Guide:** [VERSION_CONTROL_WORKFLOW.md](VERSION_CONTROL_WORKFLOW.md)
- **Quick Reference:** [VERSION_BUMP_QUICK_REFERENCE.md](VERSION_BUMP_QUICK_REFERENCE.md)
- **Branching Strategy:** [BRANCHING_STRATEGY.md](BRANCHING_STRATEGY.md)
- **Git Hooks README:** [../.githooks/README.md](../.githooks/README.md)

---

## 🔄 Maintenance

### Updating Hooks

To update hooks:

1. Edit hook file in `.githooks/`
2. Test locally
3. Commit and push
4. Team members run `./setup-git-hooks.sh` to get updates

### Updating Workflow

To update GitHub Actions workflow:

1. Edit `.github/workflows/version-check.yml`
2. Test in feature branch
3. Merge to Development → Pre_Prod → main

### Disabling (Emergency)

To temporarily disable hooks:

```bash
# Disable hooks
git config --unset core.hooksPath

# Re-enable
git config core.hooksPath .githooks
```

**Note:** GitHub Actions will still run!

---

## 🎉 Summary

You now have a complete automated version control workflow:

✅ **Local validation** - Catches issues before push  
✅ **Cloud validation** - Double-checks in GitHub Actions  
✅ **Auto-tagging** - Creates version tags automatically  
✅ **Documentation** - Complete guides and references  
✅ **Error handling** - Clear messages with solutions  
✅ **Consistency** - All files always in sync  

**Next Steps:**
1. Run `./setup-git-hooks.sh` (if not done yet)
2. Read [VERSION_CONTROL_WORKFLOW.md](VERSION_CONTROL_WORKFLOW.md)
3. Print [VERSION_BUMP_QUICK_REFERENCE.md](VERSION_BUMP_QUICK_REFERENCE.md)
4. Start using `./bump_version.sh` before merging to Pre_Prod

---

**Questions?** See [VERSION_CONTROL_WORKFLOW.md](VERSION_CONTROL_WORKFLOW.md) or contact Mukesh Kesharwani

**Last Updated:** 2025-01-28  
**Version:** 1.0.0
