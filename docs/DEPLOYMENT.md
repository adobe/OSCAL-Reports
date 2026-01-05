# 🚀 OSCAL Report Generator - Deployment Guide

**Version**: 1.2.7  
**Author**: Mukesh Kesharwani <mukesh.kesharwani@adobe.com>  
**Last Updated**: December 2025

---

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Configuration Management](#configuration-management)
3. [Docker Deployment](#docker-deployment)
4. [TrueNAS Deployment](#truenas-deployment)
5. [SMB/Network Share Deployment](#smbnetwork-share-deployment)
6. [Production Configuration](#production-configuration)
7. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Prerequisites

- **Node.js** 20+ (for local development)
- **Docker** (for containerized deployment)
- **Modern web browser** (Chrome, Firefox, Safari, Edge)

### Local Development

```bash
# Clone the repository
cd OSCAL-Report-Generator-1.2.7

# Run setup script
chmod +x setup.sh
./setup.sh

# Start development server (both frontend and backend)
npm run dev

# Access application
# Frontend dev server (with hot reload):
open http://localhost:3021

# Or backend directly (production build):
open http://localhost:3020
```

---

## Configuration Management

### Configuration Directory Structure

All configuration files are centralized in the `config/` directory:

```
config/
├── app/          # Application runtime configuration files
│   ├── config.json    # Application settings (SSO, messaging, API gateways, etc.)
│   └── users.json     # User accounts and authentication data
│
└── build/        # Build and deployment configuration files
    ├── docker-compose.yml   # Docker Compose configuration for local deployment
    ├── truenas-app.yaml     # TrueNAS Docker App configuration
    └── Dockerfile           # Docker build instructions
```

### Security and Access Control

**⚠️ IMPORTANT**: The `config/app/` directory contains sensitive data including:
- User credentials (FIPS 140-2 compliant PBKDF2 hashed passwords)
- API keys and secrets
- SMTP credentials
- SSO configuration

**Password Storage Format:**
- Passwords are stored using PBKDF2 with SHA-256 (FIPS 140-2 compliant)
- Format: `pbkdf2$sha256$100000$salt$hash`
- 100,000 iterations, random 16-byte salt per password
- Legacy SHA-256 passwords automatically migrate to PBKDF2 on login

**This directory should be encrypted and have restricted access controls applied.**

#### Recommended Security Measures

1. **File System Encryption**: Apply encryption at the filesystem level for the `config/app/` directory
2. **Access Control**: Restrict read/write permissions to authorized users only
3. **Backup Encryption**: Ensure backups of this directory are also encrypted
4. **Version Control**: These files are excluded from git (see `.gitignore`)

### File Migration

The application automatically migrates configuration files from legacy locations:
- `backend/config.json` → `config/app/config.json`
- `backend/auth/users.json` → `config/app/users.json`

Migration happens automatically on first run. Legacy files are removed after successful migration.

### Configuration File Locations

**Runtime Locations** (for application execution):
- Primary: `config/app/config.json` and `config/app/users.json`
- Legacy (backward compatibility): `backend/config.json` and `backend/auth/users.json`

**Build Locations** (for Docker/build processes):
- `docker-compose.yml` (copied from `config/build/docker-compose.yml`)
- `truenas-app.yaml` (copied from `config/build/truenas-app.yaml`)
- `Dockerfile` (copied from `config/build/Dockerfile`)

---

## Docker Deployment

### Build Docker Image

```bash
# Build the image
docker build -t oscal-report-generator:1.2.7 .

# Run the container
docker run -d \
  --name oscal-generator \
  -p 3020:3020 \
  -e NODE_ENV=production \
  -e PORT=3020 \
  oscal-report-generator:1.2.7

# Verify it's running
curl http://localhost:3020/health

# Expected response:
# {"status":"healthy","service":"Keekar's OSCAL SOA/SSP/CCM Generator"}
```

### Docker Compose (with Ollama AI)

```bash
# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

---

## TrueNAS Deployment

### Method 1: Quick Start (GUI - 5 Minutes)

**Target Server**: http://nas.keekar.com:3020

**Port Configuration**:
- Application Port: 3020 (backend API and frontend)
- Ollama AI Service: 11434 (if using local AI)

#### 1. Build Docker Image (On Your PC)

```bash
cd /path/to/OSCAL-Report-Generator-1.2.7
docker build -t oscal-report-generator:latest .
docker save -o oscal-report-generator.tar oscal-report-generator:latest
```

#### 2. Transfer to TrueNAS

```bash
scp oscal-report-generator.tar admin@nas.keekar.com:/mnt/tank/
```

#### 3. Load on TrueNAS

```bash
ssh admin@nas.keekar.com
docker load -i /mnt/tank/oscal-report-generator.tar
```

#### 4. Deploy via GUI

1. Open: `http://nas.keekar.com/ui/apps/available`
2. Click: **"Launch Docker Image"** or **"Custom App"**
3. Fill in:

```yaml
Application Name: oscal-report-generator

Container Image:
  Repository: oscal-report-generator
  Tag: latest
  Pull Policy: Never

Port Forwarding:
  Container Port: 3020
  Node Port: 3020

Environment Variables:
  NODE_ENV: production
  PORT: 3020
  OLLAMA_URL: http://ollama:11434  # if using Ollama

Health Check:
  Type: HTTP
  Path: /health
  Port: 3020
  Initial Delay: 40 seconds
```

4. Click **"Save"** → Wait for **"Running"** status

#### 5. Access

```
http://nas.keekar.com:3020
```

### Method 2: Using YAML Configuration

#### 1. Copy Configuration File

```bash
cp truenas-app.yaml /mnt/tank/apps/oscal-generator/
```

#### 2. Deploy via TrueNAS CLI

```bash
# SSH into TrueNAS
ssh admin@nas.keekar.com

# Navigate to app directory
cd /mnt/tank/apps/oscal-generator/

# Deploy using docker-compose
docker-compose -f truenas-app.yaml up -d
```

#### 3. Verify Deployment

```bash
# Check running containers
docker ps

# Check logs
docker logs oscal-report-generator

# Test health endpoint
curl http://localhost:3020/health
```

### Method 3: Using TrueNAS Build Script

For automated builds directly on TrueNAS:

```bash
# Make the script executable
chmod +x build_on_truenas.sh

# Run the build script
./build_on_truenas.sh
```

The script will:
- ✅ Install dependencies
- ✅ Build frontend
- ✅ Create Docker image
- ✅ Deploy container
- ✅ Configure health checks

### TrueNAS Configuration Parameters

| Parameter | Value | Adjustable? | Notes |
|-----------|-------|-------------|-------|
| **Application Name** | oscal-report-generator | ✅ Yes | Any valid name |
| **Container Port** | 3020 | ❌ No (fixed) | Application listens on 3020 |
| **External Port** | 3020 | ✅ Yes | Map to any available port |
| **Ollama Port** | 11434 | ❌ No (if using) | For local AI |
| **CPU Limit** | 2 cores | ✅ Yes | Minimum 1 core |
| **Memory Limit** | 2GB | ✅ Yes | Minimum 1GB |
| **NODE_ENV** | production | ✅ Yes | Use 'production' |
| **Health Check Path** | /health | ❌ No | Fixed endpoint |

### TrueNAS Checklist

- [ ] Docker image built
- [ ] Image transferred to TrueNAS
- [ ] Image loaded in TrueNAS
- [ ] App deployed via GUI/YAML
- [ ] Port 3020 accessible
- [ ] Health check passing
- [ ] Application interface loads
- [ ] Default credentials retrieved from `credentials.txt`

---

## Production Configuration

### Environment Variables

Create a `.env` file (or set in your deployment):

```bash
# Application
NODE_ENV=production
PORT=3020                    # Backend server port

# AI Integration (Optional)
OLLAMA_URL=http://localhost:11434   # For local Ollama AI

# OR for AWS Bedrock (Cloud AI)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
BEDROCK_MODEL_ID=mistral.mistral-large-2402-v1:0

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@domain.com
SMTP_PASSWORD=your-password

# Security
BUILD_TIMESTAMP=2025-12-16T20:00:00.000Z
```

### Security Configuration

1. **Copy configuration templates**:
   ```bash
   cp config/app/config.json.example config/app/config.json
   cp config/app/users.json.example config/app/users.json
   ```

2. **Set file permissions**:
   ```bash
   chmod 600 config/app/config.json
   chmod 600 config/app/users.json
   chmod 600 backend/auth/users.json
   ```

3. **Change default passwords** immediately after first login!
   - Check `credentials.txt` for initial passwords
   - Format: `username#DDMMYYHH` (timestamp-based)

### Reverse Proxy Setup (Nginx)

```nginx
server {
    listen 80;
    server_name oscal.yourdomain.com;

    # Main application
    location / {
        proxy_pass http://localhost:3020;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Increase timeout for AI operations
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
    }
}
```

### SSL/TLS Configuration

```bash
# Using Let's Encrypt
sudo certbot --nginx -d oscal.yourdomain.com

# Manual certificate
sudo cp your-cert.crt /etc/ssl/certs/
sudo cp your-key.key /etc/ssl/private/
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| **Port already in use** | Change port in environment variables or docker config |
| **App won't start** | Check logs: `docker logs oscal-generator` or `tail -f backend.log` |
| **Can't access web UI** | Verify firewall rules, check port forwarding |
| **Health check fails** | Increase initial delay to 60 seconds |
| **Permission denied** | Check file permissions: `chmod 600 config/app/*` |
| **Module not found** | Run `npm install` in backend and frontend directories |
| **Database/Config errors** | Copy `.example` files to actual config files |

### Debug Commands

```bash
# Check if app is running
curl http://localhost:3020/health

# Check Docker container logs
docker logs -f oscal-generator

# Check Node.js process
ps aux | grep node

# Check port usage
lsof -i :3020        # Backend
lsof -i :3021        # Frontend dev
lsof -i :11434       # Ollama AI
netstat -an | grep 3020

# Verify file permissions
ls -la config/app/

# Test AI connectivity (if using Ollama)
curl http://localhost:11434/api/tags

# Test AWS Bedrock (if using)
# Check backend logs for connection attempts
docker logs oscal-generator | grep -i bedrock
```

### Performance Tuning

```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" node server.js

# Enable compression
# Add to server.js:
app.use(compression());

# Use PM2 for production
npm install -g pm2
pm2 start backend/server.js --name oscal-generator
pm2 startup
pm2 save
```

### Logs Location

- **Application logs**: Check console output or redirect to file
- **Docker logs**: `docker logs oscal-generator`
- **TrueNAS logs**: GUI → Apps → Select App → Logs
- **Build logs**: `credentials.txt` contains build timestamp

---

## Upgrade Guide

### Upgrading from Previous Version

```bash
# Backup configuration
cp config/app/config.json config/app/config.json.backup
cp config/app/users.json config/app/users.json.backup

# Pull latest code
git pull origin main

# Rebuild frontend
cd frontend
npm install
npm run build
cp -r dist ../backend/public

# Update backend dependencies
cd ../backend
npm install

# Restart application
# Docker:
docker-compose down && docker-compose up -d
# Direct:
pkill -f "node server.js" && NODE_ENV=production node server.js &
```

---

## Monitoring

### Health Check

```bash
# Basic health check
curl http://localhost:3020/health

# Expected response
{
  "status": "healthy",
  "service": "Keekar's OSCAL SOA/SSP/CCM Generator"
}
```

### Resource Monitoring

```bash
# Docker stats
docker stats oscal-generator

# System resources
top -p $(pgrep -f "node server.js")
```

---

## Support

For deployment issues or questions:

- **Email**: mukesh.kesharwani@adobe.com
- **Documentation**: See README.md and SECURITY.md
- **GitHub**: Check repository for updates

---

**Document Version**: 1.2.7  
**Last Updated**: December 16, 2025

