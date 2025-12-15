# 🔧 TrueNAS Deployment - Troubleshooting & Fix

## Error: Failed 'up' action for 'oscal-report-generator' app

**Problem**: The app is trying to run source files directly instead of using a proper Docker container.

---

## ✅ CORRECT Solution: Build Proper Docker Image

You have **two options**:

### Option 1: Build Docker Image and Use Custom App (Recommended)

### Option 2: Use Node Image with Volume Mounts (Simpler for Development)

---

## 🚀 Option 1: Proper Docker Image Deployment

### Step 1: Build Image Locally

On your development machine:

```bash
cd /Users/mkesharw/Library/CloudStorage/OneDrive-Adobe/Documents/Contri/18-JustLikeThat/OSCAL-Report-Generator-V1

# Build the Docker image
docker build -t oscal-report-generator:latest .

# Test locally first
docker run -d -p 3019:3019 --name oscal-test oscal-report-generator:latest

# Test health
curl http://localhost:3019/health

# If working, save the image
docker stop oscal-test
docker rm oscal-test
docker save -o oscal-report-generator.tar oscal-report-generator:latest
```

### Step 2: Transfer to TrueNAS

```bash
# Copy to TrueNAS
scp oscal-report-generator.tar admin@nas.keekar.com:/mnt/pool1/docker-images/
```

### Step 3: Load on TrueNAS

```bash
# SSH into TrueNAS
ssh admin@nas.keekar.com

# Load the image
docker load -i /mnt/pool1/docker-images/oscal-report-generator.tar

# Verify
docker images | grep oscal
```

### Step 4: Deploy via TrueNAS GUI

1. Go to: http://nas.keekar.com/ui/apps/available

2. Click: **"Launch Docker Image"** or **"Custom App"**

3. **IMPORTANT SETTINGS**:

```
Application Name: oscal-report-generator

=== Container Images ===
Repository: oscal-report-generator
Tag: latest
Pull Policy: Never (or "If not present")

=== Container Entrypoint ===
Leave BLANK - use default from Dockerfile

=== Container Command ===
Leave BLANK - use default from Dockerfile

=== Port Forwarding ===
Click "Add"
Container Port: 3019
Node Port: 3019 (or any available)
Protocol: TCP

=== Environment Variables ===
Click "Add" for each:
NODE_ENV = production
PORT = 3019

=== Storage (Optional) ===
Skip for now - app is self-contained

=== Health Check ===
Type: HTTP
Path: /health
Port: 3019
Initial Delay: 40
Period: 30
Timeout: 10
```

4. Click **"Save"**

5. Wait for status to show **"Active"** or **"Running"**

---

## 🔥 Option 2: Quick Fix with Node Image (Development)

If you want to run directly from your source files (for development/testing):

### Step 1: Prepare Source on TrueNAS

First, make sure your source is properly set up:

```bash
# SSH to TrueNAS
ssh admin@nas.keekar.com

# Navigate to your project
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-V1

# Install dependencies
cd backend
npm install
cd ..

# Build frontend
cd frontend
npm install
npm run build
cd ..

# Copy build to backend
cp -r frontend/dist backend/public
```

### Step 2: Deploy via GUI

1. Go to: http://nas.keekar.com/ui/apps/available

2. Click: **"Launch Docker Image"** or **"Custom App"**

3. Configure:

```
Application Name: oscal-report-generator-dev

=== Container Images ===
Repository: node
Tag: 20-alpine
Pull Policy: If not present

=== Container Entrypoint ===
Leave BLANK

=== Container Command ===
/bin/sh

=== Container Args ===
-c
cd /app/backend && node server.js

=== Port Forwarding ===
Container Port: 3019
Node Port: 3019
Protocol: TCP

=== Storage - Host Path Volumes ===
Click "Add"
Host Path: /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-V1
Mount Path: /app
Read Only: NO (unchecked)

=== Environment Variables ===
NODE_ENV = production
PORT = 3019
```

4. Click **"Save"**

---

## 🎯 Recommended Approach

**For Production**: Use Option 1 (Docker Image)
- ✅ Self-contained
- ✅ Faster startup
- ✅ Reliable
- ✅ Portable

**For Testing/Development**: Use Option 2 (Volume Mount)
- ✅ Quick changes
- ✅ No rebuild needed
- ⚠️ Slower startup
- ⚠️ Requires dependencies on host

---

## 🔍 Checking Logs on TrueNAS

To see what went wrong:

```bash
# SSH to TrueNAS
ssh admin@nas.keekar.com

# Check app lifecycle log
tail -100 /var/log/app_lifecycle.log

# Check Docker logs
docker ps -a | grep oscal
docker logs [container-id]
```

---

## 🛠️ Common Issues & Fixes

### Issue: "No such file or directory"
**Fix**: Use Option 1 with proper Docker image

### Issue: "Cannot find module"
**Fix**: Ensure `npm install` was run in the backend directory

### Issue: "Frontend not found"
**Fix**: Build frontend and copy to `backend/public`

### Issue: "Port already in use"
**Fix**: Change Node Port to different number (e.g., 8080)

### Issue: "Permission denied"
**Fix**: Check file permissions on host path:
```bash
chmod -R 755 /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-V1
```

---

## ✅ Quick Verification Checklist

Before deploying, ensure:

- [ ] Dockerfile exists in project root
- [ ] Backend dependencies installed (`backend/node_modules` exists)
- [ ] Frontend built (`frontend/dist` exists)
- [ ] Frontend copied to backend (`backend/public` exists)
- [ ] Port 3019 is available on TrueNAS
- [ ] No other OSCAL app is running

---

## 🎬 Start Fresh

If you have a failed deployment:

1. **Delete Failed App**:
   - Go to TrueNAS GUI → Apps → Installed
   - Find "oscal-report-generator"
   - Click "Delete" or "Remove"
   - Confirm deletion

2. **Clean Up**:
   ```bash
   ssh admin@nas.keekar.com
   docker ps -a | grep oscal
   docker rm -f [any-oscal-containers]
   docker images | grep oscal
   # Keep the image if you want to reuse it
   ```

3. **Redeploy** using Option 1 or Option 2 above

---

## 📧 Need Help?

If you continue having issues:

1. **Check the logs**:
   ```bash
   tail -100 /var/log/app_lifecycle.log
   ```

2. **Share the error** from the log file

3. **Contact**: mukesh.kesharwani@adobe.com

---

**Next Step**: Try Option 1 (recommended) for a clean, production-ready deployment! 🚀

