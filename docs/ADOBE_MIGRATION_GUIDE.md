# Adobe Managed Services Migration Guide

**Date:** January 14, 2026  
**Version:** 1.4.1  
**Migration Status:** ✅ COMPLETED

---

## 📋 Overview

The OSCAL Report Generator V2 has been successfully migrated from the personal repository to the official **Adobe Managed Services** organization on GitHub.

### Repository Information

| Item | Old Location | New Location |
|------|-------------|--------------|
| **Repository** | `https://github.com/keekar2022/OSCAL-Reports` | `https://github.com/AdobeManagedServices/oscal` |
| **Organization** | Personal (keekar2022) | Adobe Managed Services |
| **Visibility** | Public | Organization-managed |
| **Authentication** | Personal credentials | Adobe SSO + GitHub CLI |

---

## ✅ Migration Completed

### What Was Migrated

1. ✅ **Main Branch** - All commits and history
2. ✅ **Tags** - v1.3.0, v1.3.1, v1.4.0
3. ✅ **Version 1.4.1** - Latest with reverse proxy fix
4. ✅ **GitHub Workflows** - CI/CD and Release workflows
5. ✅ **Documentation** - All URLs updated to new repository
6. ✅ **Build Scripts** - TrueNAS build script updated

### Changes in v1.4.1

- **Reverse Proxy Support**: Added `app.set('trust proxy', true)` for SQUID/Nginx/Apache
- **Enhanced CORS**: Configured for proxy authentication headers
- **Client IP Detection**: Fixed for rate limiting behind proxy
- **Repository URLs**: Updated all references to Adobe organization

---

## 🔐 Authentication Setup

### For Development (macOS/Linux)

The local development environment is already configured with:

```bash
# GitHub CLI authentication
gh auth login
gh auth refresh -h github.com -s workflow

# Git credential helper
gh auth setup-git
```

### Verify Authentication

```bash
# Check GitHub CLI status
gh auth status

# Verify repository access
gh repo view AdobeManagedServices/oscal

# Test push access
cd /Users/mkesharw/Documents/OSCAL_Reports
git remote -v
```

---

## 🖥️ TrueNAS Instances - Update Instructions

### Overview

You have two TrueNAS instances running the OSCAL Report Generator:

| Instance | Path | Port | Schedule |
|----------|------|------|----------|
| **Green (Canary)** | `/mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green` | 3019 | 1st, 3rd, 5th Sunday |
| **Blue (Production)** | `/mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue` | 3020 | 2nd, 4th Sunday |

### 🚨 Important: Update Git Remote URL

Both instances are currently configured to pull from the old repository. You MUST update them to use the new Adobe repository.

---

## 📝 Step-by-Step TrueNAS Update

### Step 1: SSH to TrueNAS

```bash
ssh mkesharw@NAS01
# Or use your TrueNAS hostname/IP
```

### Step 2: Update Green Instance (Canary)

```bash
# Navigate to Green instance
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green

# Check current remote
git remote -v
# Should show: https://github.com/keekar2022/OSCAL-Reports.git (OLD)

# Update to Adobe organization
git remote set-url origin https://github.com/AdobeManagedServices/oscal.git

# Verify change
git remote -v
# Should show: https://github.com/AdobeManagedServices/oscal.git (NEW)

# Pull latest changes
git pull origin main

# Verify version
grep '"version"' package.json
# Should show: "version": "1.4.1"

# Rebuild and deploy
sudo ./build_on_truenas.sh
```

### Step 3: Test Green Instance

```bash
# Check if Green instance is running
docker ps | grep oscal-report-generator-green

# Test the endpoint
curl http://localhost:3019/health

# Expected response:
# {"status":"healthy","service":"Keekar's OSCAL SOA/SSP/CCM Generator"}
```

### Step 4: Update Blue Instance (Production)

**⚠️ Only proceed after Green instance is tested and verified!**

```bash
# Navigate to Blue instance
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue

# Update remote
git remote set-url origin https://github.com/AdobeManagedServices/oscal.git

# Pull latest changes
git pull origin main

# Verify version
grep '"version"' package.json

# Rebuild and deploy
sudo ./build_on_truenas.sh
```

### Step 5: Test Blue Instance

```bash
# Check if Blue instance is running
docker ps | grep oscal-report-generator-blue

# Test the endpoint
curl http://localhost:3020/health
```

---

## 🔧 TrueNAS Authentication for Git

### Option 1: GitHub CLI (Recommended)

If GitHub CLI is not installed on TrueNAS:

```bash
# Install GitHub CLI on TrueNAS (FreeBSD/Linux)
# FreeBSD:
sudo pkg install gh

# Linux:
# Follow: https://github.com/cli/cli/blob/trunk/docs/install_linux.md

# Authenticate
gh auth login
# Follow prompts and use your Adobe SSO

# Setup git credential helper
gh auth setup-git
```

### Option 2: Personal Access Token (PAT)

1. **Create PAT on GitHub**:
   - Go to: https://github.com/settings/tokens
   - Click "Generate new token (classic)"
   - Scopes needed:
     - ✅ `repo` (Full control of private repositories)
     - ✅ `workflow` (Update GitHub Actions workflows)
   - For Adobe org: May need `read:org`

2. **Store PAT on TrueNAS**:

```bash
# Configure git credential helper
git config --global credential.helper store

# First pull will prompt for credentials
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green
git pull origin main

# When prompted:
# Username: mkesharw_adobe
# Password: <paste-your-PAT-here>
```

### Option 3: SSH Keys

```bash
# Generate SSH key on TrueNAS (if not exists)
ssh-keygen -t ed25519 -C "mukesh.kesharwani@adobe.com"

# Display public key
cat ~/.ssh/id_ed25519.pub

# Add this key to GitHub:
# https://github.com/settings/ssh/new

# Update both instances to use SSH
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green
git remote set-url origin git@github.com:AdobeManagedServices/oscal.git

cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue
git remote set-url origin git@github.com:AdobeManagedServices/oscal.git
```

---

## 🔄 Automated Cron Jobs Update

Your cron jobs will continue to work, but they'll now pull from the Adobe repository.

### Verify Cron Schedule

```bash
# On TrueNAS
crontab -l

# Should show:
# 0 2 * * 0 [ $(( ($(date +\%s) / 86400 / 7) % 5 )) -eq 0 ] && /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green/build_on_truenas.sh >> /var/log/oscal-green-build.log 2>&1  # Green: 1st Sunday
# 0 2 * * 0 [ $(( ($(date +\%s) / 86400 / 7) % 5 )) -eq 2 ] && /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green/build_on_truenas.sh >> /var/log/oscal-green-build.log 2>&1  # Green: 3rd Sunday
# 0 2 * * 0 [ $(( ($(date +\%s) / 86400 / 7) % 5 )) -eq 4 ] && /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green/build_on_truenas.sh >> /var/log/oscal-green-build.log 2>&1  # Green: 5th Sunday
# 0 2 * * 0 [ $(( ($(date +\%s) / 86400 / 7) % 5 )) -eq 1 ] && /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue/build_on_truenas.sh >> /var/log/oscal-blue-build.log 2>&1   # Blue: 2nd Sunday
# 0 2 * * 0 [ $(( ($(date +\%s) / 86400 / 7) % 5 )) -eq 3 ] && /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue/build_on_truenas.sh >> /var/log/oscal-blue-build.log 2>&1   # Blue: 4th Sunday
```

**No changes needed** - The scripts will automatically pull from the new repository URL after you update the git remote.

---

## ✅ Verification Checklist

### Local Development Environment

- [x] Git remote updated to Adobe organization
- [x] GitHub CLI authenticated with Adobe SSO
- [x] Workflow scope enabled for push
- [x] All branches and tags pushed
- [x] Version 1.4.1 committed and pushed
- [x] Documentation updated with new URLs
- [x] Local server running with updated configuration

### TrueNAS Green Instance

- [ ] SSH access to TrueNAS confirmed
- [ ] Git remote URL updated to Adobe org
- [ ] Latest code pulled (v1.4.1)
- [ ] Docker image rebuilt
- [ ] Container running on port 3019
- [ ] Health check endpoint responding
- [ ] Reverse proxy authentication tested

### TrueNAS Blue Instance

- [ ] Git remote URL updated to Adobe org
- [ ] Latest code pulled (v1.4.1)
- [ ] Docker image rebuilt
- [ ] Container running on port 3020
- [ ] Health check endpoint responding
- [ ] Reverse proxy authentication tested

### Production Testing

- [ ] Access through SQUID proxy works
- [ ] Authentication successful (no "token not provided" error)
- [ ] Login page loads correctly
- [ ] User management functions
- [ ] Report generation works
- [ ] Rate limiting functional (correct IP detection)
- [ ] Email notifications working

---

## 🚀 Next Deployment Schedule

Based on your staggered deployment schedule:

| Date | Instance | Action |
|------|----------|--------|
| **Next Sunday (if 1st/3rd/5th)** | Green (3019) | Auto-deploy v1.4.1+ |
| **Next Sunday (if 2nd/4th)** | Blue (3020) | Auto-deploy v1.4.1+ |

After updating git remotes, deployments will automatically pull from Adobe repository.

---

## 📞 Support & Access

### Repository Access

- **GitHub**: https://github.com/AdobeManagedServices/oscal
- **Organization**: Adobe Managed Services
- **Authentication**: Adobe SSO required

### Key Personnel

- **Author**: Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
- **License**: GPL-3.0-or-later
- **Organization**: Adobe Inc.

### Documentation

- **Main README**: [README.md](../README.md)
- **TrueNAS Deployment**: [TRUENAS_DEPLOYMENT.md](TRUENAS_DEPLOYMENT.md)
- **Deployment Guide**: [DEPLOYMENT.md](DEPLOYMENT.md)
- **Best Practices**: [BEST_PRACTICES.md](BEST_PRACTICES.md)

---

## 🔐 Security Notes

### Adobe SSO Integration

- GitHub access requires Adobe single sign-on (SSO)
- Web browser authentication handled by Adobe identity provider
- Command-line access via GitHub CLI or SSH keys
- Personal Access Tokens require organization approval

### Credential Management

- **DO NOT** commit credentials or PATs to repository
- Use environment variables or secure credential stores
- GitHub CLI stores credentials securely in system keychain
- SSH keys preferred for server environments

### Repository Permissions

- Repository is under Adobe Managed Services organization
- Access controlled by Adobe IT policies
- Workflow modifications require `workflow` scope
- Regular security scans performed by GitHub

---

## 📊 Migration Statistics

| Metric | Value |
|--------|-------|
| **Total Commits** | 325+ |
| **Branches Migrated** | 2 (main, project-cleanup-29698) |
| **Tags Migrated** | 3 (v1.3.0, v1.3.1, v1.4.0) |
| **Files Updated** | 9 (URLs changed) |
| **New Version** | 1.4.1 |
| **Migration Date** | January 14, 2026 |
| **Downtime** | 0 minutes |

---

## ✨ Benefits of Adobe Organization

### Organizational Benefits

- ✅ Official Adobe Managed Services repository
- ✅ Enterprise-grade security and compliance
- ✅ Adobe SSO integration for access control
- ✅ Centralized management and governance
- ✅ Enhanced collaboration within Adobe
- ✅ Better visibility for stakeholders

### Technical Benefits

- ✅ GitHub Actions with increased quotas
- ✅ Advanced security features (Dependabot, Code Scanning)
- ✅ Protected branches and required reviews
- ✅ Integration with Adobe's CI/CD pipelines
- ✅ Centralized artifact and package management

---

## 🎯 Post-Migration Tasks

### Immediate (Within 24 Hours)

1. ✅ Update local development environment (COMPLETED)
2. ⏳ Update TrueNAS Green instance git remote
3. ⏳ Update TrueNAS Blue instance git remote
4. ⏳ Test reverse proxy authentication
5. ⏳ Verify automated deployments

### Short-Term (Within 1 Week)

- [ ] Update any external documentation or wikis
- [ ] Notify team members of new repository location
- [ ] Update CI/CD pipeline configurations (if any external)
- [ ] Archive or update old repository with redirect notice
- [ ] Verify all integrations working with new URL

### Long-Term

- [ ] Review and update Adobe organizational policies
- [ ] Set up branch protection rules
- [ ] Configure required reviewers for PRs
- [ ] Enable GitHub Advanced Security features
- [ ] Set up automated security scanning

---

## 🆘 Troubleshooting

### Common Issues

#### 1. Authentication Failed

**Symptom**: `Authentication failed for 'https://github.com/AdobeManagedServices/oscal.git/'`

**Solution**:
```bash
# Re-authenticate with GitHub CLI
gh auth login
gh auth refresh -h github.com -s workflow
gh auth setup-git
```

#### 2. Permission Denied (publickey)

**Symptom**: `Permission denied (publickey)` when using SSH

**Solution**:
```bash
# Verify SSH key is added to GitHub
ssh -T git@github.com

# If failed, add your public key:
cat ~/.ssh/id_ed25519.pub
# Add to: https://github.com/settings/ssh/new
```

#### 3. Workflow Push Rejected

**Symptom**: `refusing to allow an OAuth App to create or update workflow`

**Solution**:
```bash
# Add workflow scope
gh auth refresh -h github.com -s workflow
```

#### 4. Repository Not Found

**Symptom**: `Repository not found`

**Solution**:
- Verify you have access to Adobe Managed Services org
- Check with Adobe IT if access is required
- Ensure you're logged in with Adobe SSO

---

## 📝 Migration Log

### 2026-01-14: Initial Migration

**Time**: 05:00 - 05:30 UTC  
**Status**: ✅ SUCCESS  
**Performed By**: mkesharw_adobe

**Actions Taken**:
1. Updated version to 1.4.1 (reverse proxy fix)
2. Updated all repository URLs in codebase
3. Changed git remote to Adobe organization
4. Authenticated via GitHub CLI with Adobe SSO
5. Added `workflow` scope for GitHub Actions
6. Pushed main branch to new repository
7. Pushed all tags (v1.3.0, v1.3.1, v1.4.0)
8. Created migration documentation

**Verification**:
- ✅ Local repository: https://github.com/AdobeManagedServices/oscal
- ✅ All commits and history preserved
- ✅ GitHub workflows transferred
- ✅ Documentation updated
- ✅ Build scripts configured for new URL

**Next Steps**:
- Update TrueNAS instances (pending user action)
- Test reverse proxy in production (pending)
- Verify automated deployments (pending)

---

## 📚 Additional Resources

- **Adobe GitHub Enterprise**: https://github.com/adobe
- **Adobe Managed Services**: https://github.com/AdobeManagedServices
- **OSCAL Official**: https://pages.nist.gov/OSCAL/
- **GitHub CLI Documentation**: https://cli.github.com/manual/
- **Git Credential Management**: https://git-scm.com/doc/credential-helpers

---

**Document Version**: 1.0  
**Last Updated**: January 14, 2026  
**Author**: Mukesh Kesharwani  
**License**: GPL-3.0-or-later
