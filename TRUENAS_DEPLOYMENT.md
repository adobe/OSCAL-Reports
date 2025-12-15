# TrueNAS SCALE Deployment Guide

**Application**: OSCAL Report Generator V2  
**Author**: Mukesh Kesharwani (mukesh.kesharwani@adobe.com)  
**TrueNAS Version**: SCALE 24.10 or later  
**Last Updated**: December 2025

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Deployment Methods](#deployment-methods)
4. [Method 1: Docker Compose (Recommended)](#method-1-docker-compose-recommended)
5. [Method 2: TrueNAS GUI Deployment](#method-2-truenas-gui-deployment)
6. [Method 3: Build on TrueNAS](#method-3-build-on-truenas)
7. [AI Integration](#ai-integration)
8. [Configuration](#configuration)
9. [Troubleshooting](#troubleshooting)
10. [Updates & Maintenance](#updates--maintenance)

---

## Overview

This guide covers deploying the OSCAL Report Generator V2 on TrueNAS SCALE. The application runs as a Docker container and provides a web interface accessible through your TrueNAS system.

**Key Features:**
- Web-based compliance documentation tool
- OSCAL SSP/SOA/CCM generation
- **AI-powered control suggestions** (configurable AI Engine integration)
- API Gateway integration for secure data fetching
- Runs on port 3020 (V2) or 3019 (V1)

---

## Prerequisites

### System Requirements
- **TrueNAS SCALE**: Version 24.10 or later
- **Memory**: Minimum 1GB RAM for application container
- **Storage**: 500MB for application image
- **AI Engine**: External AI Engine (e.g., Ollama) required for AI suggestions (not included)
- **Network**: Access to TrueNAS management interface

### Access Requirements
- SSH access to TrueNAS (for Methods 1 & 3)
- TrueNAS Web UI admin access
- Network port 3020 available (or choose alternative)

### Project Files Required
- `Dockerfile` - Container configuration
- `docker-compose.yml` - Docker Compose configuration
- `build_on_truenas.sh` - Build script
- Application source files (frontend + backend)

---

## Deployment Methods

### Comparison

| Method | Difficulty | Build Time | AI Setup | Best For |
|--------|-----------|------------|----------|----------|
| **Docker Compose** | Easy | Fast | Via Settings UI | Production (Recommended) |
| **TrueNAS GUI** | Medium | Fast | Via Settings UI | Quick deployment |
| **Build on TrueNAS** | Medium | Slow | Via Settings UI | Custom builds |

---

## Method 1: Docker Compose (Recommended)

This method sets up the application container. AI Engine must be configured separately via Settings UI.

### Step 1: Deploy Files to TrueNAS

```bash
# From your development machine
./deploy-to-smb.sh
```

### Step 2: SSH into TrueNAS

```bash
ssh admin@nas.keekar.com
```

### Step 3: Navigate to Project Directory

```bash
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-V2
```

### Step 4: Build Application Image

```bash
# Build the Docker image
./build_on_truenas.sh

# Or build manually:
docker build --build-arg PORT=3020 -t oscal-report-generator-v2:latest .
```

### Step 5: Start Application with Docker Compose

```bash
# Start application service
docker-compose up -d

# Verify container is running
docker ps
# Should show 'oscal-report-generator-v2' container
```

### Step 6: Configure AI Engine (Optional)

1. **Access Application**: `http://nas.keekar.com:3020`
2. **Log in** as Platform Administrator
3. **Navigate to**: Settings → AI Integration tab
4. **Configure** your external AI Engine (see [AI Integration](#ai-integration) section)

**Note**: AI Engine (e.g., Ollama) is NOT part of this project. You must set it up separately if you want AI-powered suggestions.

---

## Method 2: TrueNAS GUI Deployment

### Step 1: Build Docker Image

```bash
# SSH into TrueNAS
ssh admin@nas.keekar.com

# Navigate to project
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-V2

# Build image
docker build --build-arg PORT=3020 -t oscal-report-generator-v2:latest .
```

### Step 2: Deploy Application Container via GUI

1. Navigate to: **http://nas.keekar.com/ui/apps/available**

2. Click: **"Discover Apps"** → **"Custom App"**

3. Fill in form:
   ```
   Application Name: oscal-report-generator-v2
   Version: 2.0.0
   ```

4. **Container Images**:
   ```
   Repository: oscal-report-generator-v2  ⚠️ V2 image name
   Tag: latest
   Pull Policy: Never (since image is built locally)
   ```

5. **Port Forwarding**:
   ```
   Container Port: 3020  ⚠️ (Internal container port)
   Node Port: 3020       ✅ (External access port - can be different)
   Protocol: TCP
   ```

6. **Environment Variables**:
   ```
   NODE_ENV = production
   PORT = 3020
   ```
   
   **Note**: AI Engine configuration is done via Settings UI (Settings → AI Integration tab), not environment variables.
   - If missing, edit the container in TrueNAS GUI and add it

7. **Resources**:
   ```
   Memory Limit: 1024 Mi
   CPU Limit: 2.0 cores
   ```

8. **Health Check**:
   ```
   Enabled: Yes
   Start Period: 60s
   Interval: 30s
   Timeout: 10s
   Retries: 3
   Command: node -e "require('http').get('http://localhost:3020/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"
   ```

9. **Network**: Use default bridge network

10. Click: **"Install"**

### Step 3: Configure AI Engine (Optional)

If you want AI-powered suggestions, configure your external AI Engine:

1. **Set up AI Engine separately** (e.g., Ollama on another server/container)
2. **Configure in Application**:
   - Log into application as Platform Administrator
   - Navigate to: Settings → AI Integration tab
   - Enter AI Engine URL and Port
   - Test connection
   - Save configuration

See [AI Integration](#ai-integration) section for detailed instructions.

### Port Configuration Examples

**Example 1: External Port 3021, Container Port 3020**
```
Container Port: 3020
Node Port: 3021
PORT env var: 3020
Access URL: http://truenas-ip:3021
```

**Example 2: External Port 3020, Container Port 3020**
```
Container Port: 3020
Node Port: 3020
PORT env var: 3020
Access URL: http://truenas-ip:3020
```

**Key Point**: Container Port and PORT environment variable must always be `3020`. Only Node Port can vary.

---

## Method 3: Build on TrueNAS

### Step 1: Transfer Files to TrueNAS

```bash
# From your development machine
./deploy-to-smb.sh
```

### Step 2: SSH into TrueNAS

```bash
ssh admin@nas.keekar.com
```

### Step 3: Navigate to Project Directory

```bash
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-V2
```

### Step 4: Build Docker Image

```bash
# Use the build script (handles config files and credentials)
./build_on_truenas.sh

# Or build manually:
docker build --build-arg PORT=3020 --build-arg BUILD_TIMESTAMP="$(date -Iseconds)" -t oscal-report-generator-v2:latest .
```

### Step 5: Deploy via Docker Compose or GUI

Follow steps from Method 1 (Docker Compose) or Method 2 (GUI).

---

## AI Integration

### Overview

The application supports AI-powered implementation text generation for control suggestions. **The AI Engine (e.g., Ollama) is NOT part of this project** - you must set it up separately and configure the connection in the application settings.

### Configuration via Settings UI

1. **Log into the application** as Platform Administrator
2. **Navigate to**: Settings → AI Integration tab
3. **Configure**:
   - Enable AI Engine
   - Enter AI Engine URL (hostname or IP, e.g., `192.168.1.200`)
   - Enter Port (e.g., `30068` for Ollama)
   - Model Name (e.g., `mistral:7b` for Ollama)
   - Timeout (default: 30000ms)
4. **Test Connection**: Click "Test Connection" to verify connectivity
5. **Save**: Click "Save AI Configuration"

### Example Configuration

If your Ollama is running at `192.168.1.200:30068`:

- **URL**: `192.168.1.200`
- **Port**: `30068`
- **Model**: `mistral:7b`
- **Timeout**: `30000`

The application will construct the full URL: `http://192.168.1.200:30068`

### Configuration Priority

The application checks configuration sources in this order:

1. **Settings UI** (`aiConfig` in `config/app/config.json`) - **Highest Priority**
2. **Environment Variable** (`OLLAMA_URL`) - For Docker deployments
3. **Config File** (`mistralConfig` in `config/app/config.json`) - Legacy
4. **Default** (`http://localhost:11434`) - Fallback

### Verification

After configuration, verify AI integration:

1. **Test Connection** in Settings → AI Integration tab
2. **Use AI Suggestions**:
   - Log into the application
   - Load a catalog
   - Click "Get Suggestions" on any control
   - Check "Why these suggestions?" should show:
     - "Implementation text generated using AI Agents maintained by Adobe"

### Troubleshooting AI Integration

#### Issue: "AI Engine connection test failed"

**Symptoms**: Test connection fails in Settings UI

**Solutions**:
1. **Verify AI Engine is running**:
   ```bash
   # For Ollama
   curl http://192.168.1.200:30068/api/tags
   ```

2. **Check network connectivity**:
   - Ensure the application container can reach the AI Engine host
   - Check firewall rules
   - Verify port is correct

3. **Verify URL format**:
   - Use hostname/IP only (no `http://` prefix)
   - Port should be separate field
   - Example: URL=`192.168.1.200`, Port=`30068`

4. **Check AI Engine logs**:
   ```bash
   # For Ollama Docker container
   docker logs ollama
   ```

#### Issue: "Get Suggestions" not using AI

**Symptoms**: Suggestions use template/fallback text instead of AI

**Solutions**:
1. **Check AI Configuration**:
   - Settings → AI Integration tab
   - Ensure "Enabled" toggle is ON
   - Verify URL and Port are correct

2. **Test Connection**:
   - Use "Test Connection" button in Settings
   - Fix any errors reported

3. **Check Application Logs**:
   ```bash
   docker logs oscal-report-generator-v2 | grep -i "ai\|mistral\|ollama"
   ```

#### Issue: "Model not found"

**Solution**: Ensure the model is available on your AI Engine:
```bash
# For Ollama
curl http://192.168.1.200:30068/api/tags

# Pull model if missing
docker exec -it ollama ollama pull mistral:7b
```

### Setting Up Ollama (External)

If you want to use Ollama as your AI Engine, set it up separately:

1. **Install Ollama** (not part of this project):
   ```bash
   # Docker example
   docker run -d -v ollama-data:/root/.ollama -p 11434:11434 --name ollama ollama/ollama:latest
   ```

2. **Pull Mistral model**:
   ```bash
   docker exec -it ollama ollama pull mistral:7b
   ```

3. **Configure in Application**:
   - Settings → AI Integration
   - URL: `your-ollama-host`
   - Port: `11434` (or your mapped port)
   - Model: `mistral:7b`

### Performance Considerations

- **Memory**: Mistral 7B requires ~4GB RAM
- **Disk**: Model is ~4.4GB
- **Network**: Ensure low latency between application and AI Engine
- **Timeout**: Adjust timeout in Settings if requests are slow

---

## Configuration

### Port Configuration

**Default Port**: 3020 (V2) or 3019 (V1)

**To use different external port**:

1. In TrueNAS GUI → Port Forwarding:
   ```
   Container Port: 3020 (keep as is)
   Node Port: 8080 (your choice)
   ```

2. Access at: `http://nas.keekar.com:8080`

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | production | Environment mode |
| `PORT` | 3020 | Application port (V2) |
| `OLLAMA_URL` | (optional) | Legacy: AI Engine URL (prefer Settings UI) |
| `BUILD_TIMESTAMP` | Current time | Build timestamp for password generation |

### Storage (Optional)

To persist data between container restarts:

1. Create dataset:
   ```
   TrueNAS GUI → Datasets → Create
   Name: oscal-data
   ```

2. Add in Custom App → Storage:
   ```
   Host Path: /mnt/pool1/oscal-data
   Mount Path: /app/data
   ```

### WebUI Button

To add "Web UI" button in TrueNAS Apps list:

Add these labels in `docker-compose.yml` or GUI → Labels:

```yaml
labels:
  - "org.truenas.webui.enable=true"
  - "org.truenas.webui.protocol=http"
  - "org.truenas.webui.host=0.0.0.0"
  - "org.truenas.webui.port=3020"
  - "org.truenas.webui.path=/"
```

---

## Troubleshooting

### V2 Image Name Configuration

**Important:** V2 uses a different image name to avoid conflicts with V1:

### Image Build Requirement

⚠️ **CRITICAL**: This application uses a **local Docker image** that must be built before deployment. TrueNAS will show an error if you try to deploy without building the image first:

```
Error: pull access denied for oscal-report-generator-v2, repository does not exist
```

**Solution**: Always build the image locally before GUI deployment:

```bash
# On TrueNAS server
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-V2
./build_on_truenas.sh

# Or manually
docker build \
  --build-arg PORT=3020 \
  --build-arg BUILD_TIMESTAMP="$(date -Iseconds)" \
  -t oscal-report-generator-v2:latest .
```

**In TrueNAS GUI**, set **Image Pull Policy** to `If Not Present` or `Never` to use the local image.

- **V1 Image:** `oscal-report-generator:latest`
- **V2 Image:** `oscal-report-generator-v2:latest` ⚠️

When deploying V2 in TrueNAS GUI:
- **Repository:** `oscal-report-generator-v2`
- **Application Name:** `oscal-report-generator-v2` (recommended)

### Common Issues

#### 1. "Pull access denied" or "repository does not exist" Error

**Error:**
```
Error: pull access denied for oscal-report-generator-v2, repository does not exist
```

**Cause**: TrueNAS is trying to pull the image from Docker Hub, but this is a local-only image.

**Solution**:
1. **Build the image locally first**:
   ```bash
   ssh admin@nas.keekar.com
   cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-V2
   ./build_on_truenas.sh
   ```

2. **In TrueNAS GUI**, when configuring the app:
   - Set **Image Pull Policy** to `If Not Present` or `Never`
   - This tells TrueNAS to use the local image instead of pulling from registry

3. **Verify image exists**:
   ```bash
   docker images | grep oscal-report-generator-v2
   ```

4. **Alternative**: Use Docker Compose method instead (automatically builds image)

#### 2. Port Already in Use

**Error:**
```
The port is being used by following services:
1) "0.0.0.0:3020" used by Applications ('oscal-report-generator' application)
```

**Solution:**
```bash
# Stop old application
TrueNAS GUI → Apps → Find old app → Stop → Delete

# Or use different port
Change Node Port to: 8080, 8888, etc.
```

#### 2. GUI Deployment Fails: "Failed 'up' action"

**Error:**
```
[EFAULT] Failed 'up' action for 'oscalgenr8tr-v12' app. 
Please check /var/log/app_lifecycle.log for more details
```

**Step-by-Step Troubleshooting:**

1. **Check the log file:**
   ```bash
   ssh admin@nas.keekar.com
   sudo tail -100 /var/log/app_lifecycle.log
   ```

2. **Common Causes & Solutions:**

   **A. Port Mismatch (Most Common)**
   - **Problem**: Container port doesn't match application port
   - **Solution**: Ensure port configuration matches:
     - Container Port: `3020`
     - Node Port: `3020` (or any available port)
     - Environment Variable: `PORT=3020`

   **B. Image Not Found Locally**
   ```bash
   # Check if image exists
   sudo docker images | grep oscal-report-generator-v2
   
   # If missing, build it:
   cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-V2
   sudo docker build -t oscal-report-generator-v2:latest .
   
   # In GUI: Set Pull Policy to "Never"
   ```

   **C. Health Check Failing**
   - **Problem**: Health check times out before app starts
   - **Solution**: 
     - Increase Start Period to 60s in GUI
     - Or disable health check temporarily for testing
     - Verify health endpoint: `curl http://localhost:3020/health`

   **D. Port Already in Use**
   ```bash
   # Check if port is already used
   sudo netstat -tuln | grep 3020
   # or
   sudo lsof -i :3020
   
   # Solution: Use different port or stop conflicting app
   ```

   **E. Insufficient Resources**
   - **Problem**: Container fails due to memory/CPU limits
   - **Solution**: In GUI → Resources:
     - Memory Limit: Increase to 1024 Mi
     - CPU Limit: Increase to 2.0 cores

   **F. Network Configuration Issue**
   - **Problem**: Custom network conflicts
   - **Solution**: 
     - Use default network in GUI
     - Or ensure network exists: `sudo docker network ls`

3. **Manual Test (Before GUI Deployment):**
   ```bash
   # Test if image works manually
   sudo docker run -d \
     -p 3020:3020 \
     -e NODE_ENV=production \
     -e PORT=3020 \
     --name oscal-test \
     oscal-report-generator-v2:latest
   
   # Wait 30 seconds, then check
   sleep 30
   curl http://localhost:3020/health
   
   # If successful, stop test container
   sudo docker stop oscal-test
   sudo docker rm oscal-test
   
   # Then try GUI deployment again
   ```

#### 4. Cannot Access Web UI

**Check:**
```bash
# 1. Is container running?
sudo docker ps | grep oscal

# 2. Is port accessible?
curl http://localhost:3020/health

# 3. Check TrueNAS firewall
# TrueNAS GUI → Network → Firewall
```

#### 5. Application Won't Start

**Debug:**
```bash
# View container logs
sudo docker logs oscal-report-generator-v2

# Common issues:
# - Missing node_modules: Rebuild image
# - Port conflict: Change port
# - Memory limit: Increase in GUI
```

#### 6. AI Integration Not Working

**Problem**: AI suggestions not working or connection test fails.

**Symptoms**:
- "Get Suggestions" always uses template/fallback text
- No "Implementation text generated using AI Agents maintained by Adobe" message
- Connection test fails in Settings → AI Integration

**Solution Steps**:

1. **Check AI Configuration in Settings**:
   - Log into application as Platform Administrator
   - Navigate to: Settings → AI Integration tab
   - Verify "Enabled" toggle is ON
   - Check URL and Port are correct
   - Use "Test Connection" button to verify connectivity

2. **Verify AI Engine is running**:
   ```bash
   # Test AI Engine directly (replace with your URL/port)
   curl http://192.168.1.200:30068/api/tags
   ```

3. **Check network connectivity**:
   - Ensure application container can reach AI Engine host
   - Check firewall rules
   - Verify port is correct

4. **Check application logs**:
   ```bash
   docker logs oscal-report-generator-v2 | grep -i "ai\|mistral\|ollama"
   ```

5. **Verify configuration priority**:
   - Settings UI configuration takes highest priority
   - Environment variables (`OLLAMA_URL`) are fallback
   - Check Settings → AI Integration is configured correctly

See [AI Integration](#ai-integration) section for detailed troubleshooting.

---

## Updates & Maintenance

### Updating Application

#### Method 1: Rebuild Image

```bash
# Get latest code
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-V2
git pull  # or rsync new files

# Rebuild
sudo docker build -t oscal-report-generator-v2:latest .

# In TrueNAS GUI:
# Apps → oscal-report-generator-v2 → Stop → Start
# (Will use new image automatically)
```

#### Method 2: Using Docker Compose

```bash
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-V2

# Rebuild and restart
docker-compose up -d --build
```

### Updating AI Model

Update your AI Engine model separately (not part of this application):
```bash
# Example for Ollama
docker exec -it ollama ollama pull mistral:7b
```

### Backup

**Export Application Config:**
```
TrueNAS GUI → Apps → oscal-report-generator-v2
→ Three dots menu → Export
→ Save YAML file
```

**Backup Data:**
```bash
# If using persistent storage
sudo tar -czf oscal-backup-$(date +%Y%m%d).tar.gz /mnt/pool1/oscal-data/

# Transfer to safe location
scp oscal-backup-*.tar.gz user@backup-server:/backups/
```

### Monitoring

**Check Health:**
```bash
# Container status
sudo docker ps | grep oscal

# Health check
curl http://localhost:3020/health

# View logs
sudo docker logs -f oscal-report-generator-v2

# Resource usage
sudo docker stats oscal-report-generator-v2
```

**Set up Alerts:**
```
TrueNAS GUI → System → Alert Settings
→ Add alert for container not running
```

---

## Performance Tuning

### Memory Limits

In Custom App → Resources:
```
Memory Limit: 1024 Mi (1GB) - Application
CPU Limit: 2.0 cores

**Note**: AI Engine resources are managed separately (not part of this application).
```

### Multiple Instances

For load balancing:

1. Deploy multiple instances on different ports
2. Use TrueNAS HAProxy or external load balancer
3. Configure session affinity

---

## Security

### Network Security

**Recommendations:**
1. Use TrueNAS firewall to restrict access
2. Deploy behind reverse proxy (Traefik, Nginx)
3. Enable HTTPS via TrueNAS certificates
4. Use VPN for external access

### Application Security

**API Gateway:**
- Configure AWS/Azure API Gateway in Settings
- Never store credentials in application
- Use IAM roles for TrueNAS deployment

**Updates:**
- Regularly rebuild image with latest dependencies
- Monitor security advisories
- Keep TrueNAS updated

---

## Quick Reference

### Commands

```bash
# View running containers
sudo docker ps

# View all containers
sudo docker ps -a

# View logs
sudo docker logs oscal-report-generator-v2

# Follow logs
sudo docker logs -f oscal-report-generator-v2

# Restart container
sudo docker restart oscal-report-generator-v2

# Stop container
sudo docker stop oscal-report-generator-v2

# Remove container
sudo docker rm oscal-report-generator-v2

# List images
sudo docker images

# Remove image
sudo docker rmi oscal-report-generator-v2:latest

# Build image
sudo docker build -t oscal-report-generator-v2:latest .

# Docker Compose commands
docker-compose up -d          # Start services
docker-compose down           # Stop services
docker-compose restart        # Restart services
docker-compose logs -f        # View logs
docker-compose ps             # View status
```

### URLs

- **TrueNAS GUI**: http://nas.keekar.com/ui/apps
- **Application**: http://nas.keekar.com:3020
- **Health Check**: http://nas.keekar.com:3020/health
- **AI Status**: Configure and test via Settings → AI Integration tab

---

## Support

### Logs Location

```bash
# Container logs
sudo docker logs oscal-report-generator-v2 > /mnt/pool1/logs/oscal-$(date +%Y%m%d).log

# TrueNAS app logs
/var/log/app_lifecycle.log

# AI Engine logs (if using external Ollama)
# Check your AI Engine logs separately
```

### Getting Help

1. **Check logs** (above)
2. **Review this guide** (troubleshooting section)
3. **Contact**: mukesh.kesharwani@adobe.com
4. **Include**:
   - TrueNAS version
   - Error messages
   - Container logs
   - Steps to reproduce

---

**Document Version**: 2.0  
**Last Updated**: December 2025  
**Author**: Mukesh Kesharwani (mukesh.kesharwani@adobe.com)
