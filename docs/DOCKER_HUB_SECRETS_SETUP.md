# GitHub Secrets Setup for Docker Hub Publishing

This guide will help you set up the required GitHub secrets to enable automatic Docker image publishing to Docker Hub.

## Required Secrets

You need to add **2 secrets** to your GitHub repository:

1. `DOCKERHUB_USERNAME` - Your Docker Hub username
2. `DOCKERHUB_TOKEN` - Your Docker Hub access token (not password!)

## Step-by-Step Setup

### Step 1: Create Docker Hub Access Token

1. **Log in to Docker Hub**
   - Go to https://hub.docker.com/
   - Sign in with your credentials (username: `keekar`)

2. **Navigate to Security Settings**
   - Click on your profile icon (top right)
   - Select **"Account Settings"**
   - Click on **"Security"** in the left sidebar
   - Click on **"Access Tokens"**

3. **Generate New Token**
   - Click **"New Access Token"** button
   - Fill in the details:
     - **Description**: `OSCAL_GitHub_Actions` (or any name you prefer)
     - **Access permissions**: Select **"Read, Write, Delete"**
   - Click **"Generate"**

4. **Copy the Token**
   - ⚠️ **IMPORTANT**: Copy the token immediately!
   - You won't be able to see it again after closing the dialog
   - Keep it safe temporarily (you'll paste it in GitHub next)

### Step 2: Add Secrets to GitHub Repository

1. **Navigate to Repository Settings**
   - Go to your GitHub repository: https://github.com/[your-org]/OSCAL_Reports
   - Click on **"Settings"** tab (top of the page)
   - If you don't see "Settings", you may not have admin access

2. **Open Secrets Section**
   - In the left sidebar, click **"Secrets and variables"**
   - Click **"Actions"**

3. **Add First Secret: DOCKERHUB_USERNAME**
   - Click **"New repository secret"**
   - Enter:
     - **Name**: `DOCKERHUB_USERNAME`
     - **Secret**: `keekar`
   - Click **"Add secret"**

4. **Add Second Secret: DOCKERHUB_TOKEN**
   - Click **"New repository secret"** again
   - Enter:
     - **Name**: `DOCKERHUB_TOKEN`
     - **Secret**: Paste the access token you copied from Docker Hub
   - Click **"Add secret"**

### Step 3: Verify Setup

After adding both secrets, you should see:

```
Repository secrets (2)
├── DOCKERHUB_USERNAME
└── DOCKERHUB_TOKEN
```

## Testing the Setup

### Trigger a Build

1. **Push to Development branch** (for edge tag):
   ```bash
   git checkout Development
   git commit --allow-empty -m "Test Docker Hub publishing"
   git push origin Development
   ```

2. **Push to main branch** (for latest tag):
   ```bash
   git checkout main
   git commit --allow-empty -m "Test Docker Hub publishing"
   git push origin main
   ```

### Monitor the Workflow

1. Go to the **"Actions"** tab in your GitHub repository
2. Click on the latest workflow run
3. Expand the **"Build and Push Docker Image"** job
4. Check the **"Log in to Docker Hub"** step - it should succeed
5. Check the **"Build and push Docker image"** step - should show pushing to both registries:
   - `ghcr.io/[owner]/oscal-report-generator`
   - `keekar/oscal_reports`

### Verify on Docker Hub

1. Go to https://hub.docker.com/r/keekar/oscal_reports
2. Check the **"Tags"** tab
3. You should see:
   - `latest` (from main branch)
   - `edge` (from Development branch)
   - `v{version}` (version-specific tags)

## Troubleshooting

### Secret Not Found Error

**Error**: `Error: Username and password required`

**Solution**:
- Double-check secret names are exactly: `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`
- Secrets are case-sensitive
- Re-add the secrets if needed

### Authentication Failed

**Error**: `unauthorized: authentication required`

**Solutions**:
1. Verify the Docker Hub access token is still valid
2. Check if the token has **Write** permissions
3. Regenerate a new token and update the `DOCKERHUB_TOKEN` secret

### Build Succeeds but No Image on Docker Hub

**Possible Causes**:
1. Check if the branch matches the workflow trigger (`main` or `Development`)
2. Verify all tests pass before the build step
3. Check workflow logs for push errors

### Token Expired

Docker Hub tokens don't expire by default, but if you see authentication errors:

1. Go back to Docker Hub → Account Settings → Security → Access Tokens
2. Check if the token is still active
3. If needed, generate a new token
4. Update the `DOCKERHUB_TOKEN` secret in GitHub

## Security Best Practices

1. ✅ **Never commit tokens** to the repository
2. ✅ **Use access tokens**, not your Docker Hub password
3. ✅ **Rotate tokens periodically** (recommended: every 90 days)
4. ✅ **Limit token permissions** to only what's needed (Read, Write, Delete)
5. ✅ **Enable 2FA** on your Docker Hub account
6. ✅ **Delete tokens** that are no longer needed

## Token Rotation (Recommended Every 90 Days)

1. Generate a new access token in Docker Hub
2. Update the `DOCKERHUB_TOKEN` secret in GitHub
3. Delete the old token from Docker Hub
4. Test by pushing to Development or main branch

## Additional Resources

- [Docker Hub Access Tokens Documentation](https://docs.docker.com/docker-hub/access-tokens/)
- [GitHub Secrets Documentation](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Docker Hub Publishing Guide](../docs/DOCKER_HUB_SETUP.md)

## Quick Reference

```bash
# Check Docker Hub secrets in GitHub
gh secret list

# Update a secret (requires GitHub CLI)
gh secret set DOCKERHUB_TOKEN

# Test Docker Hub login locally
echo "$DOCKERHUB_TOKEN" | docker login -u keekar --password-stdin
```

---

**Need Help?**

If you encounter issues:
1. Check the [Actions](../../actions) logs
2. Review [Docker Hub status](https://status.docker.com/)
3. Open an issue in the repository

**Last Updated**: January 2026
