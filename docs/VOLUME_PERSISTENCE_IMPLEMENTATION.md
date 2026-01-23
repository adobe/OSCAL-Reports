# Docker Volume Persistence Implementation Summary

**Version:** 1.6.5  
**Implementation Date:** January 23, 2026  
**Author:** Mukesh Kesharwani

---

## Overview

This document summarizes the implementation of persistent Docker volumes to prevent data loss during container updates. The solution ensures that user accounts, configuration settings, and activity history are preserved across container recreations.

---

## Problem Statement

### Before Implementation (≤ v1.6.4)

Users experienced data loss when updating containers:

- **User accounts reset** to defaults
- **Configuration settings lost** (email, AI, API gateways)
- **Activity history erased**

**Root Cause:** Configuration and user files (`config.json`, `users.json`) were stored inside the container at `/app/config/app/`, which is ephemeral and deleted when containers are removed.

---

## Solution Architecture

### Key Components

1. **Docker Volume Mount**: `/data` directory for persistent storage
2. **Entrypoint Script**: Initializes files on first run, preserves existing files
3. **Path Priority System**: Application checks `/data` first, fallback to legacy paths
4. **Import/Export APIs**: Enables user migration between containers
5. **Volume Status Endpoint**: Provides diagnostics and verification

### Data Flow

```
Container Start
      ↓
Entrypoint Script Runs
      ↓
Check: /data/config.json exists?
      ↓
    Yes → Use existing (preserve)
    No  → Copy default (initialize)
      ↓
Create symbolic links:
  /app/config/app/config.json → /data/config.json
  /app/config/app/users.json → /data/users.json
      ↓
Application Starts
      ↓
Reads from /data via symlinks
      ↓
Data persists in volume
```

---

## Implementation Details

### 1. Docker Entrypoint Script

**File:** `docker-entrypoint.sh`

**Responsibilities:**
- Check if `/data` directory exists and is writable
- Initialize `config.json` and `users.json` if missing
- Preserve existing files (never overwrite)
- Create symbolic links for backward compatibility
- Set proper file permissions (600 for security)
- Display volume status information

**Key Logic:**

```bash
if [ ! -f /data/config.json ]; then
  echo "📝 Initializing config.json from defaults..."
  cp /app/backend/config.json /data/config.json
else
  echo "✅ Using existing config.json from volume"
fi
```

### 2. Dockerfile Changes

**File:** `Dockerfile`

**Changes:**
- Added `COPY docker-entrypoint.sh /usr/local/bin/`
- Declared `VOLUME ["/data"]` for persistence
- Set `ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]`
- Modified `CMD` to be passed through entrypoint

### 3. Docker Compose Configuration

**File:** `docker-compose.yml`

**Changes:**
- Added volume mount: `- oscal-config-data:/data`
- Declared named volume: `oscal-config-data` with local driver

### 4. Application Path Updates

#### Config Manager (`backend/configManager.js`)

**Changes:**
- Added `getConfigPath()` function with priority:
  1. `process.env.CONFIG_PATH` (custom override)
  2. `/data/config.json` (volume - preferred)
  3. `config/app/config.json` (legacy)
  4. `backend/config.json` (original)
- Updated all file operations to use `getConfigPath()`
- Added logging to show which path is being used

#### User Manager (`backend/auth/userManager.js`)

**Changes:**
- Added `getUsersPath()` function with same priority system
- Updated `loadUsers()` and `saveUsers()` to use dynamic paths
- Removed legacy migration code (no longer needed)

### 5. Import/Export API Endpoints

**File:** `backend/server.js`

#### Export Endpoint

**Route:** `GET /api/users/export`  
**Authentication:** Platform Admin required

**Features:**
- Exports all users including hashed passwords
- Includes metadata (timestamp, version, count)
- Preserves PBKDF2 password hashes for security

**Response:**

```json
{
  "exportedAt": "2026-01-23T10:30:00.000Z",
  "exportedBy": "admin",
  "version": "1.0",
  "userCount": 8,
  "users": [...]
}
```

#### Import Endpoint

**Route:** `POST /api/users/import`  
**Authentication:** Platform Admin required  
**Modes:** `merge` (default) or `override`

**Features:**
- **Merge Mode**: Skips users with duplicate IDs/usernames
- **Override Mode**: Updates existing users, creates new ones
- Detailed result reporting (added, updated, skipped, conflicts)
- Preserves password hashes (no plaintext)

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
    "conflicts": [...],
    "addedUsers": [...],
    "skippedUsers": [...]
  }
}
```

### 6. Volume Status Endpoint

**File:** `backend/server.js`

**Route:** `GET /api/system/volume-status`  
**Authentication:** Optional (more details if admin)

**Features:**
- Checks if `/data` exists and is writable
- Shows config and users file locations
- Reports file sizes and last modified timestamps
- Provides persistence recommendations
- Shows disk usage (admin only)
- Counts users (admin only)

**Response:**

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

### 7. Build Script Updates

**File:** `build_on_truenas.sh`

**Changes:**
- Added `DATA_VOLUME_BASE` configuration variable
- Created separate volumes for Blue/Green deployments
- Ensured volume directories exist before container start
- Updated `docker run` command to mount `/data` volume
- Removed old `/app/config` volume mount (no longer needed)
- Added volume verification section at end
- Displayed volume paths and backup instructions

---

## Documentation

### Created Documentation

1. **DOCKER_VOLUME_MIGRATION.md** (1000+ lines)
   - Comprehensive migration guide
   - Deployment method instructions
   - API usage examples
   - Troubleshooting section
   - Backup and recovery procedures

2. **VOLUME_PERSISTENCE_TEST_GUIDE.md** (600+ lines)
   - 5 test scenarios with step-by-step instructions
   - Automated test script
   - Validation checklist
   - Troubleshooting for failed tests

3. **VOLUME_PERSISTENCE_IMPLEMENTATION.md** (this document)
   - Implementation summary
   - Technical details
   - Migration paths

---

## Backward Compatibility

The implementation maintains full backward compatibility:

1. **Existing deployments without volumes**: Continue to work (use legacy paths)
2. **No breaking API changes**: All existing endpoints work unchanged
3. **Environment variable overrides**: Allow custom paths via `CONFIG_PATH` and `USERS_PATH`
4. **Graceful fallback**: If `/data` not available, uses old paths
5. **Idempotent entrypoint**: Safe to run multiple times

---

## Security Considerations

1. **File Permissions**: Volume files set to 600 (owner read/write only)
2. **Password Hashes**: Export maintains PBKDF2 hashes (no plaintext)
3. **Admin-Only APIs**: Import/export require Platform Admin authentication
4. **Rate Limiting**: Already in place on registration endpoints
5. **Audit Trail**: All import/export operations logged with username

---

## Performance Impact

- **Negligible**: Symbolic links have no performance overhead
- **Fast startup**: Entrypoint script runs in <1 second
- **No API latency**: Path lookup cached in memory
- **Efficient I/O**: Atomic writes prevent corruption

---

## Migration Paths

### For New Users (v1.6.5+)

✅ **Automatic**: Just use docker-compose.yml or mount `-v volume:/data`

### For Existing Users (v1.6.4 or earlier)

**Option 1: With Current Data Access**

1. Export users via API before stopping container
2. Backup config file from container
3. Update with volume mount
4. Restore config and import users

**Option 2: Without Current Data Access**

1. Start fresh with volume mount
2. Reconfigure settings via UI
3. Recreate user accounts manually

### For Multiple Containers

1. Export users from Container 1
2. Import into Container 2 with merge mode
3. Result: Combined user database, no duplicates

---

## Testing Strategy

Comprehensive test coverage includes:

1. **Fresh Installation Test**: Verify default file creation
2. **Update Persistence Test**: Verify data survives container recreation
3. **Multi-Container Test**: Verify import/export functionality
4. **Volume Status Test**: Verify diagnostic endpoint accuracy
5. **Backup/Restore Test**: Verify manual backup procedures

See `VOLUME_PERSISTENCE_TEST_GUIDE.md` for detailed test scripts.

---

## Deployment Recommendations

### For Docker Compose Users

```yaml
volumes:
  - oscal-config-data:/data  # Named volume (recommended)
```

### For Docker Run Users

```bash
docker run -v oscal-config-data:/data ...  # Named volume
# OR
docker run -v /host/path:/data ...  # Host path (easier backup)
```

### For TrueNAS SCALE Users

- Configure **Host Path Volume** in app settings
- Mount to `/data` in container
- Use a path on your TrueNAS pool (e.g., `/mnt/tank/oscal-data`)

### For Kubernetes Users

- Create **PersistentVolumeClaim** (1Gi recommended)
- Mount to `/data` in pod spec
- Use storage class with backup support

---

## Monitoring and Maintenance

### Daily Checks

```bash
# Check volume status
curl http://localhost:3020/api/system/volume-status

# Check container logs
docker logs oscal-report-generator | grep "Data directory"
```

### Weekly Tasks

```bash
# Backup volume
docker run --rm -v oscal-config-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/oscal-backup-$(date +%Y%m%d).tar.gz -C /data .
```

### Monthly Tasks

```bash
# Verify backup restoration works
# Export users as JSON backup
# Review disk usage
```

---

## Troubleshooting Guide

### Issue: "Data directory is not writable"

**Symptoms:** Container fails to start  
**Solution:** Check volume permissions, recreate volume

### Issue: "Files not using volume"

**Symptoms:** volume-status shows `/app/config/app/` paths  
**Solution:** Restart container to run entrypoint script

### Issue: "Users lost after update"

**Symptoms:** All users reset to defaults  
**Solution:** Volume not mounted, add `-v` flag

See `DOCKER_VOLUME_MIGRATION.md` for complete troubleshooting section.

---

## Future Enhancements

Potential improvements for future versions:

1. **External Database Support**: PostgreSQL/MySQL option for user storage
2. **Automatic Backup**: Built-in scheduled backups to S3/cloud storage
3. **Multi-Instance Sync**: Real-time user sync between containers
4. **Encryption**: Encrypted volume support for sensitive data
5. **LDAP/AD Integration**: External authentication with local caching

---

## Success Metrics

After implementation, users should experience:

- ✅ **0% data loss** during container updates
- ✅ **Seamless upgrades** with no manual intervention
- ✅ **User confidence** in data persistence
- ✅ **Flexible deployment** across platforms
- ✅ **Easy migration** between environments

---

## Files Modified/Created

### Created Files

1. `docker-entrypoint.sh` - Volume initialization script
2. `docs/DOCKER_VOLUME_MIGRATION.md` - Migration guide
3. `docs/VOLUME_PERSISTENCE_TEST_GUIDE.md` - Test documentation
4. `docs/VOLUME_PERSISTENCE_IMPLEMENTATION.md` - This document

### Modified Files

1. `Dockerfile` - Added entrypoint and volume declaration
2. `docker-compose.yml` - Added volume configuration
3. `backend/configManager.js` - Dynamic path resolution
4. `backend/auth/userManager.js` - Dynamic path resolution
5. `backend/server.js` - Added 3 new API endpoints
6. `build_on_truenas.sh` - Volume support and verification

---

## Version Compatibility

| Version | Volume Support | Notes |
|---------|----------------|-------|
| ≤ v1.6.4 | ❌ No | Data lost on updates |
| ≥ v1.6.5 | ✅ Yes | Persistent storage |

---

## Support and Resources

- **Migration Guide**: `docs/DOCKER_VOLUME_MIGRATION.md`
- **Test Guide**: `docs/VOLUME_PERSISTENCE_TEST_GUIDE.md`
- **API Documentation**: See volume-status and import/export endpoints
- **GitHub Issues**: https://github.com/keekar2022/OSCAL-Reports/issues

---

## Conclusion

The Docker volume persistence implementation provides a robust solution to data loss during container updates. With comprehensive testing, documentation, and backward compatibility, users can confidently upgrade and manage their OSCAL Report Generator deployments across various platforms.

**Key Benefits:**

- 🔒 Data persists across updates
- 🚀 Easy migration between containers
- 📊 Volume diagnostics and monitoring
- 🔄 Import/export for multi-instance setups
- 📚 Comprehensive documentation and testing

---

**Implementation Status:** ✅ Complete  
**Deployment Ready:** Yes  
**Next Version:** 1.6.5 (with volume persistence)

---

**Author:** Mukesh Kesharwani  
**Copyright:** © 2025 Mukesh Kesharwani  
**License:** GPL-3.0-or-later  
**Last Updated:** January 23, 2026
