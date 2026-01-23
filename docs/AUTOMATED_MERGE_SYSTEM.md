# Automated Branch Merge System

**Date:** 2026-01-23  
**Status:** ✅ Active  
**Type:** Quality-Gate Based Auto-Merge

---

## 🎯 Overview

The OSCAL Report Generator uses an automated branch merging system that promotes code through the pipeline based on test pass rates. This ensures only high-quality code reaches production.

---

## 📊 Merge Thresholds

### Development → Quality_Test: **60% Pass Rate**
**Rationale:** Early-stage testing, focus on core functionality

**What's Tested:**
- Security Tests (CSRF, SSRF, URL validation)
- Email Functionality Tests
- AI Integration Tests
- Unit Tests
- Integration Tests
- Build Tests

**Auto-Merge Behavior:**
- ✅ **Enabled:** PR created and auto-merged if checks pass
- ⏱️  **Duration:** ~15 minutes
- 🔄 **Trigger:** Push to Development branch

---

### Quality_Test → Pre_Prod: **80% Pass Rate**
**Rationale:** Comprehensive validation, production-like testing

**What's Tested:**
- Security Audit (npm audit + vulnerability scan)
- Comprehensive Security Tests
- Full Integration Suite (70%+ coverage required)
- Email & Messaging Tests
- AI Comprehensive Tests
- E2E Tests (Playwright)
- Performance Tests (load testing)

**Auto-Merge Behavior:**
- ✅ **Enabled:** PR created and auto-merged if checks pass
- ⏱️  **Duration:** ~30 minutes
- 🔄 **Trigger:** Push to Quality_Test branch

---

### Pre_Prod → main: **90% Pass Rate**
**Rationale:** Production readiness, highest quality bar

**What's Tested:**
- Production Configuration Validation
- Security Regression Tests
- Full Test Suite (80%+ coverage required)
- Smoke Tests with Production Config
- Stress & Performance Tests

**Auto-Merge Behavior:**
- ⚠️  **MANUAL APPROVAL REQUIRED** for production safety
- ✅ **PR Created Automatically**
- 🔒 **Auto-merge NOT enabled** (needs human review)
- ⏱️  **Duration:** ~35 minutes
- 🔄 **Trigger:** Push to Pre_Prod branch

---

## 🔄 Complete Flow Diagram

```
┌─────────────────┐
│  Development    │  ← Developers commit here
│   (60% pass)    │
└────────┬────────┘
         │ Auto-merge if 60%+ pass
         │ Creates PR automatically
         │
         ▼
┌─────────────────┐
│  Quality_Test   │  ← Comprehensive testing
│   (80% pass)    │
└────────┬────────┘
         │ Auto-merge if 80%+ pass
         │ Creates PR automatically
         │
         ▼
┌─────────────────┐
│    Pre_Prod     │  ← Production staging
│   (90% pass)    │
└────────┬────────┘
         │ Creates PR if 90%+ pass
         │ ⚠️  MANUAL REVIEW REQUIRED
         │
         ▼
┌─────────────────┐
│      main       │  ← Production
│  (Production)   │
└─────────────────┘
```

---

## 📋 How It Works

### 1. **Test Execution**
When code is pushed to a branch, the corresponding workflow runs all tests:
- Each test job reports success/failure
- Results are collected by the summary job

### 2. **Pass Rate Calculation**
The summary job calculates the pass rate:
```bash
PASS_RATE = (PASSED_JOBS / TOTAL_JOBS) × 100
```

Example:
- 5 out of 6 jobs passed → 83.33% pass rate
- 7 out of 7 jobs passed → 100% pass rate
- 4 out of 5 jobs passed → 80% pass rate

### 3. **Threshold Check**
The system compares pass rate to threshold:
- **Development:** Pass rate ≥ 60% → Auto-merge to Quality_Test
- **Quality_Test:** Pass rate ≥ 80% → Auto-merge to Pre_Prod
- **Pre_Prod:** Pass rate ≥ 90% → Create PR to main (manual merge)

### 4. **Pull Request Creation**
If threshold is met:
- PR is automatically created using GitHub CLI (`gh pr create`)
- PR includes detailed test results and statistics
- PR is labeled appropriately (`auto-merge`, branch name)

### 5. **Auto-Merge Execution**
For Development and Quality_Test:
- `gh pr merge --auto` is called
- PR merges automatically when all checks pass
- Branch is NOT deleted (preserved for future pushes)

For Pre_Prod → main:
- PR is created but NOT auto-merged
- Manual review and approval required
- Production deployment safety

---

## 🛠️ Technical Implementation

### Helper Scripts

#### **`.github/scripts/calculate-test-results.sh`**
- Parses Jest test output
- Calculates pass rate from test results
- Sets GitHub Actions outputs
- Used for test result analysis

#### **`.github/scripts/auto-merge.sh`**
- Creates pull requests using GitHub CLI
- Configures auto-merge settings
- Handles existing PR updates
- Implements branch-specific logic

### Workflow Structure

Each workflow has a final job: `{branch}-and-auto-merge`

**Key Components:**
```yaml
summary-and-auto-merge:
  name: Tests Summary & Auto-Merge
  needs: [all-test-jobs]
  if: always() && github.event_name == 'push'
  permissions:
    contents: write
    pull-requests: write
  
  steps:
    - Calculate test results (pass rate)
    - Check threshold
    - Create PR if threshold met
    - Enable auto-merge (if applicable)
```

---

## 📊 Pass Rate Examples

### Example 1: Development Branch

**Scenario:** 5 out of 6 tests passed

```
Total Jobs: 6
Passed: 5
Failed: 1
Pass Rate: 83.33%
Threshold: 60%

Result: ✅ Auto-merge to Quality_Test
```

### Example 2: Quality_Test Branch

**Scenario:** 6 out of 7 tests passed

```
Total Jobs: 7
Passed: 6
Failed: 1
Pass Rate: 85.71%
Threshold: 80%

Result: ✅ Auto-merge to Pre_Prod
```

### Example 3: Pre_Prod Branch

**Scenario:** 4 out of 5 tests passed

```
Total Jobs: 5
Passed: 4
Failed: 1
Pass Rate: 80.00%
Threshold: 90%

Result: ❌ No auto-merge (below 90%)
```

### Example 4: Pre_Prod Branch (Success)

**Scenario:** 5 out of 5 tests passed

```
Total Jobs: 5
Passed: 5
Failed: 0
Pass Rate: 100.00%
Threshold: 90%

Result: ✅ PR created to main (manual merge required)
```

---

## 🚀 Benefits

### 1. **Automated Quality Gates**
- Only high-quality code progresses
- Consistent quality standards enforced
- Reduces manual review burden

### 2. **Fast Feedback Loops**
- Development → Quality_Test: Automatic if 60%+ pass
- Quality_Test → Pre_Prod: Automatic if 80%+ pass
- Developers notified quickly of issues

### 3. **Safety for Production**
- 90% threshold for production
- Manual review required for main branch
- Multiple quality checkpoints

### 4. **Reduced Toil**
- No manual PR creation needed
- Automatic merge when safe
- Clear visibility of test results

### 5. **Traceability**
- Every merge has test results documented
- Pass rates tracked in PR descriptions
- Audit trail of quality metrics

---

## 🔒 Safety Mechanisms

### 1. **Branch Protection Rules**
- GitHub branch protection must be configured
- Required status checks must pass
- CODEOWNERS review if configured

### 2. **Manual Gates**
- Pre_Prod → main always requires manual approval
- Critical production safety checkpoint
- Human review of release readiness

### 3. **Failure Handling**
- If pass rate below threshold: NO auto-merge
- Failed tests block progression
- Manual intervention required

### 4. **Rollback Capability**
- Branches are never deleted
- Full git history preserved
- Easy to revert if needed

---

## 📝 Configuring Thresholds

### Modifying Thresholds

To change the pass rate thresholds, edit the workflow files:

**Development Threshold (currently 60%):**
```yaml
# File: .github/workflows/test-development.yml
# Line: ~255
THRESHOLD=60  # Change to desired percentage
```

**Quality_Test Threshold (currently 80%):**
```yaml
# File: .github/workflows/test-quality.yml
# Line: ~340
THRESHOLD=80  # Change to desired percentage
```

**Pre_Prod Threshold (currently 90%):**
```yaml
# File: .github/workflows/test-preprod.yml
# Line: ~370
THRESHOLD=90  # Change to desired percentage
```

### Enabling Full Auto-Merge to Production

⚠️  **WARNING:** This removes the production safety gate!

To enable auto-merge to main (not recommended):

```yaml
# File: .github/workflows/test-preprod.yml
# Line: ~480
# Uncomment this line:
gh pr merge "$PR_NUMBER" --auto --merge --delete-branch=false 2>&1 || true
```

---

## 🔍 Monitoring Auto-Merges

### View Auto-Merge PRs

**Filter by Label:**
- `label:auto-merge` - All automated PRs
- `label:development` - From Development branch
- `label:quality-test` - From Quality_Test branch
- `label:production` - To main branch

**GitHub Search:**
```
is:pr label:auto-merge
is:pr author:github-actions
is:pr "Auto-merge:"
```

### Check Auto-Merge Status

**In GitHub Actions:**
1. Go to Actions tab
2. Select workflow run
3. Check "Summary & Auto-Merge" job
4. View job summary for pass rate and decision

**In Pull Request:**
- PR description includes full test results
- Pass rate clearly displayed
- Threshold comparison shown

---

## 🐛 Troubleshooting

### Auto-Merge Not Triggering

**Check:**
1. ✅ Pass rate meets threshold?
2. ✅ Workflow completed successfully?
3. ✅ Branch protection rules satisfied?
4. ✅ GitHub token has correct permissions?

**Solution:**
```bash
# Check workflow logs
gh run list --workflow=test-development.yml
gh run view <run-id> --log

# Check PR creation
gh pr list --label auto-merge
```

### PR Created But Not Merging

**Common Causes:**
1. Required checks haven't passed
2. Branch protection requires reviews
3. Merge conflicts detected
4. Auto-merge not enabled (Pre_Prod → main)

**Solution:**
```bash
# Check PR status
gh pr view <pr-number>

# Check required checks
gh pr checks <pr-number>

# Manually merge if needed
gh pr merge <pr-number>
```

### Pass Rate Calculation Issues

**Check:**
1. All test jobs completed?
2. Job dependencies correct?
3. Job results captured properly?

**Solution:**
- Review workflow file `needs:` array
- Ensure all jobs are listed
- Check job status in Actions tab

---

## 📚 Related Documentation

- **Testing Strategy:** `docs/TESTING_STRATEGY.md`
- **Workflow Analysis:** `docs/WORKFLOW_ANALYSIS_2026-01-23.md`
- **Branch Protection:** `docs/REPOSITORY_WORKFLOW_RESTRICTIONS.md`
- **CI/CD Pipeline:** `docs/CI_CD_PIPELINE.md`

---

## 🎯 Best Practices

### 1. **Monitor Pass Rates**
- Track pass rates over time
- Identify flaky tests
- Improve test reliability

### 2. **Review Auto-Merged PRs**
- Periodically review merged PRs
- Ensure quality standards maintained
- Adjust thresholds if needed

### 3. **Keep Tests Reliable**
- Fix flaky tests immediately
- Maintain high test quality
- Update tests with code changes

### 4. **Use Labels Effectively**
- Label PRs for easy filtering
- Track auto-merge metrics
- Monitor merge frequency

### 5. **Production Safety**
- ALWAYS review Pre_Prod → main PRs manually
- Never auto-merge to production without review
- Ensure rollback plan exists

---

## 📊 Metrics to Track

### Quality Metrics
- Pass rate trends by branch
- Time to reach each threshold
- Number of failed auto-merges

### Velocity Metrics
- Time from Development to main
- Number of auto-merges per week
- Manual intervention frequency

### Reliability Metrics
- Test failure rate
- Flaky test incidents
- Rollback frequency

---

## ✅ Summary

The automated merge system:
- ✅ Enforces quality gates (60%, 80%, 90%)
- ✅ Reduces manual work
- ✅ Maintains production safety
- ✅ Provides fast feedback
- ✅ Creates audit trail
- ✅ Scales with team growth

**Current Status:** ✅ **ACTIVE** on all branches

---

*Last Updated: 2026-01-23*  
*System Version: 1.0*  
*Maintained by: CI/CD Team*
