# 🚀 Deployment Quick Start

**Quick reference for deploying OSCAL Report Generator**

---

## Automated Deployment (GitHub Actions)

### When: Automatically on push to `main` branch

**What happens:**
1. ✅ Tests run (backend + frontend)
2. 🐳 Docker image built → `ghcr.io/adobe/oscal-report-generator`
3. 📧 Notifications sent with URLs
4. 🔐 Credentials available in artifacts

**Access:**
- Blue: http://nas.keekar.au:3020
- Green: http://nas.keekar.au:3019

**Deploy to TrueNAS:**
```bash
ssh mkesharw@nas.keekar.au
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green
git pull origin main
./scripts/install_from_dockerhub.sh
```

---

## Manual Deployment (GitHub UI)

### Option 1: Via GitHub Web

1. Go to **Actions** tab
2. Select **Manual Deployment**
3. Click **Run workflow**
4. Choose environment (blue/green/both)
5. Click **Run workflow**

### Option 2: Via GitHub CLI

```bash
# Deploy to green (latest)
gh workflow run manual-deploy.yml -f environment=green

# Deploy specific version to blue
gh workflow run manual-deploy.yml -f environment=blue -f version=1.6.2

# Deploy to both
gh workflow run manual-deploy.yml -f environment=both
```

---

## Docker Deployment

### Pull from GitHub Container Registry

```bash
# Pull latest image
docker pull ghcr.io/adobe/oscal-report-generator:latest

# Run container
docker run -d \
  --name oscal-app \
  -p 3020:3020 \
  -v $(pwd)/config:/app/config \
  --restart unless-stopped \
  ghcr.io/adobe/oscal-report-generator:latest

# Verify
curl http://localhost:3020/health
```

### Using Docker Compose

```bash
docker-compose pull
docker-compose up -d
docker-compose logs -f
```

---

## Verification

**After deployment, check:**

```bash
# Health check
curl http://nas.keekar.au:3020/health

# Container status
docker ps | grep oscal

# View logs
docker logs oscal-report-generator-green

# Access UI
open http://nas.keekar.au:3020
```

---

## Get Credentials

### From GitHub Workflow

1. Go to workflow run
2. Click **Summary**
3. Download **deployment-credentials** artifact
4. Extract and view `credentials.txt`

### From Docker Container

```bash
docker create --name temp-oscal ghcr.io/adobe/oscal-report-generator:latest
docker cp temp-oscal:/app/credentials.txt .
docker rm temp-oscal
cat credentials.txt
```

**⚠️ Change default passwords immediately!**

---

## Troubleshooting

### Container won't start
```bash
docker logs oscal-report-generator-green
docker stop oscal-report-generator-green && docker rm oscal-report-generator-green
./scripts/install_from_dockerhub.sh
```

### Can't access UI
```bash
# Check if running
docker ps | grep oscal

# Check port
netstat -tuln | grep 3020

# Test locally
curl http://localhost:3020/health
```

### Config not persisting
```bash
# Verify mount
docker inspect oscal-report-generator-green | grep -A 10 Mounts

# Check permissions
ls -la config/app/
chmod 755 config/app
```

---

## Quick Commands

```bash
# View workflow runs
gh run list --limit 5

# Watch current run
gh run watch

# View specific run logs
gh run view <run-id> --log

# List docker images
docker images | grep oscal

# Remove old images
docker image prune -a --filter "label=org.opencontainers.image.source=https://github.com/adobe/OSCAL-Reports"
```

---

## Resources

- 📖 **Full Guide**: [docs/GITHUB_ACTIONS_DEPLOYMENT.md](../docs/GITHUB_ACTIONS_DEPLOYMENT.md)
- 🚀 **Deployment Guide**: [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md)
- 🏗️ **Architecture**: [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)

---

**Need Help?** Contact: mukesh.kesharwani@adobe.com
