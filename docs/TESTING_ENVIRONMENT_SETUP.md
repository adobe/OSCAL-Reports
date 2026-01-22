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

## 🎯 Selected Option: GitHub Runner + Ngrok

**⚠️ Note**: Railway.app is not available for use in this organization.

### GitHub Runner + Ngrok (Active Solution)

**Pros:**
- ✅ Runs on GitHub infrastructure (organization-approved)
- ✅ No external service accounts needed
- ✅ Complete control over deployment
- ✅ Temporary testing environment (5 hours)
- ✅ Free (uses GitHub Actions minutes)

**Cons:**
- ⚠️ Maximum 6 hours (GitHub workflow limit)
- ⚠️ Uses GitHub Actions minutes
- ⚠️ Ngrok free tier has some limitations
- ⚠️ Environment shuts down after time limit
- ⚠️ New URL for each deployment

**Cost:** FREE (uses GitHub Actions minutes)

**Best For:**
- Organizations with restrictions on external services
- Temporary testing needs (5 hour windows)
- Functional testing by human testers
- Quick validation before production deployment

---

## 🚀 Setup: GitHub Runner + Ngrok

### Step 1: Create Ngrok Account

1. Go to https://ngrok.com
2. Sign up (free tier available)
3. Get your auth token from dashboard

### Step 2: Configure GitHub Secrets

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Add:
   - **Name**: `NGROK_AUTHTOKEN`
   - **Value**: Your ngrok auth token

### Step 3: Workflow is Already Configured

The workflow `.github/workflows/deploy-test-environment.yml` is already configured to use Ngrok!

**The workflow automatically:**
1. Runs all tests
2. Builds Docker container
3. Starts application on GitHub runner
4. Creates Ngrok tunnel
5. Provides public testing URL
6. Keeps environment running for 5 hours
7. Shuts down automatically

### Step 4: Test the Setup

1. Push a change to `main` branch (or use empty commit for testing):
   ```bash
   git commit --allow-empty -m "test: Trigger testing environment"
   git push origin main
   ```

2. Watch the workflow in GitHub **Actions** tab

3. The workflow will:
   - Run all tests
   - Build Docker image
   - Start application
   - Create Ngrok tunnel
   - Provide testing URL (e.g., `https://abc123.ngrok-free.app`)
   - Keep running for 5 hours
   - Shut down automatically

4. Get the testing URL from the workflow output in the "📝 Get Ngrok URL" step

5. Share the URL with your testers immediately

**Important Notes:**
- URL is unique for each deployment
- Environment shuts down after 5 hours
- Workflow must complete within 6 hours (GitHub limit)
- New deployment = new URL

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
| **Testing** | Functional testing | https://...ngrok-free.app | Automatic | 5 hours |
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

### GitHub Runner + Ngrok (Selected Option):

**Free Tier:**
- ✅ GitHub Actions: Free for public repos (2,000 minutes/month for private)
- ✅ Ngrok: 1 tunnel free (40 connections/minute)
- ✅ 5 hours per deployment session
- **Total Cost: $0**

**GitHub Actions Usage:**
- ~5-6 hours per deployment
- ~360 minutes per deployment
- Can run ~5 deployments/month on free private repo tier
- Unlimited on public repos

**Ngrok Free Tier:**
- 1 online ngrok process
- 40 connections/minute
- Random tunnel URL (changes each time)
- Sufficient for testing purposes

**If you need more:**
- GitHub Actions: $0.008/minute for private repos
- Ngrok Personal: $8/month (custom domains, more connections)

**Cost Comparison:**
- **This setup**: FREE
- **Railway**: Not allowed by organization
- **Azure/AWS**: $13-128/month (production-grade)

**Best for:** Organizations with limited budgets and testing needs

---

## 🐛 Troubleshooting

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

- [ ] Create Ngrok account (free)
- [ ] Get Ngrok auth token
- [ ] Add `NGROK_AUTHTOKEN` to GitHub Secrets
- [ ] Workflow is already configured (no changes needed)
- [ ] Configure notification method (Slack/Email/Teams) - Optional
- [ ] Test deployment with empty commit
- [ ] Get testing URL from workflow output
- [ ] Share URL with testers
- [ ] Document testing process
- [ ] Set up production deployment procedure to TrueNAS

---

## 🎯 Summary

**You now have:**

✅ Automatic testing environment on GitHub infrastructure  
✅ Public URL for testers (via Ngrok tunnel)  
✅ 5-hour testing sessions (configurable)  
✅ Automatic notifications to testers  
✅ Manual control over production deployment  
✅ No external service accounts required (except free Ngrok)

**Workflow:**
```
Code Push → Tests → Deploy to Testing (Ngrok) → Testers Validate → Manual Deploy to TrueNAS
```

**Next Steps:**
1. Create free Ngrok account
2. Get auth token and add to GitHub Secrets
3. Test with empty commit
4. Get testing URL from workflow output
5. Share URL with testers
6. Configure optional notifications (Slack/Email)

**Key Points:**
- ⏰ Testing environment runs for 5 hours per deployment
- 🔄 New URL generated for each deployment
- 🆓 Completely free (GitHub Actions + Ngrok free tier)
- ✅ Runs on GitHub infrastructure (organization-approved)
- 🚀 Production stays on TrueNAS with manual deployment

---

**Last Updated**: January 22, 2026  
**Version**: 1.0  
**Author**: Development Team
