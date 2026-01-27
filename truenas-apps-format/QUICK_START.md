# Quick Start Guide

## ✅ Conversion Complete!

Your Helm chart has been successfully converted to the official TrueNAS Apps format.

## 📁 Location

All converted files are in: `truenas-apps-format/oscal-report-generator/`

## 🚀 Quick Steps to Contribute

### 1. Fork and Clone Official Repo
```bash
# Fork: https://github.com/truenas/apps
git clone https://github.com/YOUR_USERNAME/apps.git
cd apps
```

### 2. Copy Your App
```bash
cp -r /Users/mkesharw/Documents/OSCAL_Reports/truenas-apps-format/oscal-report-generator \
      ix-dev/community/
```

### 3. Test Locally
```bash
# Install dependencies
brew install helm
pip install pyyaml psutil pytest pytest-cov bcrypt pydantic

# Test your app
./.github/scripts/ci.py --app oscal-report-generator --train community --test-file basic-values.yaml

# Test with manual verification
./.github/scripts/ci.py --app oscal-report-generator --train community --test-file basic-values.yaml --wait=true
```

### 4. Generate Metadata
```bash
./.github/scripts/generate_metadata.py --app oscal-report-generator --train community
```

### 5. Create PR
```bash
git checkout -b add-oscal-report-generator
git add ix-dev/community/oscal-report-generator
git commit -m "Add OSCAL Report Generator to community catalog"
git push origin add-oscal-report-generator
```

Then open PR on GitHub: https://github.com/truenas/apps/pulls

## 📖 Detailed Guide

See `CONVERSION_GUIDE.md` for complete details and troubleshooting.

## 🔗 Resources

- **Official Guide**: https://github.com/truenas/apps/blob/master/CONTRIBUTIONS.md
- **Your App Repo**: https://github.com/keekar2022/OSCAL-Reports
- **Docker Hub**: https://hub.docker.com/r/keekar/oscal_reports

## ❓ Questions?

- GitHub Discussions: https://github.com/truenas/apps/discussions
- TrueNAS Forums: https://forums.truenas.com
