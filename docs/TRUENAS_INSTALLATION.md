# TrueNAS SCALE Installation Guide

Complete guide for installing OSCAL Report Generator on TrueNAS SCALE.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Method 1: Custom App (Quick Start)](#method-1-custom-app-quick-start)
- [Method 2: Using Helm Chart](#method-2-using-helm-chart)
- [Method 3: Via Custom Catalog](#method-3-via-custom-catalog)
- [Post-Installation](#post-installation)
- [Accessing the Application](#accessing-the-application)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements

- **TrueNAS SCALE**: Version 22.02 or later (Bluefin or newer)
- **Storage**: Minimum 1GB available for app data
- **Memory**: At least 512MB RAM available
- **Network**: Port 30000-32767 range accessible

### Before You Begin

1. **Create storage directory** (recommended):
   ```bash
   # SSH into TrueNAS
   ssh admin@[truenas-ip]
   
   # Create app data directory
   sudo mkdir -p /mnt/pool1/apps/oscal/config
   sudo chmod 755 /mnt/pool1/apps/oscal/config
   ```

2. **Check available ports**:
   - Choose an available NodePort (30000-32767)
   - Recommended: `30200`
   - Avoid ports already in use by other apps

---

## Method 1: Custom App (Quick Start)

**Best for**: Quick installation without catalog setup  
**Time**: 5 minutes  
**Difficulty**: Easy ⭐

### Step-by-Step Instructions

#### 1. Navigate to Apps

1. Open TrueNAS SCALE web interface
2. Click **Apps** in the left sidebar
3. Click **Discover Apps** tab

#### 2. Launch Custom App

1. Click **Custom App** button (top right corner)
2. A configuration form will appear

#### 3. Basic Configuration

**Section: Application Name**
- **Application Name**: `oscal-report-generator`
- **Version**: Keep default

**Section: Container Images**
- **Image Repository**: `keekar/oscal_reports`
- **Image Tag**: `latest` (for stable) or `edge` (for development)
- **Image Pull Policy**: `IfNotPresent`

#### 4. Networking Configuration

**Section: Networking**
- **Service Type**: Select `NodePort`
- **Container Port**: `3020`
- **Node Port**: `30200` (or your chosen port)
- **Protocol**: `TCP`

#### 5. Storage Configuration

**Section: Storage**

Click **Add** to add a host path volume:
- **Type**: `Host Path`
- **Host Path**: `/mnt/pool1/apps/oscal/config` (or your created path)
- **Mount Path**: `/app/config`
- **Read Only**: Unchecked ❌

#### 6. Resource Limits

**Section: Resources** (recommended values):
- **CPU Limit**: `1000m` (1 core)
- **Memory Limit**: `1Gi` (1 GiB)
- **GPU Allocation**: Leave empty
- **Enable Pod resource limits**: Checked ✅

#### 7. Environment Variables (Optional)

**Section: Environment Variables**

Add these if needed:
- **Name**: `NODE_ENV`, **Value**: `production`
- **Name**: `PORT`, **Value**: `3020`

#### 8. Health Checks (Recommended)

**Section: Health Check**

**Liveness Probe**:
- **Type**: `HTTP`
- **Path**: `/health`
- **Port**: `3020`
- **Initial Delay**: `30` seconds
- **Period**: `10` seconds

**Readiness Probe**:
- **Type**: `HTTP`
- **Path**: `/health`
- **Port**: `3020`
- **Initial Delay**: `10` seconds
- **Period**: `5` seconds

#### 9. Deploy

1. Review all settings
2. Click **Save** button at the bottom
3. Wait for deployment (usually 1-2 minutes)

#### 10. Verify Installation

1. Go to **Apps** → **Installed**
2. Find `oscal-report-generator`
3. Status should show **Active** (green)
4. Click on the app name to see details

### Quick Test

```bash
# SSH into TrueNAS
ssh admin@[truenas-ip]

# Check pod status
k3s kubectl get pods -A | grep oscal

# Test health endpoint
curl http://localhost:30200/health
```

---

## Method 2: Using Helm Chart

**Best for**: Advanced users who prefer command-line  
**Time**: 10 minutes  
**Difficulty**: Medium ⭐⭐

### Prerequisites

- SSH access to TrueNAS
- Basic knowledge of Helm and Kubernetes

### Installation Steps

#### 1. SSH into TrueNAS

```bash
ssh admin@[truenas-ip]
```

#### 2. Download the Chart

```bash
# Create working directory
mkdir -p /tmp/oscal-install
cd /tmp/oscal-install

# Option A: Download from GitHub
wget https://github.com/keekar2022/OSCAL-Reports/archive/refs/heads/main.zip
unzip main.zip
cd OSCAL-Reports-main/truenas-chart

# Option B: Clone the repository
git clone https://github.com/keekar2022/OSCAL-Reports.git
cd OSCAL-Reports/truenas-chart
```

#### 3. Create Custom Values File

Create `my-values.yaml`:

```yaml
image:
  repository: keekar/oscal_reports
  tag: latest
  pullPolicy: IfNotPresent

service:
  type: NodePort
  nodePort: 30200

persistence:
  enabled: true
  hostPath: /mnt/pool1/apps/oscal/config

resources:
  limits:
    cpu: 1000m
    memory: 1Gi
  requests:
    cpu: 100m
    memory: 256Mi
```

#### 4. Install Using Helm

```bash
# Create namespace
k3s kubectl create namespace ix-oscal-report-generator

# Install the chart
k3s helm install oscal-report-generator . \
  --namespace ix-oscal-report-generator \
  --values my-values.yaml \
  --wait
```

#### 5. Verify Installation

```bash
# Check deployment status
k3s kubectl get pods -n ix-oscal-report-generator

# View installation notes
k3s helm get notes oscal-report-generator -n ix-oscal-report-generator

# Check service
k3s kubectl get svc -n ix-oscal-report-generator
```

### Upgrading

```bash
# Update to new version
k3s helm upgrade oscal-report-generator . \
  --namespace ix-oscal-report-generator \
  --values my-values.yaml \
  --wait
```

### Uninstalling

```bash
# Uninstall the release
k3s helm uninstall oscal-report-generator \
  --namespace ix-oscal-report-generator

# Delete namespace (optional)
k3s kubectl delete namespace ix-oscal-report-generator
```

---

## Method 3: Via Custom Catalog

**Best for**: Organizations managing multiple TrueNAS instances  
**Time**: 20 minutes (one-time setup)  
**Difficulty**: Advanced ⭐⭐⭐

### Step 1: Create Catalog Repository

1. **Create GitHub Repository**: `truenas-oscal-catalog`

2. **Add Chart to Repository**:
   ```
   truenas-oscal-catalog/
   ├── index.yaml
   └── charts/
       └── oscal-report-generator/
           └── 1.6.3/
               ├── Chart.yaml
               ├── questions.yaml
               ├── values.yaml
               └── templates/
   ```

3. **Generate index.yaml**:
   ```bash
   helm repo index . --url https://github.com/[username]/truenas-oscal-catalog
   git add .
   git commit -m "Add OSCAL Report Generator chart"
   git push
   ```

### Step 2: Add Catalog to TrueNAS

1. **Open TrueNAS Web UI**
2. Go to **Apps** → **Manage Catalogs**
3. Click **Add Catalog**

Configure:
- **Catalog Name**: `OSCAL Apps`
- **Repository**: `https://github.com/[username]/truenas-oscal-catalog`
- **Preferred Trains**: `charts`
- **Branch**: `main`

4. Click **Save**
5. Wait for catalog to sync (1-2 minutes)

### Step 3: Install from Catalog

1. Go to **Apps** → **Discover Apps**
2. You should now see **OSCAL Report Generator** in the catalog
3. Click on it and configure as needed
4. Click **Install**

---

## Post-Installation

### 1. Extract Default Credentials

The Docker image generates timestamp-based default credentials.

**Method A: Via kubectl**
```bash
ssh admin@[truenas-ip]
k3s kubectl exec -n ix-oscal-report-generator \
  deployment/oscal-report-generator \
  -- cat /app/credentials.txt
```

**Method B: Via Docker**
```bash
docker pull keekar/oscal_reports:latest
docker create --name temp-oscal keekar/oscal_reports:latest
docker cp temp-oscal:/app/credentials.txt ./credentials.txt
cat credentials.txt
docker rm temp-oscal
```

### 2. First Login

1. Access the application (see next section)
2. Login with default credentials:
   - Username: `admin`
   - Password: `admin#DDMMYYHH` (from credentials file)
3. **Immediately change the password!**

### 3. Configure Users

1. Go to **Settings** → **User Management**
2. Change default passwords for all users
3. Add additional users if needed
4. Configure roles and permissions

---

## Accessing the Application

### Find Your Access URL

1. **Get TrueNAS IP address**:
   - Check your router/DHCP server
   - Or run: `ip addr show` on TrueNAS

2. **Access via browser**:
   ```
   http://[truenas-ip]:[nodeport]
   ```
   
   Example: `http://192.168.1.100:30200`

### Via TrueNAS Portal (Optional)

If configured correctly, the app may appear in:
- TrueNAS UI → Apps → Installed → Click app name → **Open**

### Bookmark for Easy Access

Create a bookmark:
- **Name**: OSCAL Report Generator
- **URL**: `http://[truenas-ip]:30200`

---

## Troubleshooting

### App Status Shows "Deploying" for Long Time

**Check pod events**:
```bash
ssh admin@[truenas-ip]
k3s kubectl get pods -n ix-oscal-report-generator
k3s kubectl describe pod -n ix-oscal-report-generator [pod-name]
```

**Common causes**:
- Image pull in progress (wait a few minutes)
- Storage path doesn't exist
- Insufficient resources

### Cannot Access Application

**1. Check pod is running**:
```bash
k3s kubectl get pods -n ix-oscal-report-generator
# Should show STATUS: Running
```

**2. Check service**:
```bash
k3s kubectl get svc -n ix-oscal-report-generator
# Should show NodePort with your port number
```

**3. Test from TrueNAS itself**:
```bash
curl http://localhost:30200/health
# Should return: {"status":"healthy"}
```

**4. Check firewall**:
- Ensure NodePort range (30000-32767) is not blocked
- Check TrueNAS firewall rules

### Storage Permission Issues

**Check permissions**:
```bash
ls -la /mnt/pool1/apps/oscal/config
```

**Fix permissions**:
```bash
sudo chown -R 568:568 /mnt/pool1/apps/oscal/config
sudo chmod -R 755 /mnt/pool1/apps/oscal/config
```

### App Crashes or Restarts

**View logs**:
```bash
k3s kubectl logs -n ix-oscal-report-generator \
  -l app.kubernetes.io/name=oscal-report-generator \
  --tail=100
```

**Common issues**:
- Out of memory (increase memory limit)
- Config directory not writable
- Port already in use

### Reset to Defaults

**Delete and reinstall**:
```bash
# Via Helm
k3s helm uninstall oscal-report-generator -n ix-oscal-report-generator

# Via Web UI
Apps → Installed → oscal-report-generator → Delete
```

**Backup config first**:
```bash
sudo cp -r /mnt/pool1/apps/oscal/config /mnt/pool1/apps/oscal/config.backup
```

---

## Performance Tuning

### Resource Recommendations by Usage

**Light Usage** (1-5 users):
- CPU: 100m-500m
- Memory: 256Mi-512Mi

**Medium Usage** (5-20 users):
- CPU: 500m-1000m  
- Memory: 512Mi-1Gi

**Heavy Usage** (20+ users):
- CPU: 1000m-2000m
- Memory: 1Gi-2Gi

### Adjust Resources

**Via Web UI**:
1. Apps → Installed → oscal-report-generator → Edit
2. Change resource limits
3. Save

**Via Helm**:
```bash
k3s helm upgrade oscal-report-generator . \
  --set resources.limits.cpu=2000m \
  --set resources.limits.memory=2Gi \
  --reuse-values
```

---

## Backup and Restore

### Backup Configuration

```bash
# Create backup
sudo tar -czf oscal-backup-$(date +%Y%m%d).tar.gz \
  /mnt/pool1/apps/oscal/config

# Move to safe location
sudo mv oscal-backup-*.tar.gz /mnt/pool1/backups/
```

### Restore Configuration

```bash
# Extract backup
sudo tar -xzf oscal-backup-20260123.tar.gz -C /

# Or restore to different location
sudo tar -xzf oscal-backup-20260123.tar.gz -C /mnt/pool1/apps/oscal-restored/

# Restart app
k3s kubectl rollout restart deployment/oscal-report-generator \
  -n ix-oscal-report-generator
```

---

## Security Best Practices

1. ✅ **Change default passwords immediately**
2. ✅ **Use strong passwords** (min 12 characters)
3. ✅ **Regular backups** of config directory
4. ✅ **Keep app updated** to latest version
5. ✅ **Restrict access** via firewall if needed
6. ✅ **Monitor logs** for suspicious activity
7. ✅ **Use HTTPS** (configure reverse proxy)

---

## Additional Resources

- **Full Documentation**: https://github.com/keekar2022/OSCAL-Reports/tree/main/docs
- **Docker Hub**: https://hub.docker.com/r/keekar/oscal_reports
- **GitHub Repository**: https://github.com/keekar2022/OSCAL-Reports
- **Report Issues**: https://github.com/keekar2022/OSCAL-Reports/issues
- **TrueNAS Forums**: https://forums.truenas.com/

---

## Support

Need help? Try these options:

1. **Check documentation** in the links above
2. **Search GitHub issues** for similar problems
3. **TrueNAS community forums** for TrueNAS-specific questions
4. **Open a GitHub issue** for bug reports

---

**Last Updated**: January 2026  
**Guide Version**: 1.0  
**App Version**: 1.6.3
