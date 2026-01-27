# Critical Data Loss Issue - Analysis and Fix

## 🚨 CRITICAL BUG DISCOVERED

**Severity**: CRITICAL  
**Impact**: User data loss on container upgrades  
**Affected Versions**: v1.5.0, v1.6.2, v1.6.4 (all versions before v1.6.5)  
**Date Discovered**: January 24, 2026  
**Status**: ✅ FIXED in v1.6.5+

---

## Problem Statement

### What Happened

Users created in TrueNAS Blue/Green deployments were permanently lost during container upgrades:

- **Jan 22, 2026**: Users Chetan Joshi, Uma, and Shraddha Agarwala manually added to deployments
- **Jan 24, 2026**: Green upgraded from v1.6.2 → v1.6.4
- **Result**: Chetan and Uma permanently lost; Shraddha recovered from Blue deployment

### Root Cause

The application had a **fundamental architecture flaw**:

```
Application writes to:  /config/app/users.json (EPHEMERAL - inside container)
Host volume mounts:     /app/config/ (PERSISTENT - but NOT USED!)
```

**Result**: All user data stored in ephemeral container storage, destroyed on container recreation.

### Technical Details

#### File Paths in v1.5.0 - v1.6.4 (BROKEN):

| Path | Storage Type | Persistence | Used By App? |
|------|--------------|-------------|--------------|
| `/config/app/users.json` | Container filesystem | ❌ Lost on restart | ✅ YES (WRONG!) |
| `/app/config/app/users.json` | Host volume mount | ✅ Persistent | ❌ NO |

#### What Broke:

1. **configManager.js** (v1.6.4 and earlier):
   ```javascript
   // WRONG - Uses relative path that resolves to container filesystem
   const CONFIG_FILE = path.join(__dirname, '../config/app/config.json');
   ```

2. **userManager.js** (v1.6.4 and earlier):
   ```javascript
   // WRONG - Uses relative path that resolves to container filesystem  
   const USERS_FILE = path.join(__dirname, '../config/app/users.json');
   ```

3. **Dockerfile** (v1.6.4 and earlier):
   - No VOLUME declaration
   - No entrypoint script to initialize persistent storage
   - Container started directly with `CMD ["node", "server.js"]`

---

## Solution Implemented (v1.6.5+)

### Architecture Changes

```
New Architecture:
┌──────────────────────────────────────┐
│ Host System                          │
│  ┌─────────────────────────────┐    │
│  │ Named Volume: oscal-data    │    │
│  │  ├── config.json            │    │
│  │  └── users.json             │    │
│  └───────┬─────────────────────┘    │
│          │ mounted to /data          │
│  ┌───────▼─────────────────────┐    │
│  │ Container                    │    │
│  │  /data/ (PERSISTENT)        │    │
│  │  /app/config/app/ (symlinks)│    │
│  └─────────────────────────────┘    │
└──────────────────────────────────────┘
```

### Files Fixed

#### 1. `docker-entrypoint.sh` (NEW)

Initialization script that runs on container start:

```bash
# Check if users.json exists in persistent volume
if [ ! -f /data/users.json ]; then
  echo "📝 Initializing users.json from defaults..."
  cp /app/backend/auth/users.json /data/users.json
else
  echo "✓ Using existing users.json from persistent volume"
fi

# Create symbolic link so app can find it
ln -sf /data/users.json /app/config/app/users.json
```

**Key Features**:
- ✅ Only initializes if file missing (never overwrites)
- ✅ Creates symlinks for backward compatibility
- ✅ Sets correct permissions
- ✅ Validates volume is writable

#### 2. `Dockerfile` (FIXED)

```dockerfile
# Declare persistent volume
VOLUME ["/data"]

# Copy and setup entrypoint
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Use entrypoint to initialize volume
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
```

#### 3. `backend/configManager.js` (FIXED)

Priority-based path resolution:

```javascript
function getConfigPath() {
  // Priority 1: Environment variable override
  if (process.env.CONFIG_PATH && fs.existsSync(process.env.CONFIG_PATH)) {
    return process.env.CONFIG_PATH;
  }
  
  // Priority 2: Persistent volume (NEW - v1.6.5+)
  if (fs.existsSync('/data/config.json')) {
    return '/data/config.json';
  }
  
  // Priority 3: New standard location
  if (fs.existsSync('/app/config/app/config.json')) {
    return '/app/config/app/config.json';
  }
  
  // Priority 4: Legacy location (backward compatibility)
  if (fs.existsSync('/app/backend/config.json')) {
    return '/app/backend/config.json';
  }
  
  // Default for new installations
  return '/data/config.json';
}
```

#### 4. `backend/auth/userManager.js` (FIXED)

Same priority-based approach for users.json.

#### 5. `backend/server.js` (ENHANCED)

**New API Endpoints**:

- `GET /api/users/export` - Export all users for backup
- `POST /api/users/import` - Import users with merge/override modes
- `GET /api/system/volume-status` - Diagnostic endpoint for volume health

---

## How to Upgrade Safely

### For TrueNAS Blue/Green Deployments

**Option 1: Use Upgrade Scripts** (RECOMMENDED)

```bash
# On TrueNAS
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green/scripts

# Run upgrade script
sudo ./upgrade-green-deployment.sh
```

The script will:
1. ✅ Backup users from **correct location** (`/config/app/`)
2. ✅ Run build script to update image
3. ✅ Restore users to new persistent volume (`/data/`)
4. ✅ Verify volume persistence is working

**Option 2: Manual Upgrade**

1. **Before upgrade**, backup existing users:
   ```bash
   docker cp oscal-report-generator-green:/config/app/users.json ./users-backup.json
   docker cp oscal-report-generator-green:/config/app/config.json ./config-backup.json
   ```

2. **Upgrade** to v1.6.5+

3. **After upgrade**, restore users:
   ```bash
   docker cp ./users-backup.json oscal-report-generator-green:/data/users.json
   docker cp ./config-backup.json oscal-report-generator-green:/data/config.json
   docker restart oscal-report-generator-green
   ```

### For Docker Compose Deployments

Ensure your `docker-compose.yml` includes:

```yaml
services:
  oscal-generator:
    volumes:
      - oscal-config-data:/data  # CRITICAL: Mount persistent volume

volumes:
  oscal-config-data:
    driver: local
```

---

## Test Coverage Added

### New Test Suite: `password-reset.test.js`

**Tests Added** (16 test cases):

1. ✅ Admin can reset user password
2. ✅ Unauthenticated requests rejected
3. ✅ Non-admin users cannot reset passwords
4. ✅ Password length validation (min 6 characters)
5. ✅ Empty password rejected
6. ✅ Invalid user ID handled gracefully
7. ✅ User can login with new password
8. ✅ Old password rejected after reset
9. ✅ Special characters in password supported
10. ✅ Activity logging works
11. ✅ Timestamp updated on reset
12. ✅ Concurrent resets handled
13. ✅ Inactive user password reset allowed
14. ✅ Password persisted to disk
15. ✅ Volume persistence integration
16. ✅ Self-service password change

**Run Tests**:
```bash
npm test -- password-reset.test.js
```

---

## Prevention Measures

### 1. Monitoring

Add to application startup logs:

```
✓ Using persistent volume: /data/users.json
⚠ WARNING: Using ephemeral storage: /config/app/users.json (data loss risk!)
```

### 2. Volume Health Check

New endpoint: `GET /api/system/volume-status`

```json
{
  "persistence": {
    "enabled": true,
    "volumePath": "/data",
    "configPath": "/data/config.json",
    "usersPath": "/data/users.json"
  },
  "files": {
    "config": {
      "exists": true,
      "writable": true,
      "size": 1024,
      "lastModified": "2026-01-24T20:30:00.000Z"
    },
    "users": {
      "exists": true,
      "writable": true,
      "size": 2048,
      "userCount": 5
    }
  }
}
```

### 3. Automated Backups

Configured in TrueNAS SCALE to run daily backups of `/data` volume.

### 4. CI/CD Test Gates

- ✅ Password reset tests must pass before merge to Quality_Test
- ✅ User management tests in Development workflow
- ✅ Volume persistence verification in integration tests

---

## Recovery Procedures

### If Users Are Lost

**Option 1: Recover from Blue Deployment**

If Blue deployment has the users:

```bash
# Extract from Blue
docker exec oscal-report-generator-blue cat /config/app/users.json > users-backup.json

# Import to Green (requires v1.6.5+)
curl -X POST http://localhost:3019/api/users/import?mode=merge \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d @users-backup.json
```

**Option 2: Recreate Manually**

Users will need to:
- Use self-registration (if enabled)
- OR admin recreates accounts with temporary passwords

**Option 3: ZFS Snapshot Recovery** (TrueNAS)

```bash
# List available snapshots
zfs list -t snapshot | grep KACI-Apps

# Mount snapshot
sudo ls /mnt/pool1/Documents/KACI-Apps/.zfs/snapshot/

# Copy users from snapshot
sudo cp /mnt/pool1/Documents/KACI-Apps/.zfs/snapshot/auto-20260124/...
```

---

## Impact Assessment

### Data Lost in January 24 Incident

| User | Created | Lost During | Recoverable? |
|------|---------|-------------|--------------|
| Chetan Joshi | Jan 22 | Green upgrade | ❌ NO (Green only) |
| Uma | Jan 22 | Green upgrade | ❌ NO (Green only) |
| Shraddha Agarwala | Jan 22 | N/A | ✅ YES (from Blue) |

### Why Recovery Failed

- ❌ Automated backups ran before users were created (Jan 22, 10:12 AM)
- ❌ Users created after last backup (Jan 22, after 10:12 AM)  
- ❌ No export API in v1.6.2 (upgrade couldn't backup)
- ❌ Old container destroyed during upgrade
- ❌ No ZFS snapshots between Jan 22-24

---

## Lessons Learned

### What Went Wrong

1. **Architecture**: Ephemeral storage for critical data
2. **Testing**: No tests for data persistence across upgrades
3. **Documentation**: Upgrade guide didn't warn about data loss
4. **Backup Strategy**: Upgrade scripts looked in wrong location

### Improvements Made

1. ✅ **Persistent volume architecture** - Data survives upgrades
2. ✅ **Comprehensive test coverage** - Password reset & user management
3. ✅ **Clear documentation** - Migration guides, testing guides
4. ✅ **Safe upgrade scripts** - Backup from correct locations
5. ✅ **Export/Import APIs** - Enable data migration and consolidation
6. ✅ **Monitoring endpoint** - Volume health checks

---

## Action Items for Administrators

### Immediate

- [ ] Upgrade all deployments to v1.6.5+ ASAP
- [ ] Verify volume persistence: `curl http://localhost:PORT/api/system/volume-status`
- [ ] Backup current users: `docker exec CONTAINER cat /config/app/users.json > backup.json`
- [ ] Test password reset functionality in UI

### Ongoing

- [ ] Enable automated backups of `/data` volumes
- [ ] Monitor volume health endpoint weekly
- [ ] Test upgrades in non-production environment first
- [ ] Maintain user export backups before major changes

---

## Support

**Issue**: User data lost or password reset not working  
**Contact**: Check logs at `/app/logs/` or `docker logs CONTAINER_NAME`  
**Documentation**: See `docs/DOCKER_VOLUME_MIGRATION.md` for detailed steps

---

**Version**: 1.6.5+  
**Last Updated**: January 24, 2026  
**Author**: OSCAL Reports Development Team
