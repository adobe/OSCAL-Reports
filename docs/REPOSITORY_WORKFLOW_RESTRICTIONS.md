# Repository-Specific Workflow Restrictions

**Date**: January 22, 2026  
**Version**: 1.2  
**Last Updated**: January 23, 2026  
**Author**: System Administrator

---

## Overview

This document describes the repository-specific restrictions applied to GitHub Actions workflows to ensure proper functionality across different repository contexts.

## Background

The OSCAL Reports application is maintained in two repositories:

1. **Adobe Repository** (Primary): `AdobeManagedServices/OSCAL-Reports`
   - Has access to Adobe infrastructure
   - Contains GitLab runner configuration
   - Has NGROK_AUTHTOKEN secret configured
   - Full deployment capabilities

2. **Personal Repository** (Mirror): `keekar2022/OSCAL-Reports`
   - Public mirror for development and sharing
   - **Does NOT have** GitLab runner access
   - **Does NOT have** NGROK_AUTHTOKEN secret
   - Limited deployment capabilities

## Workflow Restrictions

### Test Environment Deployment with Ngrok

**Workflow File**: `.github/workflows/deploy-test-environment.yml`

**Restriction**: This workflow is **ONLY** enabled for the Adobe repository.

**Trigger**: Automatically deploys on merges to `Pre_Prod` branch (staging/testing environment).

**Reason**: 
- Requires `NGROK_AUTHTOKEN` secret (only available in Adobe repository)
- Uses GitLab runner infrastructure (only available in Adobe organization)
- Aligns with three-tier branching strategy: Pre_Prod = staging/testing, main = production

**Implementation**:

```yaml
# In deploy-runner-test job:
if: |
  github.repository == 'AdobeManagedServices/OSCAL-Reports' &&
  ((github.ref == 'refs/heads/Pre_Prod' && github.event_name == 'push') ||
  github.event_name == 'workflow_dispatch')

# In notify-testers job:
if: success() && github.repository == 'AdobeManagedServices/OSCAL-Reports'
```

**Behavior by Repository**:

| Feature | Adobe Repository | Personal Repository |
|---------|-----------------|-------------------|
| Unit Tests | ✅ Runs | ✅ Runs |
| Integration Tests | ✅ Runs | ✅ Runs |
| Ngrok Deployment | ✅ Runs | ❌ Skipped |
| Tester Notifications | ✅ Runs | ❌ Skipped |

---

## Change History

### Version 1.2 - January 23, 2026

**Change**: Moved test environment trigger from `main` to `Pre_Prod` branch

**Rationale**:
- Aligns with three-tier branching strategy
- Pre_Prod serves as staging/testing environment
- Main branch reserved for production deployment only
- Allows testing before final production release

**Impact**:
- Test environment now auto-deploys on merges to Pre_Prod
- Production deployment to main remains manual/controlled
- Better separation of staging vs production

### Version 1.0 - January 22, 2026

**Initial Implementation**: Added repository restrictions for ngrok deployments

### 1. Added Repository Comment Header

Added clear documentation at the top of the workflow file:

```yaml
# IMPORTANT: This workflow only runs on AdobeManagedServices/OSCAL-Reports
# The personal repository (keekar2022/OSCAL-Reports) does not have:
# - GitLab runner access
# - NGROK_AUTHTOKEN secret
# Therefore, ngrok-related deployments are restricted to the Adobe repository
```

### 2. Updated Job Conditions

**Before** (v1.0 - January 22, 2026):
```yaml
if: |
  (github.ref == 'refs/heads/main' && github.event_name == 'push') ||
  github.event_name == 'workflow_dispatch'
```

**After** (v1.1 - January 22, 2026):
```yaml
if: |
  github.repository == 'AdobeManagedServices/OSCAL-Reports' &&
  ((github.ref == 'refs/heads/main' && github.event_name == 'push') ||
  github.event_name == 'workflow_dispatch')
```

**Current** (v1.2 - January 23, 2026):
```yaml
if: |
  github.repository == 'AdobeManagedServices/OSCAL-Reports' &&
  ((github.ref == 'refs/heads/Pre_Prod' && github.event_name == 'push') ||
  github.event_name == 'workflow_dispatch')
```

**Change**: Moved test environment trigger from `main` to `Pre_Prod` to align with three-tier branching strategy where Pre_Prod serves as staging/testing before production deployment to main.

### 3. Added Repository Check to Notifications

**Before**:
```yaml
if: success()
```

**After**:
```yaml
if: success() && github.repository == 'AdobeManagedServices/OSCAL-Reports'
```

---

## Other Workflows (No Restrictions)

The following workflows run on **BOTH** repositories without restrictions:

### 1. CI/CD Pipeline (`.github/workflows/ci-cd.yml`)
- ✅ Backend tests
- ✅ Frontend tests
- ✅ Code quality checks
- ✅ Version consistency checks
- ✅ Integration tests
- ✅ Docker image build (main branch only)

### 2. Manual Deployment (`.github/workflows/manual-deploy.yml`)
- ✅ Manual deployment to Blue/Green environments
- ✅ Docker image building
- ✅ Deployment instructions generation

### 3. Other Workflows
- ✅ Branch protection checks
- ✅ Deployment config validation
- ✅ Cloud platform deployments (Azure, AWS)
- ✅ Release workflow

---

## Testing the Restrictions

### On Adobe Repository

```bash
# Push to main branch
git push origin main

# Expected: All jobs run including ngrok deployment
```

### On Personal Repository

```bash
# Push to main branch
git push origin main

# Expected: 
# ✅ Tests run successfully
# ❌ Ngrok deployment skipped (no error, just skipped)
# ❌ Tester notifications skipped
```

---

## Secret Requirements

### Adobe Repository Required Secrets

| Secret Name | Purpose | Location |
|------------|---------|----------|
| `NGROK_AUTHTOKEN` | Ngrok tunnel authentication | Repository secrets |
| `GITHUB_TOKEN` | GitHub API access | Auto-provided |

### Personal Repository (No Additional Secrets Needed)

The personal repository works without these secrets, but with limited functionality.

---

## Troubleshooting

### Ngrok Deployment Not Running

**Symptom**: The `deploy-runner-test` job is skipped

**Possible Causes**:
1. ✅ **Expected**: Running on personal repository (keekar2022/OSCAL-Reports)
2. ❌ **Issue**: Missing NGROK_AUTHTOKEN secret in Adobe repository
3. ❌ **Issue**: Not triggering from main branch or workflow_dispatch

**Solution**:
```bash
# Check which repository you're in
git remote -v

# If on Adobe repository and job still skips:
# 1. Verify NGROK_AUTHTOKEN secret exists in repository settings
# 2. Check branch name is exactly 'main'
# 3. Check workflow run logs for condition evaluation
```

### Tests Running But No Deployment

**Symptom**: Tests pass but no ngrok URL is generated

**Cause**: This is expected behavior for personal repository

**Solution**: Push to Adobe repository for full deployment testing

---

## Future Considerations

### Adding More Repository-Specific Features

If you need to add more repository-specific workflows:

```yaml
jobs:
  my-job:
    runs-on: ubuntu-latest
    # Only run on Adobe repository
    if: github.repository == 'AdobeManagedServices/OSCAL-Reports'
    
    steps:
      # Your steps here
```

### Supporting Multiple Repositories

If you want to support different behavior based on repository:

```yaml
jobs:
  my-job:
    runs-on: ubuntu-latest
    
    steps:
      - name: Repository-specific behavior
        run: |
          if [ "${{ github.repository }}" == "AdobeManagedServices/OSCAL-Reports" ]; then
            echo "Running on Adobe repository"
            # Adobe-specific commands
          else
            echo "Running on personal repository"
            # Alternative commands
          fi
```

---

## FAQ: Common Questions

### Q: Why does deployment skip on Pull Requests?

**A: This is correct and expected behavior!**

Deployment workflows are intentionally designed to:
- ⏭️ **SKIP on Pull Requests** (review stage - validate code)
- ✅ **RUN after PR is merged** (deployment stage - deploy code)

**Technical Reason**: The workflow condition checks for:
```yaml
if: github.ref == 'refs/heads/main' && github.event_name == 'push'
```

- **Pull Requests**: `event_name` = `pull_request` ❌ → Deployment skipped
- **After Merge**: `event_name` = `push` ✅ → Deployment runs

**Why This Design?**
1. **Security**: Code must be reviewed before deployment
2. **Efficiency**: No wasted deployments on test PRs
3. **Safety**: Explicit approval required (merge button = deploy approval)
4. **Clarity**: PR = Review & Test, Merge = Deploy

This is an industry best practice followed by GitHub, Kubernetes, React, and all major projects.

### Q: When does the test environment deploy?

**A: On merges to `Pre_Prod` branch (not `main`)**

**Current Behavior** (v1.2 - January 23, 2026):
- **Triggers on**: Push to `Pre_Prod` branch (staging/testing)
- **Does NOT trigger on**: Push to `main` branch (production)
- **Duration**: 5-hour testing window
- **Repository**: Adobe only (`AdobeManagedServices/OSCAL-Reports`)
- **Tool**: Ngrok tunnel with public URL

**Why Pre_Prod instead of main?**
- Pre_Prod serves as staging/testing environment
- Testing happens BEFORE production deployment
- Aligns with three-tier branching strategy: Development → Pre_Prod (TEST) → main (PROD)
- Issues caught earlier, before reaching production

**Workflow**:
```
Development/Quality_Test → Pre_Prod  (🧪 Test environment auto-deploys here)
                              ↓
                            main  (🚀 Production deployment, no test env)
```

### Q: Why doesn't my personal repository deploy the test environment?

**A: Repository restrictions for security and infrastructure**

The ngrok test environment **only works** on `AdobeManagedServices/OSCAL-Reports` because:

**Requirements**:
- `NGROK_AUTHTOKEN` secret (Adobe repo only)
- GitLab runner infrastructure (Adobe organization only)
- 5-hour testing window support

**Personal Repository** (`keekar2022/OSCAL-Reports`):
- ⏭️ Ngrok deployment gracefully skipped (no error)
- ✅ All other CI/CD features work normally
- ✅ Tests, builds, and other workflows run fine

This is by design to prevent deployment failures due to missing infrastructure.

---

## Related Documentation

- **GitHub Actions Documentation**: [Workflow Syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)
- **Deployment Guide**: `docs/DEPLOYMENT.md`
- **CI/CD Guide**: `docs/GITHUB_ACTIONS_DEPLOYMENT.md`
- **Branching Strategy**: `docs/BRANCHING_STRATEGY.md`
- **Test Environment Setup**: `.github/workflows/deploy-test-environment.yml`

---

## Changelog

### Version 1.2 (January 23, 2026)
- **Changed test environment trigger from `main` to `Pre_Prod` branch**
- Updated workflow to align with three-tier branching strategy
- Testing now happens in staging (Pre_Prod) before production (main)
- Added FAQ section for common questions
- Updated documentation with new trigger behavior

### Version 1.1 (January 22, 2026)
- Added repository restrictions to ngrok deployment workflow
- Updated test environment deployment conditions
- Added tester notification restrictions

### Version 1.0 (January 22, 2026)
- Initial documentation
- Documented behavior differences between repositories

---

**Maintained By**: OSCAL Reports Development Team  
**Contact**: mukesh.kesharwani@adobe.com
