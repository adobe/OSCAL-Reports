# 🚀 OSCAL Report Generator - Complete Deployment Guide

**Version**: 1.6.2+  
**Last Updated**: January 2026  
**Author**: Mukesh Kesharwani

---

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Local Development](#local-development)
3. [Docker Deployment](#docker-deployment)
4. [TrueNAS Deployment](#truenas-deployment)
5. [Automated Deployments](#automated-deployments)
6. [Configuration Management](#configuration-management)
7. [Troubleshooting](#troubleshooting)

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
chmod +x build_on_truenas.sh
./build_on_truenas.sh

# Clone Green instance (Port 3019)
cd /mnt/pool1/Documents/KACI-Apps
git clone https://github.com/keekar2022/OSCAL-Reports.git OSCAL-Report-Generator-Green
cd OSCAL-Report-Generator-Green
chmod +x build_on_truenas.sh
./build_on_truenas.sh
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

### What build_on_truenas.sh Does

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
./build_on_truenas.sh

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
# In build_on_truenas.sh:
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
0 2 1-7,15-21,29-31 * 0 cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green && ./build_on_truenas.sh >> /var/log/oscal-green-deploy.log 2>&1

# Blue: 2nd and 4th Sunday at 2 AM
0 2 8-14,22-28 * 0 cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue && ./build_on_truenas.sh >> /var/log/oscal-blue-deploy.log 2>&1
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
FORCE_BUILD=true ./build_on_truenas.sh

# Or modify the script temporarily
./build_on_truenas.sh --force  # (if implemented)
```

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

### Environment Variables

For sensitive configuration, use environment variables:

```bash
# In .env file (not committed to git)
SMTP_PASSWORD=your_smtp_password
JWT_SECRET=your_jwt_secret
AI_API_KEY=your_ai_api_key

# In docker run
docker run -d \
  --env-file .env \
  -v $(pwd)/config:/app/config \
  -p 3020:3020 \
  oscal-report-generator:latest
```

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
./build_on_truenas.sh
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
./build_on_truenas.sh

# Ensure script is executable
chmod +x build_on_truenas.sh
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
./build_on_truenas.sh
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
