# Release Checklist

This comprehensive checklist ensures smooth releases and helps prevent common errors encountered in previous release cycles.

---

## Pre-Release Checklist

### 1. Version Management

- [ ] **Version Bumped**: Run `./bump_version.sh` with appropriate level
  ```bash
  # For bug fixes (1.6.6 → 1.6.7)
  ./bump_version.sh patch "Fix: description"
  
  # For new features (1.6.6 → 1.7.0)
  ./bump_version.sh minor "Add: description"
  
  # For breaking changes (1.6.6 → 2.0.0)
  ./bump_version.sh major "Breaking: description"
  ```

- [ ] **Version Consistency**: All package.json files have matching versions
  ```bash
  # Check versions
  grep '"version"' package.json backend/package.json frontend/package.json
  ```

- [ ] **CHANGELOG Updated**: `docs/CHANGELOG.md` contains entry for new version
  - Release date added (or "TBD" for development)
  - All changes documented under appropriate sections
  - Breaking changes clearly marked

### 2. Code Quality

- [ ] **Tests Passing Locally**: Run all test suites
  ```bash
  cd backend && npm run test
  ```

- [ ] **Linting Passes**: Run linters if configured
  ```bash
  npm run lint:all
  # or
  cd backend && npm run lint
  cd ../frontend && npm run lint
  ```

- [ ] **No Debug Code**: Remove console.logs, debugger statements, and test code
- [ ] **No TODO/FIXME**: Address or document remaining TODOs
- [ ] **Security Review**: No hardcoded credentials or sensitive data

### 3. Branch Workflow

- [ ] **Correct Branch Flow**: Following proper branch progression
  ```
  Development → Quality_Test → Pre_Prod → main
  ```

- [ ] **Current Branch Clean**: No uncommitted changes
  ```bash
  git status
  ```

- [ ] **Synced with Remote**: Branch up-to-date with remote
  ```bash
  git fetch --all
  git status
  ```

### 4. Pull Request Preparation

- [ ] **PR from Correct Branch**: 
  - To Pre_Prod: From Development or Quality_Test
  - To main: **ONLY from Pre_Prod** (not feature branches!)

- [ ] **PR Title Clear**: Descriptive title with version number
  - Example: "Release v1.6.7 - Bug fixes and improvements"

- [ ] **PR Description Complete**: Include:
  - Summary of changes
  - Breaking changes (if any)
  - Testing performed
  - Link to CHANGELOG section

### 5. GitHub Actions Workflows

- [ ] **All Workflows Passing**: Check GitHub Actions tab
  - Branch protection check
  - Version check
  - Pre-release validation
  - Shell validation (if applicable)

- [ ] **No Hardcoded Versions**: Workflows use variables, not hardcoded version numbers

- [ ] **Tar Commands Valid**: Verify --exclude options come BEFORE file arguments
  ```bash
  # ✅ Correct
  tar --exclude=pattern -czf archive.tar.gz files...
  
  # ❌ Wrong
  tar -czf archive.tar.gz files... --exclude=pattern
  ```

### 6. Docker & Deployment

- [ ] **Docker Build Successful**: Test Docker build locally
  ```bash
  docker build -t oscal-reports:test .
  ```

- [ ] **Docker Compose Works**: Test with docker-compose
  ```bash
  docker-compose up --build
  ```

- [ ] **Environment Variables**: All required env vars documented

### 7. Documentation

- [ ] **README Updated**: Version references, new features documented
- [ ] **API Changes Documented**: If backend API changed
- [ ] **Deployment Guide Current**: Deployment instructions up-to-date
- [ ] **Migration Guide**: If breaking changes require user action

---

## Release Day Checklist

### 1. Final Verifications

- [ ] **One Last Test**: Run full test suite one more time
- [ ] **Review CHANGELOG**: Ensure all changes for this version are listed
- [ ] **Check Open Issues**: No critical blocking issues

### 2. Create Pull Request

- [ ] **Create PR**: From Pre_Prod to main
  ```bash
  # Ensure you're on Pre_Prod branch
  git checkout Pre_Prod
  git pull origin Pre_Prod
  
  # Create PR via GitHub UI or gh CLI
  gh pr create --base main --head Pre_Prod
  ```

- [ ] **PR Passes All Checks**: All GitHub Actions workflows green
- [ ] **Code Review**: Get approval from team member (if applicable)

### 3. Merge and Tag

- [ ] **Merge PR**: Use "Merge commit" (not squash) to preserve history
- [ ] **Verify Auto-Tag**: Check that version tag was created automatically
  ```bash
  git fetch --tags
  git tag -l "v*.*.*"
  ```

- [ ] **Release Created**: GitHub Release automatically created from tag

### 4. Post-Release Verification

- [ ] **GitHub Release Published**: Verify release appears on GitHub
  - Archives attached (backend, frontend, full)
  - Changelog content included
  - Release notes accurate

- [ ] **Docker Image Published**: Check Docker Hub (personal repo only)
  ```bash
  docker pull username/oscal_reports:1.6.7
  ```

- [ ] **Deployment Successful**: If auto-deployed, verify deployment
  - Application accessible
  - Health checks passing
  - No errors in logs

---

## Common Pitfalls & How to Avoid Them

### ❌ Error 1: Tar Archive Creation Failure

**Symptom:** `tar: --exclude 'backend/node_modules' has no effect`

**Cause:** --exclude options placed after file arguments

**Fix:**
```bash
# ❌ Wrong
tar -czf archive.tar.gz backend/*.js --exclude=backend/node_modules

# ✅ Correct
tar --exclude=backend/node_modules -czf archive.tar.gz backend/*.js
```

**Prevention:** Pre-release-validation workflow now checks this automatically

---

### ❌ Error 2: ESLint Configuration Missing

**Symptom:** `ESLint couldn't find an eslint.config.js file`

**Cause:** ESLint v9+ requires flat config, old .eslintrc format not supported

**Fix:**
- Create `eslint.config.js` files (root, backend, frontend)
- Add lint scripts to package.json files
- Or disable linting if not needed

**Prevention:** Pre-release-validation checks for ESLint configs

---

### ❌ Error 3: Branch Flow Validation Failure

**Symptom:** `ERROR: Only 'Pre_Prod' branch can merge to 'main'`

**Cause:** Creating PR from feature branch or custom branch to main

**Fix:**
1. Close the incorrect PR
2. Ensure changes are in Pre_Prod branch
3. Create new PR: Pre_Prod → main

**Prevention:** 
- Always follow branch flow: Development → Quality_Test → Pre_Prod → main
- Never create feature branches targeting main directly

---

### ❌ Error 4: Version Mismatch

**Symptom:** Different versions in root, backend, and frontend package.json

**Cause:** Manual version updates instead of using bump_version.sh

**Fix:**
```bash
./bump_version.sh patch "Sync versions"
```

**Prevention:** Always use bump_version.sh script for version updates

---

### ❌ Error 5: Forgotten CHANGELOG Update

**Symptom:** Version not found in CHANGELOG.md

**Cause:** Manual version bump without updating changelog

**Fix:** Edit docs/CHANGELOG.md and add version section

**Prevention:** bump_version.sh updates CHANGELOG automatically

---

## Emergency Procedures

### Rollback a Release

If a release has critical issues:

1. **Identify Last Good Version**
   ```bash
   git tag -l "v*.*.*"
   ```

2. **Create Hotfix Branch**
   ```bash
   git checkout -b hotfix/issue-description v1.6.6
   ```

3. **Apply Fix and Test**
4. **Bump Patch Version**
   ```bash
   ./bump_version.sh patch "Hotfix: description"
   ```

5. **Follow Fast-Track Release**
   - PR to Pre_Prod
   - Immediately PR to main
   - Tag and release

### Fix Failed Release Workflow

If release workflow fails:

1. **Check Error Logs**: Review GitHub Actions logs
2. **Fix Issue Locally**: Test the fix
3. **Update Workflow**: Commit fix to workflow file
4. **Re-tag**: Delete and recreate the version tag
   ```bash
   git tag -d v1.6.7
   git push origin :refs/tags/v1.6.7
   git tag -a v1.6.7 -m "Release v1.6.7"
   git push origin v1.6.7
   ```

---

## Automated Checks

The following checks run automatically on PRs to Pre_Prod and main:

### Pre-Release Validation Workflow
- ✅ Version consistency across package.json files
- ✅ CHANGELOG.md updated
- ✅ Workflow YAML syntax valid
- ✅ Tar command syntax correct
- ✅ ESLint configuration exists
- ✅ Branch naming conventions
- ✅ Required documentation present

### Shell Validation Workflow (if .sh files changed)
- ✅ ShellCheck linting
- ✅ Git hooks validation
- ✅ Shell script best practices
- ✅ Executable permissions

### Version Check Workflow
- ✅ Version incremented from latest tag
- ✅ CHANGELOG contains new version
- ✅ Package.json consistency

### Branch Protection Check
- ✅ Enforces branch flow rules
- ✅ Validates PR source/target branches
- ✅ Provides branching strategy guidance

---

## Quick Reference Commands

```bash
# Check current version
grep '"version"' package.json

# Bump version (patch/minor/major)
./bump_version.sh patch "Bug fix description"

# Check git status
git status

# View recent commits
git log --oneline -5

# Check for uncommitted changes
git diff

# Run tests
cd backend && npm run test

# Run linting
npm run lint:all

# Build Docker image
docker build -t oscal-reports:test .

# Check GitHub Actions status
gh workflow list

# Create PR
gh pr create --base main --head Pre_Prod --title "Release v1.6.7"

# List tags
git tag -l "v*.*.*"
```

---

## Resources

- [BRANCHING_STRATEGY.md](BRANCHING_STRATEGY.md) - Detailed branch workflow
- [VERSION_BUMP_QUICK_REFERENCE.md](VERSION_BUMP_QUICK_REFERENCE.md) - Version management
- [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment procedures
- [CHANGELOG.md](CHANGELOG.md) - Version history
- [GitHub Actions Workflows](../.github/workflows/) - Automation details

---

## Checklist Template for New Releases

Copy this template for each release:

```markdown
# Release v1.6.X Checklist

## Pre-Release
- [ ] Version bumped
- [ ] CHANGELOG updated
- [ ] Tests passing
- [ ] Linting clean
- [ ] Branch: Pre_Prod
- [ ] All workflows green

## Release
- [ ] PR created: Pre_Prod → main
- [ ] PR approved
- [ ] PR merged
- [ ] Tag created
- [ ] GitHub Release published

## Post-Release
- [ ] Docker image available
- [ ] Deployment verified
- [ ] No critical issues
- [ ] Team notified
```

---

*Last Updated: 2026-01-29*
*Version: 1.0.0*
