# TrueNAS GUI Deployment - Step-by-Step Guide

## Quick Fix for Port 3021 Deployment

If you want to access the app on port **3021** externally, but the container uses port **3020** internally, use this configuration:

### Configuration for Port 3021 (External) → 3020 (Container)

**In TrueNAS GUI Custom App:**

1. **Application Name**: `oscal-report-generator-v2` (or your preferred name)

2. **Container Image**:
   - Repository: `oscal-report-generator-v2` ⚠️ **V2 image name**
   - Tag: `latest`
   - Pull Policy: `Never` (if image built locally)

3. **Port Forwarding**:
   - **Container Port**: `3020` ⚠️ (This is the port INSIDE the container)
   - **Node Port**: `3021` ✅ (This is the port on TrueNAS host)
   - Protocol: `TCP`

4. **Environment Variables**:
   ```
   NODE_ENV = production
   PORT = 3020
   ```
   ⚠️ **Important**: PORT must be `3020` (container's internal port)

5. **Resources**:
   - Memory Limit: `1024 Mi`
   - CPU Limit: `2.0 cores`

6. **Health Check**:
   - Enabled: `Yes`
   - Start Period: `60s` (increase from default)
   - Interval: `30s`
   - Timeout: `10s`
   - Retries: `3`
   - Command: `node -e "require('http').get('http://localhost:3020/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"`
   ⚠️ **Important**: Health check uses port `3020` (container's internal port)

7. **Network**:
   - Use default network (don't create custom network)

---

## Common Errors and Solutions

### Error: "[EFAULT] Failed 'up' action"

#### 1. Port Configuration Mismatch (Most Common)

**Problem**: Container port and Node port don't match the application's actual port.

**Solution**:
- Container Port: `3020` (always 3020 - this is what the app listens on)
- Node Port: `3021` (or any available port - this is what you access externally)
- Environment Variable `PORT`: `3020` (must match container port)

**Access URL**: `http://your-truenas-ip:3021`

#### 2. Image Not Found

**Error**: `unable to pull image: image not found`

**Solution**:
```bash
# SSH into TrueNAS
ssh admin@your-truenas-ip

# Check if image exists
sudo docker images | grep oscal-report-generator-v2

# If not found, build it:
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-V2
sudo docker build -t oscal-report-generator-v2:latest .

# In GUI: Set Pull Policy to "Never"
```

#### 3. Health Check Failing

**Problem**: Container starts but health check fails, causing app to be marked as failed.

**Solution**:
- Increase Start Period to `60s` or `90s`
- Verify health endpoint works:
  ```bash
  sudo docker run -d -p 3020:3020 --name oscal-test oscal-report-generator-v2:latest
  sleep 30
  curl http://localhost:3020/health
  sudo docker stop oscal-test && sudo docker rm oscal-test
  ```

#### 4. Port Already in Use

**Error**: `port is already allocated`

**Solution**:
```bash
# Check what's using port 3021
sudo netstat -tuln | grep 3021
# or
sudo lsof -i :3021

# Stop conflicting app or use different port
```

#### 5. Insufficient Resources

**Problem**: Container fails to start due to memory/CPU limits.

**Solution**:
- Increase Memory Limit to `1024 Mi` minimum
- Increase CPU Limit to `2.0 cores`
- Check system resources: `TrueNAS GUI → System → Dashboard`

---

## Step-by-Step Deployment Checklist

### Pre-Deployment

- [ ] Docker image is built: `sudo docker images | grep oscal-report-generator-v2`
- [ ] Image tag is `latest` (or match the tag in GUI)
- [ ] Port 3021 is available on TrueNAS host
- [ ] You have admin access to TrueNAS GUI

### Deployment Steps

1. [ ] Navigate to: `TrueNAS GUI → Apps → Available`
2. [ ] Click: `Discover Apps` → `Custom App`
3. [ ] Fill in Application Name
4. [ ] Set Container Image (Repository: `oscal-report-generator-v2`, Tag: `latest`) ⚠️ **V2**
5. [ ] Set Pull Policy to `Never` (if image built locally)
6. [ ] Configure Port Forwarding:
   - Container Port: `3020`
   - Node Port: `3021`
7. [ ] Add Environment Variables:
   - `NODE_ENV = production`
   - `PORT = 3020`
8. [ ] Set Resources (Memory: 1024 Mi, CPU: 2.0 cores)
9. [ ] Configure Health Check (Start Period: 60s)
10. [ ] Click `Install`

### Post-Deployment Verification

```bash
# Check container status
sudo docker ps | grep oscal

# Check logs
sudo docker logs <container-name>

# Test health endpoint
curl http://localhost:3021/health

# Access web UI
# Open browser: http://your-truenas-ip:3021
```

---

## Debugging Failed Deployments

### 1. Check TrueNAS Logs

```bash
# SSH into TrueNAS
ssh admin@your-truenas-ip

# View app lifecycle log
sudo tail -100 /var/log/app_lifecycle.log

# View Kubernetes logs
sudo journalctl -u kubernetes -n 100 --no-pager
```

### 2. Test Container Manually

```bash
# Run container manually to test
sudo docker run -d \
  -p 3021:3020 \
  -e NODE_ENV=production \
  -e PORT=3020 \
  --name oscal-test \
  oscal-report-generator-v2:latest

# Wait for startup
sleep 30

# Check if running
sudo docker ps | grep oscal-test

# Test health
curl http://localhost:3021/health

# View logs
sudo docker logs oscal-test

# Stop and remove test
sudo docker stop oscal-test
sudo docker rm oscal-test
```

### 3. Verify Image

```bash
# List images
sudo docker images

# Inspect image
sudo docker inspect oscal-report-generator-v2:latest

# Check exposed ports
sudo docker inspect oscal-report-generator-v2:latest | grep -i expose
```

---

## Correct Port Mapping Examples

### Example 1: External Port 3021, Container Port 3020
```
Container Port: 3020
Node Port: 3021
PORT env var: 3020
Access URL: http://truenas-ip:3021
```

### Example 2: External Port 3020, Container Port 3020
```
Container Port: 3020
Node Port: 3020
PORT env var: 3020
Access URL: http://truenas-ip:3020
```

### Example 3: External Port 8080, Container Port 3020
```
Container Port: 3020
Node Port: 8080
PORT env var: 3020
Access URL: http://truenas-ip:8080
```

**Key Point**: Container Port and PORT environment variable must always be `3020`. Only Node Port can vary.

---

## Quick Reference

| Setting | Value | Notes |
|---------|-------|-------|
| Container Port | `3020` | Fixed - app listens on this port |
| Node Port | `3021` | Your choice - external access port |
| PORT env var | `3020` | Must match Container Port |
| Health Check Port | `3020` | Must match Container Port |
| Image Name | `oscal-report-generator-v2:latest` | Must exist locally (V2) |
| Pull Policy | `Never` | If image built locally |

---

## Still Having Issues?

1. **Check the log**: `/var/log/app_lifecycle.log`
2. **Test manually**: Run container with `docker run` command above
3. **Verify image**: Ensure image exists and is correct
4. **Check ports**: Ensure no conflicts
5. **Increase timeouts**: Health check start period to 90s

---

---

## V2 Image Name Update

**Important:** V2 uses a different image name to avoid conflicts with V1:

- **V1 Image:** `oscal-report-generator:latest`
- **V2 Image:** `oscal-report-generator-v2:latest` ⚠️

When deploying V2, always use:
- **Repository:** `oscal-report-generator-v2`
- **Application Name:** `oscal-report-generator-v2` (recommended)

---

**Last Updated**: November 25, 2025  
**Author**: Mukesh Kesharwani

