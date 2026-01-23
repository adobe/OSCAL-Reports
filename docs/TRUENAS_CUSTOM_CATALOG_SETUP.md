# TrueNAS Custom Catalog Setup Guide

Complete guide to create your own TrueNAS SCALE app catalog.

## 📋 Overview

A custom catalog makes your app discoverable in TrueNAS "Discover Apps" section. Once users add your catalog, your app appears alongside official TrueNAS apps.

### Benefits

- ✅ **Discoverable** - Appears in "Discover Apps" UI
- ✅ **Professional** - Looks like an official app
- ✅ **Easy Updates** - Users get automatic update notifications
- ✅ **Web UI Config** - Full configuration forms via `questions.yaml`
- ✅ **Multiple Apps** - Can host multiple apps in one catalog

---

## 🎯 What You'll Create

1. **GitHub Repository**: `truenas-oscal-catalog`
2. **Catalog Structure**: Organized Helm charts
3. **Index File**: Catalog metadata
4. **GitHub Pages** (optional): Host the catalog

---

## 📁 Catalog Structure

```
truenas-oscal-catalog/
├── README.md
├── index.yaml                    # Catalog index (auto-generated)
└── charts/
    └── oscal-report-generator/
        ├── 1.6.3/                # Version directory
        │   ├── Chart.yaml
        │   ├── questions.yaml
        │   ├── values.yaml
        │   ├── app-readme.md
        │   ├── icon.png         # App icon (optional)
        │   └── templates/
        │       ├── deployment.yaml
        │       ├── service.yaml
        │       ├── pvc.yaml
        │       ├── ingress.yaml
        │       ├── _helpers.tpl
        │       └── NOTES.txt
        └── item.yaml            # App metadata (optional)
```

---

## 🚀 Step-by-Step Setup

### Step 1: Create GitHub Repository

#### 1.1 Create New Repository

1. Go to GitHub: https://github.com/new
2. Configure:
   - **Repository name**: `truenas-oscal-catalog`
   - **Description**: `TrueNAS SCALE app catalog for OSCAL Report Generator`
   - **Public**: ✅ (Required for TrueNAS to access)
   - **Initialize**: Add README
3. Click **Create repository**

#### 1.2 Clone Repository

```bash
git clone https://github.com/keekar2022/truenas-oscal-catalog.git
cd truenas-oscal-catalog
```

---

### Step 2: Create Catalog Structure

#### 2.1 Create Directories

```bash
# Create directory structure
mkdir -p charts/oscal-report-generator/1.6.3

# Navigate to version directory
cd charts/oscal-report-generator/1.6.3
```

#### 2.2 Copy Helm Chart Files

Copy all files from your existing `truenas-chart/` directory:

```bash
# From your OSCAL-Reports repository
cd /path/to/OSCAL-Reports/truenas-chart

# Copy all chart files to catalog
cp -r . /path/to/truenas-oscal-catalog/charts/oscal-report-generator/1.6.3/

# Or use this if you're in the right directory
cd /Users/mkesharw/Documents/OSCAL_Reports
cp truenas-chart/* ../truenas-oscal-catalog/charts/oscal-report-generator/1.6.3/
cp -r truenas-chart/templates ../truenas-oscal-catalog/charts/oscal-report-generator/1.6.3/
```

#### 2.3 Add App Icon (Optional but Recommended)

Create or download an icon for your app:

```bash
# Icon requirements:
# - Format: PNG
# - Size: 512x512 pixels (recommended) or 256x256
# - Transparent background (optional)
# - File name: icon.png

# Place in version directory
cp your-icon.png charts/oscal-report-generator/1.6.3/icon.png
```

---

### Step 3: Create Catalog Metadata Files

#### 3.1 Create item.yaml (Optional)

Create `charts/oscal-report-generator/item.yaml`:

```yaml
categories:
  - security
  - compliance
  - governance

icon_url: https://raw.githubusercontent.com/keekar2022/truenas-oscal-catalog/main/charts/oscal-report-generator/1.6.3/icon.png

# Alternative: Use emoji as icon if no image
# icon: "🛡️"

tags:
  - oscal
  - compliance
  - security
  - ssp
  - soa
  - ccm
  - nist
  - governance
```

#### 3.2 Create Main README.md

Create `README.md` at repository root:

```markdown
# TrueNAS SCALE App Catalog

Custom app catalog for OSCAL compliance and security tools.

## Available Apps

### OSCAL Report Generator

Generate compliance documentation from OSCAL catalogs.

**Features**:
- AI-powered control suggestions
- Multiple frameworks (NIST, ISM, IM8)
- Multiple export formats (JSON, Excel, PDF, CCM)
- Modern web interface

**Latest Version**: 1.6.3

---

## Adding This Catalog to TrueNAS

1. Open TrueNAS SCALE Web UI
2. Navigate to **Apps** → **Manage Catalogs**
3. Click **Add Catalog**
4. Configure:
   - **Catalog Name**: `OSCAL Apps`
   - **Repository**: `https://github.com/keekar2022/truenas-oscal-catalog`
   - **Preferred Trains**: `charts`
   - **Branch**: `main`
5. Click **Save**
6. Wait 1-2 minutes for sync

## Installing Apps

After adding the catalog:

1. Go to **Apps** → **Discover Apps**
2. Find **OSCAL Report Generator**
3. Click on it
4. Configure settings
5. Click **Install**

---

## Documentation

- **OSCAL Report Generator**: [GitHub](https://github.com/keekar2022/OSCAL-Reports)
- **Docker Hub**: [keekar/oscal_reports](https://hub.docker.com/r/keekar/oscal_reports)

## Support

- **Issues**: [GitHub Issues](https://github.com/keekar2022/OSCAL-Reports/issues)
- **Documentation**: [Full Docs](https://github.com/keekar2022/OSCAL-Reports/tree/main/docs)

---

**Maintained by**: Mukesh Kesharwani
```

---

### Step 4: Generate Catalog Index

The catalog index is crucial - it tells TrueNAS what apps are available.

#### 4.1 Install Helm (if not already installed)

```bash
# On macOS
brew install helm

# On Linux
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

#### 4.2 Generate index.yaml

```bash
# Navigate to catalog root
cd /path/to/truenas-oscal-catalog

# Generate catalog index
helm repo index . --url https://github.com/keekar2022/truenas-oscal-catalog/raw/main

# This creates index.yaml at the root
```

The `index.yaml` will look like this:

```yaml
apiVersion: v1
entries:
  oscal-report-generator:
    - apiVersion: v2
      appVersion: "1.6.3"
      created: "2026-01-23T..."
      description: OSCAL SOA/SSP/CCM Generator - Compliance documentation tool
      digest: abc123...
      home: https://github.com/keekar2022/OSCAL-Reports
      keywords:
        - oscal
        - compliance
        - security
      maintainers:
        - email: mukesh.kesharwani@adobe.com
          name: Mukesh Kesharwani
      name: oscal-report-generator
      sources:
        - https://github.com/keekar2022/OSCAL-Reports
        - https://hub.docker.com/r/keekar/oscal_reports
      urls:
        - https://github.com/keekar2022/truenas-oscal-catalog/raw/main/charts/oscal-report-generator/1.6.3/oscal-report-generator-1.6.3.tgz
      version: 1.6.3
generated: "2026-01-23T..."
```

---

### Step 5: Package the Chart (Optional)

Optionally package the chart as a `.tgz` file:

```bash
# Package the chart
helm package charts/oscal-report-generator/1.6.3

# Move to charts directory
mv oscal-report-generator-1.6.3.tgz charts/oscal-report-generator/

# Regenerate index with packaged chart
helm repo index . --url https://github.com/keekar2022/truenas-oscal-catalog/raw/main
```

---

### Step 6: Commit and Push

```bash
cd /path/to/truenas-oscal-catalog

# Add all files
git add .

# Commit
git commit -m "Initial catalog with OSCAL Report Generator v1.6.3"

# Push to GitHub
git push origin main
```

---

### Step 7: Verify Repository Structure

Your final structure should look like:

```
truenas-oscal-catalog/
├── README.md
├── index.yaml                                  ✅
└── charts/
    └── oscal-report-generator/
        ├── item.yaml                          ✅
        ├── 1.6.3/
        │   ├── Chart.yaml                     ✅
        │   ├── questions.yaml                 ✅
        │   ├── values.yaml                    ✅
        │   ├── app-readme.md                  ✅
        │   ├── icon.png                       ✅ (optional)
        │   ├── README.md                      ✅
        │   ├── .helmignore                    ✅
        │   └── templates/
        │       ├── deployment.yaml            ✅
        │       ├── service.yaml               ✅
        │       ├── pvc.yaml                   ✅
        │       ├── ingress.yaml               ✅
        │       ├── _helpers.tpl               ✅
        │       └── NOTES.txt                  ✅
        └── oscal-report-generator-1.6.3.tgz  ✅ (optional)
```

---

## 📱 How Users Add Your Catalog

### Step-by-Step for End Users

1. **Open TrueNAS SCALE Web UI**

2. **Navigate to Apps Section**:
   - Click **Apps** in left sidebar
   - Click **Manage Catalogs** tab

3. **Add New Catalog**:
   - Click **Add Catalog** button
   
4. **Configure Catalog**:
   - **Catalog Name**: `OSCAL Apps` (or any name)
   - **Repository**: `https://github.com/keekar2022/truenas-oscal-catalog`
   - **Preferred Trains**: `charts`
   - **Branch**: `main`
   - **Description**: `Compliance and security tools`

5. **Save and Sync**:
   - Click **Save**
   - Wait 1-2 minutes for catalog to sync
   - Status will show "Synced" when ready

6. **Discover Your App**:
   - Go to **Apps** → **Discover Apps**
   - Search for "OSCAL" or scroll to find it
   - Your app now appears with icon and description!

---

## 🔄 Adding New Versions

When you release a new version:

### Method 1: Create New Version Directory

```bash
cd truenas-oscal-catalog/charts/oscal-report-generator

# Copy previous version
cp -r 1.6.3 1.6.4

# Update Chart.yaml in new version
cd 1.6.4
# Edit Chart.yaml - change version to 1.6.4

# Regenerate index
cd ../../..
helm repo index . --url https://github.com/keekar2022/truenas-oscal-catalog/raw/main

# Commit and push
git add .
git commit -m "Add OSCAL Report Generator v1.6.4"
git push origin main
```

### Method 2: Keep Only Latest (Simpler)

```bash
# Just update the existing 1.6.3 directory
cd charts/oscal-report-generator/1.6.3

# Update Chart.yaml version
# Update values.yaml image tag
# Update any other changes

# Rename directory to new version
cd ..
mv 1.6.3 1.6.4

# Regenerate index
cd ../../
helm repo index . --url https://github.com/keekar2022/truenas-oscal-catalog/raw/main

# Commit and push
git add .
git commit -m "Update to v1.6.4"
git push origin main
```

**Note**: TrueNAS will automatically detect new versions and notify users!

---

## 🎨 Optional: Add App Icon

### Icon Requirements

- **Format**: PNG (preferred) or SVG
- **Size**: 512x512 pixels (recommended), minimum 256x256
- **Transparent background**: Recommended
- **File name**: `icon.png`
- **Location**: `charts/oscal-report-generator/1.6.3/icon.png`

### Where to Get Icons

1. **Create your own** using:
   - Adobe Illustrator
   - Figma
   - Canva
   - Inkscape (free)

2. **Use free icon libraries**:
   - [Noun Project](https://thenounproject.com/) (with attribution)
   - [Flaticon](https://www.flaticon.com/) (with attribution)
   - [Icons8](https://icons8.com/)

3. **Use emoji** (quick option):
   - In `item.yaml`: `icon: "🛡️"`
   - TrueNAS will display emoji as icon

### Update Chart.yaml with Icon URL

```yaml
# In Chart.yaml
icon: https://raw.githubusercontent.com/keekar2022/truenas-oscal-catalog/main/charts/oscal-report-generator/1.6.3/icon.png
```

---

## 🔧 Troubleshooting

### Catalog Won't Sync

**Check**:
1. Repository is **public** on GitHub
2. Repository URL is correct
3. Branch name is correct (`main` not `master`)
4. `index.yaml` exists at repository root
5. Check TrueNAS logs: System Settings → Advanced → System Dataset

**Test manually**:
```bash
# Try accessing index.yaml directly
curl https://raw.githubusercontent.com/keekar2022/truenas-oscal-catalog/main/index.yaml
```

### App Not Appearing in Discover Apps

**Check**:
1. Catalog status shows "Synced"
2. `index.yaml` contains your app entry
3. Chart name matches directory name
4. `questions.yaml` is present and valid YAML
5. Refresh the page or wait a few minutes

**Force catalog refresh**:
1. Apps → Manage Catalogs
2. Click on your catalog → ⋮ → **Refresh**

### App Won't Install

**Common issues**:
1. Invalid `questions.yaml` syntax
2. Missing required files in templates/
3. Invalid Helm template syntax
4. Check installation logs in TrueNAS

**Debug**:
```bash
# Validate chart locally
helm lint charts/oscal-report-generator/1.6.3

# Try installation dry-run
helm install test-oscal charts/oscal-report-generator/1.6.3 --dry-run
```

### Icon Not Showing

**Check**:
1. Icon file exists at correct path
2. Icon URL is correct in Chart.yaml or item.yaml
3. Image is PNG format
4. Image size is reasonable (< 1MB)
5. GitHub raw URL is used (not github.com URL)

**Correct icon URL format**:
```
https://raw.githubusercontent.com/[username]/[repo]/main/charts/[app]/[version]/icon.png
```

---

## 📊 Catalog Maintenance

### Regular Tasks

1. **Update to new versions**:
   - Add new version directory
   - Regenerate index
   - Commit and push

2. **Monitor GitHub issues**:
   - Check for installation problems
   - Respond to user questions

3. **Keep documentation updated**:
   - Update README.md
   - Update app-readme.md
   - Add release notes

4. **Test installations**:
   - Periodically test fresh installs
   - Verify upgrades work correctly

### Best Practices

1. ✅ **Semantic versioning** (1.6.3, 1.6.4, etc.)
2. ✅ **Keep old versions** (for rollback capability)
3. ✅ **Test before pushing** (helm lint, dry-run)
4. ✅ **Clear commit messages**
5. ✅ **Update CHANGELOG** in repository
6. ✅ **Provide migration guides** for breaking changes

---

## 🚀 Advanced: GitHub Pages (Optional)

Host your catalog on GitHub Pages for better performance:

### Enable GitHub Pages

1. Go to repository **Settings** → **Pages**
2. Source: Deploy from **main branch**
3. Folder: **/ (root)**
4. Click **Save**

### Update Catalog URL

When users add catalog, they use:
```
https://keekar2022.github.io/truenas-oscal-catalog
```

Update index generation:
```bash
helm repo index . --url https://keekar2022.github.io/truenas-oscal-catalog
```

---

## 📚 Additional Resources

- **TrueNAS SCALE Docs**: https://www.truenas.com/docs/scale/
- **Helm Chart Docs**: https://helm.sh/docs/topics/charts/
- **TrueCharts Guide**: https://truecharts.org/manual/SCALE/guides/adding-truecharts/
- **Kubernetes Resources**: https://kubernetes.io/docs/home/

---

## 🎉 You're Done!

Once set up, users can:

1. **Add your catalog** in 2 minutes
2. **Discover your app** in Discover Apps
3. **Install with one click** using Web UI
4. **Get automatic updates** when you push new versions

Your app is now a first-class TrueNAS SCALE app! 🚀

---

**Guide Version**: 1.0  
**Last Updated**: January 2026  
**Author**: Mukesh Kesharwani
