# Vercel Integration Removal Guide

## Background

This repository is **NOT intended for Vercel deployment**. All deployments are managed through:
- **Docker containers** on TrueNAS infrastructure
- **Blue/Green deployment** strategy using Docker Hub
- Internal network deployment with specific security configurations

## Problem

Vercel bot was automatically attempting to deploy pull requests, causing:
- Unwanted deployment notifications
- Email address mismatch errors
- Confusion about deployment targets
- Potential security concerns

## Solution Implemented

### 1. Repository Configuration

✅ **Added `.vercelignore`** - Blocks all files from Vercel deployment
```
# Ignore everything to prevent any deployment
*
**/*
```

✅ **Updated `.gitignore`** - Prevents Vercel config files from being committed
```
# Vercel deployment files (NOT USED - Docker deployments only)
.vercel/
.vercel
vercel.json
.vercelignore
```

### 2. Required Manual Steps (GitHub Settings)

**⚠️ IMPORTANT**: You must manually remove the Vercel GitHub App integration:

#### For Personal Repository (keekar2022/OSCAL-Reports)

1. Go to: https://github.com/keekar2022/OSCAL-Reports/settings/installations

2. Find "Vercel" in the list of installed GitHub Apps

3. Click "Configure" next to Vercel

4. Scroll down and click "Uninstall" or "Remove"

5. Confirm the removal

**Alternative Path:**
- Go to: https://github.com/settings/installations
- Find Vercel
- Click "Configure"
- Find this repository and remove access

#### For Adobe Repository (Optional)

If needed for the Adobe repository:
1. Go to: https://github.com/AdobeManagedServices/OSCAL-Reports/settings/installations
2. Follow the same steps as above

## Verification

After removing the Vercel integration:

1. ✅ No more "Vercel bot commented" messages on pull requests
2. ✅ No deployment notifications
3. ✅ `.vercelignore` prevents accidental deployments if re-enabled
4. ✅ `.gitignore` prevents Vercel config files from being committed

## Deployment Architecture

This project uses:

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  GitHub Repository (Source Code)                   │
│                                                     │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ Push to branches
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│                                                     │
│  GitHub Actions (CI/CD)                            │
│  - Run tests                                       │
│  - Build Docker images                             │
│  - Push to Docker Hub                              │
│                                                     │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ Docker images
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│                                                     │
│  Docker Hub (Image Registry)                       │
│  - Store built images                              │
│                                                     │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ Pull images
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│                                                     │
│  TrueNAS Infrastructure                            │
│  - Blue/Green deployments                          │
│  - Docker containers                               │
│  - Internal network                                │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**NOT USED:** Vercel, Netlify, Heroku, or any other cloud deployment platforms

## Why Not Vercel?

1. **Security**: Internal network deployment required
2. **Architecture**: Docker-based infrastructure already in place
3. **Control**: Blue/Green deployment strategy for zero-downtime
4. **Compliance**: Specific security requirements for Adobe environment
5. **Cost**: Existing TrueNAS infrastructure

## Future Prevention

To prevent Vercel (or similar services) from auto-deploying:

1. ✅ Keep `.vercelignore` in repository (blocks deployment)
2. ✅ Don't install deployment service GitHub Apps
3. ✅ Review GitHub App installations periodically
4. ✅ Use branch protection rules to control deployments
5. ✅ Document deployment architecture clearly

## Contact

If you need to configure deployments:
- Refer to: `docs/DEPLOYMENT_GUIDE.md`
- Use scripts: `scripts/deploy_from_dockerhub.sh`
- Blue/Green strategy: `scripts/consolidate-users.sh`

---

**Last Updated**: February 3, 2026
**Status**: Vercel integration disabled
**Action Required**: Remove Vercel GitHub App from repository settings
