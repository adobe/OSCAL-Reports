# Subtest-Based Pass Rate Calculation

## Overview

The CI/CD pipeline now calculates the **60% pass rate threshold** based on **individual subtests** rather than top-level jobs. This provides more granular tracking and scales automatically as new tests are added.

---

## Why Subtest-Based Calculation?

### Previous Approach (Job-Based)
```
8 jobs total
60% threshold = 5 jobs must pass
```

**Limitations:**
- ❌ Adding 100 new tests to one job doesn't change the threshold
- ❌ One job with 50 tests has same weight as job with 2 tests
- ❌ Fixed at 8 jobs (or manual updates required)
- ❌ Doesn't reflect actual test coverage

### New Approach (Subtest-Based)
```
~150+ subtests total (varies as tests are added)
60% threshold = dynamic based on total test count
```

**Benefits:**
- ✅ More granular pass rate calculation
- ✅ Reflects actual test coverage
- ✅ Automatically scales with new tests
- ✅ Each test has equal weight
- ✅ Better visibility into what's failing

---

## How It Works

### 1. Test Result Collection

Each job now outputs subtest counts:

```yaml
outputs:
  result: ${{ steps.test_result.outputs.result }}
  passed: ${{ steps.test_result.outputs.passed }}
  failed: ${{ steps.test_result.outputs.failed }}
  total: ${{ steps.test_result.outputs.total }}
```

### 2. Jest Output Parsing

The workflow parses Jest output to extract test counts:

```bash
# From Jest output:
# Tests:       57 failed, 35 passed, 92 total

PASSED=$(grep -oP 'Tests:\s+\K\d+(?= passed)' test_output.txt || echo "0")
FAILED=$(grep -oP 'Tests:\s+.*\K\d+(?= failed)' test_output.txt || echo "0")
TOTAL=$((PASSED + FAILED))
```

### 3. Aggregation

The summary job aggregates all subtest counts:

```bash
TOTAL_TESTS=$((LINT_TOTAL + UNIT_TOTAL + INT_TOTAL + AI_TOTAL + 
               EMAIL_TOTAL + CSRF_TOTAL + SSRF_TOTAL + BUILD_TOTAL))

PASSED_TESTS=$((LINT_PASSED + UNIT_PASSED + INT_PASSED + AI_PASSED + 
                EMAIL_PASSED + CSRF_PASSED + SSRF_PASSED + BUILD_PASSED))
```

### 4. Pass Rate Calculation

```bash
PASS_RATE = (PASSED_TESTS / TOTAL_TESTS) × 100

if PASS_RATE >= 60%:
  ✅ Auto-merge triggered
else:
  ❌ Manual intervention required
```

---

## Example Scenarios

### Scenario 1: All Tests Pass

| Job | Passed | Failed | Total |
|-----|--------|--------|-------|
| Linting | 2 | 0 | 2 |
| Unit Tests | 50 | 0 | 50 |
| Integration Tests | 92 | 0 | 92 |
| AI Integration | 15 | 0 | 15 |
| Email Tests | 8 | 0 | 8 |
| CSRF Security | 20 | 0 | 20 |
| SSRF Security | 12 | 0 | 12 |
| Build Test | 2 | 0 | 2 |
| **TOTAL** | **201** | **0** | **201** |

**Pass Rate:** 201/201 = **100%** ✅

---

### Scenario 2: Some Tests Fail

| Job | Passed | Failed | Total |
|-----|--------|--------|-------|
| Linting | 2 | 0 | 2 |
| Unit Tests | 48 | 2 | 50 |
| Integration Tests | 75 | 17 | 92 |
| AI Integration | 12 | 3 | 15 |
| Email Tests | 6 | 2 | 8 |
| CSRF Security | 18 | 2 | 20 |
| SSRF Security | 10 | 2 | 12 |
| Build Test | 2 | 0 | 2 |
| **TOTAL** | **173** | **28** | **201** |

**Pass Rate:** 173/201 = **86.07%** ✅

**Analysis:**
- 28 tests failed (13.93%)
- Still exceeds 60% threshold
- Auto-merge proceeds
- Detailed metrics show which areas need attention

---

### Scenario 3: Major Failures

| Job | Passed | Failed | Total |
|-----|--------|--------|-------|
| Linting | 2 | 0 | 2 |
| Unit Tests | 30 | 20 | 50 |
| Integration Tests | 35 | 57 | 92 |
| AI Integration | 5 | 10 | 15 |
| Email Tests | 3 | 5 | 8 |
| CSRF Security | 8 | 12 | 20 |
| SSRF Security | 4 | 8 | 12 |
| Build Test | 1 | 1 | 2 |
| **TOTAL** | **88** | **113** | **201** |

**Pass Rate:** 88/201 = **43.78%** ❌

**Analysis:**
- 113 tests failed (56.22%)
- Below 60% threshold
- Auto-merge blocked
- Requires manual investigation and fixes

---

## Detailed Metrics Output

### In GitHub Actions Summary

```markdown
## 📊 Development Branch Test Summary (Subtest-Based)

### Overall Results
**Pass Rate:** 86.07%
**Threshold:** 60% (60% required)
**Total Subtests:** 201
**Passed Subtests:** 173
**Failed Subtests:** 28

### Detailed Breakdown
| Test Suite | Result |
|------------|--------|
| Linting and Code Quality | 2/2 (0 failed) |
| Unit Tests | 48/50 (2 failed) |
| Integration Tests | 75/92 (17 failed) |
| AI Integration Tests | 12/15 (3 failed) |
| Email Functionality Tests | 6/8 (2 failed) |
| CSRF Security Tests | 18/20 (2 failed) |
| SSRF Security Tests | 10/12 (2 failed) |
| Build Test | 2/2 (0 failed) |

### ✅ Auto-Merge Status: TRIGGERED
A PR has been created to merge Development → Quality_Test
Pass rate of 86.07% exceeds 60% threshold ✨
```

### In Auto-Merge PR

The PR body includes a detailed table:

| Test Suite | Passed/Total | Failed | Status |
|------------|--------------|--------|--------|
| 1️⃣ Linting and Code Quality | 2/2 (0 failed) | ✅ |
| 2️⃣ Unit Tests | 48/50 (2 failed) | ⚠️ |
| 3️⃣ Integration Tests | 75/92 (17 failed) | ⚠️ |
| 4️⃣ AI Integration Tests | 12/15 (3 failed) | ⚠️ |
| 5️⃣ Email Functionality | 6/8 (2 failed) | ⚠️ |
| 6️⃣ CSRF Security Tests | 18/20 (2 failed) | ⚠️ |
| 7️⃣ SSRF Security Tests | 10/12 (2 failed) | ⚠️ |
| 8️⃣ Build Test | 2/2 (0 failed) | ✅ |

---

## Scaling with New Tests

### Adding New Tests

When you add new tests to any suite:

```javascript
// Add 10 new unit tests
describe('New Feature', () => {
  it('test 1', () => { /* ... */ });
  it('test 2', () => { /* ... */ });
  // ... 8 more tests
});
```

**Impact:**
```
Before: 201 total tests, 60% = 121 must pass
After:  211 total tests, 60% = 127 must pass
```

The threshold **automatically adjusts** - no configuration changes needed!

### Adding New Job

If you add a new test job (e.g., "Performance Tests"):

1. Add outputs to the job:
   ```yaml
   outputs:
     result: ${{ steps.perf_result.outputs.result }}
     passed: ${{ steps.perf_result.outputs.passed }}
     failed: ${{ steps.perf_result.outputs.failed }}
     total: ${{ steps.perf_result.outputs.total }}
   ```

2. Update the summary job to include it:
   ```bash
   PERF_PASSED="${{ needs.perf-tests.outputs.passed || '0' }}"
   PERF_TOTAL="${{ needs.perf-tests.outputs.total || '0' }}"
   TOTAL_TESTS=$((... + PERF_TOTAL))
   ```

3. The calculation automatically includes the new tests!

---

## Benefits Over Job-Based Calculation

| Metric | Job-Based | Subtest-Based |
|--------|-----------|---------------|
| **Granularity** | 8 data points | 200+ data points |
| **Visibility** | Job pass/fail only | Individual test results |
| **Scaling** | Manual updates | Automatic |
| **Accuracy** | Weighted by job | Weighted by test |
| **Actionability** | "Integration failed" | "75/92 tests passed" |

---

## Implementation Details

### Jobs with Subtest Counts

1. **Linting** (2 subtests)
   - Backend linting
   - Frontend linting

2. **Unit Tests** (~50 subtests)
   - Parsed from Jest output
   - Individual test cases

3. **Integration Tests** (~92 subtests)
   - Parsed from Jest output
   - API, auth, settings tests

4. **AI Integration** (~15 subtests)
   - AI service integration
   - URL validation
   - Private IP handling

5. **Email Tests** (~8 subtests)
   - SMTP connectivity
   - Email sending
   - Error handling

6. **CSRF Security** (~20 subtests)
   - Token validation
   - Protected endpoints
   - Attack scenarios

7. **SSRF Security** (~12 subtests)
   - URL filtering
   - Private IP blocking
   - Metadata endpoint protection

8. **Build Test** (2 subtests)
   - Frontend build
   - Backend startup

### Fallback Handling

If Jest output parsing fails (e.g., tests don't run):

```bash
if [ "$TOTAL" -eq 0 ]; then
  TOTAL=1
  if [ "${{ steps.run_tests.outcome }}" == "success" ]; then
    PASSED=1
  else
    FAILED=1
  fi
fi
```

This ensures every job contributes at least 1 test to the total.

---

## Monitoring and Alerts

### Pass Rate Trends

Track pass rate over time:

```
Commit A: 156/201 = 77.61% ✅
Commit B: 173/201 = 86.07% ✅
Commit C: 201/201 = 100%   ✅
Commit D: 88/201  = 43.78% ❌
```

### Threshold Proximity

When pass rate is close to threshold:

```
Pass Rate: 62.5% (5% above threshold) ⚠️
Need: 122/201 passing
Have: 126/201 passing
Buffer: 4 tests
```

**Action:** Review and fix failing tests before they push you below threshold.

---

## FAQ

### Q: What if I want to change the 60% threshold?

**A:** Update the `THRESHOLD` variable in the workflow:

```yaml
THRESHOLD=75  # Change from 60 to 75
```

### Q: Can different test suites have different weights?

**A:** Not currently, but you could implement weighted scoring:

```bash
# Example weighted calculation
CRITICAL_WEIGHT=2  # Security tests worth 2x
UNIT_SCORE=$((UNIT_PASSED * 1))
SECURITY_SCORE=$(((CSRF_PASSED + SSRF_PASSED) * CRITICAL_WEIGHT))
TOTAL_SCORE=$((UNIT_SCORE + SECURITY_SCORE + ...))
```

### Q: What counts as a "subtest"?

**A:** Each individual `it()` or `test()` block in Jest:

```javascript
describe('Feature', () => {
  it('test 1', ...);  // Subtest 1
  it('test 2', ...);  // Subtest 2
  test('test 3', ...); // Subtest 3
});
// Total: 3 subtests
```

### Q: Do skipped tests count?

**A:** No. Only passed and failed tests are counted:

```javascript
it.skip('skipped test', ...);  // Not counted
```

### Q: What if a job times out?

**A:** The parsed test count at timeout is used:

```
Integration Tests ran for 10 minutes
Completed: 50/92 tests before timeout
Result: 40 passed, 10 failed
Counted as: 40 passed, 10 failed, 42 not run (skipped)
```

---

## Related Documentation

- [CI/CD Test Optimization](./CI_CD_TEST_OPTIMIZATION.md)
- [Test Execution Summary](./TEST_EXECUTION_SUMMARY.md)
- [GitHub Actions Workflow](../.github/workflows/test-development.yml)

---

*Last Updated: 2026-01-28*  
*Version: 2.0 (Subtest-Based)*
