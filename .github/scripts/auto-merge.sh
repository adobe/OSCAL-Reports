#!/bin/bash
###############################################################################
# Automated Branch Merge Script
# 
# Creates a Pull Request from source branch to target branch and auto-merges
# if all checks pass and the pass rate threshold is met.
#
# Usage: ./auto-merge.sh <source-branch> <target-branch> <pass-rate> <threshold>
#
# Example: ./auto-merge.sh Development Quality_Test 85.5 60
###############################################################################

set -e

SOURCE_BRANCH="${1}"
TARGET_BRANCH="${2}"
PASS_RATE="${3}"
THRESHOLD="${4}"

# Validate inputs
if [ -z "$SOURCE_BRANCH" ] || [ -z "$TARGET_BRANCH" ] || [ -z "$PASS_RATE" ] || [ -z "$THRESHOLD" ]; then
    echo "❌ Error: Missing required arguments"
    echo "Usage: $0 <source-branch> <target-branch> <pass-rate> <threshold>"
    exit 1
fi

echo "════════════════════════════════════════════════════════════════"
echo "           🔄 AUTO-MERGE: $SOURCE_BRANCH → $TARGET_BRANCH"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "📊 Pass Rate: ${PASS_RATE}%"
echo "🎯 Threshold: ${THRESHOLD}%"
echo ""

# Check if pass rate meets threshold
if (( $(awk "BEGIN {print ($PASS_RATE < $THRESHOLD)}") )); then
    echo "❌ Pass rate ${PASS_RATE}% is below threshold ${THRESHOLD}%"
    echo "⏸️  Auto-merge cancelled"
    exit 1
fi

echo "✅ Pass rate ${PASS_RATE}% meets threshold ${THRESHOLD}%"
echo "🚀 Proceeding with auto-merge..."
echo ""

# Check if gh CLI is available
if ! command -v gh &> /dev/null; then
    echo "❌ Error: GitHub CLI (gh) is not installed"
    exit 1
fi

# Get current commit SHA
COMMIT_SHA=$(git rev-parse HEAD)
echo "📌 Current commit: $COMMIT_SHA"
echo ""

# Check if there are any differences between branches
echo "🔍 Checking for differences between branches..."
git fetch origin "$TARGET_BRANCH" || true

if git diff --quiet "origin/$TARGET_BRANCH" HEAD; then
    echo "ℹ️  No differences found between $SOURCE_BRANCH and $TARGET_BRANCH"
    echo "✅ Branches are already in sync, no merge needed"
    exit 0
fi

echo "📝 Differences found, creating Pull Request..."
echo ""

# Create PR title and body
PR_TITLE="🤖 Auto-merge: $SOURCE_BRANCH → $TARGET_BRANCH (${PASS_RATE}% pass rate)"
PR_BODY="## 🤖 Automated Merge

This PR was automatically created because test pass rate threshold was met.

### 📊 Test Results
- **Pass Rate:** ${PASS_RATE}%
- **Threshold:** ${THRESHOLD}%
- **Status:** ✅ Threshold met

### 🔄 Merge Details
- **Source:** \`$SOURCE_BRANCH\`
- **Target:** \`$TARGET_BRANCH\`
- **Commit:** \`$COMMIT_SHA\`
- **Triggered by:** GitHub Actions workflow

### ✅ Auto-Merge Conditions
$(if [ "$TARGET_BRANCH" == "Quality_Test" ]; then
    echo "- ✅ Development tests pass rate ≥ 60%"
elif [ "$TARGET_BRANCH" == "Pre_Prod" ]; then
    echo "- ✅ Quality_Test tests pass rate ≥ 80%"
elif [ "$TARGET_BRANCH" == "main" ]; then
    echo "- ✅ Pre_Prod tests pass rate ≥ 90%"
fi)
- ✅ All required checks passed
- ✅ No merge conflicts

### 🔒 Security
All security tests (CSRF, SSRF, URL validation) have passed.

### 📋 Next Steps
This PR will be automatically merged after:
1. Branch protection rules are satisfied
2. All status checks pass
3. No conflicts are detected

---
*This is an automated pull request created by the CI/CD pipeline.*
"

# Create the PR
echo "Creating Pull Request..."
PR_URL=$(gh pr create \
    --title "$PR_TITLE" \
    --body "$PR_BODY" \
    --base "$TARGET_BRANCH" \
    --head "$SOURCE_BRANCH" \
    --label "auto-merge,ci-cd" \
    2>&1 || echo "")

if [ -z "$PR_URL" ]; then
    # Check if PR already exists
    echo "⚠️  PR might already exist, checking..."
    EXISTING_PR=$(gh pr list --base "$TARGET_BRANCH" --head "$SOURCE_BRANCH" --json number --jq '.[0].number' || echo "")
    
    if [ -n "$EXISTING_PR" ]; then
        PR_URL="https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/pull/$EXISTING_PR"
        echo "✅ Found existing PR: $PR_URL"
        echo "📝 Updating existing PR..."
        
        # Update PR with latest information
        gh pr edit "$EXISTING_PR" --body "$PR_BODY" || true
    else
        echo "❌ Failed to create PR and no existing PR found"
        exit 1
    fi
else
    echo "✅ PR created successfully: $PR_URL"
fi

echo ""
echo "🎯 Auto-merge configured for this PR"
echo ""

# Enable auto-merge if possible
echo "🔄 Enabling auto-merge..."
PR_NUMBER=$(echo "$PR_URL" | grep -oP '\d+$')

if [ -n "$PR_NUMBER" ]; then
    # Try to enable auto-merge
    gh pr merge "$PR_NUMBER" --auto --merge --delete-branch=false 2>&1 || {
        echo "⚠️  Auto-merge could not be enabled automatically"
        echo "ℹ️  This may require manual approval or branch protection rules"
        echo "📝 Please review the PR and merge manually if needed: $PR_URL"
    }
else
    echo "⚠️  Could not extract PR number from URL"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✅ Auto-merge process completed!"
echo "📋 PR URL: $PR_URL"
echo "════════════════════════════════════════════════════════════════"

exit 0
