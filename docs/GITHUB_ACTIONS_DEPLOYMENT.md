# 🚀 GitHub Actions Deployment Guide

**OSCAL Report Generator V2 - Automated CI/CD**

**Version**: 1.6.2+  
**Last Updated**: January 22, 2026  
**Author**: Mukesh Kesharwani

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Workflows](#workflows)
3. [Setup Instructions](#setup-instructions)
4. [Notifications](#notifications)
5. [Manual Deployment](#manual-deployment)
6. [Advanced Configuration](#advanced-configuration)
7. [Troubleshooting](#troubleshooting)

---

## Overview

The OSCAL Report Generator includes comprehensive GitHub Actions workflows for:

- ✅ **Automated Testing**: Unit, integration, and E2E tests
- 🔒 **Security Scanning**: Dependency audits and vulnerability checks
- 🐳 **Docker Image Building**: Automatic containerization
- 📦 **Package Publishing**: GitHub Container Registry
- 🚀 **Deployment**: Automated and manual deployment options
- 📧 **Notifications**: Status updates to owners and contributors

### Workflow Architecture

```
Push to main
    ↓
Backend Tests ──┐
Frontend Tests ─┤
Code Quality ───┼──→ Integration Test ──→ Build Docker Image ──→ Deploy ──→ Notify
Version Check ──┘
```

---

## Workflows

### 1. CI/CD Pipeline (`ci-cd.yml`)

**Trigger**: Push to `main` or `develop` branches, PRs

**Jobs**:
1. **Backend Tests** (Node 18.x, 20.x)
   - Unit tests
   - Integration tests
   - Coverage reports

2. **Frontend Tests** (Node 18.x, 20.x)
   - Build verification
   - Test execution
   - Artifact upload

3. **Code Quality & Security**
   - Best practices validation
   - npm audit
   - Security scanning

4. **Version Consistency Check**
   - Validates version sync across package.json files

5. **Integration Test**
   - Full stack testing
   - Health endpoint verification

6. **Build and Push Docker Image** (main branch only)
   - Multi-platform build
   - Push to GitHub Container Registry
   - Tag with version and `latest`

7. **Deploy** (main branch only)
   - Generate deployment instructions
   - Provide deployment URLs
   - Upload credentials

8. **Notifications**
   - Success notifications with deployment URLs
   - Failure notifications with troubleshooting links

### 2. Manual Deployment (`manual-deploy.yml`)

**Trigger**: Manual workflow dispatch

**Options**:
- **Environment**: blue, green, or both
- **Version**: Specific version or latest
- **Skip Tests**: Option to bypass tests (use with caution)

### 3. Release (`release.yml`)

**Trigger**: Git tag push (v*.*.*)

**Actions**:
- Create GitHub release
- Generate changelog
- Upload release archives

---

## Setup Instructions

### Prerequisites

1. **GitHub Repository**
   - Repository at: https://github.com/AdobeManagedServices/OSCAL-Reports
   - Admin access required for settings

2. **GitHub Container Registry**
   - Automatically enabled for public repositories
   - For private repos, enable in Settings → Packages

### Step 1: Verify Workflow Files

Ensure these files exist in your repository:

```
.github/workflows/
├── ci-cd.yml           # Main CI/CD pipeline
├── manual-deploy.yml   # Manual deployment workflow
└── release.yml         # Release automation
```

### Step 2: Configure GitHub Secrets (Optional)

For advanced features like email notifications or SSH deployment:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Add the following secrets:

#### Email Notifications (Optional)

```
SMTP_USERNAME: your-email@example.com
SMTP_PASSWORD: your-app-password
```

**Note**: For Gmail, use [App Passwords](https://support.google.com/accounts/answer/185833)

#### Slack Notifications (Optional)

```
SLACK_WEBHOOK_URL: https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

Create webhook at: https://api.slack.com/messaging/webhooks

#### SSH Deployment (Optional)

```
TRUENAS_SSH_KEY: -----BEGIN RSA PRIVATE KEY-----
                 (your private SSH key)
                 -----END RSA PRIVATE KEY-----
```

#### Webhook Deployment (Optional)

```
TRUENAS_WEBHOOK_URL: https://your-webhook-url
TRUENAS_WEBHOOK_TOKEN: your-webhook-token
```

### Step 3: Enable Workflow Permissions

1. Go to **Settings** → **Actions** → **General**
2. Under **Workflow permissions**, select:
   - ✅ Read and write permissions
   - ✅ Allow GitHub Actions to create and approve pull requests

### Step 4: Test the Workflow

1. Make a small change to `README.md`
2. Commit and push to a feature branch
3. Create a Pull Request to `main`
4. Watch the CI/CD pipeline run
5. Merge the PR to trigger deployment

---

## Notifications

### Default Notifications

**Automatically Enabled** (no configuration required):

1. **GitHub Job Summaries**
   - Visible in workflow run page
   - Includes deployment URLs and instructions

2. **Workflow Artifacts**
   - Deployment credentials (7-day retention)
   - Deployment instructions (30-day retention)
   - Test coverage reports

3. **PR Comments** (if merged via PR)
   - Deployment success message
   - Quick access links
   - Testing instructions

### Optional Notifications

#### Email Notifications

**Setup**:

1. Add SMTP secrets (see Step 2 above)
2. Uncomment email section in `.github/workflows/ci-cd.yml`:

```yaml
- name: 📧 Send Email to Repository Owner
  uses: dawidd6/action-send-mail@v3
  with:
    server_address: smtp.gmail.com
    server_port: 587
    username: ${{ secrets.SMTP_USERNAME }}
    password: ${{ secrets.SMTP_PASSWORD }}
    subject: '✅ OSCAL Report Generator v${{ needs.build-and-push.outputs.version }} Deployed'
    to: mukesh.kesharwani@adobe.com
    from: GitHub Actions <noreply@github.com>
    body: file://deployment-summary.md
    convert_markdown: true
```

#### Slack Notifications

**Setup**:

1. Add Slack webhook secret
2. Uncomment Slack section in `.github/workflows/ci-cd.yml`:

```yaml
- name: 📱 Send Slack Notification
  uses: slackapi/slack-github-action@v1
  with:
    webhook: ${{ secrets.SLACK_WEBHOOK_URL }}
    webhook-type: incoming-webhook
    payload: |
      {
        "text": "🚀 OSCAL Report Generator v${{ needs.build-and-push.outputs.version }} deployed!",
        "blocks": [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "*OSCAL Report Generator Deployment*\n\n*Version:* ${{ needs.build-and-push.outputs.version }}\n*Status:* ✅ Success\n*URLs:*\n• Blue: http://nas.keekar.com:3020\n• Green: http://nas.keekar.com:3019"
            }
          }
        ]
      }
```

#### Microsoft Teams Notifications

**Setup**:

1. Create incoming webhook in Teams
2. Add secret: `TEAMS_WEBHOOK_URL`
3. Add step:

```yaml
- name: 📱 Send Teams Notification
  uses: aliencube/microsoft-teams-actions@v0.8.0
  with:
    webhook_uri: ${{ secrets.TEAMS_WEBHOOK_URL }}
    title: OSCAL Report Generator Deployed
    summary: Version ${{ needs.build-and-push.outputs.version }} deployed successfully
    sections: |
      [
        {
          "activityTitle": "Deployment Details",
          "activitySubtitle": "OSCAL Report Generator",
          "facts": [
            {
              "name": "Version",
              "value": "${{ needs.build-and-push.outputs.version }}"
            },
            {
              "name": "Status",
              "value": "Success ✅"
            },
            {
              "name": "Blue URL",
              "value": "http://nas.keekar.com:3020"
            },
            {
              "name": "Green URL",
              "value": "http://nas.keekar.com:3019"
            }
          ]
        }
      ]
```

---

## Manual Deployment

### Via GitHub Web Interface

1. Go to **Actions** tab in GitHub
2. Select **Manual Deployment** workflow
3. Click **Run workflow**
4. Choose options:
   - **Environment**: blue, green, or both
   - **Version**: Leave empty for latest
   - **Skip Tests**: Check only if urgent
5. Click **Run workflow**
6. Monitor progress
7. Download deployment instructions from artifacts

### Via GitHub CLI

```bash
# Deploy to green environment (latest version)
gh workflow run manual-deploy.yml \
  -f environment=green

# Deploy specific version to blue
gh workflow run manual-deploy.yml \
  -f environment=blue \
  -f version=1.6.2

# Deploy to both environments (skip tests)
gh workflow run manual-deploy.yml \
  -f environment=both \
  -f skip_tests=true
```

### Automated TrueNAS Deployment

To enable automatic deployment to TrueNAS:

#### Option 1: SSH Deployment

**Setup**:

1. Generate SSH key pair on GitHub Actions runner
2. Add public key to TrueNAS: `~/.ssh/authorized_keys`
3. Add private key as GitHub secret: `TRUENAS_SSH_KEY`
4. Uncomment SSH deployment section in `ci-cd.yml`:

```yaml
- name: 🔔 Deploy to TrueNAS via SSH
  run: |
    echo "${{ secrets.TRUENAS_SSH_KEY }}" > /tmp/ssh_key
    chmod 600 /tmp/ssh_key
    ssh -i /tmp/ssh_key -o StrictHostKeyChecking=no mkesharw@NAS01 \
      'cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green && \
       git pull origin main && \
       ./build_on_truenas.sh'
    rm /tmp/ssh_key
```

#### Option 2: Webhook Deployment

**Setup**:

1. Create webhook endpoint on TrueNAS (using Node.js, Python, etc.)
2. Webhook should trigger `build_on_truenas.sh`
3. Add webhook URL and token as GitHub secrets
4. Uncomment webhook section in `ci-cd.yml`:

```yaml
- name: 🔔 Trigger TrueNAS Deployment via Webhook
  run: |
    curl -X POST ${{ secrets.TRUENAS_WEBHOOK_URL }} \
      -H "Authorization: Bearer ${{ secrets.TRUENAS_WEBHOOK_TOKEN }}" \
      -H "Content-Type: application/json" \
      -d '{
        "version": "${{ needs.build-and-push.outputs.version }}",
        "image": "${{ needs.build-and-push.outputs.image-tag }}",
        "actor": "${{ github.actor }}"
      }'
```

**Example Webhook Server** (TrueNAS):

```javascript
// webhook-server.js
const express = require('express');
const { exec } = require('child_process');
const app = express();

app.use(express.json());

app.post('/deploy', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (token !== process.env.WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const { version, image } = req.body;
  
  exec(
    'cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green && ./build_on_truenas.sh',
    (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error}`);
        return res.status(500).json({ error: stderr });
      }
      res.json({ success: true, output: stdout });
    }
  );
});

app.listen(3000, () => console.log('Webhook server running on port 3000'));
```

---

## Advanced Configuration

### Custom Build Arguments

Modify Docker build args in `ci-cd.yml`:

```yaml
build-args: |
  BUILD_TIMESTAMP=${{ github.event.head_commit.timestamp }}
  PORT=3020
  NODE_ENV=production
  CUSTOM_VAR=value
```

### Multi-Platform Builds

Build for multiple architectures:

```yaml
- name: 📦 Build and push Docker image
  uses: docker/build-push-action@v5
  with:
    platforms: linux/amd64,linux/arm64
    # ... other options
```

### Custom Image Tags

Add custom tagging strategy:

```yaml
tags: |
  ghcr.io/${{ github.repository_owner }}/oscal-report-generator:${{ steps.extract-version.outputs.version }}
  ghcr.io/${{ github.repository_owner }}/oscal-report-generator:latest
  ghcr.io/${{ github.repository_owner }}/oscal-report-generator:stable
  ghcr.io/${{ github.repository_owner }}/oscal-report-generator:${{ github.sha }}
```

### Deployment to Cloud Providers

#### Azure Web App

```yaml
- name: 🚀 Deploy to Azure
  uses: azure/webapps-deploy@v2
  with:
    app-name: oscal-report-generator
    publish-profile: ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}
    images: ${{ needs.build-and-push.outputs.image-tag }}
```

#### AWS ECS

```yaml
- name: 🚀 Deploy to AWS ECS
  uses: aws-actions/amazon-ecs-deploy-task-definition@v1
  with:
    task-definition: task-definition.json
    service: oscal-service
    cluster: oscal-cluster
    wait-for-service-stability: true
```

#### Google Cloud Run

```yaml
- name: 🚀 Deploy to Cloud Run
  uses: google-github-actions/deploy-cloudrun@v1
  with:
    service: oscal-report-generator
    image: ${{ needs.build-and-push.outputs.image-tag }}
    region: us-central1
```

---

## Troubleshooting

### Issue: Workflow Fails on Docker Build

**Solution**:

```bash
# Check Dockerfile syntax
docker build -t test .

# Review build logs in GitHub Actions
# Ensure all dependencies are available
```

### Issue: Permission Denied on Package Push

**Solution**:

1. Go to **Settings** → **Actions** → **General**
2. Under **Workflow permissions**:
   - ✅ Read and write permissions
3. Save changes

### Issue: Secrets Not Available

**Solution**:

1. Verify secrets exist: **Settings** → **Secrets and variables** → **Actions**
2. Check secret names match exactly (case-sensitive)
3. Ensure workflow has permission to access secrets

### Issue: Deployment URL Not Working

**Solution**:

```bash
# SSH into TrueNAS
ssh mkesharw@NAS01

# Check container status
docker ps | grep oscal

# Check logs
docker logs oscal-report-generator-green

# Verify health endpoint
curl http://localhost:3019/health
```

### Issue: Email Notifications Not Sending

**Solution**:

1. **Gmail**: Enable 2FA and create App Password
2. **Verify SMTP settings**: Test with mail client
3. **Check secrets**: Ensure `SMTP_USERNAME` and `SMTP_PASSWORD` are set
4. **Review logs**: Check workflow logs for errors

### Issue: Tests Failing

**Solution**:

```bash
# Run tests locally
npm run install:all
cd backend && npm test
cd ../frontend && npm test

# Check test logs in GitHub Actions
# Fix failing tests
# Push changes
```

---

## Monitoring and Maintenance

### Check Workflow Status

```bash
# Via GitHub CLI
gh run list --workflow=ci-cd.yml --limit 10

# Watch specific run
gh run watch <run-id>

# View logs
gh run view <run-id> --log
```

### Container Registry Management

```bash
# View published packages
gh api user/packages

# Delete old versions (optional)
gh api --method DELETE /user/packages/container/oscal-report-generator/versions/<version-id>
```

### Artifact Cleanup

Artifacts are automatically cleaned up based on retention:
- Credentials: 7 days
- Deployment instructions: 30 days
- Test reports: 7 days

---

## Best Practices

1. ✅ **Always test locally** before pushing to main
2. ✅ **Use feature branches** and pull requests
3. ✅ **Review workflow logs** for warnings
4. ✅ **Keep secrets secure** - never commit them
5. ✅ **Update dependencies** regularly
6. ✅ **Monitor deployment** after merging
7. ✅ **Download credentials** immediately after deployment
8. ✅ **Change default passwords** on first login
9. ✅ **Test both environments** (Blue and Green)
10. ✅ **Keep documentation updated**

---

## Additional Resources

- **GitHub Actions Documentation**: https://docs.github.com/en/actions
- **Docker Documentation**: https://docs.docker.com/
- **GitHub Container Registry**: https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry
- **TrueNAS Documentation**: https://www.truenas.com/docs/

---

## Support

For issues or questions:

1. Check this documentation
2. Review workflow logs
3. Check [GitHub Issues](https://github.com/AdobeManagedServices/OSCAL-Reports/issues)
4. Contact: mukesh.kesharwani@adobe.com

---

**Last Updated**: January 22, 2026  
**Maintainer**: Mukesh Kesharwani  
**License**: GPL-3.0-or-later
