# 🚀 Quick Setup: Ngrok Testing Environment

**5-Minute Setup for Automatic Testing Environment**

---

## ✅ What You Get

After this setup, every push to `main` will automatically:
1. Run all tests
2. Deploy to a temporary testing environment (5 hours)
3. Provide a public URL for testers
4. Shut down automatically after 5 hours

**Infrastructure:** GitHub-hosted runners + Ngrok tunnel  
**Cost:** FREE  
**Duration:** 5 hours per deployment

---

## 📋 Setup Steps (5 Minutes)

### Step 1: Create Ngrok Account (2 minutes)

1. Go to https://ngrok.com/signup
2. Sign up (free tier is sufficient)
3. Verify your email

### Step 2: Get Ngrok Auth Token (1 minute)

1. Log in to Ngrok dashboard
2. Go to **Your Authtoken** page: https://dashboard.ngrok.com/get-started/your-authtoken
3. Copy your auth token (looks like: `2abc...XYZ123`)

### Step 3: Add Token to GitHub (2 minutes)

1. Go to your GitHub repository: https://github.com/AdobeManagedServices/OSCAL-Reports
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Fill in:
   - **Name:** `NGROK_AUTHTOKEN`
   - **Value:** Paste your ngrok auth token from Step 2
5. Click **Add secret**

### Step 4: Test It! (2 minutes)

The workflow is already configured and ready to go!

```bash
# Test with an empty commit
git commit --allow-empty -m "test: Testing Ngrok environment"
git push origin main
```

---

## 📍 How to Get Testing URL

After pushing to `main`:

1. Go to **Actions** tab in GitHub
2. Click on the running workflow
3. Click on the **"Deploy on Runner with Ngrok (5 Hours)"** job
4. Expand the **"📝 Get Ngrok URL"** step
5. Copy the URL (e.g., `https://abc123.ngrok-free.app`)
6. Share this URL with your testers!

**Example URL:** `https://1a2b-3c4d-5e6f.ngrok-free.app`

---

## ⏰ How It Works

```
Push to main
    ↓
Run All Tests (2-3 min)
    ↓
Build Docker Image (3-4 min)
    ↓
Start Application
    ↓
Create Ngrok Tunnel
    ↓
Get Public URL ← Share this with testers!
    ↓
Keep Running (5 hours)
    ↓
Auto Shutdown
```

---

## 📧 Optional: Add Notifications

Want to automatically notify testers when testing URL is ready?

### Slack Notifications

1. Create Slack webhook: https://api.slack.com/messaging/webhooks
2. Add GitHub secret: `SLACK_TESTERS_WEBHOOK_URL`
3. Uncomment Slack section in `.github/workflows/deploy-test-environment.yml`

### Email Notifications

1. Get SMTP credentials (e.g., Gmail App Password)
2. Add GitHub secrets:
   - `SMTP_USERNAME`
   - `SMTP_PASSWORD`
3. Uncomment email section in `.github/workflows/deploy-test-environment.yml`

---

## 🎯 Testing Workflow

### For Developers:
1. Push code to `main`
2. Wait 5-10 minutes for deployment
3. Get testing URL from workflow output
4. Share URL with testers
5. After testing approval, deploy manually to TrueNAS

### For Testers:
1. Receive testing URL (from developer or notification)
2. Access the URL immediately
3. Perform functional testing (you have 5 hours)
4. Document any issues
5. Report findings before environment shuts down

### Manual Production Deployment:
After testing approval:

```bash
# SSH to TrueNAS
ssh mkesharw@NAS01

# Deploy to Green environment
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green
git pull origin main
./build_on_truenas.sh

# Test production
curl http://localhost:3019/health
```

---

## 💰 Cost

**GitHub Actions:**
- Public repos: FREE (unlimited)
- Private repos: 2,000 minutes/month FREE
- Each deployment uses ~360 minutes (6 hours)
- **Cost: $0** for public repos

**Ngrok Free Tier:**
- 1 online tunnel
- 40 connections/minute
- Random URLs
- **Cost: $0**

**Total: FREE** ✅

---

## 🐛 Troubleshooting

### "Ngrok tunnel not created"
- Verify `NGROK_AUTHTOKEN` is set correctly in GitHub Secrets
- Check your Ngrok account is active
- Review workflow logs for errors

### "Can't access the URL"
- Wait 2-3 minutes after deployment starts
- Check workflow is still running (hasn't completed yet)
- Try the health endpoint: `<ngrok-url>/health`

### "Tests failing"
- Fix the tests first
- Deployment only triggers if all tests pass
- Review test logs in GitHub Actions

### "URL expired"
- Environment shuts down after 5 hours
- Trigger new deployment with another push
- Each deployment gets a new URL

---

## 📚 More Information

- **Full Documentation:** [docs/TESTING_ENVIRONMENT_SETUP.md](docs/TESTING_ENVIRONMENT_SETUP.md)
- **All Deployment Options:** [DEPLOYMENT_OPTIONS.md](DEPLOYMENT_OPTIONS.md)
- **GitHub Actions Deployment:** [docs/GITHUB_ACTIONS_DEPLOYMENT.md](docs/GITHUB_ACTIONS_DEPLOYMENT.md)

---

## ⚡ Quick Reference

**Trigger deployment:**
```bash
git commit --allow-empty -m "test: Deploy testing environment"
git push origin main
```

**Get URL:**
- GitHub → Actions → Workflow → "Deploy on Runner with Ngrok" → "📝 Get Ngrok URL"

**Duration:** 5 hours per deployment

**Cost:** FREE

**Production:** Manual deployment to TrueNAS after testing approval

---

**Need Help?** Contact: mukesh.kesharwani@adobe.com

**Last Updated:** January 22, 2026
