# GitHub Account Management Guide

**Date**: January 23, 2026  
**Status**: Repository is PRIVATE ✅

---

## 🔒 Repository Privacy Status

Your personal repository **keekar2022/OSCAL-Reports** is **PRIVATE**.

- ✅ Only you (keekar2022 account) can access it
- ✅ Hidden from public view
- ✅ Not searchable or indexable
- ✅ Secure and protected

---

## 👥 Your GitHub Accounts

You have two GitHub accounts configured:

### 1. keekar2022 (Personal Account)
- **Type**: Personal GitHub account
- **Use For**: Personal repository (keekar2022/OSCAL-Reports)
- **Access**: Owner of private repository
- **Scopes**: delete_repo, gist, read:org, repo

### 2. mkesharw_adobe (Adobe EMU)
- **Type**: Enterprise Managed User (EMU)
- **Use For**: Adobe repository (AdobeManagedServices/OSCAL-Reports)
- **Access**: Adobe organization repositories
- **Scopes**: gist, read:org, repo, workflow
- **Limitation**: ❌ Cannot be added to personal repositories

---

## 🔄 Account Switching

### Quick Switch Commands

```bash
# Switch to personal account (for personal repo)
gh auth switch --user keekar2022

# Switch to Adobe account (for Adobe repo)
gh auth switch --user mkesharw_adobe

# Check current active account
gh auth status
```

### Using Helper Script

We've created an easy-to-use script for account switching:

```bash
# Run the account switcher
./switch-github-account.sh
```

This will show you:
- Current account status
- Menu to switch accounts
- Which repositories you can access

---

## 📋 Common Workflows

### Working with Personal Repository

```bash
# 1. Switch to personal account
gh auth switch --user keekar2022

# 2. View repository
gh repo view keekar2022/OSCAL-Reports

# 3. Git operations
git fetch personal
git pull personal Development
git push personal Development

# 4. Create PR
gh pr create --repo keekar2022/OSCAL-Reports --base Development
```

### Working with Adobe Repository

```bash
# 1. Switch to Adobe account
gh auth switch --user mkesharw_adobe

# 2. View repository
gh repo view AdobeManagedServices/OSCAL-Reports

# 3. Git operations
git fetch adobe
git pull adobe Development
git push adobe Development

# 4. Create PR
gh pr create --repo AdobeManagedServices/OSCAL-Reports --base Development
```

---

## 🔍 Verify Repository Privacy

### Test 1: Incognito Browser Test
1. Open a private/incognito browser window
2. Navigate to: https://github.com/keekar2022/OSCAL-Reports
3. **Expected Result**: 404 error (confirms private)

### Test 2: CLI Verification (as owner)
```bash
gh auth switch --user keekar2022
gh repo view keekar2022/OSCAL-Reports --json visibility
# Output: {"visibility": "PRIVATE"}
```

### Test 3: Access Test (as non-owner)
```bash
gh auth switch --user mkesharw_adobe
gh repo view keekar2022/OSCAL-Reports
# Output: "Could not resolve to a Repository" (expected)
```

---

## ⚠️ Why Can't I Add Adobe Account as Collaborator?

**Enterprise Managed User (EMU) Restriction**

GitHub's security policy prevents EMUs from accessing personal repositories:

- ❌ Cannot add mkesharw_adobe as collaborator to keekar2022/OSCAL-Reports
- ❌ Cannot transfer personal repo to Adobe organization
- ✅ Can have both accounts on same machine
- ✅ Can switch between accounts easily

**GitHub Policy**: EMUs are managed by the enterprise (Adobe) and can only access:
- Organization repositories within Adobe
- Repositories where the organization has control

**Your personal repository** remains separate for security and compliance.

---

## 📊 Repository Overview

### Adobe Repository
- **URL**: https://github.com/AdobeManagedServices/OSCAL-Reports
- **Visibility**: Internal to Adobe organization
- **Your Access**: mkesharw_adobe (member)
- **Git Remote**: `adobe`

### Personal Repository
- **URL**: https://github.com/keekar2022/OSCAL-Reports
- **Visibility**: ✅ PRIVATE
- **Your Access**: keekar2022 (owner)
- **Git Remote**: `personal`

### Local Configuration
```bash
# Check remotes
git remote -v

# Output:
# adobe    https://github.com/AdobeManagedServices/OSCAL-Reports.git
# personal https://github.com/keekar2022/OSCAL-Reports.git
```

---

## 🛠️ Troubleshooting

### "Could not resolve to a Repository"
**Cause**: You're using the wrong account for that repository

**Solution**:
```bash
# Check which account is active
gh auth status

# Switch to the correct account
gh auth switch --user [correct-username]
```

### "404 Not Found" on Repository Page
**Cause**: Repository is private and you're not logged in with the owner account

**Solution**:
1. Log out of GitHub in your browser
2. Log in as `keekar2022`
3. Navigate to the repository

### Push/Pull Fails with Authentication Error
**Cause**: Git credentials don't match the active gh account

**Solution**:
```bash
# Make sure gh account matches git operation
gh auth switch --user keekar2022  # for personal repo
gh auth switch --user mkesharw_adobe  # for Adobe repo

# Refresh git credentials
gh auth refresh

# Try operation again
git push personal Development
```

---

## 🔐 Security Best Practices

### 1. Regular Account Verification
```bash
# Check which account is active before operations
gh auth status
```

### 2. Keep Accounts Separate
- Use `keekar2022` for personal projects
- Use `mkesharw_adobe` for Adobe work
- Don't mix credentials

### 3. Verify Repository Before Pushing
```bash
# Always check where you're pushing
git remote -v
git remote show [remote-name]
```

### 4. Use Account Switcher Script
```bash
# Use the helper script to avoid mistakes
./switch-github-account.sh
```

---

## 📝 Quick Reference

| Task | Account | Command |
|------|---------|---------|
| Access personal repo | keekar2022 | `gh auth switch --user keekar2022` |
| Access Adobe repo | mkesharw_adobe | `gh auth switch --user mkesharw_adobe` |
| Check current account | Either | `gh auth status` |
| View repository | Correct account | `gh repo view [owner/repo]` |
| Push changes | Correct account | `git push [remote] [branch]` |

---

## 🎯 Summary

✅ **Personal repository is PRIVATE and secure**  
✅ **Both accounts configured and working**  
✅ **Easy account switching available**  
✅ **Helper script created**: `./switch-github-account.sh`  
✅ **EMU restriction understood and documented**  

Your personal repository is protected and only accessible to you (keekar2022 account). Use account switching to work with both repositories seamlessly.

---

**Last Updated**: January 23, 2026  
**Maintained By**: OSCAL Reports Development Team
