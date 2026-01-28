# Version Control Workflow

## Overview

This document describes the automated version control workflow for the OSCAL Report Generator. The workflow ensures that all releases have properly incremented version numbers and consistent documentation across all files.

## Table of Contents

- [Architecture](#architecture)
- [Components](#components)
- [Workflow](#workflow)
- [Usage Guide](#usage-guide)
- [Troubleshooting](#troubleshooting)

---

## Architecture

### Version Enforcement Strategy

```
Development/Quality_Test → Pre_Prod → main
                            ↓
                    Version Check Triggered
                            ↓
              ┌─────────────┴─────────────┐
              ↓                           ↓
         Local Hook                 GitHub Actions
        (pre-push)                (version-check.yml)
              ↓                           ↓
         [VALIDATE]                  [VALIDATE]
              ↓                           ↓
         Pass/Fail                    Pass/Fail
```

### Validation Points

1. **Local Pre-Push Hook** - Catches version issues before code leaves developer machine
2. **GitHub Actions Workflow** - Enforces version checks on Pre_Prod and main branches
3. **Auto-Tagging** - Automatically creates Git tags for new versions on Pre_Prod

---

## Components

### 1. Version Bump Script

**Location:** `bump_version.sh`

**Purpose:** Centralized script to increment version numbers across all files

**Updates:**
- ✅ `package.json` (root)
- ✅ `backend/package.json`
- ✅ `frontend/package.json`
- ✅ `docs/CHANGELOG.md`
- ✅ `.validation/learnings.json`

**Usage:**
```bash
# Patch version (bug fixes): 1.6.4 → 1.6.5
./bump_version.sh patch "Fix: Authentication timeout issue"

# Minor version (new features): 1.6.4 → 1.7.0
./bump_version.sh minor "Add: AI-powered control suggestions"

# Major version (breaking changes): 1.6.4 → 2.0.0
./bump_version.sh major "Breaking: New API structure"
```

### 2. Pre-Push Git Hook

**Location:** `.githooks/pre-push`

**Purpose:** Prevent pushing unversioned code to Pre_Prod or main

**Checks:**
- ✅ Version has been incremented from latest tag
- ✅ All `package.json` files have consistent versions
- ✅ Changelog contains the new version
- ✅ Version not decreased (no downgrades)

**Setup:**
```bash
./setup-git-hooks.sh
```

### 3. GitHub Actions Workflow

**Location:** `.github/workflows/version-check.yml`

**Triggers:**
- Push to `Pre_Prod` branch
- Pull requests to `Pre_Prod` or `main` branches

**Jobs:**

#### a. Version Check
Validates that version has been incremented properly.

#### b. Changelog Check
Ensures changelog has been updated with the new version.

#### c. Package Consistency
Verifies all `package.json` files have matching versions.

#### d. Auto-Tag Creation
Automatically creates Git tags for new versions (only on Pre_Prod push).

---

## Workflow

### Standard Development Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Feature Development                                      │
│    • Work on feature/fix branches                           │
│    • Merge to Development or Quality_Test                   │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Prepare for Pre-Production                               │
│    • Merge Development/Quality_Test → Pre_Prod (PR)         │
│    • Bump version: ./bump_version.sh [type] "message"       │
│    • Push changes                                           │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Automated Validation (GitHub Actions)                    │
│    ✓ Version incremented?                                   │
│    ✓ Changelog updated?                                     │
│    ✓ Package.json consistent?                               │
│    ✓ Auto-create tag vX.Y.Z                                 │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Production Release                                       │
│    • Create PR: Pre_Prod → main                             │
│    • Version validation runs again                          │
│    • Merge to main = Production Release                     │
│    • Tag triggers release workflow (.github/workflows/      │
│      release.yml)                                           │
└─────────────────────────────────────────────────────────────┘
```

### Version Bump Decision Matrix

| Change Type | Example | Bump Type | Example Version |
|-------------|---------|-----------|-----------------|
| Bug fix | Fix crash, typo, small issue | `patch` | 1.6.4 → 1.6.5 |
| New feature | Add new capability | `minor` | 1.6.4 → 1.7.0 |
| Breaking change | API changes, major refactor | `major` | 1.6.4 → 2.0.0 |

---

## Usage Guide

### For Developers

#### Initial Setup

1. **Install Git Hooks:**
   ```bash
   ./setup-git-hooks.sh
   ```

2. **Verify Installation:**
   ```bash
   git config core.hooksPath
   # Should output: .githooks
   ```

#### Creating a Release

1. **Ensure you're on the correct branch:**
   ```bash
   git checkout Pre_Prod
   git pull origin Pre_Prod
   ```

2. **Merge your changes:**
   ```bash
   # Merge from Development or Quality_Test
   git merge Development
   ```

3. **Bump the version:**
   ```bash
   # Choose appropriate version bump type
   ./bump_version.sh minor "Add new AI integration features"
   ```

4. **Review changes:**
   ```bash
   git log -1
   git diff HEAD~1
   ```

5. **Push to Pre_Prod:**
   ```bash
   git push origin Pre_Prod
   ```
   
   **Note:** The pre-push hook will validate your version bump!

6. **Verify GitHub Actions:**
   - Go to GitHub Actions tab
   - Check that "Version Check on Pre_Prod" workflow passes
   - Verify that tag was auto-created: `git fetch --tags && git tag`

#### Merging to Production (main)

1. **Create Pull Request:**
   - From: `Pre_Prod`
   - To: `main`

2. **Wait for Validation:**
   - Version check will run automatically
   - All checks must pass

3. **Merge PR:**
   - Once approved and checks pass, merge to main
   - This triggers the release workflow

### For CI/CD

The GitHub Actions workflow runs automatically. No manual intervention needed unless validation fails.

**Workflow files:**
- `.github/workflows/version-check.yml` - Version validation
- `.github/workflows/release.yml` - Creates GitHub releases from tags

---

## Troubleshooting

### Error: "Version has NOT been incremented"

**Problem:** You're trying to push to Pre_Prod/main without bumping the version.

**Solution:**
```bash
# Run version bump script
./bump_version.sh patch "Your changelog message"

# Then push again
git push origin Pre_Prod
```

### Error: "Version mismatch detected"

**Problem:** `package.json` files have inconsistent versions.

**Current state:**
- Root: 1.6.4
- Backend: 1.6.3
- Frontend: 1.6.4

**Solution:**
```bash
# The bump script will sync all versions
./bump_version.sh patch "Sync package versions"
```

### Error: "Version cannot be less than latest tag"

**Problem:** You manually edited package.json and set version lower than the last release.

**Current state:**
- Latest tag: v1.6.4
- Current version: 1.6.3

**Solution:**
```bash
# Set version higher than latest tag
./bump_version.sh minor "Correct version number"
```

### Warning: "Version X.Y.Z not found in CHANGELOG.md"

**Problem:** Changelog hasn't been updated with the new version.

**Solution:**
The `bump_version.sh` script automatically updates the changelog. If you manually edited versions:

```bash
# Use the script to ensure consistency
./bump_version.sh patch "Update documentation"
```

### Bypassing Hooks (NOT RECOMMENDED)

If you absolutely must bypass the pre-push hook (NOT recommended):

```bash
git push --no-verify origin Pre_Prod
```

**⚠️ WARNING:** This will still fail at GitHub Actions level!

### Disabling Hooks

If you need to disable hooks temporarily:

```bash
# Remove hooks configuration
git config --unset core.hooksPath

# Re-enable later
git config core.hooksPath .githooks
```

---

## Best Practices

### ✅ DO

- **Always use `bump_version.sh`** for version changes
- **Bump version on Pre_Prod** before merging to main
- **Write meaningful changelog messages**
- **Follow semantic versioning** (major.minor.patch)
- **Test thoroughly** before bumping to production
- **Review generated commits** before pushing

### ❌ DON'T

- **Don't manually edit version numbers** in package.json files
- **Don't skip version bumps** when merging to Pre_Prod
- **Don't use `--no-verify`** to bypass hooks (GitHub Actions will catch it)
- **Don't reuse version numbers**
- **Don't bump version for minor commits** to Development/Quality_Test
- **Don't downgrade versions**

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-01-28 | Initial version control workflow documentation |

---

## Related Documentation

- [Branching Strategy](BRANCHING_STRATEGY.md) - Git branching workflow
- [Deployment Guide](DEPLOYMENT.md) - Deployment procedures
- [Contributing Guide](..//.github/CONTRIBUTING.md) - Contribution guidelines
- [Changelog](CHANGELOG.md) - Version history

---

## Support

For questions or issues with the version control workflow:

1. Check this documentation
2. Review [Troubleshooting](#troubleshooting) section
3. Check GitHub Actions logs for detailed error messages
4. Contact: Mukesh Kesharwani <mukesh.kesharwani@adobe.com>

---

**Last Updated:** 2025-01-28  
**Author:** Mukesh Kesharwani  
**Maintained by:** Development Team
