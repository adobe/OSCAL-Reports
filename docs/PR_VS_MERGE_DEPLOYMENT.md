# PR vs Merge: When Deployment Runs

**Quick Reference Guide**

---

## 🎯 The Simple Answer

**Pull Requests** = Review + Validate (No Deployment)  
**Merge to Main** = Deploy to Production

---

## 📊 Visual Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    PULL REQUEST STAGE                        │
│                     (You are here)                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Create PR #9: Pre_Prod → main                              │
│        ↓                                                     │
│  GitHub Actions Triggered                                   │
│        ↓                                                     │
│  ✅ RUN: Tests & Validation                                 │
│     • Backend tests                                         │
│     • Frontend tests                                        │
│     • Code quality                                          │
│     • Security scanning                                     │
│     • Version check                                         │
│        ↓                                                     │
│  ⏭️  SKIP: Deployment                                       │
│     • Docker build (skipped)                                │
│     • Container push (skipped)                              │
│     • Production deploy (skipped)                           │
│        ↓                                                     │
│  📋 Status: Ready for Review                                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                         ↓
                   Click "Merge"
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                    MERGE TO MAIN STAGE                       │
│                   (Happens after merge)                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Merge Completed                                            │
│        ↓                                                     │
│  Push Event on 'main' Branch                                │
│        ↓                                                     │
│  GitHub Actions Triggered                                   │
│        ↓                                                     │
│  ✅ RUN: Tests Again (final check)                          │
│     • Backend tests                                         │
│     • Frontend tests                                        │
│     • Code quality                                          │
│     • Security scanning                                     │
│        ↓                                                     │
│  ✅ RUN: Build & Deploy                                     │
│     • Build Docker images                                   │
│     • Push to ghcr.io                                       │
│     • Generate deployment instructions                      │
│     • Extract credentials                                   │
│     • Send notifications                                    │
│        ↓                                                     │
│  🎉 Status: Deployed to Production                          │
│     • Dependabot alert closes                               │
│     • Docker images published                               │
│     • Ready for TrueNAS deployment                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔑 Key Workflow Conditions

### Condition in `ci-cd.yml` (Lines 216, 299)

```yaml
if: github.ref == 'refs/heads/main' && github.event_name == 'push'
```

### What This Means

| Context Variable | PR #9 Value | After Merge | Match? |
|-----------------|-------------|-------------|--------|
| `github.ref` | `refs/heads/Pre_Prod` | `refs/heads/main` | After merge ✅ |
| `github.event_name` | `pull_request` | `push` | After merge ✅ |
| **Result** | **SKIP** ⏭️ | **RUN** ✅ | |

---

## 📋 Comparison Table

| Feature | On Pull Request | After Merge |
|---------|----------------|-------------|
| **Tests** | ✅ Run | ✅ Run again |
| **Code Quality** | ✅ Check | ✅ Check again |
| **Security Scan** | ✅ Scan | ✅ Scan again |
| **Docker Build** | ⏭️ Skip | ✅ Build |
| **Container Push** | ⏭️ Skip | ✅ Push to ghcr.io |
| **Deploy** | ⏭️ Skip | ✅ Deploy |
| **Notifications** | ⏭️ Skip | ✅ Send |
| **Dependabot Close** | ⏭️ Skip | ✅ Auto-close |
| **Purpose** | Review & Validate | Deploy to Production |

---

## 💡 Why This Design?

### 1. Security 🔒
- **PR**: Review first, deploy later
- **Prevents**: Unreviewed code in production
- **Ensures**: All changes are approved

### 2. Efficiency ⚡
- **PR**: Fast feedback (just tests)
- **No waste**: Don't deploy every PR update
- **Deploy once**: Only after merge

### 3. Safety 🛡️
- **PR**: Catch issues early
- **Merge**: Deploy only validated code
- **Rollback**: Easy to revert merge commit

### 4. Clarity 📊
- **PR** = Review stage
- **Merge** = Deploy stage
- **Clear separation** of concerns

---

## 🎯 Your Current Situation: PR #9

### What's Happening Now

```
PR #9: Pre_Prod → main
Status: OPEN
Checks: Running/Passing

Jobs Running:
✅ Backend Tests
✅ Frontend Tests
✅ Code Quality
✅ Security Scan
✅ Version Check
✅ Integration Test

Jobs Skipped (by design):
⏭️  Docker Build
⏭️  Deploy
⏭️  Notifications
```

### What Will Happen After Merge

```
Merge PR #9
  ↓
Push to main triggered
  ↓
All jobs run (including deployment)
  ↓
3-5 minutes later:
  ✅ Docker images published
  ✅ Deployment ready
  ✅ Dependabot alert closes
  ✅ Notifications sent
```

---

## 🚀 Action Required

### To Complete Deployment

**Step 1**: Wait for checks (~2-3 minutes)
- All checks should turn green
- Any failures will be shown in PR

**Step 2**: Open PR #9
- URL: https://github.com/AdobeManagedServices/OSCAL-Reports/pull/9

**Step 3**: Review and Merge
- Review "Files changed" tab
- Click "Merge pull request" button
- Click "Confirm merge"

**Step 4**: Watch Deployment
- Go to "Actions" tab
- Watch CI/CD pipeline run
- See deployment jobs execute

**Step 5**: Verify Success
- Check Dependabot alert #8 (should be closed)
- Verify npm audit (0 vulnerabilities)
- Test application health

---

## ✅ Quick Reference

```bash
# Check PR status
gh pr view 9 --repo AdobeManagedServices/OSCAL-Reports

# Check running workflows
gh pr checks 9 --repo AdobeManagedServices/OSCAL-Reports

# Merge when ready
gh pr merge 9 --repo AdobeManagedServices/OSCAL-Reports --merge

# Watch deployment after merge
gh run watch --repo AdobeManagedServices/OSCAL-Reports
```

---

## 🎓 Remember

- ✅ **PR = Test** (No deployment)
- ✅ **Merge = Deploy** (Automatic)
- ✅ **Skipped = Normal** (For PRs)
- ✅ **This is secure** (Best practice)

---

**Status**: Your CI/CD pipeline is working correctly!  
**Action**: Merge PR #9 to trigger deployment  
**Result**: Automated, secure production deployment

---

**Last Updated**: January 23, 2026
