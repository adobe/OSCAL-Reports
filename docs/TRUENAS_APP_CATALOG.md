# TrueNAS App Catalog Integration

This guide explains how to make the OSCAL Report Generator available in TrueNAS SCALE "Discover Apps" catalog.

## Overview

TrueNAS SCALE uses Helm charts for its app catalog. To make your app discoverable, you need to:

1. Create a Helm chart structure
2. Define app metadata and configuration options
3. Either submit to TrueCharts community or host your own catalog

## Option 1: Quick Install via Docker Image (Current Method)

Users can currently install your app using the **Custom App** feature in TrueNAS:

### Steps for Users:

1. Open TrueNAS SCALE Web UI
2. Go to **Apps** → **Discover Apps**
3. Click **Custom App** (top right)
4. Fill in the form:

**Application Name**: `oscal-report-generator`

**Image Configuration**:
- Image repository: `keekar/oscal_reports`
- Image Tag: `latest` (or `edge`)
- Image Pull Policy: `IfNotPresent`

**Container Configuration**:
- Container Port: `3020`
- Node Port: `30200` (or any available port)

**Storage**:
- Add Host Path Volume:
  - Host Path: `/mnt/pool1/apps/oscal/config`
  - Mount Path: `/app/config`

**Environment Variables**:
- `NODE_ENV`: `production`
- `PORT`: `3020`

5. Click **Save**

### Access the App:
- URL: `http://[truenas-ip]:30200`
- Default credentials are in the Docker image (see Docker Hub setup guide)

---

## Option 2: Create TrueNAS Helm Chart (Discoverable App)

To make your app appear in the "Discover Apps" catalog natively, create a Helm chart.

### Chart Structure

```
truenas-charts/
└── oscal-report-generator/
    ├── Chart.yaml              # Chart metadata
    ├── questions.yaml          # TrueNAS UI configuration form
    ├── values.yaml             # Default configuration values
    ├── templates/
    │   ├── deployment.yaml     # Kubernetes deployment
    │   ├── service.yaml        # Kubernetes service
    │   ├── pvc.yaml           # Persistent volume claim (optional)
    │   └── NOTES.txt          # Post-install instructions
    └── README.md              # App documentation
```

### Files to Create

I'll create these files for you in the next steps.

---

## Option 3: Submit to TrueCharts Community

[TrueCharts](https://truecharts.org/) is the most popular third-party app catalog for TrueNAS SCALE.

### Steps to Submit:

1. **Fork TrueCharts Repository**:
   ```bash
   git clone https://github.com/truecharts/charts.git
   cd charts
   ```

2. **Create Your App Chart**:
   ```bash
   mkdir -p charts/stable/oscal-report-generator
   # Copy chart files (see below)
   ```

3. **Test Locally**:
   ```bash
   helm lint charts/stable/oscal-report-generator
   helm install oscal charts/stable/oscal-report-generator --dry-run
   ```

4. **Submit Pull Request**:
   - Follow TrueCharts contribution guidelines
   - Ensure all required files are present
   - Wait for community review

---

## Option 4: Host Your Own TrueNAS Catalog

Create a custom catalog that users can add to their TrueNAS instance.

### Catalog Structure:

```
truenas-catalog/
├── index.yaml              # Catalog index
└── oscal-report-generator/
    └── [version]/          # e.g., 1.6.3/
        └── [chart files]
```

### Setup Your Catalog:

1. **Create GitHub Repository**: `truenas-catalog`

2. **Add Chart Files**: (See Helm chart structure above)

3. **Generate Index**:
   ```bash
   helm repo index . --url https://github.com/keekar2022/truenas-catalog
   ```

4. **Users Add Your Catalog**:
   - TrueNAS UI → Apps → Manage Catalogs → Add Catalog
   - Name: `Keekar Apps`
   - Repository: `https://github.com/keekar2022/truenas-catalog`
   - Branch: `main`

---

## Recommended Approach

**For Now (Immediate)**: Use **Option 1** - Document "Custom App" installation in your README

**For Future (Discoverability)**: Use **Option 4** - Create your own catalog (gives you full control)

**For Maximum Reach**: Consider **Option 3** - Submit to TrueCharts (requires community approval)

---

## Files You Need to Create

I'll create the following files for you:

1. **`truenas-chart/Chart.yaml`** - Chart metadata
2. **`truenas-chart/questions.yaml`** - TrueNAS configuration UI
3. **`truenas-chart/values.yaml`** - Default values
4. **`truenas-chart/templates/deployment.yaml`** - Kubernetes deployment
5. **`truenas-chart/templates/service.yaml`** - Kubernetes service
6. **`truenas-chart/templates/NOTES.txt`** - Installation notes
7. **`docs/TRUENAS_INSTALLATION.md`** - User installation guide

---

## Benefits by Approach

### Option 1: Custom App
- ✅ Works immediately
- ✅ No chart creation needed
- ✅ Users control all settings
- ❌ Not discoverable in catalog
- ❌ Manual configuration required

### Option 2: Own Chart
- ✅ Full customization control
- ✅ Professional appearance
- ✅ Reusable across deployments
- ⚠️ Requires Helm knowledge
- ⚠️ Manual catalog setup

### Option 3: TrueCharts
- ✅ Appears in default catalog
- ✅ Large user base
- ✅ Community support
- ❌ Approval process required
- ❌ Must follow their standards

### Option 4: Custom Catalog
- ✅ Full control
- ✅ Professional appearance
- ✅ Easy updates
- ⚠️ Users must add catalog manually
- ⚠️ You maintain the catalog

---

## Next Steps

1. I'll create the Helm chart files for you
2. I'll create user installation documentation
3. You can choose which approach to use
4. I'll help you set up whichever option you prefer

Let me know if you want me to:
- Create the full Helm chart structure
- Create a simple installation guide for "Custom App" method
- Set up a GitHub repository for your own catalog

---

## References

- [TrueNAS SCALE Apps Documentation](https://www.truenas.com/docs/scale/scaletutorials/apps/)
- [TrueCharts Documentation](https://truecharts.org/manual/Quick-Start%20Guides/01-Adding-TrueCharts/)
- [Helm Charts Documentation](https://helm.sh/docs/topics/charts/)
- [Kubernetes Documentation](https://kubernetes.io/docs/home/)

---

**Last Updated**: January 2026
**Author**: Mukesh Kesharwani
