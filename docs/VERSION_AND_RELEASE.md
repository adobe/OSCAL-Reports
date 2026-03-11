# Version Control and Release

**Unified guide: version bumping, workflow, and release checklist.**

---

## Quick Reference

### Version Bump (before merging to Pre_Prod/main)

```bash
# Bug fix: 1.6.4 → 1.6.5
./bump_version.sh patch "Fix: description"

# New feature: 1.6.4 → 1.7.0
./bump_version.sh minor "Add: description"

# Breaking change: 1.6.4 → 2.0.0
./bump_version.sh major "Breaking: description"
```

### One-Time Setup

```bash
./setup-git-hooks.sh
git config core.hooksPath   # Should output: .githooks
```

### Branch Flow

```
Development → Quality_Test → Pre_Prod → main
```

**main** accepts PRs from **Development**, **Quality_Test**, or **Pre_Prod**. Feature/custom branches cannot target main. Recommended: use Pre_Prod for staging validation first.

---

## Components

- **bump_version.sh** – Updates `package.json` (root, backend, frontend), `docs/CHANGELOG.md`, `.validation/learnings.json`.
- **.githooks/pre-push** – Validates version increment and package consistency before push to Pre_Prod/main.
- **.github/workflows/version-check.yml** – Validates on push/PR to Pre_Prod and main; auto-creates tags on Pre_Prod.

---

## Workflow

1. **Develop** on Development or Quality_Test; merge to Pre_Prod via PR.
2. **On Pre_Prod**: Run `./bump_version.sh [patch|minor|major] "message"` and push. Pre-push hook and GitHub Actions validate.
3. **Release**: Create PR Pre_Prod → main. After merge, release workflow runs (tag, GitHub Release).

---

## Release Checklist (Condensed)

### Pre-Release
- [ ] Version bumped with `bump_version.sh`
- [ ] All `package.json` versions match
- [ ] `docs/CHANGELOG.md` has entry for new version
- [ ] Tests pass: `cd backend && npm run test`
- [ ] No debug code or hardcoded credentials
- [ ] Branch flow correct (PR from Pre_Prod to main only)

### Release Day
- [ ] Create PR: Pre_Prod → main
- [ ] All GitHub Actions green
- [ ] Merge (use merge commit to preserve history)
- [ ] Verify tag created: `git fetch --tags && git tag -l "v*"`
- [ ] Verify GitHub Release and Docker image published

### Common Pitfalls
- **Tar:** Use `tar --exclude=... -czf archive.tar.gz files` (exclude before file args).
- **Version mismatch:** Always use `bump_version.sh`, never edit version by hand in one place only.
- **Wrong PR base:** Only Pre_Prod → main; never feature branch → main.

---

## Troubleshooting

- **"Version has NOT been incremented"** – Run `./bump_version.sh patch "message"` then push again.
- **"Version mismatch"** – Run `./bump_version.sh patch "Sync versions"` to align all package.json files.
- **"Version not in CHANGELOG"** – Use `bump_version.sh`; it updates CHANGELOG. If you edited versions manually, run bump again with a message.
- **Bypass hook (not recommended):** `git push --no-verify` – validation will still run on GitHub Actions.

---

## Related Documentation

- [BRANCHING_STRATEGY.md](BRANCHING_STRATEGY.md)
- [CHANGELOG.md](CHANGELOG.md)
- [DUAL_REPO_SETUP.md](DUAL_REPO_SETUP.md)

---

*Last updated: February 2026*
