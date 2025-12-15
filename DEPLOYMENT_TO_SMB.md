# Deploy to SMB Share - Quick Guide

**Author**: Mukesh Kesharwani (mukesh.kesharwani@adobe.com)  
**Date**: November 7, 2025

## Overview

This guide helps you efficiently deploy your OSCAL Report Generator to an SMB network share, syncing only modified files.

---

## 📋 Prerequisites

1. **SMB Share Mounted** on your Mac
   - Open Finder → Go → Connect to Server (⌘K)
   - Enter your SMB server address: `smb://nas.keekar.com/share`
   - Mount the share (it will appear in `/Volumes/`)

2. **Destination Folder** created on the SMB share

---

## 🚀 Quick Deployment

### **Step 1: Configure the Script**

Edit the deployment script:

```bash
nano deploy-to-smb.sh
```

Set your SMB share destination:

```bash
DESTINATION="/Volumes/YourShareName/OSCAL-Report-Generator-V1"
```

**Example:**
```bash
DESTINATION="/Volumes/nas-share/apps/OSCAL-Report-Generator-V1"
```

Save and exit (Ctrl+O, Enter, Ctrl+X)

### **Step 2: Run the Deployment**

```bash
./deploy-to-smb.sh
```

The script will:
- ✅ Compare source and destination files
- ✅ Copy only modified files (based on timestamp)
- ✅ Skip unchanged files (saves time!)
- ✅ Exclude unnecessary files (node_modules, logs, build artifacts)
- ✅ Show progress for each file

---

## 📊 What Gets Synced

### **Included:**
- ✅ Backend source code (`backend/*.js`)
- ✅ Frontend source code (`frontend/src/**`)
- ✅ Configuration files (`package.json`, `vite.config.js`)
- ✅ Documentation files (`*.md`)
- ✅ Setup scripts (`setup.sh`, `deploy-*.sh`)

### **Excluded (Automatically):**
- ❌ `node_modules/` (reinstall on server)
- ❌ `.git/` (version control)
- ❌ `*.log` (log files)
- ❌ `frontend/dist/` (rebuild on server)
- ❌ `backend/public/` (rebuild on server)
- ❌ `.DS_Store` (macOS metadata)
- ❌ `.env` files (environment-specific)

---

## 🔧 After Deployment

On your deployment server (TrueNAS or other):

```bash
# 1. Navigate to the deployed folder
cd /path/to/OSCAL-Report-Generator-V1

# 2. Install dependencies
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# 3. Build frontend
cd frontend
npm run build

# 4. Copy built files to backend
cd ..
cp -r frontend/dist/* backend/public/

# 5. Start the server
cd backend
node server.js
```

---

## ⚡ Advanced Usage

### **Dry Run (See what would be synced)**

```bash
rsync -avzhn --update \
    --exclude 'node_modules/' \
    --exclude '.git/' \
    "/Users/mkesharw/.../OSCAL-Report-Generator-V1/" \
    "/Volumes/your-share/OSCAL-Report-Generator-V1/"
```

The `-n` flag shows what would be copied without actually copying.

### **Sync Specific Folder Only**

**Backend only:**
```bash
rsync -avzh --update \
    "/Users/mkesharw/.../OSCAL-Report-Generator-V1/backend/" \
    "/Volumes/your-share/OSCAL-Report-Generator-V1/backend/"
```

**Frontend only:**
```bash
rsync -avzh --update \
    --exclude 'node_modules/' \
    --exclude 'dist/' \
    "/Users/mkesharw/.../OSCAL-Report-Generator-V1/frontend/" \
    "/Volumes/your-share/OSCAL-Report-Generator-V1/frontend/"
```

---

## 🐛 Troubleshooting

### **Issue: "Destination directory does not exist"**

**Solution:**
1. Ensure SMB share is mounted: Check Finder → Locations
2. Create the destination folder on SMB share first
3. Verify the path in the script is correct

### **Issue: "Permission denied"**

**Solution:**
1. Check you have write permissions on the SMB share
2. Remount the share with proper credentials
3. Contact your network admin if needed

### **Issue: rsync command not found**

**Solution:**
rsync comes pre-installed on macOS. If missing:
```bash
brew install rsync
```

### **Issue: Files not syncing (showing as skipped)**

**Reason:** Files on destination are newer than source (by timestamp)

**Solution:** If you want to force overwrite:
```bash
rsync -avzh --ignore-times \  # Force sync based on size, not time
    --exclude 'node_modules/' \
    --exclude '.git/' \
    "source/" "destination/"
```

---

## 📈 Performance Tips

1. **First sync takes longest** (copies everything)
2. **Subsequent syncs are fast** (only changed files)
3. **Exclude node_modules** always (reinstall on server)
4. **Use wired connection** for faster transfer to network share
5. **Consider compression** for large files (already enabled with `-z`)

---

## 🔒 Security Notes

- ✅ `.env` files are excluded (don't deploy secrets)
- ✅ `.git` folder excluded (version control stays local)
- ✅ Log files excluded (may contain sensitive data)
- ⚠️ Ensure SMB share is secure (proper authentication)
- ⚠️ Use VPN if accessing remote shares

---

## 📝 Example Workflow

```bash
# 1. Make changes locally
vim backend/server.js

# 2. Test locally
cd backend && node server.js

# 3. Stop local server
# (already done)

# 4. Deploy to SMB share
./deploy-to-smb.sh

# 5. SSH to deployment server
ssh user@nas.keekar.com

# 6. Restart service on deployment server
cd /path/to/app
pm2 restart oscal-app
# OR
systemctl restart oscal-report-generator
```

---

## 🎯 Quick Reference

| Command | Purpose |
|---------|---------|
| `./deploy-to-smb.sh` | Full deployment (modified files only) |
| `rsync ... -n` | Dry run (preview changes) |
| `rsync ... --delete` | Delete files on dest not in source |
| `rsync ... --ignore-times` | Force sync (ignore timestamps) |

---

**Script Location**: `deploy-to-smb.sh`  
**Last Updated**: November 7, 2025

