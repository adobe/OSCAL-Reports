# Docker Hub Publishing Setup

This document explains how to set up automated Docker image publishing to Docker Hub for the OSCAL Report Generator project.

## Overview

The CI/CD pipeline automatically builds and publishes Docker images to both:
1. **Docker Hub** (Public) - `keekar/oscal_reports`
2. **GitHub Container Registry** (GHCR) - `ghcr.io/[owner]/oscal-report-generator`

## Docker Tags

### Tag Strategy

| Branch | Docker Hub Tag | Description |
|--------|----------------|-------------|
| `main` | `latest`, `v{version}` | Stable production releases |
| `Development` | `edge`, `v{version}` | Latest development builds |

### Examples

```bash
# Pull latest stable release
docker pull keekar/oscal_reports:latest

# Pull latest development build
docker pull keekar/oscal_reports:edge

# Pull specific version
docker pull keekar/oscal_reports:v1.0.0
```

## GitHub Secrets Setup

To enable Docker Hub publishing, you need to configure two GitHub secrets:

### 1. Create Docker Hub Access Token

1. Log in to [Docker Hub](https://hub.docker.com/)
2. Go to **Account Settings** → **Security** → **Access Tokens**
3. Click **New Access Token**
4. Name it `OSCAL_GitHub_Actions` (or any descriptive name)
5. Set permissions to **Read, Write, Delete**
6. Click **Generate**
7. **Copy the token** (you won't be able to see it again!)

### 2. Add Secrets to GitHub Repository

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add the following secrets:

#### Secret 1: DOCKERHUB_USERNAME
- **Name**: `DOCKERHUB_USERNAME`
- **Value**: `keekar` (your Docker Hub username)

#### Secret 2: DOCKERHUB_TOKEN
- **Name**: `DOCKERHUB_TOKEN`
- **Value**: Paste the access token you generated in step 1

### Visual Guide

```
GitHub Repository
└── Settings
    └── Secrets and variables
        └── Actions
            └── New repository secret
                ├── DOCKERHUB_USERNAME = keekar
                └── DOCKERHUB_TOKEN = dckr_pat_xxxxxxxxxxxxx
```

## How the CI/CD Pipeline Works

### Workflow Triggers

The Docker build and push workflow is triggered on:
- **Push to `main` branch** → Builds and publishes `latest` tag
- **Push to `Development` branch** → Builds and publishes `edge` tag

### Build Process

1. **Tests Run**: Backend, frontend, and integration tests
2. **Code Quality**: Security scans and validation
3. **Version Check**: Ensures version consistency across package.json files
4. **Docker Build**: Multi-platform build (linux/amd64, linux/arm64)
5. **Push to Registries**:
   - GitHub Container Registry (GHCR)
   - Docker Hub (public)
6. **Extract Credentials**: Saves default credentials as artifacts
7. **Deploy**: Manual deployment instructions provided

### Multi-Platform Support

Images are built for multiple architectures:
- `linux/amd64` (Intel/AMD processors)
- `linux/arm64` (Apple Silicon, ARM processors)

This ensures the image works on various platforms including:
- x86_64 servers
- Apple M1/M2/M3 Macs
- ARM-based cloud instances

## Using Published Images

### Quick Start

```bash
# Pull and run the latest stable version
docker pull keekar/oscal_reports:latest
docker run -d --name oscal-app -p 3020:3020 keekar/oscal_reports:latest
```

### With Configuration Volume

```bash
# Run with persistent configuration
docker run -d \
  --name oscal-app \
  -p 3020:3020 \
  -v $(pwd)/config:/app/config \
  keekar/oscal_reports:latest
```

### Using Docker Compose

Update your `docker-compose.yml`:

```yaml
version: '3.8'

services:
  oscal-app:
    image: keekar/oscal_reports:latest  # or :edge for development
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

Then:

```bash
docker-compose pull
docker-compose up -d
```

## Default Credentials

Default credentials are generated during the Docker build based on the build timestamp.

### Format
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
- **admin**: Platform administrator
- **user**: Standard user
- **assessor**: Assessor role

### Finding Credentials

#### Method 1: Extract from Docker Image (Easiest)

```bash
# Pull the image
docker pull keekar/oscal_reports:latest  # or :edge

# Create temporary container
docker create --name temp-oscal keekar/oscal_reports:latest

# Extract credentials file
docker cp temp-oscal:/app/credentials.txt ./credentials.txt

# View credentials
cat credentials.txt

# Clean up
docker rm temp-oscal
```

#### Method 2: Via GitHub Actions (Requires Repository Access)

1. Go to the [Actions tab](../../actions)
2. Click on the latest workflow run
3. **View credentials in the job summary** (displayed directly on the page)
4. Or scroll down to "Artifacts" section and download the `deployment-credentials-v{version}` artifact

**Note**: Artifact download URLs (like `https://github.com/.../artifacts/123456`) do NOT work directly in browsers. You must:
- Download via the GitHub UI (method above), OR
- Use GitHub CLI: `gh run download RUN_ID --name deployment-credentials-v{version}`, OR
- Extract from Docker image (Method 1 - recommended)

⚠️ **IMPORTANT**: Change default passwords immediately after first login!

## Verifying the Image

### Check Image on Docker Hub

Visit: https://hub.docker.com/r/keekar/oscal_reports

### Inspect Local Image

```bash
# Pull the image
docker pull keekar/oscal_reports:latest

# Inspect image details
docker inspect keekar/oscal_reports:latest

# Check image layers
docker history keekar/oscal_reports:latest

# View image metadata
docker image inspect keekar/oscal_reports:latest | jq '.[0].Config.Labels'
```

### Test the Image

```bash
# Run the container
docker run -d --name test-oscal -p 3020:3020 keekar/oscal_reports:latest

# Check health endpoint
curl http://localhost:3020/health

# View logs
docker logs test-oscal

# Clean up
docker stop test-oscal
docker rm test-oscal
```

## Troubleshooting

### Image Build Fails

**Problem**: Docker build fails in CI/CD pipeline

**Solutions**:
1. Check if all tests pass before the build step
2. Verify Dockerfile syntax
3. Review workflow logs in GitHub Actions
4. Check if disk space is sufficient

### Cannot Push to Docker Hub

**Problem**: `unauthorized: authentication required` error

**Solutions**:
1. Verify `DOCKERHUB_USERNAME` secret is correct
2. Regenerate Docker Hub access token
3. Ensure token has **Write** permissions
4. Check if Docker Hub account is active

### Cannot Pull Image

**Problem**: `Error response from daemon: pull access denied`

**Solutions**:
1. Verify repository name is correct: `keekar/oscal_reports`
2. Check if repository is public on Docker Hub
3. Try: `docker pull keekar/oscal_reports:latest`

### Multi-Platform Build Issues

**Problem**: `exec format error` when running container

**Solutions**:
1. Ensure you're pulling the correct architecture
2. Check: `docker inspect keekar/oscal_reports:latest | jq '.[0].Architecture'`
3. Force specific platform: `docker pull --platform linux/amd64 keekar/oscal_reports:latest`

## CI/CD Workflow Configuration

### Workflow File Location
`.github/workflows/ci-cd.yml`

### Key Configuration

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

## Security Best Practices

1. **Never commit Docker Hub credentials** to the repository
2. **Use access tokens** instead of passwords
3. **Rotate tokens periodically** (every 90 days recommended)
4. **Limit token permissions** to what's needed
5. **Enable 2FA** on Docker Hub account
6. **Review access logs** regularly on Docker Hub

## Benefits of Docker Hub Publishing

### For Users
- ✅ **No build required** - Just pull and run
- ✅ **Fast downloads** - Docker Hub's CDN
- ✅ **Cross-platform** - Works on amd64 and arm64
- ✅ **Version control** - Easy rollback to previous versions
- ✅ **Public access** - No authentication needed

### For Developers
- ✅ **Automated publishing** - No manual intervention
- ✅ **Version tracking** - All versions available
- ✅ **CI/CD integrated** - Automatic on push
- ✅ **Multi-registry** - GHCR + Docker Hub redundancy

## Monitoring and Maintenance

### Check Image Statistics

Visit Docker Hub to monitor:
- Pull counts
- Star ratings
- Image sizes
- Security scan results

### Update Workflow

When updating the workflow:
1. Test changes in a separate branch
2. Verify with Development branch first
3. Merge to main only after validation

### Image Cleanup

Docker Hub has pull limits. To manage:
1. Delete unused tags
2. Keep only recent versions (e.g., last 10)
3. Consider upgrading to Docker Hub Pro if needed

## Related Documentation

- [Deployment Guide](./DEPLOYMENT.md)
- [Cloud Deployment](./CLOUD_DEPLOYMENT.md)
- [GitHub Actions Deployment](./GITHUB_ACTIONS_DEPLOYMENT.md)
- [Architecture](./ARCHITECTURE.md)

## Support

For issues with Docker Hub publishing:
1. Check [GitHub Actions logs](../../actions)
2. Review [Docker Hub status](https://status.docker.com/)
3. Open an issue in the repository

---

**Last Updated**: January 2026
**Maintained By**: Mukesh Kesharwani
