# 🧪 Testing Environment Setup

**Automatic Testing Environment for Testers**

This guide explains how to set up an automatic testing environment that testers can access immediately after CI/CD completes, while keeping production on TrueNAS.

---

## 📋 Overview

### Architecture

```
GitHub Push → Tests Pass → Deploy to Testing Environment → Notify Testers
                                                          ↓
                                                    Manual Deploy to
                                                    TrueNAS Production
```

### What You Get

✅ **Automatic testing environment** after every push to main  
✅ **Public URL** that testers can access immediately  
✅ **5+ hours availability** for functional testing  
✅ **Automatic notifications** to testers  
✅ **Manual control** over production deployment  

---

## 🎯 Two Options

### Option 1: Railway (Recommended) - FREE

**Pros:**
- ✅ Completely free ($5/month credit, enough for testing)
- ✅ Environment stays up 24/7
- ✅ Professional URLs
- ✅ Simple setup (5 minutes)
- ✅ No workflow time limits
- ✅ SSL/HTTPS included

**Cons:**
- ⚠️ Requires Railway account (free)
- ⚠️ $5/month credit limit (plenty for testing)

**Cost:** FREE (within $5 monthly credit)

### Option 2: GitHub Runner + Ngrok

**Pros:**
- ✅ Runs on GitHub infrastructure
- ✅ No external service needed
- ✅ Complete control

**Cons:**
- ⚠️ Maximum 6 hours (GitHub workflow limit)
- ⚠️ Uses GitHub Actions minutes
- ⚠️ Ngrok free tier has limitations
- ⚠️ Environment shuts down after time limit

**Cost:** FREE (uses GitHub Actions minutes)

---

## 🚀 Setup: Option 1 - Railway (Recommended)

### Step 1: Create Railway Account

1. Go to https://railway.app
2. Sign up with GitHub (free)
3. You get **$5/month free credit** (plenty for testing)

### Step 2: Create Railway Project

```bash
# Install Railway CLI (optional)
npm install -g @railway/cli

# Or use Railway dashboard
```

**Via Railway Dashboard:**

1. Log in to Railway
2. Click **New Project**
3. Select **Deploy from GitHub repo**
4. Choose: `AdobeManagedServices/OSCAL-Reports`
5. Railway will detect Dockerfile automatically
6. Configure:
   - **Name**: `oscal-report-generator-testing`
   - **Branch**: `main`
   - **Auto-deploy**: ON
7. Add environment variables:
   ```
   PORT=3020
   NODE_ENV=production
   ```
8. Click **Deploy**

### Step 3: Get Railway Token

1. Go to Railway Dashboard
2. Click **Account Settings**
3. Go to **Tokens**
4. Click **Create New Token**
5. Give it a name: `github-actions`
6. Copy the token

### Step 4: Configure GitHub Secrets

1. Go to your GitHub repo: **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Add:
   - **Name**: `RAILWAY_TOKEN`
   - **Value**: Your Railway token from Step 3

### Step 5: Enable Workflow

The workflow `.github/workflows/deploy-test-environment.yml` is already created!

**It will automatically:**
1. Run tests
2. Deploy to Railway if tests pass
3. Provide testing URL to testers
4. Notify team (if configured)

### Step 6: Test It

1. Push a change to `main` branch:
   ```bash
   git commit --allow-empty -m "test: Trigger testing environment"
   git push origin main
   ```

2. Watch workflow in **Actions** tab

3. Get testing URL from workflow output:
   - URL format: `https://oscal-report-generator-testing.up.railway.app`

4. Share URL with testers!

---

## 🚀 Setup: Option 2 - GitHub Runner + Ngrok

### Step 1: Create Ngrok Account

1. Go to https://ngrok.com
2. Sign up (free tier available)
3. Get your auth token from dashboard

### Step 2: Configure GitHub Secrets

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Add:
   - **Name**: `NGROK_AUTHTOKEN`
   - **Value**: Your ngrok auth token

### Step 3: Enable Workflow

Edit `.github/workflows/deploy-test-environment.yml`:

Change line 135:
```yaml
# FROM:
if: false  # Disabled by default

# TO:
if: github.ref == 'refs/heads/main' && github.event_name == 'push'
```

And disable Railway deployment (line 54):
```yaml
# FROM:
if: github.ref == 'refs/heads/main' && github.event_name == 'push'

# TO:
if: false  # Use Ngrok instead
```

### Step 4: Test It

Push to main → Workflow will:
1. Run tests
2. Start Docker container
3. Create ngrok tunnel
4. Provide URL (e.g., `https://abc123.ngrok.io`)
5. Keep running for 5 hours
6. Shut down automatically

**Important:** Workflow must complete within 6 hours (GitHub limit).

---

## 📧 Configure Notifications

### Option A: Slack Notifications

1. Create Slack Incoming Webhook:
   - Go to https://api.slack.com/messaging/webhooks
   - Create webhook for your #testing channel
   - Copy webhook URL

2. Add GitHub Secret:
   - Name: `SLACK_TESTERS_WEBHOOK_URL`
   - Value: Your webhook URL

3. Uncomment Slack section in workflow (line ~225)

4. Testers will get notifications in Slack when new build is ready!

### Option B: Email Notifications

1. Get SMTP credentials (e.g., Gmail App Password)

2. Add GitHub Secrets:
   - `SMTP_USERNAME`: your email
   - `SMTP_PASSWORD`: your app password

3. Uncomment email section in workflow (line ~210)

4. Update recipient email in workflow:
   ```yaml
   to: testers@yourcompany.com
   ```

5. Testers will get email when new build is ready!

### Option C: Microsoft Teams

1. Create Teams Incoming Webhook
2. Add as GitHub Secret: `TEAMS_TESTERS_WEBHOOK_URL`
3. Add Teams notification step to workflow (see example below)

**Example Teams Notification:**

```yaml
- name: 📱 Teams Notification
  uses: aliencube/microsoft-teams-actions@v0.8.0
  with:
    webhook_uri: ${{ secrets.TEAMS_TESTERS_WEBHOOK_URL }}
    title: New Build Ready for Testing
    summary: OSCAL Report Generator testing environment is ready
    sections: |
      [{
        "activityTitle": "Testing Environment Ready",
        "facts": [
          {"name": "URL", "value": "https://oscal-report-generator-testing.up.railway.app"},
          {"name": "Build", "value": "#${{ github.run_number }}"},
          {"name": "Deployed By", "value": "${{ github.actor }}"}
        ]
      }]
```

---

## 🎓 Usage Workflow

### For Developers:

1. **Develop** your feature
2. **Create PR** and test
3. **Merge to main**
4. **Wait 5 minutes** for deployment
5. **Share testing URL** with testers (automatically done via notifications)
6. **After testing approval**, manually deploy to TrueNAS production

### For Testers:

1. **Receive notification** (Slack/Email/GitHub)
2. **Access testing URL** provided
3. **Perform functional testing**:
   - Login functionality
   - Create/edit reports
   - Export features
   - AI integration
   - Settings
   - User management
4. **Document issues** found
5. **Report via GitHub Issues** or team channel
6. **Approve** for production deployment

### For Production Deployment:

**After testing approval**, deploy to TrueNAS manually:

```bash
# SSH to TrueNAS
ssh mkesharw@NAS01

# Deploy to Green instance (or Blue)
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green
git pull origin main
./build_on_truenas.sh

# Verify
curl http://localhost:3019/health

# Access
open http://nas.keekar.com:3019
```

---

## 📊 Environment Comparison

| Environment | Purpose | URL | Deployment | Uptime |
|-------------|---------|-----|------------|--------|
| **Testing** | Functional testing | https://...railway.app | Automatic | Always on |
| **Production (Green)** | Live users | http://nas.keekar.com:3019 | Manual | Always on |
| **Production (Blue)** | Live users | http://nas.keekar.com:3020 | Manual | Always on |

---

## 🔒 Security Considerations

### Testing Environment:

- ✅ Use test data only
- ✅ Default credentials are okay
- ✅ Publicly accessible (for testers)
- ✅ Can be reset anytime
- ⚠️ Do NOT put sensitive data

### Production Environment:

- ✅ Change default passwords
- ✅ Restrict network access if needed
- ✅ Use real credentials
- ✅ Backup configurations
- ✅ Sensitive data is protected

---

## 💰 Cost Analysis

### Railway (Option 1):

**Free Tier:**
- $5/month free credit
- Testing instance uses ~$2-3/month
- **Total: $0** (within free credit)

**If exceed free tier:**
- $0.000231/GB-hour
- ~$3-5/month for testing instance

### GitHub Runner + Ngrok (Option 2):

**Free Tier:**
- GitHub Actions: Free for public repos
- Ngrok: 1 tunnel free
- 5 hours per deployment
- **Total: $0**

**Limitations:**
- Max 6 hours per workflow
- Limited to 1 tunnel on free tier

---

## 🐛 Troubleshooting

### Railway Issues:

**Deployment fails:**
```bash
# Check Railway logs
railway logs

# Check build logs in Railway dashboard
```

**App not starting:**
```bash
# Verify environment variables in Railway dashboard
# Check Dockerfile builds locally:
docker build -t test .
docker run -p 3020:3020 test
```

### Ngrok Issues:

**Tunnel not created:**
- Verify `NGROK_AUTHTOKEN` secret is set correctly
- Check ngrok account limits
- Review workflow logs

**Can't access URL:**
- URL is only active during workflow run
- Check workflow is still running
- Verify health endpoint: `<ngrok-url>/health`

### General Issues:

**Tests failing:**
- Fix tests before deployment triggers
- Review test logs in Actions

**URL not working:**
- Wait 2-3 minutes after deployment starts
- Check application health endpoint
- Review deployment logs

---

## 📚 Best Practices

### For Development:

1. ✅ Test locally first
2. ✅ Ensure all tests pass
3. ✅ Use meaningful commit messages
4. ✅ Update version when needed
5. ✅ Document significant changes

### For Testing:

1. ✅ Test immediately after notification
2. ✅ Follow testing checklist
3. ✅ Document all findings
4. ✅ Report critical issues immediately
5. ✅ Approve/reject for production

### For Production:

1. ✅ Only deploy after testing approval
2. ✅ Backup config before deployment
3. ✅ Use Blue-Green strategy
4. ✅ Test production after deployment
5. ✅ Monitor for issues

---

## 📞 Support

### Resources:

- **Railway Docs**: https://docs.railway.app
- **Ngrok Docs**: https://ngrok.com/docs
- **GitHub Actions**: https://docs.github.com/en/actions

### Need Help?

1. Check workflow logs in Actions tab
2. Review this documentation
3. Check service status (Railway/Ngrok)
4. Contact: mukesh.kesharwani@adobe.com

---

## ✅ Quick Start Checklist

- [ ] Choose deployment option (Railway or Ngrok)
- [ ] Create account (Railway or Ngrok)
- [ ] Get API token/auth token
- [ ] Add token to GitHub Secrets
- [ ] Configure notification method (Slack/Email/Teams)
- [ ] Test deployment with empty commit
- [ ] Verify testing URL works
- [ ] Share URL with testers
- [ ] Document testing process
- [ ] Set up production deployment procedure

---

## 🎯 Summary

**You now have:**

✅ Automatic testing environment after every push  
✅ Public URL for testers  
✅ 24/7 availability (Railway) or 5-hour sessions (Ngrok)  
✅ Automatic notifications to testers  
✅ Manual control over production  

**Workflow:**
```
Code Push → Tests → Deploy to Testing → Testers Validate → Manual Deploy to TrueNAS
```

**Next Steps:**
1. Choose Railway (recommended) or Ngrok
2. Follow setup steps above
3. Configure notifications
4. Test the workflow
5. Share testing URL with team

---

**Last Updated**: January 22, 2026  
**Version**: 1.0  
**Author**: Development Team
