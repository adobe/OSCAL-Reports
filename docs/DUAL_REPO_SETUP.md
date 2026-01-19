# Dual Repository Setup Guide

## Overview

This project is maintained in **two GitHub repositories** due to network access restrictions:

1. **Adobe Repository** (Primary/Corporate)
   - URL: `https://github.com/AdobeManagedServices/oscal`
   - Access: Requires Adobe VPN + SSO authentication
   - Purpose: Corporate codebase, collaboration, CI/CD
   - Branch Protection: Enabled (requires Pull Requests)

2. **Personal Repository** (Mirror/Public)
   - URL: `https://github.com/keekar2022/OSCAL-Reports`
   - Access: Public (no VPN required)
   - Purpose: TrueNAS deployment, backup, public access
   - Branch Protection: Disabled (direct push allowed)

---

## Why Two Repositories?

**TrueNAS servers cannot access the Adobe repository** because:
- Adobe repo requires VPN connection
- TrueNAS servers are not on the Adobe VPN
- SSO authentication is not available on TrueNAS

**Solution**: TrueNAS pulls updates from the personal repository (public), which is kept in sync with the Adobe repository.

---

## Repository Sync Workflow

### Development Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                    LOCAL DEVELOPMENT                         │
│                                                              │
│  1. Make changes locally                                     │
│  2. Commit changes                                           │
│  3. Push to BOTH repositories                               │
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼
        ┌──────────────────────────────────────┐
        │                                      │
        ▼                                      ▼
┌─────────────────┐                  ┌─────────────────┐
│  Adobe Repo     │                  │  Personal Repo  │
│  (via PR)       │                  │  (direct push)  │
└─────────────────┘                  └─────────────────┘
        │                                      │
        │ Manual merge                         │
        │ (via GitHub UI)                      │
        │                                      │
        ▼                                      ▼
┌─────────────────┐                  ┌─────────────────┐
│  Adobe main     │                  │  Personal main  │
└─────────────────┘                  └─────────────────┘
                                              │
                                              │ git pull
                                              ▼
                                     ┌─────────────────┐
                                     │  TrueNAS        │
                                     │  Deployment     │
                                     └─────────────────┘
```

---

## Local Git Configuration

### Checking Current Remotes

```bash
git remote -v
```

**Expected output:**
```
adobe     https://github.com/AdobeManagedServices/oscal.git (fetch)
adobe     https://github.com/AdobeManagedServices/oscal.git (push)
personal  https://TOKEN@github.com/keekar2022/OSCAL-Reports.git (fetch)
personal  https://TOKEN@github.com/keekar2022/OSCAL-Reports.git (push)
```

### Setting Up Dual Remotes

```bash
# Add Adobe remote (if not already configured)
git remote add adobe https://github.com/AdobeManagedServices/oscal.git

# Add personal remote with Personal Access Token
git remote add personal https://YOUR_TOKEN@github.com/keekar2022/OSCAL-Reports.git
```

### Daily Development Workflow

#### Option A: Push to Personal Repository Directly

```bash
# Make your changes
git add .
git commit -m "feat: your feature description"

# Push to personal repo (direct push, no PR needed)
GIT_TERMINAL_PROMPT=0 git -c credential.helper= push personal main --force
git push personal --tags
```

#### Option B: Push to Adobe Repository via PR

```bash
# Create a feature branch
git checkout -b feature/my-feature

# Make your changes
git add .
git commit -m "feat: your feature description"

# Push branch to Adobe repo
git push adobe feature/my-feature

# Create PR via GitHub web interface
# URL: https://github.com/AdobeManagedServices/oscal/compare/feature/my-feature

# After PR is merged, sync back to local
git checkout main
git pull adobe main

# Sync to personal repo
git push personal main --force
git push personal --tags
```

#### Option C: Push to Both Simultaneously

```bash
# Make your changes
git add .
git commit -m "feat: your feature description"

# Push to personal repo directly
git push personal main
git push personal --tags

# Create branch and push to Adobe repo (for PR)
git checkout -b feature/my-feature
git push adobe feature/my-feature
# Then create PR on GitHub web
```

---

## TrueNAS Configuration

### Git Remote Setup on TrueNAS

TrueNAS instances **MUST** use the personal repository:

```bash
# On TrueNAS (via SSH)
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green  # or Blue

# Check current remotes
sudo git remote -v

# Add/update origin to personal repo
sudo git remote add origin https://github.com/keekar2022/OSCAL-Reports.git

# Or if origin already exists:
sudo git remote set-url origin https://github.com/keekar2022/OSCAL-Reports.git

# Fetch latest
sudo git fetch origin

# Checkout main branch
sudo git checkout -B main origin/main

# Fix ownership
sudo chown -R mkesharw:mkesharw /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green
```

### Automated Deployment via Cron

The `build_on_truenas.sh` script automatically pulls from the personal repository:

```bash
# Green instance cron (1st, 3rd, 5th Sunday at 2 AM)
0 2 1-7,15-21,29-31 * 0 cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green && ./build_on_truenas.sh >> /var/log/oscal-deploy-green.log 2>&1

# Blue instance cron (2nd, 4th Sunday at 2 AM)
0 2 8-14,22-28 * 0 cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue && ./build_on_truenas.sh >> /var/log/oscal-deploy-blue.log 2>&1
```

---

## Troubleshooting

### Issue: TrueNAS can't pull from Adobe repo

**Error:**
```
fatal: Authentication failed for 'https://github.com/AdobeManagedServices/oscal.git/'
```

**Solution:**
Update `build_on_truenas.sh` to use personal repo:
```bash
GIT_REPO="https://github.com/keekar2022/OSCAL-Reports.git"
```

### Issue: Personal repo token expired

**Error:**
```
remote: Permission to keekar2022/OSCAL-Reports.git denied to keekar2022.
```

**Solution:**
1. Create new token: https://github.com/settings/tokens/new
2. Select scopes: `repo`, `workflow`
3. Update remote:
   ```bash
   git remote set-url personal https://NEW_TOKEN@github.com/keekar2022/OSCAL-Reports.git
   ```

### Issue: Repositories out of sync

**Check versions:**
```bash
# Local version
grep '"version"' package.json

# Adobe repo version (via web)
# https://github.com/AdobeManagedServices/oscal/blob/main/package.json

# Personal repo version (via web)
# https://github.com/keekar2022/OSCAL-Reports/blob/main/package.json

# TrueNAS version
ssh mkesharw@NAS01 "cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green && grep '\"version\"' package.json"
```

**Sync personal repo from Adobe:**
```bash
git checkout main
git pull adobe main
git push personal main --force
git push personal --tags
```

### Issue: Branch protection prevents direct push to Adobe

**This is expected behavior!** Adobe repo requires Pull Requests:

```bash
# Create a feature branch
git checkout -b fix/my-fix

# Push branch
git push adobe fix/my-fix

# Create PR via web interface
# https://github.com/AdobeManagedServices/oscal/compare/fix/my-fix
```

---

## Security Considerations

### Personal Access Tokens

- **Never commit tokens** to the repository
- Tokens are stored in `.git/config` (not tracked by git)
- Use tokens with **minimal required scopes** (`repo`, `workflow`)
- **Rotate tokens** every 90 days for security

### Viewing Stored Credentials

```bash
# View remotes (tokens are visible!)
git remote -v

# Safely view remotes (tokens sanitized)
git config --get-regexp remote.*.url | sed 's/:[^:]*@/:***@/g'
```

---

## Quick Reference

### Common Commands

| Action | Command |
|--------|---------|
| Check remotes | `git remote -v` |
| Pull from Adobe | `git pull adobe main` |
| Push to personal | `git push personal main` |
| Push tags | `git push personal --tags` |
| Create PR branch | `git checkout -b feature/name && git push adobe feature/name` |
| Sync repos | `git pull adobe main && git push personal main --force` |

### Repository URLs

| Repository | URL |
|------------|-----|
| Adobe (Primary) | https://github.com/AdobeManagedServices/oscal |
| Personal (Mirror) | https://github.com/keekar2022/OSCAL-Reports |
| Personal (Clone) | `git clone https://github.com/keekar2022/OSCAL-Reports.git` |

---

## Maintenance Schedule

### Weekly Tasks
- ✅ Verify both repositories are in sync
- ✅ Check TrueNAS deployment logs

### Monthly Tasks
- ✅ Verify automated deployments (check cron logs)
- ✅ Review Personal Access Token expiration dates
- ✅ Test manual deployment on TrueNAS

### Quarterly Tasks
- ✅ Rotate Personal Access Tokens
- ✅ Review and update documentation
- ✅ Audit repository access permissions

---

## Support

For issues related to:
- **Adobe repository access**: Contact Adobe IT Support
- **Personal repository**: Contact Mukesh Kesharwani (keekar2022@outlook.com)
- **TrueNAS deployment**: Check logs in `/var/log/oscal-deploy-*.log`

---

**Version**: 1.4.2  
**Last Updated**: January 2026  
**License**: GPL-3.0-or-later
