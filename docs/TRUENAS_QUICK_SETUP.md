# TrueNAS Quick Setup Guide

## 🚀 Quick Start (5 Minutes)

### 1. Clone Repository (Both Instances)

```bash
ssh mkesharw@NAS01
cd /mnt/pool1/Documents/KACI-Apps

# Blue instance
git clone https://github.com/keekar2022/OSCAL-Reports.git OSCAL-Report-Generator-Blue
cd OSCAL-Report-Generator-Blue
chmod +x build_on_truenas.sh

# Green instance
cd ..
git clone https://github.com/keekar2022/OSCAL-Reports.git OSCAL-Report-Generator-Green
cd OSCAL-Report-Generator-Green
chmod +x build_on_truenas.sh
```

### 2. Initial Deployment

```bash
# Deploy Blue (Port 3020)
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue
./build_on_truenas.sh

# Deploy Green (Port 3019)
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green
./build_on_truenas.sh
```

### 3. Setup Automated Updates (Cron - Monthly Sunday Schedule)

```bash
crontab -e

# Add these lines for staggered monthly updates:
# Green: 1st, 3rd, and 5th Sunday at 2 AM
0 2 1-7,15-21,29-31 * 0 cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green && ./build_on_truenas.sh >> /var/log/oscal-green-deploy.log 2>&1

# Blue: 2nd and 4th Sunday at 2 AM
0 2 8-14,22-28 * 0 cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue && ./build_on_truenas.sh >> /var/log/oscal-blue-deploy.log 2>&1
```

### 4. Verify Deployment

```bash
# Check containers
docker ps | grep oscal

# Test Blue instance
curl http://localhost:3020/health

# Test Green instance
curl http://localhost:3019/health
```

---

## 📋 Key Information

| Instance | Port | Container Name | URL |
|----------|------|----------------|-----|
| Blue | 3020 | oscal-report-generator-blue | http://NAS01:3020 |
| Green | 3019 | oscal-report-generator-green | http://NAS01:3019 |

---

## 🔍 Useful Commands

### View Logs
```bash
# Deployment logs
tail -f /var/log/oscal-blue-deploy.log
tail -f /var/log/oscal-green-deploy.log

# Container logs
docker logs -f oscal-report-generator-blue
docker logs -f oscal-report-generator-green
```

### Container Management
```bash
# Restart
docker restart oscal-report-generator-blue
docker restart oscal-report-generator-green

# Stop
docker stop oscal-report-generator-blue
docker stop oscal-report-generator-green

# Status
docker ps | grep oscal
```

### Force Update
```bash
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue
./build_on_truenas.sh --force
```

---

## 🎯 How It Works

### Deployment Schedule
- **Green Instance**: Updates on 1st, 3rd, and 5th Sunday of each month
- **Blue Instance**: Updates on 2nd and 4th Sunday of each month

### Workflow
1. **Cron triggers** script on scheduled Sunday
2. **Script pulls** latest code from GitHub
3. **Compares versions** (deployed vs GitHub)
4. **If version changed**:
   - Builds new Docker image
   - Stops old container
   - Starts new container
5. **If version same**: Exits (no action needed)

---

## ⚙️ What Gets Auto-Detected

- ✅ Blue or Green instance (from directory name)
- ✅ Port assignment (3020 or 3019)
- ✅ Container name and Docker image tag
- ✅ Current version vs GitHub version
- ✅ Whether rebuild is needed

---

## 📖 Full Documentation

For detailed information, see: `docs/TRUENAS_DEPLOYMENT.md`

---

## 🆘 Quick Troubleshooting

### Container won't start?
```bash
docker logs oscal-report-generator-blue
```

### Cron not running?
```bash
tail -f /var/log/oscal-blue-deploy.log
```

### Force rebuild?
```bash
./build_on_truenas.sh --force
```

### Check version?
```bash
grep '"version"' package.json
docker exec oscal-report-generator-blue cat /app/package.json | grep version
```

---

**That's it!** The system will now automatically update when you push changes to GitHub. 🎉

