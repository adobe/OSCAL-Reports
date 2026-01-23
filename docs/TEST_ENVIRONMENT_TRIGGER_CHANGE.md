# Test Environment Trigger Change: main → Pre_Prod

**Date**: January 23, 2026  
**Change Type**: Workflow Trigger Update  
**Status**: ✅ Complete  
**Impact**: Medium - Improves alignment with branching strategy

---

## 🎯 Summary

**Changed the test environment (ngrok) deployment trigger from `main` branch to `Pre_Prod` branch.**

This aligns the testing workflow with the three-tier branching strategy, where Pre_Prod serves as the staging/testing environment before production deployment to main.

---

## 📋 What Changed

### Before (v1.0)

```yaml
# Triggered on main branch
on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main

# Condition checked for main
if: |
  github.repository == 'AdobeManagedServices/OSCAL-Reports' &&
  ((github.ref == 'refs/heads/main' && github.event_name == 'push') ||
  github.event_name == 'workflow_dispatch')
```

**Result**: Test environment deployed when merging to `main` (production branch)

### After (v1.1)

```yaml
# Triggered on Pre_Prod branch
on:
  push:
    branches:
      - Pre_Prod
  pull_request:
    branches:
      - Pre_Prod

# Condition checks for Pre_Prod
if: |
  github.repository == 'AdobeManagedServices/OSCAL-Reports' &&
  ((github.ref == 'refs/heads/Pre_Prod' && github.event_name == 'push') ||
  github.event_name == 'workflow_dispatch')
```

**Result**: Test environment deployed when merging to `Pre_Prod` (staging branch)

---

## 💡 Why This Change?

### Problem with Previous Setup

1. **Wrong Timing**: Testing happened AFTER production merge
2. **No Pre-Production Testing**: Skipped staging validation
3. **Branching Misalignment**: Didn't match three-tier strategy
4. **Risk**: Issues found after code reached main branch

### Benefits of New Setup

1. **Proper Testing Flow**: Test before production
2. **Staging Environment**: Pre_Prod serves its intended purpose
3. **Aligned Strategy**: Matches Development → Pre_Prod (TEST) → main (PRODUCTION)
4. **Reduced Risk**: Issues caught in staging, not production

---

## 🔄 Updated Workflow

### Three-Tier Branching Strategy with Test Environment

```
Development Branch
  │
  ├── Develop & integrate features
  │
  ↓ (Merge via PR)
Quality_Test Branch
  │
  ├── QA validation & testing
  │
  ↓ (Merge via PR)
Pre_Prod Branch  ← 🧪 TEST ENVIRONMENT DEPLOYS HERE
  │
  ├── Staging environment
  ├── Ngrok 5-hour testing session
  ├── Functional testing by testers
  ├── Final validation before production
  │
  ↓ (Merge via PR after testing)
main Branch  ← 🚀 PRODUCTION DEPLOYMENT
  │
  ├── Production release
  ├── Docker images published
  └── Manual TrueNAS deployment
```

### Deployment Timeline

#### Development/Quality_Test → Pre_Prod

```
PR Created: Development → Pre_Prod
  ↓
PR Merged
  ↓
Automatic Trigger:
  ✅ Run all tests
  ✅ Build Docker image
  🧪 Deploy 5-hour Ngrok test environment
  ✅ Notify testers with URL
  ↓
Testers Access & Validate (5 hours)
  ↓
Testing Complete? (feedback gathered)
```

#### Pre_Prod → main

```
PR Created: Pre_Prod → main
  ↓
PR Merged (after testing approval)
  ↓
Automatic Trigger:
  ✅ Run all tests again
  ✅ Build production Docker images
  ✅ Push to GitHub Container Registry
  ✅ Generate deployment instructions
  ⏭️  Skip Ngrok (already tested in Pre_Prod)
  ↓
Production Ready
```

---

## 📊 Impact Analysis

### What Stays the Same

- ✅ Test environment still deploys automatically
- ✅ 5-hour duration remains
- ✅ Ngrok URL provided to testers
- ✅ Repository restriction (Adobe only) unchanged
- ✅ Manual trigger (`workflow_dispatch`) still works

### What Changes

- 🔄 **Trigger Branch**: `main` → `Pre_Prod`
- 🔄 **Timing**: After production merge → Before production merge
- 🔄 **Purpose**: Production testing → Staging testing
- 🔄 **Workflow**: main deploys test env → Pre_Prod deploys test env

### What Improves

- ✅ **Better Alignment**: Matches three-tier branching strategy
- ✅ **Proper Staging**: Pre_Prod serves as true staging environment
- ✅ **Earlier Testing**: Issues caught before reaching main
- ✅ **Cleaner main**: Only production-ready code merges to main
- ✅ **Logical Flow**: Development → Test → Stage → Production

---

## 🎯 Updated Branching Strategy

### Complete Flow with Testing

```
1. Feature Development
   └─ Work in: Development or Quality_Test branch
   └─ CI/CD: Unit tests, integration tests
   
2. Stage for Pre-Production (NEW TEST TRIGGER HERE!)
   └─ Merge to: Pre_Prod branch
   └─ CI/CD: 
      • Run full test suite
      • Build Docker image
      • 🧪 Deploy Ngrok test environment (5 hours)
      • Notify testers
   └─ Action: Testers validate functionality
   └─ Duration: 5 hours active testing window
   
3. Production Release
   └─ Merge to: main branch (after Pre_Prod testing)
   └─ CI/CD:
      • Run full test suite again
      • Build production Docker images
      • Push to GitHub Container Registry
      • Generate deployment docs
   └─ Action: Manual deployment to TrueNAS
```

### Decision Points

| Stage | Branch | Auto-Deploy Test Env? | Purpose |
|-------|--------|----------------------|---------|
| Development | Development | ❌ No | Feature development |
| QA Testing | Quality_Test | ❌ No | Quality validation |
| **Staging** | **Pre_Prod** | **✅ Yes (NEW!)** | **Pre-production testing** |
| Production | main | ❌ No | Production release |

---

## 🔧 Technical Details

### Files Modified

1. **`.github/workflows/deploy-test-environment.yml`**
   - Line 18-22: Changed trigger from `main` to `Pre_Prod`
   - Line 68: Changed ref check from `refs/heads/main` to `refs/heads/Pre_Prod`
   - Added comments explaining new strategy

2. **`docs/REPOSITORY_WORKFLOW_RESTRICTIONS.md`**
   - Updated trigger documentation
   - Added change history section
   - Documented rationale

3. **`docs/REPOSITORY_WORKFLOW_UPDATE_SUMMARY.md`**
   - Updated expected behavior section
   - Modified workflow trigger flow diagram
   - Added version history

4. **`docs/TEST_ENVIRONMENT_TRIGGER_CHANGE.md`**
   - This document (new)

---

## 🧪 Testing the Change

### Test Scenario 1: Merge to Pre_Prod (Adobe Repo)

```bash
# On Adobe repository
cd /path/to/AdobeManagedServices/OSCAL-Reports
git checkout Pre_Prod
git pull

# Create test commit
echo "# Test Pre_Prod trigger" >> README.md
git add README.md
git commit -m "test: verify Pre_Prod ngrok deployment"
git push adobe Pre_Prod

# Expected Result:
✅ Tests run
✅ Docker builds
✅ Ngrok test environment deploys
✅ 5-hour testing session starts
✅ Testers receive notification
```

### Test Scenario 2: Merge to Pre_Prod (Personal Repo)

```bash
# On personal repository
cd /path/to/keekar2022/OSCAL-Reports
git checkout Pre_Prod
git pull

# Create test commit
echo "# Test Pre_Prod trigger" >> README.md
git add README.md
git commit -m "test: verify Pre_Prod ngrok skip"
git push personal Pre_Prod

# Expected Result:
✅ Tests run
✅ Docker builds
⏭️  Ngrok deployment skipped (no error, no secrets)
```

### Test Scenario 3: Merge to main (Adobe Repo)

```bash
# On Adobe repository
cd /path/to/AdobeManagedServices/OSCAL-Reports
git checkout main
git pull

# Merge from Pre_Prod
git merge Pre_Prod
git push adobe main

# Expected Result:
✅ Tests run
✅ Docker images build & push
✅ Production deployment ready
⏭️  Ngrok test environment does NOT deploy (tested in Pre_Prod)
```

---

## 📚 Documentation Updates

All related documentation has been updated:

- ✅ `docs/REPOSITORY_WORKFLOW_RESTRICTIONS.md` - Updated trigger info
- ✅ `docs/REPOSITORY_WORKFLOW_UPDATE_SUMMARY.md` - Updated behavior
- ✅ `docs/TEST_ENVIRONMENT_TRIGGER_CHANGE.md` - This document
- ⏭️ `docs/DEPLOYMENT.md` - May need minor updates (TBD)
- ⏭️ `docs/BRANCHING_STRATEGY.md` - Already covers this flow

---

## ✅ Verification Checklist

Before considering this change complete:

- [x] Workflow file updated (`.github/workflows/deploy-test-environment.yml`)
- [x] Repository restriction maintained (Adobe only)
- [x] Manual trigger still works (`workflow_dispatch`)
- [x] Documentation updated
- [x] Change rationale documented
- [ ] Tested on Adobe repository Pre_Prod merge
- [ ] Tested on Personal repository Pre_Prod merge
- [ ] Tested on main branch merge (should NOT trigger test env)
- [ ] Team notified of change

---

## 💬 Communication Template

### For Team Notification

```
Subject: Test Environment Now Deploys on Pre_Prod (Not main)

Hi Team,

The automatic test environment (ngrok) deployment has been moved from the
`main` branch to the `Pre_Prod` branch to better align with our three-tier
branching strategy.

What This Means:
• When you merge to Pre_Prod → Test environment deploys automatically
• When you merge to main → Test environment does NOT deploy
• Testing happens at staging level (Pre_Prod) before production (main)

Benefits:
• Issues caught earlier (in staging, not production)
• Better alignment with branching strategy
• Cleaner main branch (only tested, validated code)

Next Steps:
• Merge your code to Pre_Prod for testing
• Use the 5-hour ngrok URL to validate
• Only merge to main after Pre_Prod testing passes

Documentation: docs/TEST_ENVIRONMENT_TRIGGER_CHANGE.md

Questions? Let me know!
```

---

## 🎉 Summary

**What**: Moved test environment trigger from `main` to `Pre_Prod`  
**Why**: Better alignment with three-tier branching strategy  
**When**: Effective immediately after PR merge  
**Impact**: Testing now happens in staging (Pre_Prod) before production (main)  
**Result**: Cleaner workflow, earlier issue detection, proper staging usage

---

**Document Version**: 1.0  
**Author**: AI Assistant  
**Date**: January 23, 2026  
**Related PR**: [To be added after commit]
