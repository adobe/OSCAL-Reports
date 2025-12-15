# 📋 TrueNAS YAML Deployment Guide

## Deploy OSCAL Report Generator via YAML Configuration

**Author**: Mukesh Kesharwani <mukesh.kesharwani@adobe.com>  
**Server**: nas.keekar.com

---

## 🎯 Prerequisites

Before deploying, ensure:

✅ Docker image is built on TrueNAS:
```bash
docker images | grep oscal-report-generator
# Should show: oscal-report-generator   latest   ...
```

If not built yet, run:
```bash
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-V1
docker build -t oscal-report-generator:latest .
```

---

## 📝 Step-by-Step Deployment via YAML

### Step 1: Access TrueNAS Apps Page

1. Open your browser
2. Navigate to: **http://nas.keekar.com/ui/apps**
3. Log in with your admin credentials

### Step 2: Launch Custom App

1. Click on **"Discover Apps"** or **"Available Applications"**
2. Look for **"Custom App"** option
3. Click **"Install"** or **"Launch Docker Image"**

### Step 3: Choose "Compose" or "YAML" Option

Look for one of these options:
- **"Docker Compose"** tab
- **"YAML Configuration"** option
- **"Advanced Settings"** → **"Compose"**

### Step 4: Paste YAML Configuration

Copy and paste this YAML into the text area:

```yaml
version: "3.8"

services:
  oscal-report-generator:
    image: oscal-report-generator:latest
    container_name: oscal-report-generator
    hostname: oscal-generator
    restart: unless-stopped
    
    ports:
      - "3019:3019"
    
    environment:
      - NODE_ENV=production
      - PORT=3019
    
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3019/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    
    labels:
      - "app.name=OSCAL Report Generator"
      - "app.description=Generate OSCAL SOA/SSP/CCM compliance reports"
      - "app.author=Mukesh Kesharwani"
      - "app.version=1.0.0"
      - "app.url=http://nas.keekar.com:3019"
    
    networks:
      - default

networks:
  default:
    name: oscal-network
    driver: bridge
```

### Step 5: Configure App Name

In the GUI form, you'll also need to provide:

```
Application Name: oscal-report-generator
```

### Step 6: Deploy

1. Review the configuration
2. Click **"Save"** or **"Install"** or **"Deploy"**
3. Wait for deployment (30-60 seconds)
4. Check status - should show **"Active"** or **"Running"**

---

## 🎨 Customizable Parameters in YAML

You can modify these values before deploying:

### Change External Port

```yaml
ports:
  - "8080:3019"  # Change 8080 to any available port
```

### Add Resource Limits

```yaml
services:
  oscal-report-generator:
    # ... existing config ...
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
```

### Add Storage Volume (Optional)

```yaml
services:
  oscal-report-generator:
    # ... existing config ...
    volumes:
      - /mnt/pool1/apps/oscal-data:/app/data
```

### Change Environment Variables

```yaml
environment:
  - NODE_ENV=production
  - PORT=3019
  - TZ=America/New_York  # Add timezone
```

---

## ✅ Verification

### 1. Check App Status in GUI

1. Go to **Apps** → **Installed Applications**
2. Find "oscal-report-generator"
3. Status should show **"Running"** with green indicator

### 2. Test Health Endpoint

Open browser or use curl:
```bash
curl http://nas.keekar.com:3019/health
```

Expected response:
```json
{"status":"healthy","service":"Keekar's OSCAL SOA/SSP/CCM Generator"}
```

### 3. Access Application

Navigate to:
```
http://nas.keekar.com:3019
```

You should see the OSCAL Report Generator interface!

---

## 🔧 Alternative: Deploy via SSH with Docker Compose

If TrueNAS GUI doesn't have YAML/Compose option, you can deploy via SSH:

### Step 1: Create docker-compose.yml on TrueNAS

```bash
# SSH to TrueNAS
ssh admin@nas.keekar.com

# Create compose file
cat > /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-V1/docker-compose.yml << 'EOF'
version: "3.8"

services:
  oscal-report-generator:
    image: oscal-report-generator:latest
    container_name: oscal-report-generator
    hostname: oscal-generator
    restart: unless-stopped
    
    ports:
      - "3019:3019"
    
    environment:
      - NODE_ENV=production
      - PORT=3019
    
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3019/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    
    labels:
      - "app.name=OSCAL Report Generator"
      - "app.description=Generate OSCAL SOA/SSP/CCM compliance reports"
      - "app.author=Mukesh Kesharwani"
      - "app.version=1.0.0"
    
    networks:
      - default

networks:
  default:
    name: oscal-network
    driver: bridge
EOF
```

### Step 2: Deploy with Docker Compose

```bash
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-V1
docker-compose up -d
```

### Step 3: Verify

```bash
# Check status
docker-compose ps

# View logs
docker-compose logs -f

# Test health
curl http://localhost:3019/health
```

---

## 📊 Managing Your App

### View Logs

**Via GUI:**
1. Apps → Installed Applications
2. Click "oscal-report-generator"
3. Click "Logs" tab

**Via SSH:**
```bash
docker logs oscal-report-generator
docker logs -f oscal-report-generator  # Follow logs
```

### Restart App

**Via GUI:**
1. Apps → Installed Applications
2. Click "oscal-report-generator"
3. Click "Restart"

**Via SSH:**
```bash
docker restart oscal-report-generator
# or
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-V1
docker-compose restart
```

### Stop App

**Via GUI:**
1. Apps → Installed Applications
2. Click "oscal-report-generator"
3. Click "Stop"

**Via SSH:**
```bash
docker stop oscal-report-generator
# or
docker-compose down
```

### Update App

**Via GUI:**
1. Stop the app
2. Delete the app
3. Rebuild Docker image if needed
4. Redeploy with YAML

**Via SSH:**
```bash
# Rebuild image
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-V1
docker build -t oscal-report-generator:latest .

# Restart with new image
docker-compose down
docker-compose up -d
```

---

## 🔍 Troubleshooting

### App Shows as "Failed" or "Error"

1. Check logs: `docker logs oscal-report-generator`
2. Verify image exists: `docker images | grep oscal`
3. Check port availability: `netstat -tuln | grep 3019`
4. Try rebuilding: `docker build -t oscal-report-generator:latest .`

### Cannot Access via Browser

1. Verify app is running: `docker ps | grep oscal`
2. Check health: `curl http://localhost:3019/health`
3. Check firewall: Ensure port 3019 is open
4. Try different browser or clear cache

### Health Check Failing

1. Increase initial delay in YAML:
   ```yaml
   start_period: 60s  # Increase from 40s
   ```
2. Check if Node.js is starting: `docker logs oscal-report-generator`

### Port Already in Use

Change the external port in YAML:
```yaml
ports:
  - "8080:3019"  # Use 8080 instead of 3019
```

---

## 🎉 Success!

Once deployed, you can access your application at:

**Main URL**: http://nas.keekar.com:3019  
**Health Check**: http://nas.keekar.com:3019/health

The app will:
- ✅ Start automatically when TrueNAS boots
- ✅ Restart if it crashes
- ✅ Monitor its own health
- ✅ Be visible in TrueNAS Apps dashboard

---

## 📧 Support

**Author**: Mukesh Kesharwani  
**Email**: mukesh.kesharwani@adobe.com  
**Server**: nas.keekar.com

For issues or questions, check the logs or contact the author.

---

**Deployment Complete! Enjoy your OSCAL Report Generator! 🎊**

