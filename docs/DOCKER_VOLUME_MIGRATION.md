# Docker Volume Migration Guide

**Protecting Your Configuration and User Data Across Container Updates**

---

## Table of Contents

1. [Overview](#overview)
2. [The Problem](#the-problem)
3. [The Solution](#the-solution)
4. [Quick Start](#quick-start)
5. [Deployment Methods](#deployment-methods)
6. [Migration Scenarios](#migration-scenarios)
7. [User Import/Export](#user-importexport)
8. [Verification](#verification)
9. [Troubleshooting](#troubleshooting)
10. [Backup and Recovery](#backup-and-recovery)

---

## Overview

Starting with version **1.6.5**, the OSCAL Report Generator implements **persistent volume storage** to prevent data loss during Docker updates. This ensures that your:

- **User accounts and passwords** are preserved
- **Configuration settings** (email, AI, API gateways) persist
- **User activity history** is maintained

All data is now stored in a Docker volume mounted at `/data` instead of inside the container.

---

## The Problem

### Before Volume Persistence (≤ v1.6.4)

When you updated your Docker container:

```bash
docker pull keekar/oscal_reports:latest
docker stop oscal-report-generator
docker rm oscal-report-generator
docker run ... keekar/oscal_reports:latest
```

**Result:** ❌ All users and configuration were reset to defaults!

### Why This Happened

- `config.json` and `users.json` were stored **inside** the container at `/app/config/app/`
- When you deleted the old container, these files were deleted too
- The new container started with fresh default files

---

## The Solution

### After Volume Persistence (≥ v1.6.5)

The application now uses a **Docker volume** mounted to `/data`:

```
Host Machine                Container
┌─────────────┐            ┌──────────────────┐
│ Docker      │            │                  │
│ Volume      │  ========> │ /data/           │
│ (persistent)│            │ ├─ config.json   │
│             │            │ └─ users.json    │
└─────────────┘            │                  │
                           │ /app/            │
                           │ (application)    │
                           └──────────────────┘
```

**Result:** ✅ Data persists across container recreations!

### How It Works

1. **Entrypoint Script**: On container start, checks if `/data/config.json` and `/data/users.json` exist
2. **Initialization**: If files don't exist, copies defaults from the image
3. **Preservation**: If files exist, uses them (never overwrites)
4. **Symbolic Links**: Creates links from `/app/config/app/` to `/data/` for backward compatibility

---

## Quick Start

### New Installations (v1.6.5+)

If you're starting fresh with the latest version, persistence is automatic!

#### Using Docker Compose (Recommended)

```bash
# Download the updated docker-compose.yml
wget https://raw.githubusercontent.com/keekar2022/OSCAL-Reports/main/docker-compose.yml

# Start the services
docker-compose up -d

# Verify volume is created
docker volume ls | grep oscal-config-data
```

#### Using Docker Run

```bash
docker run -d \
  --name oscal-report-generator \
  -p 3020:3020 \
  -v oscal-config-data:/data \
  -e OLLAMA_URL=http://host.docker.internal:11434 \
  keekar/oscal_reports:latest
```

### Check Volume Status

Access the health check endpoint:

```bash
curl http://localhost:3020/api/system/volume-status
```

Or visit: `http://your-server:3020/api/system/volume-status` in your browser

---

## Deployment Methods

### Method 1: Docker Compose (Recommended)

**Updated docker-compose.yml:**

```yaml
version: '3.8'

services:
  oscal-generator:
    image: keekar/oscal_reports:latest
    container_name: oscal-report-generator
    restart: unless-stopped
    ports:
      - "3020:3020"
    volumes:
      # Persistent volume for config and user data
      - oscal-config-data:/data
    environment:
      - NODE_ENV=production
      - PORT=3020
      - OLLAMA_URL=http://ollama:11434

volumes:
  oscal-config-data:
    driver: local
```

**Commands:**

```bash
# Update to latest version
docker-compose pull
docker-compose up -d

# View logs
docker-compose logs -f oscal-generator
```

### Method 2: Docker Run

**With named volume:**

```bash
docker run -d \
  --name oscal-report-generator \
  --restart unless-stopped \
  -p 3020:3020 \
  -v oscal-config-data:/data \
  -e NODE_ENV=production \
  -e PORT=3020 \
  -e OLLAMA_URL=http://host.docker.internal:11434 \
  keekar/oscal_reports:latest
```

**With host directory (for easier backup):**

```bash
# Create host directory
mkdir -p /opt/oscal-data

# Run container
docker run -d \
  --name oscal-report-generator \
  --restart unless-stopped \
  -p 3020:3020 \
  -v /opt/oscal-data:/data \
  -e NODE_ENV=production \
  keekar/oscal_reports:latest
```

### Method 3: TrueNAS SCALE

1. **Navigate to**: Apps → Discover Apps → Custom App
2. **Application Name**: `oscal-report-generator`
3. **Image Repository**: `keekar/oscal_reports`
4. **Image Tag**: `latest`
5. **Port Forwarding**:
   - Container Port: `3020`
   - Node Port: `3020` (or your preferred port)
6. **Storage (CRITICAL)**:
   - Type: `Host Path Volume`
   - Mount Path: `/data`
   - Host Path: `/mnt/pool-name/oscal-data` (choose a location on your pool)
   - Click "Add" to save
7. **Environment Variables**:
   - `OLLAMA_URL`: `http://your-truenas-ip:11434`
8. Click **Install**

### Method 4: Kubernetes/Helm

**With PersistentVolumeClaim:**

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: oscal-config-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: oscal-report-generator
spec:
  replicas: 1
  selector:
    matchLabels:
      app: oscal-report-generator
  template:
    metadata:
      labels:
        app: oscal-report-generator
    spec:
      containers:
      - name: oscal-generator
        image: keekar/oscal_reports:latest
        ports:
        - containerPort: 3020
        volumeMounts:
        - name: config-storage
          mountPath: /data
        env:
        - name: NODE_ENV
          value: "production"
      volumes:
      - name: config-storage
        persistentVolumeClaim:
          claimName: oscal-config-pvc
```

---

## Migration Scenarios

### Scenario 1: Migrating from v1.6.4 or Earlier (No Volume)

**If you can still access your old container:**

#### Step 1: Export Users (Before Stopping)

```bash
# Get your admin token
TOKEN=$(curl -X POST http://localhost:3020/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin#23012507"}' \
  | jq -r '.token')

# Export users to file
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3020/api/users/export > users-backup.json

echo "✅ Users exported to users-backup.json"
```

#### Step 2: Export Configuration (Manual Backup)

```bash
# Copy config from running container
docker cp oscal-report-generator:/app/config/app/config.json config-backup.json

echo "✅ Config exported to config-backup.json"
```

#### Step 3: Update Container with Volume

```bash
# Stop and remove old container
docker stop oscal-report-generator
docker rm oscal-report-generator

# Pull latest image
docker pull keekar/oscal_reports:latest

# Start with volume
docker run -d \
  --name oscal-report-generator \
  -p 3020:3020 \
  -v oscal-config-data:/data \
  -e OLLAMA_URL=http://host.docker.internal:11434 \
  keekar/oscal_reports:latest

# Wait for startup
sleep 10
```

#### Step 4: Restore Configuration

```bash
# Copy config into volume
docker cp config-backup.json oscal-report-generator:/data/config.json

# Restart container to load new config
docker restart oscal-report-generator
```

#### Step 5: Import Users

```bash
# Login with default credentials
TOKEN=$(curl -X POST http://localhost:3020/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin#<current_date>"}' \
  | jq -r '.token')

# Import users
curl -X POST http://localhost:3020/api/users/import \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @users-backup.json

echo "✅ Migration complete!"
```

### Scenario 2: Starting Fresh (Lost Data)

If you've already updated and lost your data:

1. **Start with volume** (use Quick Start guide above)
2. **Create new admin account** with default credentials
3. **Reconfigure** email, AI, and other settings via UI
4. **Re-create user accounts** manually or ask users to self-register

**Important:** From now on, your data will persist!

### Scenario 3: Multiple Containers (Consolidation)

If you're running multiple instances and want to merge user databases:

#### Container 1: Export Users

```bash
curl -H "Authorization: Bearer $TOKEN1" \
  http://container1:3020/api/users/export > container1-users.json
```

#### Container 2: Import Users

```bash
curl -X POST http://container2:3020/api/users/import \
  -H "Authorization: Bearer $TOKEN2" \
  -H "Content-Type: application/json" \
  -d @container1-users.json
```

**Result:** Container 2 now has users from both containers (no duplicates)

---

## User Import/Export

### Export Users API

**Endpoint:** `GET /api/users/export`  
**Authentication:** Platform Admin required  
**Description:** Exports all users including hashed passwords for migration

**Example:**

```bash
curl -H "Authorization: Bearer $YOUR_TOKEN" \
  http://localhost:3020/api/users/export > users-export.json
```

**Response:**

```json
{
  "exportedAt": "2026-01-23T10:30:00.000Z",
  "exportedBy": "admin",
  "version": "1.0",
  "userCount": 8,
  "users": [
    {
      "id": "f2ae7c44-34d7-430a-a3df-47c99debcff9",
      "username": "admin",
      "password": "pbkdf2$sha256$100000$...",
      "email": "admin@example.com",
      "role": "Platform Admin",
      "fullName": "Platform Administrator",
      "createdAt": "2025-12-20T08:23:47.588Z",
      "isActive": true
    }
    // ... more users
  ]
}
```

### Import Users API

**Endpoint:** `POST /api/users/import`  
**Authentication:** Platform Admin required  
**Query Parameters:**
- `mode=merge` (default): Skip users with duplicate IDs/usernames
- `mode=override`: Update existing users, create new ones

**Example (Merge Mode):**

```bash
curl -X POST 'http://localhost:3020/api/users/import?mode=merge' \
  -H "Authorization: Bearer $YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d @users-export.json
```

**Example (Override Mode):**

```bash
curl -X POST 'http://localhost:3020/api/users/import?mode=override' \
  -H "Authorization: Bearer $YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d @users-export.json
```

**Response:**

```json
{
  "success": true,
  "message": "Import complete: 5 added, 0 updated, 3 skipped",
  "results": {
    "mode": "merge",
    "total": 8,
    "added": 5,
    "updated": 0,
    "skipped": 3,
    "conflicts": [
      {
        "reason": "id_exists",
        "id": "f2ae7c44-34d7-430a-a3df-47c99debcff9",
        "username": "admin"
      }
    ],
    "addedUsers": [
      { "id": "...", "username": "user1" }
    ],
    "skippedUsers": [
      { "username": "admin", "reason": "User ID already exists" }
    ]
  }
}
```

---

## Verification

### Check Volume Status Endpoint

**Endpoint:** `GET /api/system/volume-status`  
**Authentication:** Optional (more details if authenticated as admin)

```bash
curl http://localhost:3020/api/system/volume-status | jq
```

**Expected Response (Good):**

```json
{
  "timestamp": "2026-01-23T10:45:00.000Z",
  "volumeMount": {
    "path": "/data",
    "exists": true,
    "writable": true,
    "type": "directory"
  },
  "config": {
    "path": "/data/config.json",
    "exists": true,
    "size": 1234,
    "lastModified": "2026-01-23T10:30:00.000Z"
  },
  "users": {
    "path": "/data/users.json",
    "exists": true,
    "size": 5678,
    "lastModified": "2026-01-23T10:35:00.000Z",
    "userCount": 8
  },
  "persistence": {
    "enabled": true,
    "recommendation": "Volume persistence is properly configured"
  }
}
```

**Bad Response (Volume Not Mounted):**

```json
{
  "persistence": {
    "enabled": false,
    "recommendation": "No persistent volume detected. Data will be lost on container updates. Mount a volume to /data"
  }
}
```

### Manual Verification

```bash
# Inspect container to check volume mount
docker inspect oscal-report-generator | jq '.[0].Mounts'

# Should show:
# [
#   {
#     "Type": "volume",
#     "Name": "oscal-config-data",
#     "Source": "/var/lib/docker/volumes/oscal-config-data/_data",
#     "Destination": "/data",
#     "Driver": "local",
#     "Mode": "z",
#     "RW": true,
#     "Propagation": ""
#   }
# ]

# Check files inside volume
docker exec oscal-report-generator ls -lh /data

# Should show:
# -rw------- 1 node node 1.2K Jan 23 10:30 config.json
# -rw------- 1 node node 5.5K Jan 23 10:35 users.json
```

### Test Update Scenario

```bash
# 1. Create a test user
TOKEN=$(curl -X POST http://localhost:3020/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin#..."}' | jq -r '.token')

curl -X POST http://localhost:3020/api/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser@example.com","email":"testuser@example.com","role":"User","fullName":"Test User"}'

# 2. Recreate container
docker stop oscal-report-generator
docker rm oscal-report-generator
docker run -d --name oscal-report-generator -p 3020:3020 \
  -v oscal-config-data:/data keekar/oscal_reports:latest

# 3. Check if user still exists
sleep 10
TOKEN=$(curl -X POST http://localhost:3020/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin#..."}' | jq -r '.token')

curl -H "Authorization: Bearer $TOKEN" http://localhost:3020/api/users | jq '.[] | select(.username=="testuser@example.com")'

# ✅ If you see the test user, persistence is working!
```

---

## Troubleshooting

### Problem: "Data directory is not writable"

**Symptom:** Container logs show:
```
❌ ERROR: /data is not writable!
```

**Solution:**

```bash
# Check permissions on host
docker volume inspect oscal-config-data

# Remove and recreate volume
docker volume rm oscal-config-data
docker volume create oscal-config-data

# Restart container
docker restart oscal-report-generator
```

### Problem: "Files not using volume"

**Symptom:** `volume-status` shows files at `/app/config/app/` instead of `/data`

**Solution:**

```bash
# Entrypoint script may not have run. Check logs:
docker logs oscal-report-generator | head -20

# Should see:
# ✅ Data directory: /data (writable)
# ✅ Using existing config.json from volume

# If not, restart container:
docker restart oscal-report-generator
```

### Problem: "Users lost after update"

**Symptom:** After pulling new image, users are reset

**Cause:** Volume not properly mounted

**Solution:**

```bash
# Check if volume is mounted
docker inspect oscal-report-generator | jq '.[0].Mounts'

# If no volume mount, stop and recreate with volume:
docker stop oscal-report-generator
docker rm oscal-report-generator
docker run -d --name oscal-report-generator -p 3020:3020 \
  -v oscal-config-data:/data keekar/oscal_reports:latest
```

### Problem: "Permission denied" on volume

**TrueNAS/Host Path Specific:**

```bash
# Set correct permissions on host path
chmod 755 /mnt/pool-name/oscal-data
chown 1000:1000 /mnt/pool-name/oscal-data

# Restart TrueNAS app
```

### Problem: Import fails with "username_exists"

**Symptom:**
```json
{
  "conflicts": [
    {"reason": "username_exists", "username": "admin"}
  ]
}
```

**Explanation:** Import in `merge` mode skips existing users to avoid overwriting

**Solution 1:** Use `override` mode to update existing users:
```bash
curl -X POST 'http://localhost:3020/api/users/import?mode=override' ...
```

**Solution 2:** Manually remove conflicting users first, then import

---

## Backup and Recovery

### Manual Backup

#### Backup Volume Data

```bash
# Using docker cp
docker cp oscal-report-generator:/data ./backup-$(date +%Y%m%d)

# Or backup the volume directly
docker run --rm -v oscal-config-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/oscal-backup-$(date +%Y%m%d).tar.gz -C /data .
```

#### Restore from Backup

```bash
# Extract backup into volume
docker run --rm -v oscal-config-data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/oscal-backup-20260123.tar.gz -C /data

# Restart container
docker restart oscal-report-generator
```

### Automated Backup Script

```bash
#!/bin/bash
# backup-oscal.sh

BACKUP_DIR="/backups/oscal"
DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/oscal-backup-$DATE.tar.gz"

mkdir -p "$BACKUP_DIR"

docker run --rm \
  -v oscal-config-data:/data \
  -v "$BACKUP_DIR":/backup \
  alpine tar czf "/backup/oscal-backup-$DATE.tar.gz" -C /data .

echo "✅ Backup created: $BACKUP_FILE"

# Keep only last 7 days of backups
find "$BACKUP_DIR" -name "oscal-backup-*.tar.gz" -mtime +7 -delete
```

**Setup cron job:**

```bash
# Add to crontab (daily at 2 AM)
0 2 * * * /path/to/backup-oscal.sh >> /var/log/oscal-backup.log 2>&1
```

### Disaster Recovery

If you lose your container and volume:

1. **Restore from backup** (see above)
2. **Restore from exported files** (if you have `users-backup.json` and `config-backup.json`)
3. **Start fresh** (last resort)

---

## Best Practices

1. **Always use volumes** - Never run without `-v` flag
2. **Regular backups** - Automate daily backups of the `/data` volume
3. **Test restore** - Periodically verify backups can be restored
4. **Export before major updates** - Use API to export users before upgrading
5. **Monitor volume status** - Check `/api/system/volume-status` regularly
6. **Separate volumes per instance** - Each container should have its own volume
7. **Document your setup** - Keep notes on which volume goes with which instance

---

## Support

If you encounter issues:

1. **Check logs**: `docker logs oscal-report-generator`
2. **Check volume status**: `curl http://localhost:3020/api/system/volume-status`
3. **Review this guide**: Especially the Troubleshooting section
4. **Open an issue**: https://github.com/keekar2022/OSCAL-Reports/issues

---

## Version History

- **v1.6.5** - Volume persistence introduced
- **v1.6.4 and earlier** - No volume persistence (data lost on updates)

---

**Author:** Mukesh Kesharwani  
**License:** GPL-3.0-or-later  
**Last Updated:** January 23, 2026
