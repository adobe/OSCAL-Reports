# Repository Workflow Restriction - Implementation Summary

**Date**: January 22, 2026  
**Task**: Restrict test environment and ngrok deployments to Adobe repository only  
**Status**: ✅ Complete

---

## 📋 Task Overview

Ensure that test environment deployment and ngrok-related workflows are only triggered when code is merged to the main branch of the Adobe repository (`AdobeManagedServices/OSCAL-Reports`) because:

1. **GitLab runner** is not available at the personal repository (`keekar2022/OSCAL-Reports`)
2. **NGROK_AUTHTOKEN secret** is not configured in the personal repository
3. These resources are only available in the Adobe organization

---

## ✅ Changes Implemented

### 1. Updated Workflow: `.github/workflows/deploy-test-environment.yml`

#### A. Added Repository Documentation Header

Added clear documentation at the top of the workflow file:

```yaml
# IMPORTANT: This workflow only runs on AdobeManagedServices/OSCAL-Reports
# The personal repository (keekar2022/OSCAL-Reports) does not have:
# - GitLab runner access
# - NGROK_AUTHTOKEN secret
# Therefore, ngrok-related deployments are restricted to the Adobe repository
```

#### B. Updated `deploy-runner-test` Job Condition

**Before**:
```yaml
if: |
  (github.ref == 'refs/heads/main' && github.event_name == 'push') ||
  github.event_name == 'workflow_dispatch'
```

**After**:
```yaml
if: |
  github.repository == 'AdobeManagedServices/OSCAL-Reports' &&
  ((github.ref == 'refs/heads/main' && github.event_name == 'push') ||
  github.event_name == 'workflow_dispatch')
```

**Effect**: The ngrok deployment job will now only run on the Adobe repository.

#### C. Updated `notify-testers` Job Condition

**Before**:
```yaml
if: success()
```

**After**:
```yaml
if: success() && github.repository == 'AdobeManagedServices/OSCAL-Reports'
```

**Effect**: Tester notifications will only be sent when running on the Adobe repository.

#### D. Added Inline Comment

Added explanatory comment in the job header:

```yaml
# Note: Only runs on Adobe repository where GitLab runner and ngrok secrets are available
```

---

### 2. Created New Documentation: `docs/REPOSITORY_WORKFLOW_RESTRICTIONS.md`

Created comprehensive documentation covering:

- **Overview** of the two repositories (Adobe and Personal)
- **Workflow restrictions** and their rationale
- **Implementation details** with code examples
- **Behavior comparison** table showing what runs where
- **Secret requirements** for each repository
- **Troubleshooting guide** for common issues
- **Future considerations** for adding more repository-specific features

**Key sections**:
- Background on repository differences
- Test Environment Deployment with Ngrok restrictions
- Changes made (this implementation)
- Other workflows (no restrictions)
- Testing the restrictions
- Secret requirements
- Troubleshooting guide

---

### 3. Updated Deployment Documentation: `docs/DEPLOYMENT.md`

#### A. Added Note to Deployment Options Table

```markdown
| Need | Recommended Option | Cost | Setup Time |
|------|-------------------|------|------------|
| Testing environment for testers | Ngrok + GitHub Runner* | FREE | 10 min |
...

* **Note**: Ngrok deployment only available on Adobe repository (`AdobeManagedServices/OSCAL-Reports`)
```

#### B. Added Repository Restriction Warning

Added detailed warning in the Testing Environment section:

```markdown
**⚠️ Repository Restriction:**
- **Only available on Adobe repository** (`AdobeManagedServices/OSCAL-Reports`)
- Requires `NGROK_AUTHTOKEN` secret and GitLab runner access
- Personal repository (`keekar2022/OSCAL-Reports`) does not support this deployment
- See `docs/REPOSITORY_WORKFLOW_RESTRICTIONS.md` for details
```

---

## 🎯 Expected Behavior

### On Adobe Repository (`AdobeManagedServices/OSCAL-Reports`)

When code is merged to the `main` branch:

```
✅ Tests Run
✅ Docker Build
✅ Ngrok Deployment Starts
✅ 5-Hour Testing Environment Active
✅ Testers Notified with Ngrok URL
✅ Full Deployment Pipeline
```

### On Personal Repository (`keekar2022/OSCAL-Reports`)

When code is merged to the `main` branch:

```
✅ Tests Run
✅ Docker Build
⏭️  Ngrok Deployment Skipped (no error)
⏭️  Tester Notifications Skipped
✅ Other CI/CD Steps Continue Normally
```

**Note**: Jobs are **skipped**, not **failed**. This is the expected behavior.

---

## 🔍 How It Works

### Repository Check Logic

The workflow uses GitHub Actions context to check the repository:

```yaml
github.repository == 'AdobeManagedServices/OSCAL-Reports'
```

This evaluates to:
- `true` on Adobe repository → Job runs
- `false` on personal repository → Job skipped

### Workflow Trigger Flow

```
Push to main branch
  ↓
Tests Job Runs (both repos)
  ↓
Deploy-runner-test Job
  ↓
Check: github.repository == 'AdobeManagedServices/OSCAL-Reports'?
  ↓
Yes → Run ngrok deployment
No  → Skip (no error)
```

---

## 📊 Files Modified

### 1. Workflow Files
- ✏️ **Modified**: `.github/workflows/deploy-test-environment.yml`
  - Added repository check to `deploy-runner-test` job
  - Added repository check to `notify-testers` job
  - Added documentation comments

### 2. Documentation Files
- 📄 **Created**: `docs/REPOSITORY_WORKFLOW_RESTRICTIONS.md`
  - Comprehensive guide to repository-specific restrictions
- ✏️ **Modified**: `docs/DEPLOYMENT.md`
  - Added repository restriction notes
  - Updated deployment options table

### 3. Summary Files
- 📄 **Created**: `REPOSITORY_WORKFLOW_UPDATE_SUMMARY.md` (this file)
  - Implementation summary

---

## ✅ Verification Steps

### 1. Test on Adobe Repository

```bash
# On Adobe repository
cd /path/to/AdobeManagedServices/OSCAL-Reports
git checkout main
git pull

# Make a small change
echo "# Test" >> README.md
git add README.md
git commit -m "test: verify ngrok deployment restriction"
git push origin main

# Expected: Ngrok deployment runs
# Check: https://github.com/AdobeManagedServices/OSCAL-Reports/actions
```

### 2. Test on Personal Repository

```bash
# On personal repository
cd /path/to/keekar2022/OSCAL-Reports
git checkout main
git pull

# Make a small change
echo "# Test" >> README.md
git add README.md
git commit -m "test: verify ngrok deployment skipped"
git push origin main

# Expected: Ngrok deployment skipped (not failed)
# Check: https://github.com/keekar2022/OSCAL-Reports/actions
```

### 3. Verify Workflow Logs

Check the workflow run logs to ensure:

1. **Tests job** runs successfully on both repositories
2. **deploy-runner-test job** shows:
   - ✅ "Running" on Adobe repository
   - ⏭️ "Skipped" on personal repository (not "Failed")
3. **notify-testers job** shows:
   - ✅ "Running" on Adobe repository
   - ⏭️ "Skipped" on personal repository

---

## 🔐 Security Considerations

### Secret Management

| Secret | Adobe Repo | Personal Repo |
|--------|-----------|--------------|
| `NGROK_AUTHTOKEN` | ✅ Configured | ❌ Not available |
| `GITHUB_TOKEN` | ✅ Auto-provided | ✅ Auto-provided |

### Access Control

- **Adobe Repository**: Full access to Adobe infrastructure and secrets
- **Personal Repository**: Public mirror without sensitive configurations
- **Benefit**: Prevents secret exposure in personal/public repositories

---

## 📚 Related Documentation

1. **Main Implementation**:
   - `.github/workflows/deploy-test-environment.yml` - Workflow file with restrictions

2. **Documentation**:
   - `docs/REPOSITORY_WORKFLOW_RESTRICTIONS.md` - Detailed restriction guide
   - `docs/DEPLOYMENT.md` - Updated deployment options with notes
   - `docs/GITHUB_ACTIONS_DEPLOYMENT.md` - CI/CD pipeline documentation

3. **Reference**:
   - [GitHub Actions Contexts](https://docs.github.com/en/actions/learn-github-actions/contexts)
   - [Workflow Syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)

---

## 🚀 Next Steps

### Immediate Actions

1. ✅ Review the workflow file changes
2. ✅ Review the documentation updates
3. ⏭️ Commit and push changes to the repository
4. ⏭️ Test on both repositories to verify behavior

### Recommended Follow-ups

1. **Update Team**: Notify team members about the restriction
2. **Update CI/CD Docs**: Reference the new restriction documentation in CI/CD guides
3. **Monitor Workflows**: Watch the next few workflow runs to ensure proper behavior
4. **Create FAQ**: Add Q&A about repository differences to team wiki

---

## 💡 Tips for Developers

### When Working on Personal Repository

```bash
# Personal repository workflow
git clone https://github.com/keekar2022/OSCAL-Reports.git
cd OSCAL-Reports

# Make changes
# Push to main

# Expected: Tests run, ngrok deployment skips
# This is normal and expected!
```

### When Working on Adobe Repository

```bash
# Adobe repository workflow
git clone https://github.com/AdobeManagedServices/OSCAL-Reports.git
cd OSCAL-Reports

# Make changes
# Push to main

# Expected: Full CI/CD including ngrok deployment
# Testers will receive ngrok URL for 5-hour testing session
```

### Checking Which Repository You're On

```bash
# Check remote URL
git remote -v

# If shows "AdobeManagedServices" → Full features including ngrok
# If shows "keekar2022" → Limited features, ngrok skipped
```

---

## 🔧 Troubleshooting

### Issue: "Ngrok deployment not running on Adobe repository"

**Check**:
1. Verify `NGROK_AUTHTOKEN` secret exists in repository settings
2. Ensure branch name is exactly `main` (case-sensitive)
3. Check workflow logs for condition evaluation

**Solution**:
```bash
# Verify secret (as repo admin)
# Go to: Settings > Secrets and variables > Actions
# Ensure NGROK_AUTHTOKEN exists
```

### Issue: "Personal repository workflow failing"

**This should NOT happen**. Jobs should be skipped, not failed.

**If you see failures**:
1. Check that the condition uses `&&` (AND) not `||` (OR)
2. Verify the repository name is exact: `'AdobeManagedServices/OSCAL-Reports'`
3. Review workflow syntax for any typos

---

## 📝 Summary

### What Was Done

✅ Added repository checks to ngrok deployment workflow  
✅ Restricted test environment deployment to Adobe repository only  
✅ Created comprehensive documentation  
✅ Updated deployment guide with restriction notes  
✅ Ensured graceful skipping (not failure) on personal repository  

### Why It Matters

- **Security**: Prevents attempting deployments without required secrets
- **Clarity**: Developers know which features are available where
- **Stability**: No failed workflows due to missing resources
- **Documentation**: Clear guidance for future developers

### Result

The test environment and ngrok deployment workflow will now **only run** on the Adobe repository (`AdobeManagedServices/OSCAL-Reports`) where the required infrastructure and secrets are available, while gracefully skipping on the personal repository without causing errors.

---

**Implemented By**: AI Assistant  
**Reviewed By**: _Pending review_  
**Date**: January 22, 2026  
**Version**: 1.0
