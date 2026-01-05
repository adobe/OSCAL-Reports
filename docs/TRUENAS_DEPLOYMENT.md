# TrueNAS Automated Deployment Guide

## Overview

This guide explains how to set up automated Blue-Green deployment for OSCAL Report Generator V2 on TrueNAS with automatic updates from GitHub.

## Blue-Green Deployment Architecture

The system supports two parallel instances running simultaneously with staggered monthly updates:

- **Green Instance**: `OSCAL-Report-Generator-Green` (Port 3019)
  - Updates on: 1st, 3rd, and 5th Sunday of each month
  
- **Blue Instance**: `OSCAL-Report-Generator-Blue` (Port 3020)
  - Updates on: 2nd and 4th Sunday of each month

### Benefits of Staggered Schedule
- **High Availability**: Always have one stable instance running
- **Gradual Rollout**: Test updates on Green before Blue gets them
- **Easy Rollback**: If Green has issues, Blue is still on previous version
- **Reduced Risk**: Never update both instances simultaneously

Each instance:
- Runs independently on different ports
- Auto-detects its configuration based on directory name
- Pulls updates from GitHub on scheduled Sundays
- Only rebuilds when version changes detected

---

## Initial Setup

### 1. Directory Structure on TrueNAS

```bash
/mnt/pool1/Documents/KACI-Apps/
├── OSCAL-Report-Generator-Blue/     # Blue instance (Port 3020)
│   ├── build_on_truenas.sh
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── package.json
│   └── ... (all project files)
└── OSCAL-Report-Generator-Green/    # Green instance (Port 3019)
    ├── build_on_truenas.sh
    ├── Dockerfile
    ├── docker-compose.yml
    ├── package.json
    └── ... (all project files)
```

### 2. Clone Repository to Both Directories

```bash
# SSH into TrueNAS
ssh mkesharw@NAS01

# Navigate to apps directory
cd /mnt/pool1/Documents/KACI-Apps

# Clone for Blue instance
git clone https://github.com/keekar2022/OSCAL-Reports.git OSCAL-Report-Generator-Blue
cd OSCAL-Report-Generator-Blue
git checkout main

# Clone for Green instance
cd ..
git clone https://github.com/keekar2022/OSCAL-Reports.git OSCAL-Report-Generator-Green
cd OSCAL-Report-Generator-Green
git checkout main
```

### 3. Make Scripts Executable

```bash
# Blue instance
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue
chmod +x build_on_truenas.sh

# Green instance
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green
chmod +x build_on_truenas.sh
```

---

## Script Features

### Automatic Detection

The script automatically detects:
- **Which instance** it's running (Blue or Green) based on directory name
- **Current version** from local `package.json`
- **Running container version** from Docker container
- **Remote version** from GitHub repository

### Configuration Per Instance

| Feature | Blue Instance | Green Instance |
|---------|---------------|----------------|
| Directory | `*Blue*` | `*Green*` |
| Container Name | `oscal-report-generator-blue` | `oscal-report-generator-green` |
| Docker Image | `oscal-report-generator:blue` | `oscal-report-generator:green` |
| Port | 3020 | 3019 |

### Build Logic

The script will **only build and deploy** if:
1. Local version ≠ GitHub version, OR
2. Running container version ≠ GitHub version, OR
3. Container is not running, OR
4. `--force` flag is used

If versions match, the script exits with "No action required - system is up to date!"

---

## Manual Deployment

### Deploy Blue Instance

```bash
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue
./build_on_truenas.sh
```

### Deploy Green Instance

```bash
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green
./build_on_truenas.sh
```

### Force Rebuild (Skip Version Check)

```bash
./build_on_truenas.sh --force
```

---

## Automated Deployment with Cron

### Setup Cron Jobs

The recommended schedule staggers updates across both instances for maximum reliability:

```bash
# Edit crontab on TrueNAS
crontab -e

# Add these lines for monthly staggered updates:

# Green instance - 1st, 3rd, and 5th Sunday at 2 AM
0 2 1-7,15-21,29-31 * 0 cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green && ./build_on_truenas.sh >> /var/log/oscal-green-deploy.log 2>&1

# Blue instance - 2nd and 4th Sunday at 2 AM
0 2 8-14,22-28 * 0 cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue && ./build_on_truenas.sh >> /var/log/oscal-blue-deploy.log 2>&1
```

### Understanding the Cron Schedule

The cron syntax `0 2 1-7,15-21,29-31 * 0` means:
- `0` - Minute (at the start of the hour)
- `2` - Hour (2 AM)
- `1-7,15-21,29-31` - Days of month
  - `1-7`: Covers 1st Sunday
  - `15-21`: Covers 3rd Sunday
  - `29-31`: Covers 5th Sunday (if exists)
- `*` - Every month
- `0` - Day of week (0 = Sunday)

### Alternative Time Schedules

If 2 AM doesn't work for you, adjust the hour:

```bash
# 3 AM updates
# Green: 1st, 3rd, 5th Sunday
0 3 1-7,15-21,29-31 * 0 cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green && ./build_on_truenas.sh >> /var/log/oscal-green-deploy.log 2>&1

# Blue: 2nd, 4th Sunday
0 3 8-14,22-28 * 0 cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue && ./build_on_truenas.sh >> /var/log/oscal-blue-deploy.log 2>&1

# Midnight updates
# Green: 1st, 3rd, 5th Sunday
0 0 1-7,15-21,29-31 * 0 cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green && ./build_on_truenas.sh >> /var/log/oscal-green-deploy.log 2>&1

# Blue: 2nd, 4th Sunday
0 0 8-14,22-28 * 0 cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue && ./build_on_truenas.sh >> /var/log/oscal-blue-deploy.log 2>&1
```

### Monthly Update Calendar

| Week | Sunday | Green Updates | Blue Updates |
|------|--------|---------------|--------------|
| 1st  | Days 1-7 | ✅ Yes | ❌ No |
| 2nd  | Days 8-14 | ❌ No | ✅ Yes |
| 3rd  | Days 15-21 | ✅ Yes | ❌ No |
| 4th  | Days 22-28 | ❌ No | ✅ Yes |
| 5th  | Days 29-31 | ✅ Yes (if exists) | ❌ No |

### View Cron Logs

```bash
# Blue instance logs
tail -f /var/log/oscal-blue-deploy.log

# Green instance logs
tail -f /var/log/oscal-green-deploy.log

# Both instances
tail -f /var/log/oscal-*-deploy.log
```

---

## Monitoring and Management

### Check Container Status

```bash
# List running containers
docker ps | grep oscal

# Check specific instance
docker ps | grep oscal-report-generator-blue
docker ps | grep oscal-report-generator-green
```

### View Container Logs

```bash
# Blue instance
docker logs -f oscal-report-generator-blue

# Green instance
docker logs -f oscal-report-generator-green

# Last 50 lines
docker logs --tail 50 oscal-report-generator-blue
```

### Access Container Shell

```bash
# Blue instance
docker exec -it oscal-report-generator-blue sh

# Green instance
docker exec -it oscal-report-generator-green sh
```

### Restart Container

```bash
# Blue instance
docker restart oscal-report-generator-blue

# Green instance
docker restart oscal-report-generator-green
```

### Stop Container

```bash
# Blue instance
docker stop oscal-report-generator-blue

# Green instance
docker stop oscal-report-generator-green
```

---

## Accessing the Applications

### Blue Instance
- **URL**: http://NAS01:3020
- **Health Check**: http://NAS01:3020/health

### Green Instance
- **URL**: http://NAS01:3019
- **Health Check**: http://NAS01:3019/health

### From Network

Replace `NAS01` with your TrueNAS IP address:
- Blue: http://YOUR_NAS_IP:3020
- Green: http://YOUR_NAS_IP:3019

---

## Deployment Workflow

### Monthly Schedule Overview

```
Month View:
┌────────────────────────────────────────────────────────────┐
│  Week 1 (Days 1-7):    GREEN updates on 1st Sunday        │
│  Week 2 (Days 8-14):   BLUE updates on 2nd Sunday         │
│  Week 3 (Days 15-21):  GREEN updates on 3rd Sunday        │
│  Week 4 (Days 22-28):  BLUE updates on 4th Sunday         │
│  Week 5 (Days 29-31):  GREEN updates on 5th Sunday (rare) │
└────────────────────────────────────────────────────────────┘
```

### Execution Workflow (Each Scheduled Sunday)

```
┌─────────────────────────────────────────────────────────┐
│  Cron triggers build_on_truenas.sh on scheduled Sunday  │
│  Green: 1st, 3rd, 5th Sunday                            │
│  Blue:  2nd, 4th Sunday                                 │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│  Detect deployment instance (Blue/Green)                │
│  Set: Port, Container Name, Docker Image                │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│  Pull latest code from GitHub (main branch)             │
│  Using existing cloned repository                       │
│  Get versions:                                           │
│  - Current deployed (package.json)                      │
│  - Running container (docker exec)                      │
│  - Remote GitHub (origin/main)                          │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│  Compare Versions                                        │
│  If same → Exit (No action needed)                      │
│  If different → Continue                                 │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│  Build new Docker image                                  │
│  Tag: oscal-report-generator:blue/green                 │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│  Stop existing container (if running)                    │
│  Remove old container                                    │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│  Start new container                                     │
│  - Mount config volume                                   │
│  - Mount logs volume                                     │
│  - Set environment variables                             │
│  - Expose port (3020 or 3019)                           │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│  Health check & cleanup                                  │
│  - Test /health endpoint                                 │
│  - Remove dangling images                                │
│  - Log deployment summary                                │
└─────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### Script Fails to Fetch from Git

```bash
# Check Git configuration
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue
git remote -v

# Reset Git remote
git remote set-url origin https://github.com/keekar2022/OSCAL-Reports.git

# Manual fetch
git fetch origin main
```

### Container Won't Start

```bash
# Check Docker logs
docker logs oscal-report-generator-blue

# Check if port is already in use
netstat -tuln | grep 3020

# Check Docker service
docker ps -a | grep oscal
```

### Version Comparison Not Working

```bash
# Manually check versions
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue
grep '"version"' package.json

# Check container version
docker exec oscal-report-generator-blue cat /app/package.json | grep version
```

### Cron Job Not Running

```bash
# Check cron service status
service cron status

# Check cron logs
tail -f /var/log/cron

# Test script manually
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue
./build_on_truenas.sh
```

### Script Shows "No Action Required" But Container Not Running

```bash
# Force rebuild
./build_on_truenas.sh --force

# Check if container exists but stopped
docker ps -a | grep oscal-report-generator-blue

# Start existing container
docker start oscal-report-generator-blue
```

---

## Best Practices

### 1. Staggered Monthly Updates
The recommended approach staggers updates across different Sundays:
- **Green**: Updates on 1st, 3rd, and 5th Sunday (test/canary instance)
- **Blue**: Updates on 2nd and 4th Sunday (production instance)
- **Benefit**: Always have one stable instance running while the other updates

### 2. Monitor Logs
Set up log rotation for deployment logs:
```bash
# /etc/logrotate.d/oscal-deploy
/var/log/oscal-*-deploy.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
}
```

### 3. Health Monitoring
Consider setting up monitoring for the health endpoints:
```bash
# Add to cron for alerts
*/5 * * * * curl -f http://localhost:3020/health || echo "Blue instance down!" | mail -s "OSCAL Blue Alert" admin@example.com
```

### 4. Backup Strategy
Before automated deployments, ensure you have backups:
```bash
# Backup config directory
cd /mnt/pool1/Documents/KACI-Apps
tar -czf oscal-config-backup-$(date +%Y%m%d).tar.gz \
  OSCAL-Report-Generator-Blue/config \
  OSCAL-Report-Generator-Green/config
```

---

## Security Considerations

### 1. Git Access
The script uses HTTPS for Git access. For private repositories, configure Git credentials:
```bash
# Using Git credential helper
git config --global credential.helper store

# Or use SSH keys
git remote set-url origin git@github.com:keekar2022/OSCAL-Reports.git
```

### 2. Docker Security
Run containers with proper security:
```bash
# Add security options to docker run command in script:
--security-opt no-new-privileges \
--read-only \
--tmpfs /tmp \
--tmpfs /app/logs
```

### 3. Network Isolation
Consider using Docker networks for isolation:
```bash
docker network create oscal-network
# Update script to use: --network oscal-network
```

---

## Support

For issues or questions:
- GitHub Issues: https://github.com/keekar2022/OSCAL-Reports/issues
- Email: mukesh.kesharwani@adobe.com
- Documentation: See `docs/` directory

---

**Version**: 1.3.0  
**Last Updated**: 2025-12-29  
**Maintained By**: Mukesh Kesharwani

