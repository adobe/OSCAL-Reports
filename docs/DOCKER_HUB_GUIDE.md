# 🐳 Docker Hub - Complete Guide

**Comprehensive guide for Docker Hub publishing, setup, and usage for OSCAL Report Generator**

---

## 📋 Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Setup Instructions](#setup-instructions)
  - [GitHub Secrets Configuration](#github-secrets-configuration)
  - [Setup Checklist](#setup-checklist)
- [Using Published Images](#using-published-images)
- [Default Credentials](#default-credentials)
- [CI/CD Pipeline](#cicd-pipeline)
- [Verification & Testing](#verification--testing)
- [Troubleshooting](#troubleshooting)
- [Maintenance & Best Practices](#maintenance--best-practices)
- [Support](#support)

---

## Overview

The OSCAL Report Generator is automatically published to Docker Hub, making it easy for users to pull and run without building from source.

### Published Images

1. **Docker Hub** (Public) - `keekar/oscal_reports`
2. **GitHub Container Registry** (GHCR) - `ghcr.io/[owner]/oscal-report-generator`

### Tag Strategy

| Branch | Docker Hub Tags | Description |
|--------|----------------|-------------|
| `main` | `latest`, `v{version}`, `main-{sha}` | Stable production releases |
| `Development` | `edge`, `v{version}`, `Development-{sha}` | Latest development builds |

### Multi-Platform Support

Images are built for multiple architectures:
- ✅ **linux/amd64** - Intel/AMD 64-bit processors
- ✅ **linux/arm64** - ARM 64-bit processors (Apple Silicon, ARM servers)

### Key Benefits

**For Users:**
- ✅ No build required - just pull and run
- ✅ Fast downloads via Docker Hub CDN
- ✅ Cross-platform support
- ✅ Version control and easy rollbacks
- ✅ Public access - no authentication needed

**For Developers:**
- ✅ Automated publishing on every push
- ✅ Version tracking
- ✅ CI/CD integrated
- ✅ Multi-registry redundancy

---

## Quick Start

### Pull and Run

```bash
# Pull the latest stable version
docker pull keekar/oscal_reports:latest

# Run the container
docker run -d \
  --name oscal-app \
  -p 3020:3020 \
  keekar/oscal_reports:latest

# Access the application
open http://localhost:3020
```

### Available Tags

```bash
# Stable production release
docker pull keekar/oscal_reports:latest

# Latest development build
docker pull keekar/oscal_reports:edge

# Specific version
docker pull keekar/oscal_reports:v1.6.3
```

### With Persistent Configuration

```bash
# Create config directory
mkdir -p ./config

# Run with volume mount
docker run -d \
  --name oscal-app \
  -p 3020:3020 \
  -v $(pwd)/config:/app/config \
  keekar/oscal_reports:latest
```

### Using Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  oscal-app:
    image: keekar/oscal_reports:latest
    container_name: oscal-app
    ports:
      - "3020:3020"
    volumes:
      - ./config:/app/config
    environment:
      - NODE_ENV=production
      - PORT=3020
    restart: unless-stopped
```

Run:

```bash
docker-compose up -d
```

---

## Setup Instructions

### Prerequisites

- GitHub repository with admin access
- Docker Hub account (username: `keekar`)
- Ability to create GitHub secrets

### GitHub Secrets Configuration

#### Step 1: Create Docker Hub Access Token

1. **Log in to Docker Hub**
   - Go to https://hub.docker.com/
   - Sign in with your credentials

2. **Navigate to Security Settings**
   - Click profile icon (top right)
   - Select **Account Settings**
   - Click **Security** → **Access Tokens**

3. **Generate New Token**
   - Click **New Access Token**
   - Configuration:
     - **Description**: `OSCAL_GitHub_Actions`
     - **Permissions**: **Read, Write, Delete**
   - Click **Generate**

4. **Copy the Token**
   - ⚠️ **IMPORTANT**: Copy immediately!
   - You won't see it again after closing
   - Keep it safe for the next step

#### Step 2: Add Secrets to GitHub

1. **Navigate to Repository Settings**
   - Go to: `https://github.com/[your-org]/OSCAL-Reports`
   - Click **Settings** tab
   - Go to **Secrets and variables** → **Actions**

2. **Add DOCKERHUB_USERNAME**
   - Click **New repository secret**
   - **Name**: `DOCKERHUB_USERNAME`
   - **Value**: `keekar`
   - Click **Add secret**

3. **Add DOCKERHUB_TOKEN**
   - Click **New repository secret**
   - **Name**: `DOCKERHUB_TOKEN`
   - **Value**: Paste the access token from Step 1
   - Click **Add secret**

4. **Verify Setup**
   - You should see both secrets listed:
     - `DOCKERHUB_USERNAME`
     - `DOCKERHUB_TOKEN`

### Setup Checklist

Use this checklist to ensure complete setup:

#### ✅ Phase 1: Docker Hub Preparation

- [ ] Log in to Docker Hub (https://hub.docker.com/)
- [ ] Create repository `oscal_reports` (Public visibility)
- [ ] Generate access token with Read, Write, Delete permissions
- [ ] Copy token immediately

#### ✅ Phase 2: GitHub Secrets

- [ ] Navigate to Settings → Secrets and variables → Actions
- [ ] Add `DOCKERHUB_USERNAME` secret = `keekar`
- [ ] Add `DOCKERHUB_TOKEN` secret = (paste token)
- [ ] Verify both secrets appear in list

#### ✅ Phase 3: Testing

- [ ] Push to Development branch (creates `edge` tag)
- [ ] Monitor GitHub Actions workflow
- [ ] Verify image on Docker Hub
- [ ] Test pulling: `docker pull keekar/oscal_reports:edge`
- [ ] Test running and accessing at http://localhost:3020

#### ✅ Phase 4: Docker Hub Configuration

- [ ] Update repository description on Docker Hub
- [ ] Add repository links (GitHub, docs)
- [ ] Add tags: oscal, compliance, security, ssp, soa, ccm, nist

#### ✅ Phase 5: Verification

- [ ] Verify multi-platform images (amd64, arm64)
- [ ] Test on different platforms if available
- [ ] Verify image size < 500MB
- [ ] Test credentials extraction
- [ ] Verify badges work

---

## Using Published Images

### Basic Usage

```bash
# Pull latest
docker pull keekar/oscal_reports:latest

# Run
docker run -d --name oscal-app -p 3020:3020 keekar/oscal_reports:latest

# Check health
curl http://localhost:3020/health

# View logs
docker logs oscal-app

# Stop and remove
docker stop oscal-app && docker rm oscal-app
```

### Custom Port Mapping

```bash
# Map to port 8080
docker run -d \
  --name oscal-app \
  -p 8080:3020 \
  keekar/oscal_reports:latest

# Access at http://localhost:8080
```

### Production Deployment

```bash
# Pin to specific version
docker pull keekar/oscal_reports:v1.6.3

# Run with resource limits and restart policy
docker run -d \
  --name oscal-prod \
  -p 3020:3020 \
  -v /opt/oscal/config:/app/config \
  --restart unless-stopped \
  --memory="1g" \
  --cpus="1.0" \
  keekar/oscal_reports:v1.6.3
```

### Development Testing

```bash
# Pull edge build
docker pull keekar/oscal_reports:edge

# Run on different port
docker run -d \
  --name oscal-dev \
  -p 3021:3020 \
  keekar/oscal_reports:edge
```

### Force Specific Platform

```bash
# For Intel/AMD systems
docker pull --platform linux/amd64 keekar/oscal_reports:latest

# For Apple Silicon / ARM
docker pull --platform linux/arm64 keekar/oscal_reports:latest
```

---

## Default Credentials

The Docker image generates timestamp-based default credentials during build.

### Credential Format

```
Username: [role]
Password: [role]#DDMMYYHH
```

Where:
- `DD` = Day of build (UTC)
- `MM` = Month of build (UTC)
- `YY` = Year (last 2 digits)
- `HH` = Hour of build (UTC)

### Default Roles

- **admin** - Platform administrator
- **user** - Standard user
- **assessor** - Assessor role

### Extracting Credentials

#### Method 1: From Docker Image (Recommended)

```bash
# Pull the image
docker pull keekar/oscal_reports:latest

# Create temporary container
docker create --name temp-oscal keekar/oscal_reports:latest

# Extract credentials file
docker cp temp-oscal:/app/credentials.txt ./credentials.txt

# View credentials
cat credentials.txt

# Clean up
docker rm temp-oscal
```

#### Method 2: From GitHub Actions

1. Go to [Actions tab](../../actions)
2. Click on latest workflow run
3. **View credentials in job summary** (displayed directly)
4. Or download from "Artifacts" section

**Note**: Artifact URLs don't work directly in browsers. Use Method 1 or GitHub UI.

### ⚠️ Security Warning

**Change default passwords immediately after first login!**

---

## CI/CD Pipeline

### Workflow Triggers

The workflow is triggered on:
- **Push to `main` branch** → Publishes `latest` tag
- **Push to `Development` branch** → Publishes `edge` tag

### Build Process

1. **Run Tests** - Backend, frontend, integration tests
2. **Code Quality** - Security scans and validation
3. **Version Check** - Ensures consistency across package.json files
4. **Docker Build** - Multi-platform build (amd64, arm64)
5. **Push to Registries**:
   - GitHub Container Registry (GHCR)
   - Docker Hub (public)
6. **Extract Credentials** - Saves to artifacts and job summary
7. **Generate Reports** - Deployment instructions

### Workflow Configuration

File: `.github/workflows/ci-cd.yml`

Key sections:

```yaml
- name: 🔐 Log in to Docker Hub
  uses: docker/login-action@v3
  with:
    username: ${{ secrets.DOCKERHUB_USERNAME }}
    password: ${{ secrets.DOCKERHUB_TOKEN }}

- name: 🏷️ Docker metadata for tags
  id: docker-meta
  uses: docker/metadata-action@v5
  with:
    images: |
      ghcr.io/${{ github.repository_owner }}/oscal-report-generator
      keekar/oscal_reports
    tags: |
      type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}
      type=raw,value=edge,enable=${{ github.ref == 'refs/heads/Development' }}
      type=semver,pattern={{version}}
```

---

## Verification & Testing

### Verify Image on Docker Hub

Visit: https://hub.docker.com/r/keekar/oscal_reports

Check:
- Pull counts
- Available tags
- Image sizes
- Security scan results

### Inspect Local Image

```bash
# View image metadata
docker inspect keekar/oscal_reports:latest

# Check image size
docker images keekar/oscal_reports

# View image history/layers
docker history keekar/oscal_reports:latest

# View labels
docker image inspect keekar/oscal_reports:latest | jq '.[0].Config.Labels'
```

### Test Image Functionality

```bash
# Run container
docker run -d --name test-oscal -p 3020:3020 keekar/oscal_reports:latest

# Test health endpoint
curl http://localhost:3020/health
# Expected: {"status":"healthy",...}

# View logs
docker logs test-oscal

# Test in browser
open http://localhost:3020

# Clean up
docker stop test-oscal && docker rm test-oscal
```

### Verify Multi-Platform Build

```bash
# Inspect manifest for multiple platforms
docker manifest inspect keekar/oscal_reports:latest

# Should show:
# - linux/amd64
# - linux/arm64
```

### Health Check

```bash
# Check container health status
docker ps --filter name=oscal-app --format "table {{.Names}}\t{{.Status}}"

# Manual health check
curl http://localhost:3020/health

# View detailed container info
docker inspect oscal-app | jq '.[0].State.Health'
```

---

## Troubleshooting

### Common Issues

#### Issue: Image Build Fails

**Problem**: Docker build fails in CI/CD pipeline

**Solutions**:
1. Check all tests pass before build step
2. Verify Dockerfile syntax is correct
3. Review GitHub Actions workflow logs
4. Check if sufficient disk space available
5. Verify all dependencies are accessible

#### Issue: Cannot Push to Docker Hub

**Problem**: `unauthorized: authentication required`

**Solutions**:
1. Verify `DOCKERHUB_USERNAME` secret is exactly `keekar`
2. Regenerate Docker Hub access token
3. Ensure token has **Write** permissions
4. Check if Docker Hub account is active
5. Verify token hasn't been revoked

#### Issue: Cannot Pull Image

**Problem**: `Error response from daemon: pull access denied`

**Solutions**:
1. Verify repository name: `keekar/oscal_reports`
2. Check repository is public on Docker Hub
3. Try: `docker pull keekar/oscal_reports:latest`
4. Check Docker Hub status page

#### Issue: Wrong Architecture Error

**Problem**: `exec format error` when running container

**Solutions**:
```bash
# Check architecture
docker inspect keekar/oscal_reports:latest | jq '.[0].Architecture'

# Force specific platform
docker pull --platform linux/amd64 keekar/oscal_reports:latest
# or
docker pull --platform linux/arm64 keekar/oscal_reports:latest
```

#### Issue: Container Won't Start

**Problem**: Container exits immediately

**Solutions**:
```bash
# Check logs for errors
docker logs oscal-app

# Check if port is already in use
lsof -i :3020  # macOS/Linux
netstat -ano | findstr :3020  # Windows

# Try different port
docker run -d --name oscal-app -p 8080:3020 keekar/oscal_reports:latest
```

#### Issue: Cannot Access Application

**Problem**: Can't reach http://localhost:3020

**Solutions**:
1. Verify container is running: `docker ps | grep oscal-app`
2. Check port mapping: `docker port oscal-app`
3. Test health endpoint: `curl http://localhost:3020/health`
4. Check firewall rules
5. Verify no proxy/VPN interference

#### Issue: Secrets Not Working

**Problem**: `Error: Username and password required`

**Solutions**:
1. Verify secret names are exactly:
   - `DOCKERHUB_USERNAME` (case-sensitive)
   - `DOCKERHUB_TOKEN` (case-sensitive)
2. Re-add secrets if needed
3. Check secrets in correct repository
4. Verify workflow file references correct secret names

#### Issue: Image Not on Docker Hub

**Problem**: Build succeeds but no image published

**Solutions**:
1. Check workflow succeeded in GitHub Actions
2. Verify branch is `main` or `Development`
3. Check Docker Hub repository name is correct
4. Review workflow logs for push errors
5. Verify Docker Hub account has space available

### Token Issues

#### Token Expired

Docker Hub tokens don't expire by default, but if you see auth errors:

1. Go to Docker Hub → Account Settings → Security → Access Tokens
2. Check if token is still active
3. Generate new token if needed
4. Update `DOCKERHUB_TOKEN` secret in GitHub
5. Test with new push

#### Test Docker Hub Login Locally

```bash
# Test login with token
echo "$DOCKERHUB_TOKEN" | docker login -u keekar --password-stdin

# Should return: Login Succeeded
```

---

## Maintenance & Best Practices

### Security Best Practices

1. ✅ **Never commit credentials** to repository
2. ✅ **Use access tokens** instead of passwords
3. ✅ **Rotate tokens periodically** (every 90 days recommended)
4. ✅ **Limit token permissions** to what's needed
5. ✅ **Enable 2FA** on Docker Hub account
6. ✅ **Review access logs** regularly
7. ✅ **Delete unused tokens** promptly

### Token Rotation (Every 90 Days)

```bash
# 1. Generate new token on Docker Hub
# 2. Update GitHub secret
gh secret set DOCKERHUB_TOKEN

# 3. Test with push to Development
git checkout Development
git commit --allow-empty -m "Test: Token rotation"
git push

# 4. Delete old token from Docker Hub
```

### Image Cleanup

Docker Hub has pull limits. Manage images:

1. Delete unused tags regularly
2. Keep last 10 versions
3. Always keep `latest` and `edge` tags
4. Delete old development/test tags
5. Consider Docker Hub Pro for higher limits

### Monitoring

#### Check Image Statistics

Visit Docker Hub to monitor:
- Pull counts
- Star ratings
- Image sizes
- Security scan results
- Download trends

#### Set Up Alerts

```bash
# GitHub Actions notifications
# Settings → Notifications → Actions

# Set up:
# - Workflow failure alerts
# - Build duration alerts
# - Image size alerts
```

### Update Workflow

When modifying workflow:

1. Test changes in separate branch
2. Verify with Development branch first
3. Review logs carefully
4. Merge to main only after validation
5. Document changes in CHANGELOG

### Regular Maintenance Tasks

**Weekly**:
- Check Docker Hub pull statistics
- Review workflow run logs
- Monitor image sizes

**Monthly**:
- Review and cleanup old tags
- Check security scan results
- Update dependencies if needed

**Every 90 Days**:
- Rotate Docker Hub access token
- Review security settings
- Audit access permissions

---

## Support

### Documentation

- **GitHub Repository**: https://github.com/keekar2022/OSCAL-Reports
- **Full Documentation**: https://github.com/keekar2022/OSCAL-Reports/tree/main/docs
- **Docker Hub Page**: https://hub.docker.com/r/keekar/oscal_reports

### Getting Help

1. **Check Documentation** - Review this guide and related docs
2. **GitHub Actions Logs** - Check workflow logs for errors
3. **Docker Hub Status** - https://status.docker.com/
4. **GitHub Issues** - Open an issue for problems
5. **Discussions** - Join GitHub Discussions for questions

### Quick Reference

```bash
# Pull Commands
docker pull keekar/oscal_reports:latest  # Stable
docker pull keekar/oscal_reports:edge    # Development
docker pull keekar/oscal_reports:v1.6.3  # Specific version

# Run Commands
docker run -d --name oscal-app -p 3020:3020 keekar/oscal_reports:latest
docker run -d --name oscal-app -p 3020:3020 -v $(pwd)/config:/app/config keekar/oscal_reports:latest

# Management Commands
docker ps | grep oscal-app              # Check status
docker logs oscal-app                   # View logs
docker logs -f oscal-app                # Follow logs
docker stop oscal-app                   # Stop container
docker rm oscal-app                     # Remove container
curl http://localhost:3020/health       # Check health
```

### Important Links

| Resource | URL |
|----------|-----|
| **Docker Hub** | https://hub.docker.com/r/keekar/oscal_reports |
| **Tags** | https://hub.docker.com/r/keekar/oscal_reports/tags |
| **GitHub Actions** | https://github.com/keekar2022/OSCAL-Reports/actions |
| **Issues** | https://github.com/keekar2022/OSCAL-Reports/issues |
| **Documentation** | https://github.com/keekar2022/OSCAL-Reports/tree/main/docs |

---

## Related Documentation

- [TrueNAS Installation](./TRUENAS_INSTALLATION.md)
- [Cloud Deployment](./CLOUD_DEPLOYMENT.md)
- [Architecture](./ARCHITECTURE.md)
- [Deployment Guide](./DEPLOYMENT.md)

---

**Last Updated**: January 2026  
**Maintained By**: Mukesh Kesharwani  
**Version**: 1.6.3
