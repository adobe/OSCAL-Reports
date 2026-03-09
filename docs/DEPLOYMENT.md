# 🚀 OSCAL Report Generator - Complete Deployment Guide

**Version**: 1.6.2+  
**Last Updated**: January 2026  
**Author**: Mukesh Kesharwani

---

## 📋 Table of Contents

1. [Deployment Options Comparison](#deployment-options-comparison)
2. [Quick Start](#quick-start)
3. [Local Development](#local-development)
4. [Docker Deployment](#docker-deployment)
5. [TrueNAS Deployment](#truenas-deployment)
6. [Automated Deployments](#automated-deployments)
7. [Configuration Management](#configuration-management)
8. [Troubleshooting](#troubleshooting)

---

## Deployment Options Comparison

### 🎯 Quick Decision Guide

**Choose Your Deployment:**

| Need | Recommended Option | Cost | Setup Time |
|------|-------------------|------|------------|
| Testing environment for testers | Ngrok + GitHub Runner* | FREE | 10 min |
| Free/cheap hosting | Google Cloud Run | $5/mo | 10 min |
| Simplest setup | DigitalOcean | $5/mo | 10 min |
| Corporate/Enterprise | Azure Web App | $13/mo | 15 min |
| On-premises (own server) | TrueNAS | FREE | 20 min |
| Just build Docker images | GitHub Container Registry | FREE | Auto |

\* **Note**: Ngrok deployment only available on Adobe repository (`AdobeManagedServices/OSCAL-Reports`)

### Platform Comparison

#### Option 1: Testing Environment (FREE) ⭐

**Best for**: Functional testing, temporary deployments

| Platform | Cost | Availability | Best For |
|----------|------|--------------|----------|
| 🌐 **Ngrok + Runner** | FREE | 5 hours/session | Functional testing |

**Pros:**
- Testers get immediate access after CI/CD
- Public URL automatically provided
- Organization-approved (GitHub infrastructure)
- Perfect for functional testing

**Cons:**
- Not for production use
- 5-6 hour time limit per deployment
- New URL for each deployment

**⚠️ Repository Restriction:**
- **Only available on Adobe repository** (`AdobeManagedServices/OSCAL-Reports`)
- Requires `NGROK_AUTHTOKEN` secret and GitLab runner access
- Personal repository (`keekar2022/OSCAL-Reports`) does not support this deployment
- See `docs/REPOSITORY_WORKFLOW_RESTRICTIONS.md` for details

**See**: `docs/TESTING_ENVIRONMENT_SETUP.md`

#### Option 2: Cloud Platforms

**Best for**: Production deployments

| Platform | Cost | Setup Time | Best For |
|----------|------|------------|----------|
| 🔵 Azure Web App | $13/mo | 15 min | Microsoft ecosystem |
| 🟠 AWS EC2 | $10-20/mo | 20 min | Full control |
| 🟠 AWS ECS | $15-20/mo | 30 min | AWS containers |
| 🔴 Google Cloud Run | $5-10/mo | 10 min | Serverless |
| 🟣 Heroku | $0-7/mo | 5 min | Quick testing |
| 🟢 DigitalOcean | $5/mo | 10 min | Simple & affordable |

**See**: `docs/CLOUD_DEPLOYMENT.md`

#### Option 3: TrueNAS (Current Setup)

**Best for**: On-premises deployments

**Cost:** FREE (your own hardware)  
**Setup Time:** 20 minutes

**Pros:**
- No recurring costs
- Full control
- On-premises (data stays local)
- Blue-Green deployment

**See**: [TrueNAS Deployment](#truenas-deployment) section below

#### Option 4: Docker Images Only

**Best for**: Manual deployment or custom hosting

**Cost:** FREE  
**Setup Time:** Automatic via CI/CD

GitHub Actions automatically builds and publishes Docker images to GitHub Container Registry on every push to `main` branch.

**See**: `docs/GITHUB_ACTIONS_DEPLOYMENT.md`

---

## Quick Start

### Prerequisites

- **Node.js** 20+ (for local development)
- **Docker** (for containerized deployment)
- **Modern web browser** (Chrome, Firefox, Safari, Edge)
- **Git** (for deployment automation)

### 5-Minute Setup

```bash
# 1. Clone repository
git clone https://github.com/keekar2022/OSCAL-Reports.git
cd OSCAL-Reports

# 2. Run setup
chmod +x setup.sh
./setup.sh

# 3. Start application
npm run dev

# 4. Access
open http://localhost:3021  # Dev server with hot reload
open http://localhost:3020  # Production build
```

---

## Local Development

### Initial Setup

```bash
# Install dependencies for all modules
npm run install:all

# Or install individually
npm install          # Root dependencies
cd backend && npm install
cd frontend && npm install
```

### Development Modes

**Full Stack Development** (Recommended):
```bash
npm run dev
# Runs both frontend (3021) and backend (3020) concurrently
```

**Backend Only**:
```bash
cd backend
npm run dev
# Backend on http://localhost:3020
```

**Frontend Only**:
```bash
cd frontend
npm run dev
# Frontend dev server on http://localhost:3021
# Proxies API calls to backend on 3020
```

### Testing

```bash
# Run all tests
./test_cases/scripts/run_tests.sh

# Run specific test suites
cd backend
npm run test:unit        # Unit tests
npm run test:integration # Integration tests
npm run test:e2e         # E2E tests
npm run test:coverage    # With coverage report
```

---

## Docker Deployment

### Basic Docker Setup

```bash
# Build image
docker build -t oscal-report-generator:latest .

# Run container
docker run -d \
  --name oscal-app \
  -p 3020:3020 \
  -v $(pwd)/config:/app/config \
  oscal-report-generator:latest

# View logs
docker logs -f oscal-app

# Stop container
docker stop oscal-app && docker rm oscal-app
```

### Docker Compose

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Configuration Persistence

**IMPORTANT**: Always mount the config directory to persist user data:

```bash
docker run -d \
  -v /path/on/host/config:/app/config \
  -p 3020:3020 \
  oscal-report-generator:latest
```

---

## TrueNAS Deployment

### Overview

For TrueNAS deployments, we use:
- **Blue-Green deployment** strategy for zero-downtime updates
- **Personal GitHub repo** (no VPN required on TrueNAS)
- **Automated monthly updates** via cron
- **Persistent configuration** across rebuilds

### Quick Setup (TrueNAS)

**⚠️ Important**: Uses personal repo (`github.com/keekar2022/OSCAL-Reports`) - no VPN required

```bash
# SSH into TrueNAS
ssh mkesharw@NAS01
cd /mnt/pool1/Documents/KACI-Apps

# Clone Blue instance (Port 3020)
git clone https://github.com/keekar2022/OSCAL-Reports.git OSCAL-Report-Generator-Blue
cd OSCAL-Report-Generator-Blue
# TrueNAS build script is in retired/truenas-build/ (can be removed after 6 months when stable)
chmod +x retired/truenas-build/build_on_truenas.sh
./retired/truenas-build/build_on_truenas.sh

# Clone Green instance (Port 3019)
cd /mnt/pool1/Documents/KACI-Apps
git clone https://github.com/keekar2022/OSCAL-Reports.git OSCAL-Report-Generator-Green
cd OSCAL-Report-Generator-Green
chmod +x retired/truenas-build/build_on_truenas.sh
./retired/truenas-build/build_on_truenas.sh
```

### Blue-Green Deployment Strategy

**Why Blue-Green?**
- ✅ Zero-downtime deployments
- ✅ Instant rollback capability
- ✅ Test new version before switching
- ✅ High availability (never both down)

**Ports**:
- Blue: http://nas.keekar.com:3020
- Green: http://nas.keekar.com:3019

**Deployment Pattern**:
```
Month 1:
  Week 1 (1st Sun) → Deploy to Green
  Week 2 (2nd Sun) → Deploy to Blue
  Week 3 (3rd Sun) → Deploy to Green
  Week 4 (4th Sun) → Deploy to Blue
  Week 5 (5th Sun) → Deploy to Green (if exists)
```

### What the TrueNAS build script does

The script lives in **retired/truenas-build/build_on_truenas.sh** (retired from repo root; see [retired/truenas-build/README.md](../retired/truenas-build/README.md)).

The automated build script:

1. **Detects Instance**: Identifies Blue or Green from directory name
2. **Config Persistence**: Verifies config volume is mounted correctly
3. **Version Check**: Compares local, running, and GitHub versions
4. **Smart Build**: Only rebuilds if version changed
5. **Zero Downtime**: Gracefully stops container, rebuilds, starts
6. **Verification**: Checks container is running and healthy

```bash
# Manual deployment
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green
./retired/truenas-build/build_on_truenas.sh

# What happens:
# ✓ Config persistence verified
# ✓ Current version: 1.6.2
# ✓ GitHub version: 1.6.2
# ✓ Versions match - no build needed
```

### Configuration Persistence on TrueNAS

**Config Directory Structure**:
```
/mnt/pool1/Documents/KACI-Apps/
├── OSCAL-Report-Generator-Blue/
│   └── config/
│       └── app/
│           ├── config.json         # Application settings
│           ├── users.json          # User accounts
│           ├── email_blacklist.json
│           └── rate_limit.json
└── OSCAL-Report-Generator-Green/
    └── config/
        └── app/
            ├── config.json
            ├── users.json
            ├── email_blacklist.json
            └── rate_limit.json
```

**Volume Mount**:
```bash
# In retired/truenas-build/build_on_truenas.sh:
-v "${SCRIPT_DIR}/config:/app/config"
```

This ensures:
- ✅ Users persist across rebuilds
- ✅ Settings persist across rebuilds
- ✅ Independent configs for Blue/Green
- ✅ Easy backup/restore

---

## Automated Deployments

### Cron Setup (Monthly Updates)

```bash
# Edit crontab
crontab -e

# Add these lines for monthly staggered updates:
# Green: 1st, 3rd, and 5th Sunday at 2 AM
0 2 1-7,15-21,29-31 * 0 cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green && ./retired/truenas-build/build_on_truenas.sh >> /var/log/oscal-green-deploy.log 2>&1

# Blue: 2nd and 4th Sunday at 2 AM
0 2 8-14,22-28 * 0 cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue && ./retired/truenas-build/build_on_truenas.sh >> /var/log/oscal-blue-deploy.log 2>&1
```

### Cron Syntax Explained

**Green Instance**: `0 2 1-7,15-21,29-31 * 0`
- Minute: `0` (top of hour)
- Hour: `2` (2 AM)
- Day of Month: `1-7,15-21,29-31` (1st, 3rd, 5th week)
- Month: `*` (every month)
- Day of Week: `0` (Sunday)

**Blue Instance**: `0 2 8-14,22-28 * 0`
- Day of Month: `8-14,22-28` (2nd, 4th week)
- All other fields same as Green

### Viewing Deployment Logs

```bash
# Real-time monitoring
tail -f /var/log/oscal-green-deploy.log
tail -f /var/log/oscal-blue-deploy.log

# View last deployment
tail -100 /var/log/oscal-green-deploy.log

# Check cron status
crontab -l
systemctl status cron  # or 'crond' on some systems
```

### Manual Force Rebuild

```bash
# Force rebuild regardless of version
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green
FORCE_BUILD=true ./retired/truenas-build/build_on_truenas.sh

# Or (if implemented)
./retired/truenas-build/build_on_truenas.sh --force
```

### Removing Green (or Blue) to free resources

To stop and remove the **Green** instance on TrueNAS and free Docker resources:

```bash
docker stop oscal-report-generator-green
docker rm oscal-report-generator-green
# Optional: remove image
docker rmi oscal-report-generator:green 2>/dev/null || true
```

The **data-green** directory (config/users) is left in place unless you delete it manually. To bring Green back later, run `./retired/truenas-build/build_on_truenas.sh` again from the Green directory.

For **Blue**, use the same steps with container name `oscal-report-generator-blue` and port 3020.

---

## Configuration Management

### Initial Configuration

After first deployment, configure via web UI:

1. **Access Application**: http://nas.keekar.com:3020 (or :3019)
2. **Default Admin**: 
   - Username: `admin`
   - Password: `admin` (⚠️ Change immediately!)
3. **Configure Settings**:
   - Email/SMTP settings
   - AI integration (optional)
   - Published SOA URL
   - API Gateways

### Configuration Files

**Location**: `config/app/`

**Files**:
```
config.json              # Main application config
users.json               # User accounts (hashed passwords)
email_blacklist.json     # Blocked email domains
rate_limit.json          # API rate limiting rules
```

### Published SOA/CCM uploads (Published_OSCAL)

Uploaded published SOA/CCM JSON files (Platform Settings → Published SOA/CCM URL → upload) are stored in **`backend/Published_OSCAL/`** (next to the app’s `public/` directory, not under it). They are **not** served as static files: access is only via the application API (`GET /api/baseline-report`, `GET /api/published-soa/:filename`), so web crawlers and scanners cannot reach them.

**Restrict directory permissions** so only the application service user can read/write:

```bash
# Example: app runs as svc_ams-oscal
chown -R svc_ams-oscal:svc_ams-oscal backend/Published_OSCAL
chmod 750 backend/Published_OSCAL
```

On first use, the app creates the directory (mode `0750`) and, if present, migrates existing files from `config/app/published-soa/` into `Published_OSCAL/`.

### Backup Configuration

```bash
# Backup (before deployment)
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue
cp -r config config.backup.$(date +%Y%m%d)

# Restore (if needed)
rm -rf config
mv config.backup.20260122 config
docker restart oscal-report-generator-blue
```

### Sensitive settings and pass

Passwords, tokens, and API keys (SMTP password, Slack webhook URL, AI API token, AWS Bedrock keys, SSO client secrets) are stored in the [pass](https://www.passwordstore.org/) password manager. `config.json` holds only pointers, e.g. `{ "_pass": "OSCAL/smtp-password" }`. The app resolves these at runtime and never persists plaintext secrets in config.

**Pass entry names:**

| Setting | Pass entry |
|--------|------------|
| SMTP password | `OSCAL/smtp-password` |
| Slack webhook URL | `OSCAL/slack-webhook-url` |
| AI API token | `OSCAL/ai-api-token` |
| AI AWS Access Key ID | `OSCAL/ai-aws-access-key-id` |
| AI AWS Secret Access Key | `OSCAL/ai-aws-secret-access-key` |
| SSO Azure client secret | `OSCAL/sso-oauth-azure-client-secret` |
| SSO Google client secret | `OSCAL/sso-oauth-google-client-secret` |
| SSO Okta client secret | `OSCAL/sso-oauth-okta-client-secret` |
| SSO GitHub client secret | `OSCAL/sso-oauth-github-client-secret` |

- **Local (laptop):** Install and initialize `pass`; create entries with `pass insert OSCAL/smtp-password` etc. Set `OSCAL_PASS_DISABLED=1` to skip pass (secrets then empty; useful for dev without pass). Optional: `PASSWORD_STORE_DIR` for store location.
- **TrueNAS / Docker:** For pass-backed secrets, either install pass inside the container and mount the host’s `~/.password-store` (or a dedicated store) into the container, or run pass on the host and use a script to inject resolved values. Prefer mounting a volume for `~/.password-store` and running `pass insert OSCAL/...` on the host (or copying the store into the volume).
- **EC2 (direct run):** Pass is set up for the service account `svc_ams-oscal`. Ensure the app runs as that user and config is under `/opt/oscal/data`. Add secrets with `sudo -u svc_ams-oscal pass insert OSCAL/smtp-password` etc. on the instance.

### Environment Variables

For non-pass configuration (e.g. JWT), use environment variables:

```bash
# In .env file (not committed to git)
JWT_SECRET=your_jwt_secret

# In docker run
docker run -d \
  --env-file .env \
  -v $(pwd)/config:/app/config \
  -p 3020:3020 \
  oscal-report-generator:latest
```

Sensitive Platform Settings (SMTP password, AI tokens, SSO client secrets) are stored in pass; see [Sensitive settings and pass](#sensitive-settings-and-pass) above.

---

## Troubleshooting

### Common Issues

#### Issue: Container won't start

```bash
# Check container logs
docker logs oscal-report-generator-green

# Check if port is in use
netstat -tuln | grep 3019
lsof -i :3019

# Remove and recreate
docker stop oscal-report-generator-green
docker rm oscal-report-generator-green
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green
./retired/truenas-build/build_on_truenas.sh
```

#### Issue: Config not persisting

```bash
# Verify volume mount
docker inspect oscal-report-generator-green | grep -A 10 Mounts

# Check config directory permissions
ls -la config/app/
chmod 755 config/app
chmod 644 config/app/*.json

# Verify files exist
cat config/app/users.json
```

#### Issue: Can't access application

```bash
# Check if container is running
docker ps | grep oscal

# Check if service is listening
curl http://localhost:3020/health

# Check firewall
sudo ufw status
sudo ufw allow 3020/tcp
```

#### Issue: Automatic updates not running

```bash
# Verify cron entries
crontab -l | grep oscal

# Check cron logs
grep CRON /var/log/syslog | grep oscal

# Test script manually
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green
./retired/truenas-build/build_on_truenas.sh

# Ensure script is executable
chmod +x retired/truenas-build/build_on_truenas.sh
```

#### Issue: Wrong version deployed

```bash
# Check package.json version
grep '"version"' package.json

# Check git remote
git remote -v

# Force update from GitHub
git fetch origin
git reset --hard origin/main
./retired/truenas-build/build_on_truenas.sh
```

### Health Checks

```bash
# Application health endpoint
curl http://localhost:3020/health

# Docker container health
docker ps --format "table {{.Names}}\t{{.Status}}"

# Check logs for errors
docker logs --tail 100 oscal-report-generator-green | grep -i error

# Check resource usage
docker stats oscal-report-generator-green --no-stream
```

### Performance Issues

```bash
# Check container resources
docker stats --no-stream

# Increase container memory (if needed)
docker run -d \
  --memory="2g" \
  --cpus="2" \
  # ... other options

# Check disk space
df -h
du -sh /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-*
```

---

## Production Checklist

### Pre-Deployment

- [ ] Backup current configuration
- [ ] Review changelog for breaking changes
- [ ] Test in development environment
- [ ] Verify all tests pass
- [ ] Update documentation if needed

### Deployment

- [ ] Deploy to one instance (Blue or Green)
- [ ] Verify deployment successful
- [ ] Test critical functionality
- [ ] Monitor logs for errors
- [ ] Switch traffic if needed

### Post-Deployment

- [ ] Verify application health
- [ ] Check configuration persistence
- [ ] Test user authentication
- [ ] Monitor resource usage
- [ ] Update deployment log

---

## Additional Resources

- **Architecture**: See `docs/ARCHITECTURE.md`
- **Best Practices**: See `docs/BEST_PRACTICES.md`
- **Testing Guide**: See `test_cases/TESTING_GUIDE.md`
- **Validation System**: See `docs/VALIDATION_SYSTEM.md`
- **Dual Repo Setup**: See `docs/DUAL_REPO_SETUP.md`
- **Version History**: See `docs/VERSION_NOTES.md`

---

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review documentation in `docs/` folder
3. Check GitHub issues
4. Contact development team

---

**Last Updated**: January 22, 2026  
**Maintainer**: Mukesh Kesharwani <mkesharw@adobe.com>  
**License**: GPL-3.0-or-later
