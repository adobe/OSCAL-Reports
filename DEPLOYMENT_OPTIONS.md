# 🚀 Deployment Options - Quick Comparison

**OSCAL Report Generator V2**

Choose the deployment option that best fits your needs.

---

## 🎯 Quick Decision Guide

### I want...

**✅ Testing environment for testers** → Railway (FREE) ⭐ **NEW!**

**✅ Free/cheap hosting** → Heroku (free tier) or Google Cloud Run ($5/mo)

**✅ Simplest setup** → DigitalOcean App Platform ($5/mo)

**✅ Corporate/Enterprise** → Azure Web App ($13/mo)

**✅ On-premises (my own server)** → TrueNAS (included)

**✅ Just build Docker images** → GitHub Container Registry (free)

---

## 📊 All Deployment Options

### Option 1: Testing Environment (for Testers) - FREE ⭐

**Automatic testing environment for functional testing**

**⚠️ Active Solution: GitHub Runner + Ngrok** (Railway not allowed by organization)

| Platform | Cost | Availability | Best For |
|----------|------|--------------|----------|
| 🌐 **Ngrok + Runner** | FREE | 5 hours/session | Functional testing |

**✅ Pros:**
- Testers get immediate access after CI/CD
- Public URL automatically provided
- Runs on GitHub infrastructure (organization-approved)
- No external service accounts needed (except free Ngrok)
- Perfect for functional testing
- Completely FREE (GitHub Actions + Ngrok free tier)

**❌ Cons:**
- Not for production use
- 5-6 hour time limit per deployment
- New URL for each deployment
- Uses GitHub Actions minutes

**Perfect for:** 
- Giving testers a temporary URL to test immediately after deployment
- Organizations with restrictions on external services
- Quick validation before manual production deployment

**Setup:** See `docs/TESTING_ENVIRONMENT_SETUP.md`

### Option 2: Cloud Platforms (Recommended for Production)

| Platform | Cost | Setup Time | Best For |
|----------|------|------------|----------|
| 🔵 **Azure Web App** | $13/mo | 15 min | Microsoft ecosystem |
| 🟠 **AWS ECS** | $15-20/mo | 30 min | AWS containers |
| 🟠 **AWS EKS** | $98-128/mo | 60 min | Kubernetes users |
| 🔴 **Google Cloud Run** | $5-10/mo | 10 min | Pay-per-use, serverless |
| 🟣 **Heroku** | $0-7/mo | 5 min | Quick testing |
| 🟢 **DigitalOcean** | $5/mo | 10 min | Simple & affordable |

**✅ Pros:**
- Public URL automatically provided
- High availability (99.9%+ uptime)
- Auto-scaling capabilities
- Managed infrastructure
- SSL/HTTPS included
- Professional hosting

**❌ Cons:**
- Monthly recurring cost
- Requires cloud account
- External dependency

**Setup:** See `docs/CLOUD_DEPLOYMENT.md`

### Option 3: TrueNAS (Current Setup)

**Cost:** Free (your own hardware)  
**Setup Time:** 20 minutes

**✅ Pros:**
- No recurring costs
- Full control
- On-premises (data stays local)
- Blue-Green deployment
- Already configured

**❌ Cons:**
- Requires TrueNAS server
- Manual deployment steps
- You manage infrastructure
- VPN may be needed for remote access

**Setup:** See `docs/DEPLOYMENT.md`

### Option 4: GitHub Container Registry Only

**Cost:** Free  
**Setup Time:** 0 minutes (already configured)

**What it does:**
- Builds Docker image on every push
- Stores image in GitHub Container Registry
- You manually pull and run wherever you want

**Use this if:**
- You want to manually deploy
- You have your own server/hosting
- You want maximum flexibility

**Already working!** Images at: `ghcr.io/adobemanagedservices/oscal-report-generator`

---

## 🛠️ Setup Instructions

### For Cloud Deployment:

1. **Choose a platform** from the comparison above
2. **Follow setup guide**: `docs/CLOUD_DEPLOYMENT.md`
3. **Configure GitHub secrets** (platform-specific)
4. **Enable workflow** (already created)
5. **Push to main** → automatic deployment!

### For TrueNAS Only:

**Already configured!** Current setup:
```bash
ssh mkesharw@NAS01
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green
./build_on_truenas.sh
```

Access at:
- Blue: http://nas.keekar.com:3020
- Green: http://nas.keekar.com:3019

### For GitHub Registry Only:

**Already configured!** Nothing to do.

Pull image anywhere:
```bash
docker pull ghcr.io/adobemanagedservices/oscal-report-generator:latest
docker run -d -p 3020:3020 ghcr.io/adobemanagedservices/oscal-report-generator:latest
```

---

## 📋 Workflows Available

### Automatic (on push to main):

1. ✅ **CI/CD Pipeline** (`.github/workflows/ci-cd.yml`)
   - Tests code
   - Builds Docker image
   - Pushes to GitHub Container Registry
   - **Does NOT deploy** (you choose where)

### Manual (via GitHub Actions UI):

1. 🔵 **Deploy to Azure** (`.github/workflows/deploy-azure.yml`)
   - Requires: Azure account + secrets
   - Deploys to: Azure Web App
   - Cost: ~$13/month

2. 🟠 **Deploy to AWS** (`.github/workflows/deploy-aws.yml`)
   - Requires: AWS account + secrets
   - Deploys to: ECS Fargate
   - Cost: ~$15-20/month

3. 🟢 **Deploy to TrueNAS** (`.github/workflows/manual-deploy.yml`)
   - Requires: TrueNAS server
   - Deploys to: Blue/Green instances
   - Cost: Free

---

## 🎓 Recommendations by Use Case

### Testing/Development
**→ Heroku (free tier)**
- 5 minutes setup
- No credit card for free tier
- Public URL included

### Small Production (Budget)
**→ DigitalOcean App Platform**
- $5/month
- Very simple setup
- Good performance

### Enterprise Production (AWS/Azure)
**→ Azure Web App or AWS ECS**
- Professional SLAs
- Enterprise support
- Compliance certifications

### Kubernetes Infrastructure
**→ AWS EKS**
- Already using Kubernetes
- Multi-cloud portability
- Advanced orchestration needs
- Rich K8s ecosystem

### On-Premises (Internal Use)
**→ TrueNAS (current setup)**
- No recurring costs
- Data stays local
- Full control

---

## 🚀 Quick Start: Deploy to Cloud in 15 Minutes

### Example: Google Cloud Run (Easiest + Cheapest)

```bash
# 1. Install Google Cloud CLI
brew install google-cloud-sdk

# 2. Login and setup
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# 3. Deploy (one command!)
gcloud run deploy oscal-report-generator \
  --image ghcr.io/adobemanagedservices/oscal-report-generator:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 3020

# 4. Access your app
# URL provided in output, e.g.:
# https://oscal-report-generator-xxx-uc.a.run.app
```

**Cost:** ~$5-10/month (pay per use)

---

## ❓ FAQ

### Q: Can I run on GitHub-hosted runners directly?
**A:** No. GitHub runners are ephemeral (temporary) and shut down after each workflow. Not suitable for hosting applications.

### Q: What's the cheapest option?
**A:** Heroku free tier ($0) or Google Cloud Run (~$5/month). TrueNAS is free but requires your own hardware.

### Q: What's the easiest option?
**A:** DigitalOcean App Platform or Heroku. Both can be set up in 5-10 minutes.

### Q: Can I use my current TrueNAS setup?
**A:** Yes! It's already fully configured. Just keep using `build_on_truenas.sh`.

### Q: Do I need to choose only one option?
**A:** No! You can use multiple. For example:
- TrueNAS for internal testing
- Azure/AWS for production
- Both automatically updated from same GitHub repo

### Q: What if I just want Docker images built?
**A:** Already done! Every push to main builds and pushes to `ghcr.io`. Pull and run anywhere.

### Q: Should I use AWS ECS or AWS EKS?
**A:** 
- **Use ECS** if you want simpler AWS-native container management (~$15-20/month)
- **Use EKS** if you already use Kubernetes or need K8s portability (~$98-128/month)
- EKS costs more but provides Kubernetes ecosystem and multi-cloud capability

---

## 📚 Documentation

- **Cloud Deployment Guide**: `docs/CLOUD_DEPLOYMENT.md`
- **TrueNAS Deployment**: `docs/DEPLOYMENT.md`
- **GitHub Actions Setup**: `docs/GITHUB_ACTIONS_DEPLOYMENT.md`
- **Architecture**: `docs/ARCHITECTURE.md`

---

## 🎯 Summary

**Current Status:**
✅ Docker images built automatically  
✅ Pushed to GitHub Container Registry  
✅ TrueNAS deployment configured  
✅ Cloud deployment workflows ready  

**Next Step:**
👉 Choose your deployment platform from the options above
👉 Follow the setup guide for that platform
👉 Enable the workflow (or keep using TrueNAS)

**No changes needed if you're happy with TrueNAS!**

---

**Questions?** Check documentation or contact: mukesh.kesharwani@adobe.com

---

**Last Updated**: January 22, 2026  
**Version**: 1.0
