# OSCAL Reports Deployment Scripts

This directory contains upgrade and consolidation scripts for Blue-Green deployments.

## 📋 Available Scripts

### 1. `upgrade-blue-deployment.sh`
Upgrades Blue deployment from v1.5.0 to v1.6.5+ with volume persistence.

**What it does:**
- Backs up Blue users and configuration
- Runs build script to upgrade Docker image
- Restores users and configuration to persistent volume
- Verifies volume persistence is enabled

**Usage:**
```bash
cd /Users/mkesharw/Documents/OSCAL_Reports/scripts
./upgrade-blue-deployment.sh
```

**Requirements:**
- Blue container must be running (or at least exist)
- Admin credentials for Blue deployment
- Blue deployment directory path

---

### 2. `upgrade-green-deployment.sh`
Upgrades Green deployment from v1.6.2 to v1.6.5+ with volume persistence.

**What it does:**
- Backs up Green users and configuration
- Runs build script to upgrade Docker image
- Restores users and configuration to persistent volume
- Verifies volume persistence is enabled

**Usage:**
```bash
cd /Users/mkesharw/Documents/OSCAL_Reports/scripts
./upgrade-green-deployment.sh
```

**Requirements:**
- Green container must be running (or at least exist)
- Admin credentials for Green deployment
- Green deployment directory path

---

### 3. `upgrade-both-deployments.sh`
Upgrades BOTH Blue and Green deployments together.

**What it does:**
- Backs up both Blue and Green users and configurations
- Upgrades both deployments sequentially
- Restores users and configurations to persistent volumes
- Verifies volume persistence for both

**Usage:**
```bash
cd /Users/mkesharw/Documents/OSCAL_Reports/scripts
./upgrade-both-deployments.sh
```

**Requirements:**
- Blue and/or Green containers running
- Admin credentials for both deployments
- Blue and Green deployment directory paths

**Benefits:**
- Single script for complete upgrade
- Consistent backup naming
- Consolidated verification

---

### 4. `consolidate-users.sh`
Merges users between Blue and Green deployments after upgrade.

**What it does:**
- Exports users from one or both deployments
- Imports users with duplicate detection
- Preserves existing users (no overwrites)
- Provides bi-directional sync option

**Usage:**
```bash
cd /Users/mkesharw/Documents/OSCAL_Reports/scripts
./consolidate-users.sh
```

**Options:**
1. **Blue → Green**: Merge Blue users into Green
2. **Green → Blue**: Merge Green users into Blue
3. **Bi-directional**: Merge both ways (recommended)

**Requirements:**
- Both containers must be running
- Admin credentials for both deployments
- Volume persistence must be enabled (upgrade first!)

---

## 🚀 Recommended Upgrade Workflow

### Option A: Upgrade One at a Time (Safer)

**Step 1: Upgrade Green first (test deployment)**
```bash
./upgrade-green-deployment.sh
# Test Green thoroughly at http://YOUR_SERVER:3019
```

**Step 2: If Green works, upgrade Blue**
```bash
./upgrade-blue-deployment.sh
# Test Blue at http://YOUR_SERVER:3020
```

**Step 3: Consolidate users**
```bash
./consolidate-users.sh
# Choose option 3 (bi-directional)
```

### Option B: Upgrade Both Together (Faster)

**Step 1: Upgrade both**
```bash
./upgrade-both-deployments.sh
# Follows interactive prompts
```

**Step 2: Consolidate users**
```bash
./consolidate-users.sh
# Choose option 3 (bi-directional)
```

---

## 📂 Backup Locations

All scripts create backups in your home directory:

```
~/oscal-blue-backup-YYYYMMDD-HHMMSS/
├── users.json
├── config.json
└── backup-info.txt

~/oscal-green-backup-YYYYMMDD-HHMMSS/
├── users.json
├── config.json
└── backup-info.txt

~/oscal-backup-YYYYMMDD-HHMMSS/
├── blue/
│   ├── users.json
│   └── config.json
└── green/
    ├── users.json
    └── config.json

~/oscal-user-consolidation-YYYYMMDD-HHMMSS/
├── blue-users.json
└── green-users.json
```

---

## ✅ Pre-Upgrade Checklist

Before running any upgrade script:

- [ ] Verify current deployment versions
  - Blue: v1.5.0 (check at http://YOUR_SERVER:3020)
  - Green: v1.6.2 (check at http://YOUR_SERVER:3019)

- [ ] Have admin credentials ready
  - Blue admin username and password
  - Green admin username and password

- [ ] Know deployment directory paths
  - Blue directory (contains "Blue" in name)
  - Green directory (contains "Green" in name)

- [ ] Check container status
  ```bash
  docker ps | grep oscal
  ```

- [ ] Ensure sufficient disk space
  ```bash
  df -h
  ```

- [ ] Install required tools (if missing)
  ```bash
  # jq for JSON parsing
  sudo apt-get install jq  # Ubuntu/Debian
  # or
  brew install jq  # macOS
  ```

---

## 🔍 Post-Upgrade Verification

After upgrading, verify volume persistence:

### Check Blue:
```bash
curl http://localhost:3020/api/system/volume-status | jq '.persistence'
```

Expected output:
```json
{
  "enabled": true,
  "recommendation": "Volume persistence is properly configured"
}
```

### Check Green:
```bash
curl http://localhost:3019/api/system/volume-status | jq '.persistence'
```

Expected output:
```json
{
  "enabled": true,
  "recommendation": "Volume persistence is properly configured"
}
```

---

## ⚠️ Troubleshooting

### "Authentication failed"
- Check your password carefully
- Try retrieving from container logs:
  ```bash
  docker logs oscal-report-generator-blue | grep Password
  docker logs oscal-report-generator-green | grep Password
  ```

### "Container not found"
- Check container name:
  ```bash
  docker ps -a | grep oscal
  ```
- Containers might be named differently on your system

### "Directory not found"
- Use absolute paths (full path from root)
- Example: `/mnt/pool/oscal/Blue/` not `~/Blue/`

### "Permission denied"
- Make scripts executable:
  ```bash
  chmod +x /Users/mkesharw/Documents/OSCAL_Reports/scripts/*.sh
  ```

### "jq: command not found"
- Install jq:
  ```bash
  # Ubuntu/Debian
  sudo apt-get install jq
  
  # macOS
  brew install jq
  
  # TrueNAS
  pkg install jq
  ```

---

## 📖 Additional Documentation

For more information, see:

- **Migration Guide**: `../docs/DOCKER_VOLUME_MIGRATION.md`
- **Test Guide**: `../docs/VOLUME_PERSISTENCE_TEST_GUIDE.md`
- **Implementation Details**: `../docs/VOLUME_PERSISTENCE_IMPLEMENTATION.md`

---

## 🆘 Support

If you encounter issues:

1. Check container logs:
   ```bash
   docker logs oscal-report-generator-blue
   docker logs oscal-report-generator-green
   ```

2. Check volume status:
   ```bash
   curl http://localhost:3020/api/system/volume-status
   curl http://localhost:3019/api/system/volume-status
   ```

3. Review backup files in `~/oscal-*-backup-*/`

4. Open an issue: https://github.com/keekar2022/OSCAL-Reports/issues

---

**Author:** Mukesh Kesharwani  
**Version:** 1.0.0  
**Last Updated:** January 24, 2026
