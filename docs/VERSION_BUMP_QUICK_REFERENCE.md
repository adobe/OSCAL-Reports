# 🚀 Version Bump Quick Reference Card

**Print this and keep it handy!**

---

## ⚡ Quick Command Reference

### Bump Version (Before Merging to Pre_Prod/main)

```bash
# Bug fix (1.6.4 → 1.6.5)
./bump_version.sh patch "Fix: description"

# New feature (1.6.4 → 1.7.0)
./bump_version.sh minor "Add: description"

# Breaking change (1.6.4 → 2.0.0)
./bump_version.sh major "Breaking: description"
```

---

## 🔧 One-Time Setup

```bash
# Install Git hooks
./setup-git-hooks.sh

# Verify installation
git config core.hooksPath
# Should output: .githooks
```

---

## ✅ Pre-Merge Checklist

Before creating PR to Pre_Prod or main:

- [ ] Run `./bump_version.sh [type] "message"`
- [ ] Review changes: `git diff HEAD~1`
- [ ] Check version: `grep version package.json`
- [ ] Verify CHANGELOG: `cat docs/CHANGELOG.md | head -20`
- [ ] Push to branch
- [ ] Pre-push hook validates automatically

---

## 🌳 Branch Flow

```
Development/Quality_Test → Pre_Prod → main
                            ↑
                    BUMP VERSION HERE!
```

**Version bump required when:**
- ✅ Merging to Pre_Prod
- ✅ Merging to main
- ❌ NOT needed for Development/Quality_Test

---

## 🏷️ Version Types

| Type | When | Example |
|------|------|---------|
| `patch` | Bug fixes, typos, small issues | 1.6.4 → 1.6.5 |
| `minor` | New features, enhancements | 1.6.4 → 1.7.0 |
| `major` | Breaking changes, API changes | 1.6.4 → 2.0.0 |

---

## 🚨 Common Errors & Fixes

### Error: "Version has NOT been incremented"

**Fix:**
```bash
./bump_version.sh patch "Bump version"
git push
```

### Error: "Version mismatch detected"

**Fix:**
```bash
./bump_version.sh patch "Sync versions"
git push
```

### Warning: "Changelog not updated"

**Fix:** The bump script updates it automatically!

---

## 🛠️ What bump_version.sh Does

Automatically updates:
- ✅ `package.json` (root)
- ✅ `backend/package.json`
- ✅ `frontend/package.json`
- ✅ `docs/CHANGELOG.md`
- ✅ `.validation/learnings.json`
- ✅ Creates git commit
- ✅ Optionally creates git tag

---

## 📝 Good Changelog Messages

### DO ✅
- `./bump_version.sh patch "Fix authentication timeout issue"`
- `./bump_version.sh minor "Add AI-powered control suggestions"`
- `./bump_version.sh major "Breaking: Redesign REST API structure"`

### DON'T ❌
- `./bump_version.sh patch "stuff"`
- `./bump_version.sh minor "updates"`
- `./bump_version.sh major "changes"`

---

## 🔍 Verify Your Version Bump

```bash
# Check current version
grep '"version"' package.json | head -1

# Check all package.json versions match
grep '"version"' package.json backend/package.json frontend/package.json

# View recent changelog entries
head -20 docs/CHANGELOG.md

# View your version bump commit
git log -1

# Compare with latest tag
git describe --tags --abbrev=0
```

---

## 🔄 Complete Workflow Example

```bash
# 1. Merge your feature to Development
git checkout Development
git merge feature/my-feature
git push

# 2. Create PR from Development to Pre_Prod
git checkout Pre_Prod
git pull
git merge Development

# 3. BUMP VERSION (before pushing!)
./bump_version.sh minor "Add new AI integration features"

# 4. Push (pre-push hook validates)
git push origin Pre_Prod

# 5. GitHub Actions auto-creates tag
# Check: git fetch --tags && git tag

# 6. Later: Merge Pre_Prod to main
git checkout main
git merge Pre_Prod
git push origin main
```

---

## 🚫 Bypass Hook (NOT RECOMMENDED)

```bash
# Only use in emergencies - will still fail in GitHub Actions!
git push --no-verify
```

**⚠️ WARNING**: This only bypasses LOCAL hook. GitHub Actions will still catch version issues!

---

## 📚 Full Documentation

For complete details, see:
- [VERSION_CONTROL_WORKFLOW.md](VERSION_CONTROL_WORKFLOW.md)
- [BRANCHING_STRATEGY.md](BRANCHING_STRATEGY.md)

---

## 🆘 Need Help?

1. Read [VERSION_CONTROL_WORKFLOW.md](VERSION_CONTROL_WORKFLOW.md)
2. Check [Troubleshooting section](VERSION_CONTROL_WORKFLOW.md#troubleshooting)
3. View GitHub Actions logs for detailed errors
4. Contact: Mukesh Kesharwani <mukesh.kesharwani@adobe.com>

---

**Last Updated:** 2025-01-28  
**Version:** 1.0.0

---

## 🖨️ Print-Friendly Version

For a print-friendly version:
1. Open this file in your browser
2. Print with "Reader View" enabled
3. Or save as PDF and print

Keep this card near your workspace for easy reference!
