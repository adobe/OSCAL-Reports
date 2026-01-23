# Volume Persistence Testing Guide

This guide provides test scenarios to verify that persistent volume configuration is working correctly.

---

## Pre-Test Checklist

Before running any tests, ensure:

1. ✅ Docker is installed and running
2. ✅ Latest image pulled: `docker pull keekar/oscal_reports:latest`
3. ✅ No existing containers running: `docker ps | grep oscal`
4. ✅ Clean volumes (for fresh start): `docker volume rm oscal-config-data` (optional)

---

## Test Scenario 1: Fresh Installation

**Objective:** Verify that a fresh container creates default config and users in the volume.

### Steps

```bash
# 1. Create volume
docker volume create oscal-config-data

# 2. Start container
docker run -d \
  --name oscal-test-fresh \
  -p 3020:3020 \
  -v oscal-config-data:/data \
  keekar/oscal_reports:latest

# 3. Wait for startup (30 seconds)
sleep 30

# 4. Check entrypoint logs
docker logs oscal-test-fresh | head -30

# Expected output:
# ✅ Data directory: /data (writable)
# 📝 Initializing config.json from defaults...
# ✅ Created /data/config.json
# 📝 Initializing users.json from defaults...
# ✅ Created /data/users.json
# 🔗 Setting up symbolic links...

# 5. Verify files exist in volume
docker exec oscal-test-fresh ls -lh /data

# Expected output:
# -rw------- 1 node node  XXX Jan 23 10:00 config.json
# -rw------- 1 node node  XXX Jan 23 10:00 users.json

# 6. Check volume status API
curl http://localhost:3020/api/system/volume-status | jq

# Expected:
# "persistence": {
#   "enabled": true,
#   "recommendation": "Volume persistence is properly configured"
# }

# 7. Cleanup
docker stop oscal-test-fresh
docker rm oscal-test-fresh
```

### Success Criteria

- ✅ Container starts without errors
- ✅ `/data/config.json` and `/data/users.json` created automatically
- ✅ Volume status API shows `"enabled": true`
- ✅ Can login with default credentials

---

## Test Scenario 2: Container Update (Data Persistence)

**Objective:** Verify that data persists when container is recreated.

### Steps

```bash
# 1. Start fresh container
docker volume create oscal-config-data-test2
docker run -d \
  --name oscal-test-update \
  -p 3020:3020 \
  -v oscal-config-data-test2:/data \
  keekar/oscal_reports:latest

# 2. Wait for startup
sleep 30

# 3. Create a test user
TOKEN=$(curl -s -X POST http://localhost:3020/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin#<check-credentials.txt>"}' \
  | jq -r '.token')

curl -s -X POST http://localhost:3020/api/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username":"testuser@example.com",
    "email":"testuser@example.com",
    "role":"User",
    "fullName":"Test Persistence User"
  }' | jq

# 4. Get user count before update
USER_COUNT_BEFORE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3020/api/users | jq 'length')

echo "Users before update: $USER_COUNT_BEFORE"

# 5. Stop and remove container (simulating update)
docker stop oscal-test-update
docker rm oscal-test-update

# 6. "Pull" new image (simulate update)
# In real scenario: docker pull keekar/oscal_reports:latest

# 7. Recreate container with same volume
docker run -d \
  --name oscal-test-update \
  -p 3020:3020 \
  -v oscal-config-data-test2:/data \
  keekar/oscal_reports:latest

# 8. Wait for startup
sleep 30

# 9. Check entrypoint logs
docker logs oscal-test-update | head -30

# Expected output:
# ✅ Data directory: /data (writable)
# ✅ Using existing config.json from volume
# ✅ Using existing users.json from volume
#    Found X user(s) in database

# 10. Login and verify user still exists
TOKEN=$(curl -s -X POST http://localhost:3020/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin#<check-credentials.txt>"}' \
  | jq -r '.token')

USER_COUNT_AFTER=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3020/api/users | jq 'length')

echo "Users after update: $USER_COUNT_AFTER"

# 11. Verify test user exists
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3020/api/users \
  | jq '.[] | select(.username=="testuser@example.com")'

# Expected: Full user object returned

# 12. Cleanup
docker stop oscal-test-update
docker rm oscal-test-update
docker volume rm oscal-config-data-test2
```

### Success Criteria

- ✅ Test user exists before container recreation
- ✅ Container recreates successfully with same volume
- ✅ Logs show "Using existing config.json" and "Using existing users.json"
- ✅ User count matches before and after
- ✅ Test user still exists after recreation
- ✅ Can login with same credentials

---

## Test Scenario 3: Multi-Container User Import

**Objective:** Verify user export/import functionality between containers.

### Steps

```bash
# 1. Create Container 1 with its own volume
docker volume create oscal-config-container1
docker run -d \
  --name oscal-container1 \
  -p 3020:3020 \
  -v oscal-config-container1:/data \
  keekar/oscal_reports:latest

sleep 30

# 2. Create users in Container 1
TOKEN1=$(curl -s -X POST http://localhost:3020/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin#<check>"}' \
  | jq -r '.token')

# Create user 1
curl -s -X POST http://localhost:3020/api/users \
  -H "Authorization: Bearer $TOKEN1" \
  -H "Content-Type: application/json" \
  -d '{
    "username":"user1@container1.com",
    "email":"user1@container1.com",
    "role":"User",
    "fullName":"Container 1 User 1"
  }' | jq

# Create user 2
curl -s -X POST http://localhost:3020/api/users \
  -H "Authorization: Bearer $TOKEN1" \
  -H "Content-Type: application/json" \
  -d '{
    "username":"user2@container1.com",
    "email":"user2@container1.com",
    "role":"User",
    "fullName":"Container 1 User 2"
  }' | jq

# 3. Export users from Container 1
curl -s -H "Authorization: Bearer $TOKEN1" \
  http://localhost:3020/api/users/export > container1-users.json

echo "Exported $(jq '.userCount' container1-users.json) users from Container 1"

# 4. Stop Container 1 and start Container 2
docker stop oscal-container1

docker volume create oscal-config-container2
docker run -d \
  --name oscal-container2 \
  -p 3021:3020 \
  -v oscal-config-container2:/data \
  -e PORT=3020 \
  keekar/oscal_reports:latest

sleep 30

# 5. Create a different user in Container 2
TOKEN2=$(curl -s -X POST http://localhost:3021/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin#<check>"}' \
  | jq -r '.token')

curl -s -X POST http://localhost:3021/api/users \
  -H "Authorization: Bearer $TOKEN2" \
  -H "Content-Type: application/json" \
  -d '{
    "username":"user1@container2.com",
    "email":"user1@container2.com",
    "role":"User",
    "fullName":"Container 2 User 1"
  }' | jq

# 6. Count users before import
USER_COUNT_BEFORE=$(curl -s -H "Authorization: Bearer $TOKEN2" \
  http://localhost:3021/api/users | jq 'length')

echo "Container 2 users before import: $USER_COUNT_BEFORE"

# 7. Import users from Container 1 into Container 2
IMPORT_RESULT=$(curl -s -X POST 'http://localhost:3021/api/users/import?mode=merge' \
  -H "Authorization: Bearer $TOKEN2" \
  -H "Content-Type: application/json" \
  -d @container1-users.json)

echo "$IMPORT_RESULT" | jq

# 8. Count users after import
USER_COUNT_AFTER=$(curl -s -H "Authorization: Bearer $TOKEN2" \
  http://localhost:3021/api/users | jq 'length')

echo "Container 2 users after import: $USER_COUNT_AFTER"

# 9. Verify all users exist
echo "Users in Container 2:"
curl -s -H "Authorization: Bearer $TOKEN2" \
  http://localhost:3021/api/users \
  | jq '.[] | {username: .username, fullName: .fullName}'

# Expected:
# - admin
# - user (default)
# - assessor (default)
# - user1@container2.com (created in container 2)
# - user1@container1.com (imported)
# - user2@container1.com (imported)

# 10. Cleanup
docker stop oscal-container1 oscal-container2
docker rm oscal-container1 oscal-container2
docker volume rm oscal-config-container1 oscal-config-container2
rm container1-users.json
```

### Success Criteria

- ✅ Container 1 creates users successfully
- ✅ Export API returns JSON with correct user count
- ✅ Container 2 starts with separate volume
- ✅ Import API successfully merges users
- ✅ User count increases by number of imported non-duplicate users
- ✅ Both original and imported users exist in Container 2
- ✅ Admin and default users not duplicated (skipped during import)

---

## Test Scenario 4: Volume Status Endpoint

**Objective:** Verify volume status API provides accurate information.

### Steps

```bash
# 1. Start container
docker volume create oscal-config-test4
docker run -d \
  --name oscal-test-status \
  -p 3020:3020 \
  -v oscal-config-test4:/data \
  keekar/oscal_reports:latest

sleep 30

# 2. Check volume status (unauthenticated)
curl -s http://localhost:3020/api/system/volume-status | jq

# Expected:
# {
#   "volumeMount": {
#     "path": "/data",
#     "exists": true,
#     "writable": true
#   },
#   "config": {
#     "path": "/data/config.json",
#     "exists": true
#   },
#   "users": {
#     "path": "/data/users.json",
#     "exists": true,
#     "userCount": 0  // Hidden when not authenticated
#   },
#   "persistence": {
#     "enabled": true,
#     "recommendation": "Volume persistence is properly configured"
#   }
# }

# 3. Check volume status (authenticated)
TOKEN=$(curl -s -X POST http://localhost:3020/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin#<check>"}' \
  | jq -r '.token')

curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3020/api/system/volume-status | jq

# Expected: Same as above but with userCount showing actual count

# 4. Test without volume (create another container)
docker run -d \
  --name oscal-test-no-volume \
  -p 3021:3020 \
  -e PORT=3020 \
  keekar/oscal_reports:latest

sleep 30

# 5. Check status without volume
curl -s http://localhost:3021/api/system/volume-status | jq

# Expected:
# "persistence": {
#   "enabled": false,
#   "recommendation": "No persistent volume detected. Data will be lost on container updates. Mount a volume to /data"
# }

# 6. Cleanup
docker stop oscal-test-status oscal-test-no-volume
docker rm oscal-test-status oscal-test-no-volume
docker volume rm oscal-config-test4
```

### Success Criteria

- ✅ Status endpoint returns 200 OK
- ✅ Shows correct volume mount information
- ✅ Shows correct file paths (/data/config.json, /data/users.json)
- ✅ `persistence.enabled` is `true` when volume mounted
- ✅ `persistence.enabled` is `false` when no volume
- ✅ User count hidden when unauthenticated
- ✅ User count shown when authenticated as admin

---

## Test Scenario 5: Backup and Restore

**Objective:** Verify volume backup and restore functionality.

### Steps

```bash
# 1. Create container with volume
docker volume create oscal-config-backup-test
docker run -d \
  --name oscal-test-backup \
  -p 3020:3020 \
  -v oscal-config-backup-test:/data \
  keekar/oscal_reports:latest

sleep 30

# 2. Create test user
TOKEN=$(curl -s -X POST http://localhost:3020/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin#<check>"}' \
  | jq -r '.token')

curl -s -X POST http://localhost:3020/api/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username":"backup.test@example.com",
    "email":"backup.test@example.com",
    "role":"User",
    "fullName":"Backup Test User"
  }' | jq

# 3. Backup volume
mkdir -p /tmp/oscal-backup
docker run --rm \
  -v oscal-config-backup-test:/data \
  -v /tmp/oscal-backup:/backup \
  alpine tar czf /backup/oscal-backup-$(date +%Y%m%d).tar.gz -C /data .

ls -lh /tmp/oscal-backup/

# Expected: oscal-backup-YYYYMMDD.tar.gz file created

# 4. Delete volume (simulate disaster)
docker stop oscal-test-backup
docker rm oscal-test-backup
docker volume rm oscal-config-backup-test

# 5. Create new volume
docker volume create oscal-config-backup-test

# 6. Restore from backup
BACKUP_FILE=$(ls /tmp/oscal-backup/oscal-backup-*.tar.gz | head -1)
docker run --rm \
  -v oscal-config-backup-test:/data \
  -v /tmp/oscal-backup:/backup \
  alpine tar xzf /backup/$(basename $BACKUP_FILE) -C /data

# 7. Start container with restored volume
docker run -d \
  --name oscal-test-backup \
  -p 3020:3020 \
  -v oscal-config-backup-test:/data \
  keekar/oscal_reports:latest

sleep 30

# 8. Verify test user exists after restore
TOKEN=$(curl -s -X POST http://localhost:3020/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin#<check>"}' \
  | jq -r '.token')

curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3020/api/users \
  | jq '.[] | select(.username=="backup.test@example.com")'

# Expected: User object returned

# 9. Cleanup
docker stop oscal-test-backup
docker rm oscal-test-backup
docker volume rm oscal-config-backup-test
rm -rf /tmp/oscal-backup
```

### Success Criteria

- ✅ Backup creates tar.gz file successfully
- ✅ Backup file contains config.json and users.json
- ✅ Restore extracts files into new volume
- ✅ Container starts with restored data
- ✅ Test user exists after restore
- ✅ Can login with original credentials

---

## Automated Test Script

Create a simple automated test script:

```bash
#!/bin/bash
# test-volume-persistence.sh

set -e

echo "🧪 Volume Persistence Test Suite"
echo "================================="
echo ""

# Test 1: Fresh Install
echo "Test 1: Fresh Installation"
docker volume create oscal-test-fresh
docker run -d --name oscal-test-fresh -p 3020:3020 \
  -v oscal-test-fresh:/data keekar/oscal_reports:latest
sleep 30

if docker exec oscal-test-fresh test -f /data/config.json; then
  echo "✅ Test 1 PASSED: config.json created"
else
  echo "❌ Test 1 FAILED: config.json not found"
fi

docker stop oscal-test-fresh && docker rm oscal-test-fresh
docker volume rm oscal-test-fresh

# Test 2: Data Persistence
echo ""
echo "Test 2: Data Persistence"
docker volume create oscal-test-persist
docker run -d --name oscal-test-persist -p 3020:3020 \
  -v oscal-test-persist:/data keekar/oscal_reports:latest
sleep 30

# Create marker file
docker exec oscal-test-persist sh -c 'echo "test" > /data/marker.txt'

# Recreate container
docker stop oscal-test-persist && docker rm oscal-test-persist
docker run -d --name oscal-test-persist -p 3020:3020 \
  -v oscal-test-persist:/data keekar/oscal_reports:latest
sleep 30

if docker exec oscal-test-persist test -f /data/marker.txt; then
  echo "✅ Test 2 PASSED: Data persisted"
else
  echo "❌ Test 2 FAILED: Data lost"
fi

docker stop oscal-test-persist && docker rm oscal-test-persist
docker volume rm oscal-test-persist

echo ""
echo "🎉 All tests completed!"
```

---

## Validation Checklist

After running all tests, verify:

- [ ] Fresh install creates default files in `/data`
- [ ] Container recreation preserves user data
- [ ] User export/import works between containers
- [ ] Volume status API provides accurate information
- [ ] Backup and restore functionality works
- [ ] Entrypoint script logs show correct volume initialization
- [ ] Config changes persist across container updates
- [ ] No "file not found" errors in logs
- [ ] Application functions normally with volume persistence

---

## Troubleshooting Failed Tests

### Test fails with "Permission denied"

**Solution:** Check volume permissions

```bash
docker volume inspect oscal-config-data
docker run --rm -v oscal-config-data:/data alpine ls -la /data
```

### Test user not persisting

**Solution:** Verify volume is actually mounted

```bash
docker inspect oscal-container-name | jq '.[0].Mounts'
```

### Import shows all users skipped

**Solution:** Users already exist (expected in merge mode)

```bash
# Use override mode instead
curl -X POST 'http://localhost:3020/api/users/import?mode=override' ...
```

---

**Author:** Mukesh Kesharwani  
**Last Updated:** January 23, 2026
