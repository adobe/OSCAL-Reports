# Configuration and User Data Migration Guide

**Version**: 1.6.5  
**Last Updated**: January 28, 2026  
**Author**: Mukesh Kesharwani

This guide explains how to migrate your configuration and user data from one deployment (development/blue) to another (production/green).

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Files to Migrate](#files-to-migrate)
3. [Migration Methods](#migration-methods)
4. [Security Considerations](#security-considerations)
5. [Deployment-Specific Instructions](#deployment-specific-instructions)
6. [Verification Steps](#verification-steps)
7. [Rollback Procedures](#rollback-procedures)

---

## Overview

Your OSCAL Report Generator stores configuration and user data in JSON files located in the `config/app/` directory. These files need to be migrated when moving to a green deployment to preserve:

- Application settings (AI, messaging, SSO, etc.)
- User accounts and their roles
- User activity and permissions

---

## Files to Migrate

### Current Location (Running System)
```
/Users/mkesharw/Documents/OSCAL_Reports/config/app/
├── config.json          # Application configuration
└── users.json           # User accounts and credentials
```

### What Each File Contains

#### 1. `config.json` (Application Settings)
- **AI Configuration**: Ollama/Mistral settings, models, timeouts
- **Messaging**: Email/Slack notification settings
- **SSO**: SAML authentication configuration
- **API Gateways**: AWS/Azure integration settings
- **Published SOA URL**: Compliance report URLs

**⚠️ Contains Sensitive Data:**
- SMTP passwords
- API keys (Mistral, Slack webhooks)
- SSO certificates

#### 2. `users.json` (User Accounts)
- User credentials (PBKDF2 hashed passwords)
- User roles and permissions
- Activity timestamps
- Account status

**⚠️ Contains Sensitive Data:**
- Password hashes
- Email addresses
- User activity data

---

## Migration Methods

### Method 1: Docker Volume Mounting (Recommended for Production)

When deploying with Docker, mount these files as volumes to persist configuration across container restarts.

#### Step 1: Backup Current Configuration
```bash
# On your running system
cd /Users/mkesharw/Documents/OSCAL_Reports
mkdir -p backups/config-$(date +%Y%m%d-%H%M%S)
cp config/app/config.json backups/config-$(date +%Y%m%d-%H%M%S)/
cp config/app/users.json backups/config-$(date +%Y%m%d-%H%M%S)/
```

#### Step 2: Copy to Green Deployment Host
```bash
# Using SCP (for remote servers)
scp config/app/config.json user@green-deployment:/path/to/deployment/config/app/
scp config/app/users.json user@green-deployment:/path/to/deployment/config/app/

# OR using rsync (better for large files)
rsync -avz config/app/ user@green-deployment:/path/to/deployment/config/app/
```

#### Step 3: Docker Compose Configuration
```yaml
# docker-compose.yml on green deployment
services:
  oscal-backend:
    image: your-image:tag
    volumes:
      # Mount config files as read-write volumes
      - ./config/app/config.json:/app/config/app/config.json:rw
      - ./config/app/users.json:/app/config/app/users.json:rw
    environment:
      - NODE_ENV=production
```

### Method 2: TrueNAS Blue-Green Deployment

#### Step 1: Access TrueNAS
```bash
# SSH into TrueNAS
ssh admin@truenas.local
```

#### Step 2: Locate Blue Deployment Config
```bash
# Find blue deployment app
cd /mnt/pool/ix-applications/releases/oscal-generator-blue/volumes

# Backup current config
cp pvc-*/config/app/config.json /mnt/pool/backups/
cp pvc-*/config/app/users.json /mnt/pool/backups/
```

#### Step 3: Copy to Green Deployment
```bash
# Locate green deployment
cd /mnt/pool/ix-applications/releases/oscal-generator-green/volumes

# Copy config files
cp /mnt/pool/backups/config.json pvc-*/config/app/
cp /mnt/pool/backups/users.json pvc-*/config/app/

# Set proper permissions
chmod 644 pvc-*/config/app/*.json
```

#### Step 4: Restart Green Deployment
```bash
# Via TrueNAS UI: Apps → oscal-generator-green → Stop → Start
# OR via CLI:
k3s kubectl -n ix-oscal-generator-green rollout restart deployment
```

### Method 3: Cloud Deployment (Azure/AWS/GCP)

#### Azure Web App
```bash
# Using Azure CLI
az webapp config connection-string set \
  --name oscal-green \
  --resource-group oscal-rg \
  --settings config_json="$(cat config/app/config.json)" \
  --connection-string-type Custom

# Or upload via FTPS/SFTP
az webapp deployment source config-zip \
  --resource-group oscal-rg \
  --name oscal-green \
  --src config-files.zip
```

#### AWS ECS
```bash
# Upload to S3
aws s3 cp config/app/config.json s3://oscal-config-bucket/green/
aws s3 cp config/app/users.json s3://oscal-config-bucket/green/

# Update task definition to mount from S3
# Or use EFS for shared config
```

#### Google Cloud Run
```bash
# Create secret for sensitive config
gcloud secrets create oscal-config-green \
  --data-file=config/app/config.json

# Mount as volume in Cloud Run service
gcloud run services update oscal-green \
  --update-secrets=/app/config/app/config.json=oscal-config-green:latest
```

### Method 4: Direct File Copy (Development/Testing)

#### On Same Machine
```bash
# If running two instances on same machine
cp -r /path/to/blue/config/app/*.json /path/to/green/config/app/
```

#### Between Different Machines
```bash
# Using scp
scp -r config/app/*.json user@green-server:/app/config/app/

# Using sftp
sftp user@green-server
put -r config/app/*.json /app/config/app/
```

---

## Security Considerations

### 🔒 Protect Sensitive Data

1. **Never Commit Config Files to Git**
   ```bash
   # Ensure .gitignore includes:
   config/app/config.json
   config/app/users.json
   ```

2. **Encrypt Files During Transfer**
   ```bash
   # Encrypt before transfer
   gpg --encrypt --recipient your-email@example.com config/app/config.json
   
   # Transfer encrypted file
   scp config.json.gpg user@green-deployment:/tmp/
   
   # Decrypt on green deployment
   gpg --decrypt /tmp/config.json.gpg > /app/config/app/config.json
   ```

3. **Use Secure Transfer Methods**
   - ✅ SCP/SFTP (encrypted)
   - ✅ HTTPS file upload
   - ✅ Cloud storage with encryption at rest
   - ❌ Plain FTP
   - ❌ Unencrypted email
   - ❌ Slack/messaging apps

4. **Update Sensitive Values**
   After migration, consider updating:
   - SMTP passwords
   - API keys
   - SSO certificates
   - Session secrets (via environment variables)

### 🔐 Password Reset After Migration

If you want users to reset passwords in the new environment:

```bash
# Option 1: Reset specific user
# Login as admin → User Management → Reset Password

# Option 2: Force password change on next login
# (Requires code modification to add "mustChangePassword" flag)
```

---

## Deployment-Specific Instructions

### TrueNAS Deployment

```bash
# 1. Backup blue deployment config
cd /mnt/pool/ix-applications/releases
tar -czf /mnt/pool/backups/oscal-config-$(date +%Y%m%d).tar.gz \
  oscal-generator-blue/volumes/pvc-*/config/

# 2. Extract to green deployment
tar -xzf /mnt/pool/backups/oscal-config-$(date +%Y%m%d).tar.gz \
  -C oscal-generator-green/volumes/pvc-*/

# 3. Verify ownership and permissions
chown -R apps:apps oscal-generator-green/volumes/pvc-*/config/
chmod -R 755 oscal-generator-green/volumes/pvc-*/config/
chmod 644 oscal-generator-green/volumes/pvc-*/config/app/*.json

# 4. Restart green deployment
k3s kubectl -n ix-oscal-generator-green rollout restart deployment
```

### Docker Compose Deployment

```yaml
# docker-compose.green.yml
version: '3.8'

services:
  oscal-backend:
    image: keekar2022/oscal-backend:1.6.5
    container_name: oscal-backend-green
    ports:
      - "3020:3020"
    volumes:
      # Persist config across deployments
      - ./config/app/config.json:/app/config/app/config.json:rw
      - ./config/app/users.json:/app/config/app/users.json:rw
    environment:
      - NODE_ENV=production
      - SESSION_SECRET=${SESSION_SECRET}
    restart: unless-stopped

  oscal-frontend:
    image: keekar2022/oscal-frontend:1.6.5
    container_name: oscal-frontend-green
    ports:
      - "3021:80"
    depends_on:
      - oscal-backend
    restart: unless-stopped
```

```bash
# Deploy green with existing config
docker-compose -f docker-compose.green.yml up -d
```

### Kubernetes/K3s Deployment

```yaml
# configmap-green.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: oscal-config-green
  namespace: oscal
data:
  config.json: |
    # Paste contents of config.json here

---
apiVersion: v1
kind: Secret
metadata:
  name: oscal-users-green
  namespace: oscal
type: Opaque
stringData:
  users.json: |
    # Paste contents of users.json here

---
# deployment-green.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: oscal-backend-green
spec:
  template:
    spec:
      containers:
      - name: backend
        volumeMounts:
        - name: config
          mountPath: /app/config/app/config.json
          subPath: config.json
        - name: users
          mountPath: /app/config/app/users.json
          subPath: users.json
      volumes:
      - name: config
        configMap:
          name: oscal-config-green
      - name: users
        secret:
          secretName: oscal-users-green
```

```bash
# Apply configuration
kubectl apply -f configmap-green.yaml
kubectl apply -f deployment-green.yaml
```

---

## Verification Steps

After migrating config files to green deployment:

### 1. Check File Existence
```bash
# On green deployment
ls -lah /app/config/app/
# Should show:
# - config.json
# - users.json
```

### 2. Verify File Permissions
```bash
# Files should be readable by the application
chmod 644 /app/config/app/*.json
```

### 3. Test Backend Startup
```bash
# Check logs for successful config loading
docker logs oscal-backend-green | grep "Loaded.*users"
# Should show: "✅ Loaded X users from /app/config/app/users.json"
```

### 4. Test Login
```bash
# Try logging in with existing credentials
curl -X POST http://green-deployment:3020/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "your-password"}'
# Should return: {"success": true, "sessionToken": "..."}
```

### 5. Verify Settings
```bash
# Check if AI config is loaded
curl http://green-deployment:3020/api/settings | jq '.aiConfig'
# Should show your AI configuration
```

### 6. Test User Management (Admin Only)
```bash
# Login and get token
TOKEN=$(curl -s -X POST http://green-deployment:3020/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}' | jq -r '.sessionToken')

# List users
curl -H "Authorization: Bearer $TOKEN" \
  http://green-deployment:3020/api/users
# Should show all migrated users
```

---

## Rollback Procedures

If migration fails, you can rollback:

### Quick Rollback

```bash
# 1. Stop green deployment
docker stop oscal-backend-green oscal-frontend-green

# 2. Restore from backup
cp backups/config-20260128-120000/config.json config/app/
cp backups/config-20260128-120000/users.json config/app/

# 3. Restart green deployment
docker start oscal-backend-green oscal-frontend-green
```

### TrueNAS Rollback

```bash
# Restore from TrueNAS snapshot
cd /mnt/pool/ix-applications/releases/oscal-generator-green
zfs rollback pool/ix-applications@pre-migration

# Or restore from backup
tar -xzf /mnt/pool/backups/oscal-config-backup.tar.gz \
  -C volumes/pvc-*/
```

---

## Automated Migration Script

Here's a script to automate the migration process:

```bash
#!/bin/bash
# migrate-config.sh

set -e

# Configuration
BLUE_CONFIG_DIR="/path/to/blue/config/app"
GREEN_CONFIG_DIR="/path/to/green/config/app"
BACKUP_DIR="/path/to/backups/$(date +%Y%m%d-%H%M%S)"

echo "🔄 Starting config migration..."

# 1. Create backup directory
mkdir -p "$BACKUP_DIR"
echo "📦 Created backup directory: $BACKUP_DIR"

# 2. Backup current green config (if exists)
if [ -f "$GREEN_CONFIG_DIR/config.json" ]; then
  echo "💾 Backing up existing green config..."
  cp "$GREEN_CONFIG_DIR/config.json" "$BACKUP_DIR/config.json.old"
  cp "$GREEN_CONFIG_DIR/users.json" "$BACKUP_DIR/users.json.old"
fi

# 3. Copy blue config to backup (for safety)
echo "💾 Backing up blue config..."
cp "$BLUE_CONFIG_DIR/config.json" "$BACKUP_DIR/config.json.blue"
cp "$BLUE_CONFIG_DIR/users.json" "$BACKUP_DIR/users.json.blue"

# 4. Copy to green deployment
echo "📋 Copying config to green deployment..."
cp "$BLUE_CONFIG_DIR/config.json" "$GREEN_CONFIG_DIR/"
cp "$BLUE_CONFIG_DIR/users.json" "$GREEN_CONFIG_DIR/"

# 5. Set permissions
echo "🔐 Setting permissions..."
chmod 644 "$GREEN_CONFIG_DIR"/*.json

# 6. Verify files
echo "✅ Verifying migration..."
if [ -f "$GREEN_CONFIG_DIR/config.json" ] && [ -f "$GREEN_CONFIG_DIR/users.json" ]; then
  echo "✅ Migration successful!"
  echo "📁 Config files location: $GREEN_CONFIG_DIR"
  echo "💾 Backup location: $BACKUP_DIR"
else
  echo "❌ Migration failed! Files not found."
  exit 1
fi

echo ""
echo "🎉 Migration complete!"
echo ""
echo "Next steps:"
echo "1. Restart green deployment"
echo "2. Test login with existing credentials"
echo "3. Verify settings in admin panel"
echo ""
echo "To rollback: cp $BACKUP_DIR/*.blue $GREEN_CONFIG_DIR/"
```

**Usage:**
```bash
chmod +x migrate-config.sh
./migrate-config.sh
```

---

## Best Practices

### ✅ Do's

1. **Always Backup First**
   - Create timestamped backups before migration
   - Keep multiple backup versions

2. **Test in Staging**
   - Test migration in staging environment first
   - Verify all functionality works

3. **Use Version Control for Scripts**
   - Keep migration scripts in git
   - Document environment-specific changes

4. **Encrypt Sensitive Data**
   - Use encryption during transfer
   - Use secrets management (Kubernetes Secrets, Azure Key Vault)

5. **Document Changes**
   - Log when migrations occur
   - Track which config version is deployed

### ❌ Don'ts

1. **Don't Commit Config Files**
   - Never commit config.json or users.json to git
   - Use environment variables for secrets

2. **Don't Skip Backups**
   - Always backup before migration
   - Automate backup process

3. **Don't Use Plain Text Transfer**
   - Avoid FTP, HTTP, unencrypted channels
   - Use SCP, SFTP, HTTPS

4. **Don't Share Credentials**
   - Don't email config files
   - Don't share via chat apps

5. **Don't Forget Permissions**
   - Ensure proper file ownership
   - Check read/write permissions

---

## Troubleshooting

### Issue: Users Can't Login After Migration

**Cause**: Password hashes not migrated or corrupted

**Solution**:
```bash
# 1. Verify users.json exists and is readable
cat /app/config/app/users.json | jq '.[0]'

# 2. Check password field format (should start with "pbkdf2$")
cat /app/config/app/users.json | jq '.[].password' | head -n 3

# 3. Reset admin password if needed (requires backend access)
# Login as another admin → User Management → Reset Password
```

### Issue: Settings Not Loading

**Cause**: config.json missing or malformed

**Solution**:
```bash
# 1. Validate JSON syntax
cat /app/config/app/config.json | jq '.'

# 2. Check for required fields
cat /app/config/app/config.json | jq '.aiConfig, .messagingConfig'

# 3. Restore from backup if corrupted
cp /path/to/backup/config.json /app/config/app/
```

### Issue: File Permission Denied

**Cause**: Wrong file ownership or permissions

**Solution**:
```bash
# Set correct ownership (replace 'node' with your app user)
chown node:node /app/config/app/*.json

# Set correct permissions
chmod 644 /app/config/app/*.json
chmod 755 /app/config/app/
```

---

## Security Checklist

Before migrating to production:

- [ ] Remove default admin password
- [ ] Update SMTP credentials
- [ ] Rotate API keys (Mistral, Slack)
- [ ] Update SSO certificates
- [ ] Set strong SESSION_SECRET environment variable
- [ ] Enable HTTPS/TLS
- [ ] Configure firewall rules
- [ ] Enable audit logging
- [ ] Review user access levels
- [ ] Test backup/restore procedures

---

## Additional Resources

- [Deployment Guide](./DEPLOYMENT.md)
- [Security Fixes Documentation](./SECURITY_FIXES.md)
- [TrueNAS Installation Guide](./TRUENAS_INSTALLATION.md)
- [Cloud Deployment Guide](./CLOUD_DEPLOYMENT.md)

---

**Last Updated**: January 28, 2026  
**Maintained By**: Development Team
