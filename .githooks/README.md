# Git Hooks for OSCAL Report Generator

This directory contains custom Git hooks that enforce version control policies.

## Setup

To activate these hooks:

```bash
./setup-git-hooks.sh
```

Or manually:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/*
```

## Available Hooks

### pre-push

**Purpose**: Validates version increment before pushing to Pre_Prod or main branches

**Checks:**
- ✅ Version has been incremented from latest tag
- ✅ All package.json files have consistent versions
- ✅ Version not decreased (no downgrades)
- ⚠️  Warns if changelog not updated

**When it runs:**
- Before `git push` to Pre_Prod branch
- Before `git push` to main branch
- Does NOT run for other branches (Development, Quality_Test, feature branches)

**If validation fails:**
- Push is blocked
- Error message shows current vs. expected version
- Instructions provided to fix with `bump_version.sh`

## How to Bump Version

Before pushing to Pre_Prod or main:

```bash
# Bug fix (1.6.4 → 1.6.5)
./bump_version.sh patch "Fix: description"

# New feature (1.6.4 → 1.7.0)
./bump_version.sh minor "Add: description"

# Breaking change (1.6.4 → 2.0.0)
./bump_version.sh major "Breaking: description"
```

## Troubleshooting

### Hook doesn't run

```bash
# Check if hooks path is configured
git config core.hooksPath

# Should output: .githooks
# If not, run:
./setup-git-hooks.sh
```

### Hook fails with "permission denied"

```bash
# Make hooks executable
chmod +x .githooks/*
```

### Need to bypass (emergency only)

```bash
# Bypass local hook (NOT RECOMMENDED)
git push --no-verify

# WARNING: GitHub Actions will still validate version!
```

## Documentation

For complete documentation, see:
- [GIT_AND_RELEASE.md](../docs/GIT_AND_RELEASE.md) (version, branching, dual remotes, PRs)

## Adding New Hooks

To add a new hook:

1. Create hook file in this directory (e.g., `pre-commit`)
2. Make it executable: `chmod +x .githooks/pre-commit`
3. Add documentation here
4. Update `setup-git-hooks.sh` if needed

---

**Last Updated:** April 2026
