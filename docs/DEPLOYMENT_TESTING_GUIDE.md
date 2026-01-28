# Deployment Script Testing Guide

**Comprehensive testing guide for `deploy_from_dockerhub.sh` script**

---

## Overview

This guide provides detailed test scenarios, validation procedures, and expected outcomes for the Docker Hub pull-based deployment script.

---

## Test Environment Setup

### Prerequisites

```bash
# 1. Ensure Docker is installed
docker --version

# 2. Create test directories
mkdir -p /tmp/OSCAL_Test_Blue
mkdir -p /tmp/OSCAL_Test_Green

# 3. Copy deployment script to test directories
cp scripts/deploy_from_dockerhub.sh /tmp/OSCAL_Test_Blue/
cp scripts/deploy_from_dockerhub.sh /tmp/OSCAL_Test_Green/
mkdir -p /tmp/OSCAL_Test_Blue/scripts
mkdir -p /tmp/OSCAL_Test_Green/scripts
cp scripts/deploy_from_dockerhub.sh /tmp/OSCAL_Test_Blue/scripts/
cp scripts/deploy_from_dockerhub.sh /tmp/OSCAL_Test_Green/scripts/

# 4. Ensure connectivity
ping -c 3 hub.docker.com
```

---

## Test Scenarios

### Test 1: Fresh Deployment (No Existing Container)

**Objective**: Verify script handles first-time deployment correctly

**Setup**:
```bash
cd /tmp/OSCAL_Test_Blue
# Ensure no existing container
docker rm -f oscal-report-generator-blue 2>/dev/null || true
```

**Execute**:
```bash
./scripts/deploy_from_dockerhub.sh
```

**Expected Results**:
- ✅ Detects "Blue" instance correctly
- ✅ Skips API backup (no existing container)
- ✅ Skips volume backup (empty directory)
- ✅ Pulls image from Docker Hub successfully
- ✅ Extracts and displays credentials
- ✅ Starts container on port 3020
- ✅ Health check passes
- ✅ Container is running and accessible

**Validation**:
```bash
# Check container is running
docker ps | grep oscal-report-generator-blue

# Test health endpoint
curl -s http://localhost:3020/health | jq

# Check logs
docker logs oscal-report-generator-blue | tail -20

# Verify port binding
docker port oscal-report-generator-blue

# Check volume mount
docker inspect oscal-report-generator-blue | jq '.[0].Mounts'
```

**Success Criteria**:
- [ ] Container status: Running
- [ ] Health endpoint returns: `{"status":"healthy"}`
- [ ] Port 3020 is accessible
- [ ] Volume mounted at `/data`
- [ ] No errors in logs
- [ ] Deployment completed in < 3 minutes

---

### Test 2: Update Deployment (Replace Running Container)

**Objective**: Verify script updates existing deployment safely

**Setup**:
```bash
cd /tmp/OSCAL_Test_Blue
# Ensure container is running from Test 1
docker ps | grep oscal-report-generator-blue
```

**Execute**:
```bash
# Run deployment again to simulate update
./scripts/deploy_from_dockerhub.sh
```

**Expected Results**:
- ✅ Detects existing container
- ✅ Prompts for admin credentials (or skip with Enter)
- ✅ Creates backup directory with timestamp
- ✅ Backs up volume directory
- ✅ Tags current image for rollback
- ✅ Pulls latest image
- ✅ Stops old container gracefully
- ✅ Renames old container with backup suffix
- ✅ Starts new container
- ✅ Health check passes
- ✅ Restores configuration
- ✅ Removes backup container after success

**Validation**:
```bash
# Check backup directory created
ls -la backups/ | grep dockerhub-deploy

# Verify new container is running
docker ps | grep oscal-report-generator-blue

# Check old container was renamed/removed
docker ps -a | grep oscal-report-generator-blue-backup

# Test health
curl -s http://localhost:3020/health

# Verify volume persistence
ls -la data-blue/
```

**Success Criteria**:
- [ ] Backup created successfully
- [ ] Container updated without data loss
- [ ] Health check passes
- [ ] No duplicate containers
- [ ] Volume data preserved
- [ ] Old container removed after success

---

### Test 3: Rollback Scenario (Health Check Failure)

**Objective**: Verify automatic rollback when new deployment fails

**Setup**:
```bash
cd /tmp/OSCAL_Test_Blue

# Simulate health check failure by blocking health endpoint
# (For testing, we'll use a modified approach)

# Option 1: Pull a specific old version first
docker pull keekar/oscal_reports:v1.6.3
docker tag keekar/oscal_reports:v1.6.3 oscal-report-generator:blue
docker stop oscal-report-generator-blue 2>/dev/null || true
docker rm oscal-report-generator-blue 2>/dev/null || true
docker run -d --name oscal-report-generator-blue -p 3020:3020 oscal-report-generator:blue

# Wait for it to be healthy
sleep 15
curl http://localhost:3020/health

# Now simulate a deployment that will fail
# Create a bad image by tagging busybox as oscal (will fail health check)
docker pull busybox
docker tag busybox keekar/oscal_reports:latest
```

**Execute**:
```bash
./scripts/deploy_from_dockerhub.sh
```

**Expected Results**:
- ✅ Backs up current working deployment
- ✅ Saves current image with backup tag
- ✅ Pulls "new" image (our busybox test image)
- ✅ Starts new container
- ✅ Health check fails after timeout (60s)
- ✅ Automatic rollback initiated
- ✅ Stops failed container
- ✅ Tags failed image for debugging
- ✅ Restores previous container
- ✅ Starts previous container
- ✅ Health check passes on old version
- ✅ Rollback success message displayed

**Validation**:
```bash
# Check container is running (should be old version)
docker ps | grep oscal-report-generator-blue

# Verify failed image is tagged
docker images | grep failed

# Check backup image exists
docker images | grep backup

# Verify health of rolled-back version
curl http://localhost:3020/health

# Check logs for rollback messages
docker logs oscal-report-generator-blue | grep -i rollback
```

**Success Criteria**:
- [ ] Rollback automatically triggered
- [ ] Old version restored successfully
- [ ] Failed image preserved for debugging
- [ ] Health check passes after rollback
- [ ] Clear rollback messages in output
- [ ] No data loss during rollback

**Cleanup**:
```bash
# Reset for next tests
docker pull keekar/oscal_reports:latest --platform linux/amd64
docker stop oscal-report-generator-blue
docker rm oscal-report-generator-blue
```

---

### Test 4: Offline Handling (Docker Hub Unreachable)

**Objective**: Verify graceful failure when Docker Hub unavailable

**Setup**:
```bash
cd /tmp/OSCAL_Test_Blue

# Simulate Docker Hub unavailability by using invalid registry
# Temporarily modify script or use firewall rule
# OR use an invalid image name
```

**Execute**:
```bash
# Modify image temporarily to simulate failure
sed -i.bak 's|keekar/oscal_reports|keekar/nonexistent_image|g' scripts/deploy_from_dockerhub.sh

./scripts/deploy_from_dockerhub.sh

# Restore original
mv scripts/deploy_from_dockerhub.sh.bak scripts/deploy_from_dockerhub.sh
```

**Expected Results**:
- ✅ Prerequisites check passes
- ✅ Connectivity check may warn
- ✅ Docker pull fails gracefully
- ✅ Error message displayed
- ✅ Suggests using `build_on_truenas.sh`
- ✅ Existing container not affected
- ✅ No data loss
- ✅ Clean exit

**Validation**:
```bash
# Verify existing container still running
docker ps | grep oscal-report-generator-blue

# Check no partial changes
docker images | grep oscal-report-generator

# Verify no lock file left
ls -la /tmp/oscal-deploy-blue.lock 2>/dev/null
```

**Success Criteria**:
- [ ] Clear error message about Docker Hub
- [ ] Suggests alternative (build script)
- [ ] No changes to running system
- [ ] Clean exit without errors
- [ ] Lock file removed

---

### Test 5: Blue and Green Detection

**Objective**: Verify script correctly identifies Blue vs Green instances

**Setup**:
```bash
# Clean up previous tests
docker stop oscal-report-generator-blue oscal-report-generator-green 2>/dev/null || true
docker rm oscal-report-generator-blue oscal-report-generator-green 2>/dev/null || true
```

**Test 5a: Blue Instance**

```bash
cd /tmp/OSCAL_Test_Blue
./scripts/deploy_from_dockerhub.sh
```

**Expected Results**:
- ✅ Detects "Blue" instance
- ✅ Uses port 3020
- ✅ Container name: `oscal-report-generator-blue`
- ✅ Data volume: `data-blue`
- ✅ Lock file: `/tmp/oscal-deploy-blue.lock`

**Validation**:
```bash
docker ps --format '{{.Names}}\t{{.Ports}}' | grep blue
# Should show: oscal-report-generator-blue  0.0.0.0:3020->3020/tcp
```

**Test 5b: Green Instance**

```bash
cd /tmp/OSCAL_Test_Green
./scripts/deploy_from_dockerhub.sh
```

**Expected Results**:
- ✅ Detects "Green" instance
- ✅ Uses port 3019
- ✅ Container name: `oscal-report-generator-green`
- ✅ Data volume: `data-green`
- ✅ Lock file: `/tmp/oscal-deploy-green.lock`

**Validation**:
```bash
docker ps --format '{{.Names}}\t{{.Ports}}' | grep green
# Should show: oscal-report-generator-green  0.0.0.0:3019->3019/tcp

# Both should be running simultaneously
docker ps | grep oscal-report-generator
```

**Success Criteria**:
- [ ] Blue uses port 3020
- [ ] Green uses port 3019
- [ ] Different container names
- [ ] Separate data volumes
- [ ] Separate lock files
- [ ] Both can run simultaneously

---

### Test 6: Concurrent Deployment Protection

**Objective**: Verify lock mechanism prevents concurrent deployments

**Setup**:
```bash
cd /tmp/OSCAL_Test_Blue
```

**Execute**:
```bash
# Start first deployment in background
./scripts/deploy_from_dockerhub.sh > /tmp/deploy1.log 2>&1 &
DEPLOY1_PID=$!

# Wait 2 seconds and try concurrent deployment
sleep 2
./scripts/deploy_from_dockerhub.sh > /tmp/deploy2.log 2>&1 &
DEPLOY2_PID=$!

# Wait for both to complete
wait $DEPLOY1_PID
DEPLOY1_EXIT=$?

wait $DEPLOY2_PID
DEPLOY2_EXIT=$?

# Check results
echo "First deployment exit code: $DEPLOY1_EXIT"
echo "Second deployment exit code: $DEPLOY2_EXIT"

cat /tmp/deploy2.log | grep -i "lock\|in progress"
```

**Expected Results**:
- ✅ First deployment proceeds normally
- ✅ Second deployment detects lock file
- ✅ Second deployment exits with error
- ✅ Error message: "Deployment already in progress"
- ✅ Only one deployment completes successfully

**Validation**:
```bash
# Check lock file behavior
ls -la /tmp/oscal-deploy-blue.lock 2>/dev/null

# Verify only one container updated
docker ps | grep oscal-report-generator-blue | wc -l
# Should be 1
```

**Success Criteria**:
- [ ] Lock prevents concurrent deployments
- [ ] Clear error message shown
- [ ] First deployment succeeds
- [ ] Second deployment fails gracefully
- [ ] No corruption or conflicts

---

### Test 7: Force Deployment (Override Lock)

**Objective**: Verify --force flag overrides lock

**Setup**:
```bash
cd /tmp/OSCAL_Test_Blue

# Create a stale lock file
echo "12345" > /tmp/oscal-deploy-blue.lock
echo "$(date -d '2 hours ago' 2>/dev/null || date -v-2H)" >> /tmp/oscal-deploy-blue.lock 2>/dev/null || echo "Old Date" >> /tmp/oscal-deploy-blue.lock
```

**Execute**:
```bash
# Try without force (should fail)
./scripts/deploy_from_dockerhub.sh
echo "Exit code: $?"

# Try with force (should succeed)
./scripts/deploy_from_dockerhub.sh --force
```

**Expected Results**:
- ✅ First attempt detects lock and exits
- ✅ Second attempt with --force removes lock
- ✅ Deployment proceeds successfully
- ✅ New lock created and removed after completion

**Success Criteria**:
- [ ] Lock prevents deployment without --force
- [ ] --force removes lock and proceeds
- [ ] Deployment completes successfully
- [ ] Lock cleaned up after completion

---

### Test 8: Skip API Backup

**Objective**: Verify --skip-backup flag works correctly

**Setup**:
```bash
cd /tmp/OSCAL_Test_Blue
# Ensure container is running
docker start oscal-report-generator-blue 2>/dev/null || ./scripts/deploy_from_dockerhub.sh
```

**Execute**:
```bash
./scripts/deploy_from_dockerhub.sh --skip-backup
```

**Expected Results**:
- ✅ API backup section is skipped
- ✅ Volume backup still performed
- ✅ No credential prompts
- ✅ Deployment completes successfully
- ✅ Faster deployment (no API calls)

**Validation**:
```bash
# Check backup directory
LATEST_BACKUP=$(ls -t backups/ | head -1)
ls -la backups/$LATEST_BACKUP/

# Should have volume-backup.tar.gz but no users.json
test -f backups/$LATEST_BACKUP/volume-backup.tar.gz && echo "Volume backup: YES"
test -f backups/$LATEST_BACKUP/users.json && echo "API backup: YES" || echo "API backup: NO (expected)"
```

**Success Criteria**:
- [ ] No API backup performed
- [ ] Volume backup still created
- [ ] Deployment succeeds
- [ ] No credential prompts
- [ ] Faster than normal deployment

---

### Test 9: Architecture Detection

**Objective**: Verify correct platform detection and image pulling

**Setup**:
```bash
cd /tmp/OSCAL_Test_Blue
```

**Execute**:
```bash
# Check system architecture
uname -m

# Run deployment and check logs
./scripts/deploy_from_dockerhub.sh 2>&1 | grep -i "architecture\|platform"
```

**Expected Results**:
- ✅ Detects system architecture (x86_64 or arm64)
- ✅ Sets correct Docker platform (linux/amd64 or linux/arm64)
- ✅ Pulls image with --platform flag
- ✅ Verifies pulled image architecture matches

**Validation**:
```bash
# Check pulled image architecture
docker inspect keekar/oscal_reports:latest | jq '.[0].Architecture'

# Should match system architecture
SYSTEM_ARCH=$(uname -m)
IMAGE_ARCH=$(docker inspect keekar/oscal_reports:latest --format='{{.Architecture}}')

echo "System: $SYSTEM_ARCH"
echo "Image: $IMAGE_ARCH"
```

**Success Criteria**:
- [ ] Correct architecture detected
- [ ] Appropriate platform flag used
- [ ] Image architecture matches system
- [ ] Container starts without "exec format error"

---

### Test 10: Credential Extraction

**Objective**: Verify credentials are extracted and displayed

**Setup**:
```bash
cd /tmp/OSCAL_Test_Blue
docker pull keekar/oscal_reports:latest
```

**Execute**:
```bash
./scripts/deploy_from_dockerhub.sh 2>&1 | grep -A 30 "Extract Default Credentials"
```

**Expected Results**:
- ✅ Creates temporary container
- ✅ Extracts credentials.txt file
- ✅ Displays credentials to user
- ✅ Shows password format explanation
- ✅ Warns to change defaults
- ✅ Cleans up temporary container

**Validation**:
```bash
# Check latest backup has credentials file
LATEST_BACKUP=$(ls -t backups/ | head -1)
test -f backups/$LATEST_BACKUP/credentials.txt && echo "Credentials saved"

# Display credentials
cat backups/$LATEST_BACKUP/credentials.txt
```

**Success Criteria**:
- [ ] Credentials extracted successfully
- [ ] File saved to backup directory
- [ ] Credentials displayed to user
- [ ] Clear warning about changing defaults
- [ ] Temporary container removed

---

## Validation Checklist

### Functional Validation

- [ ] Blue instance detected correctly
- [ ] Green instance detected correctly
- [ ] Port assignments correct (Blue: 3020, Green: 3019)
- [ ] Data volumes created and mounted
- [ ] Locks prevent concurrent deployments
- [ ] Stale locks auto-cleaned (>30 min)
- [ ] --force flag overrides locks
- [ ] --skip-backup works correctly

### Backup Validation

- [ ] API backup prompts for credentials
- [ ] API backup exports users correctly
- [ ] Volume backup creates compressed archive
- [ ] Backup directory includes timestamp
- [ ] Backup files have correct permissions
- [ ] Both backup methods work independently

### Deployment Validation

- [ ] Prerequisites check all pass
- [ ] Internet connectivity verified
- [ ] Disk space checked before pull
- [ ] Architecture detected correctly
- [ ] Image pulled with correct platform
- [ ] Credentials extracted and displayed
- [ ] Old container stopped gracefully
- [ ] Old container renamed (not deleted)
- [ ] New container starts successfully
- [ ] Volume mounts correctly

### Health Check Validation

- [ ] Initial health check waits 10 seconds
- [ ] Health checks retry up to 12 times
- [ ] 60-second total timeout
- [ ] Health endpoint tested correctly
- [ ] Container logs checked on failure
- [ ] Failed health triggers rollback

### Rollback Validation

- [ ] Rollback triggered on health failure
- [ ] Failed container stopped and removed
- [ ] Failed image tagged for debugging
- [ ] Failed logs saved to backup directory
- [ ] Previous container restored
- [ ] Previous configuration restored
- [ ] Rollback health check performed
- [ ] Clear rollback messages shown

### Cleanup Validation

- [ ] Backup container removed after success
- [ ] Dangling images pruned
- [ ] Lock file removed
- [ ] Old images tagged appropriately
- [ ] Disk space recovered

### Error Handling Validation

- [ ] Docker Hub unreachable handled gracefully
- [ ] Network interruption recovered
- [ ] Port conflicts detected
- [ ] Insufficient disk space detected
- [ ] Permission errors reported clearly
- [ ] Invalid credentials handled (3 retries)
- [ ] Missing jq handled gracefully

---

## Performance Benchmarks

### Expected Timings

Record actual timings for comparison:

| Phase | Expected | Actual (Test 1) | Actual (Test 2) |
|-------|----------|-----------------|-----------------|
| Prerequisites | 10s | ___ s | ___ s |
| Backup | 10-20s | ___ s | ___ s |
| Pull Image | 1-2 min | ___ min | ___ min |
| Deploy | 30s | ___ s | ___ s |
| Health Check | 10-60s | ___ s | ___ s |
| Restore | 20s | ___ s | ___ s |
| **Total** | **1-3 min** | **___ min** | **___ min** |

---

## Cleanup After Testing

```bash
# Stop and remove test containers
docker stop oscal-report-generator-blue oscal-report-generator-green 2>/dev/null || true
docker rm oscal-report-generator-blue oscal-report-generator-green 2>/dev/null || true

# Remove test images (optional - keep for faster re-testing)
# docker rmi oscal-report-generator:blue oscal-report-generator:green

# Remove test directories
rm -rf /tmp/OSCAL_Test_Blue /tmp/OSCAL_Test_Green

# Remove lock files
rm -f /tmp/oscal-deploy-blue.lock /tmp/oscal-deploy-green.lock

# Prune Docker system
docker system prune -f
```

---

## Automated Test Script

A companion automated test script is available: `test_cases/scripts/test-deployment-script.sh`

Run all tests automatically:

```bash
cd /Users/mkesharw/Documents/OSCAL_Reports
./test_cases/scripts/test-deployment-script.sh
```

---

## Reporting Issues

If any test fails, please report with:

1. Test number and name
2. Expected vs actual behavior
3. Error messages and logs
4. System information (OS, Docker version, architecture)
5. Output of failed deployment

---

**Last Updated**: January 2026  
**Test Version**: 1.0.0
