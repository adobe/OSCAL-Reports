# TrueNAS Custom Catalog - Quick Start

**Create your own app catalog in 20 minutes!**

## 🚀 Automated Setup (Easiest)

### Quick Command

```bash
cd /Users/mkesharw/Documents/OSCAL_Reports
./scripts/create-truenas-catalog.sh ../truenas-oscal-catalog keekar2022
```

This creates everything you need automatically!

---

## 📋 Manual Setup (Step-by-Step)

### Prerequisites

```bash
# Install Helm (if not installed)
brew install helm  # macOS
# or
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash  # Linux
```

### Step 1: Create Repository on GitHub

1. Go to: https://github.com/new
2. Configure:
   - **Name**: `truenas-oscal-catalog`
   - **Public**: ✅ (Required!)
   - **Don't** initialize with README
3. Click **Create repository**

### Step 2: Create Local Structure

```bash
# Create catalog directory
mkdir -p truenas-oscal-catalog/charts/oscal-report-generator/1.6.3

# Copy chart files
cd /Users/mkesharw/Documents/OSCAL_Reports
cp -r truenas-chart/* ../truenas-oscal-catalog/charts/oscal-report-generator/1.6.3/
```

### Step 3: Create Metadata Files

#### item.yaml
```bash
cat > ../truenas-oscal-catalog/charts/oscal-report-generator/item.yaml << 'EOF'
categories:
  - security
  - compliance
icon_url: https://raw.githubusercontent.com/keekar2022/truenas-oscal-catalog/main/charts/oscal-report-generator/1.6.3/icon.png
tags:
  - oscal
  - compliance
  - security
EOF
```

#### README.md
```bash
cat > ../truenas-oscal-catalog/README.md << 'EOF'
# TrueNAS SCALE App Catalog

Custom catalog for OSCAL Report Generator.

## Adding This Catalog

1. TrueNAS UI → Apps → Manage Catalogs → Add Catalog
2. Repository: https://github.com/keekar2022/truenas-oscal-catalog
3. Branch: main
4. Save and wait for sync

## Apps

- **OSCAL Report Generator** v1.6.3
EOF
```

### Step 4: Generate Index

```bash
cd ../truenas-oscal-catalog
helm repo index . --url https://github.com/keekar2022/truenas-oscal-catalog/raw/main
```

### Step 5: Push to GitHub

```bash
git init
git add .
git commit -m "Initial catalog with OSCAL Report Generator v1.6.3"
git remote add origin https://github.com/keekar2022/truenas-oscal-catalog.git
git branch -M main
git push -u origin main
```

---

## ✅ Verify Setup

### Check Repository Structure

```bash
cd truenas-oscal-catalog
tree -L 4
```

Should show:
```
.
├── README.md
├── index.yaml                                ✓
└── charts/
    └── oscal-report-generator/
        ├── item.yaml                        ✓
        └── 1.6.3/
            ├── Chart.yaml                   ✓
            ├── questions.yaml               ✓
            ├── values.yaml                  ✓
            └── templates/                   ✓
```

### Test Catalog Index

```bash
curl https://raw.githubusercontent.com/keekar2022/truenas-oscal-catalog/main/index.yaml
```

Should return valid YAML with your app info.

---

## 👥 How Users Add Your Catalog

### Step 1: Open TrueNAS Web UI

### Step 2: Manage Catalogs
- Apps → **Manage Catalogs** → **Add Catalog**

### Step 3: Configure
```
Catalog Name:      OSCAL Apps
Repository:        https://github.com/keekar2022/truenas-oscal-catalog
Preferred Trains:  charts
Branch:            main
```

### Step 4: Save
- Click **Save**
- Wait 1-2 minutes for sync
- Status will show **"Synced"**

### Step 5: Discover App
- Go to **Apps** → **Discover Apps**
- Search for "OSCAL" or scroll to find it
- Your app appears with icon and description!

---

## 🔄 Update to New Version

When releasing v1.6.4:

```bash
cd truenas-oscal-catalog/charts/oscal-report-generator

# Create new version
cp -r 1.6.3 1.6.4

# Update version in Chart.yaml
sed -i '' 's/version: 1.6.3/version: 1.6.4/' 1.6.4/Chart.yaml
sed -i '' 's/appVersion: "1.6.3"/appVersion: "1.6.4"/' 1.6.4/Chart.yaml

# Update image tag in values.yaml
sed -i '' 's/tag: "latest"/tag: "1.6.4"/' 1.6.4/values.yaml

# Regenerate index
cd ../..
helm repo index . --url https://github.com/keekar2022/truenas-oscal-catalog/raw/main

# Push update
git add .
git commit -m "Add v1.6.4"
git push
```

TrueNAS users get automatic update notification!

---

## 🎨 Optional: Add App Icon

### Create/Download Icon
- Format: PNG
- Size: 512x512 pixels
- Name: `icon.png`

### Add to Catalog
```bash
# Copy icon
cp your-icon.png truenas-oscal-catalog/charts/oscal-report-generator/1.6.3/icon.png

# Update Chart.yaml
echo "icon: https://raw.githubusercontent.com/keekar2022/truenas-oscal-catalog/main/charts/oscal-report-generator/1.6.3/icon.png" >> \
  truenas-oscal-catalog/charts/oscal-report-generator/1.6.3/Chart.yaml

# Regenerate index
cd truenas-oscal-catalog
helm repo index . --url https://github.com/keekar2022/truenas-oscal-catalog/raw/main

# Push
git add .
git commit -m "Add app icon"
git push
```

---

## 🐛 Troubleshooting

### Catalog Won't Sync

**Check**:
1. Repository is **public** ✓
2. URL is correct: `https://github.com/keekar2022/truenas-oscal-catalog`
3. Branch is `main` (not `master`)
4. `index.yaml` exists at root
5. Try force refresh in TrueNAS

**Test manually**:
```bash
curl https://raw.githubusercontent.com/keekar2022/truenas-oscal-catalog/main/index.yaml
```

### App Not Appearing

**Check**:
1. Catalog status shows "Synced"
2. Wait 2-3 minutes after sync
3. Refresh browser page
4. Check `index.yaml` contains app entry
5. Verify `questions.yaml` is valid YAML

**Validate chart**:
```bash
helm lint truenas-oscal-catalog/charts/oscal-report-generator/1.6.3
```

### Icon Not Showing

**Check**:
1. Icon file exists at correct path
2. URL uses `raw.githubusercontent.com`
3. File is PNG format
4. Size < 1MB
5. Repository is public

**Test icon URL**:
```bash
curl -I https://raw.githubusercontent.com/keekar2022/truenas-oscal-catalog/main/charts/oscal-report-generator/1.6.3/icon.png
# Should return: HTTP/2 200
```

---

## 📊 Success Checklist

- [ ] GitHub repository created (public)
- [ ] Catalog structure created
- [ ] Chart files copied
- [ ] `item.yaml` created
- [ ] `README.md` created
- [ ] `index.yaml` generated
- [ ] Pushed to GitHub
- [ ] Repository is public ✓
- [ ] `index.yaml` accessible via curl
- [ ] Users can add catalog in TrueNAS
- [ ] App appears in Discover Apps
- [ ] App installs successfully
- [ ] Icon displays correctly (optional)

---

## 🔗 Quick Links

- **Full Guide**: [TRUENAS_CUSTOM_CATALOG_SETUP.md](TRUENAS_CUSTOM_CATALOG_SETUP.md)
- **Installation Guide**: [TRUENAS_INSTALLATION.md](TRUENAS_INSTALLATION.md)
- **Quick Reference**: [TRUENAS_QUICK_REFERENCE.md](TRUENAS_QUICK_REFERENCE.md)
- **Docker Hub**: https://hub.docker.com/r/keekar/oscal_reports
- **GitHub**: https://github.com/keekar2022/OSCAL-Reports

---

## 🎉 Result

Once set up, users can:
1. ✅ Add your catalog (2 minutes)
2. ✅ Find your app in Discover Apps
3. ✅ Install with one click via Web UI
4. ✅ Get automatic update notifications
5. ✅ Configure via friendly forms

**Your app is now a first-class TrueNAS SCALE application!** 🚀

---

**Time to Complete**: 20 minutes  
**Difficulty**: ⭐⭐⭐ Advanced (or ⭐ Easy with automated script)  
**Last Updated**: January 2026
