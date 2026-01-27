# TrueNAS App Catalog Integration

This guide explains the OSCAL Report Generator integration with TrueNAS SCALE Apps catalog.

## ✅ Official Catalog Status

**OSCAL Report Generator has been submitted to the official TrueNAS Apps catalog!**

- **Pull Request**: https://github.com/truenas/apps/pull/4144
- **Status**: 🚧 Pending approval and merge
- **Train**: Community
- **When Available**: After PR approval, the app will appear in the default TrueNAS Apps catalog

---

## Installation Options

### Option 1: Official TrueNAS Apps Catalog (Recommended - After Approval)

Once the PR is approved and merged, users can install directly from the catalog.

**Steps for Users:**
1. Open TrueNAS SCALE Web UI
2. Navigate to **Apps** → **Discover Apps**
3. Search for "**OSCAL Report Generator**"
4. Click on the app card
5. Click **Install**
6. Configure settings and deploy

**Benefits:**
- ✅ Appears by default in all TrueNAS instances
- ✅ Automatic update notifications
- ✅ Professional web UI configuration form
- ✅ Maintained by TrueNAS community
- ✅ No manual catalog setup required

---

### Option 2: Quick Install via Custom App (Current Method)

**Use this until the official catalog version is approved.**

Users can install using the **Custom App** feature in TrueNAS:

**Steps:**

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

**Access the App:**
- URL: `http://[truenas-ip]:30200`
- Default credentials are in the Docker image (see Docker Hub setup guide)

**Benefits:**
- ✅ Works immediately
- ✅ No waiting for PR approval
- ✅ Full control over settings
- ❌ Not discoverable in catalog
- ❌ Manual configuration required

---

### Option 3: Using Helm Chart Directly

For advanced users who want to use Helm directly.

See [TRUENAS_INSTALLATION.md](TRUENAS_INSTALLATION.md) for Helm installation instructions.

---

## Contribution to Official Catalog

### What Was Submitted

The following files were contributed to the official TrueNAS Apps repository:

**App Structure:**
```
ix-dev/community/oscal-report-generator/
├── app.yaml                    # App metadata
├── ix_values.yaml              # Static configuration
├── questions.yaml              # User configuration UI
├── README.md                   # Short description
├── app-readme.md               # Detailed app information
├── .helmignore                 # Ignore patterns
└── templates/
    ├── docker-compose.yaml     # Docker Compose template
    └── test_values/
        ├── basic-values.yaml   # Basic test config
        └── hostpath-values.yaml # Host path test config
```

### Key Features in Official Version

- **AI-Powered Control Suggestions**: Automatically suggest relevant security controls
- **Multiple Framework Support**: NIST 800-53, ISM, IM8, and more
- **Multiple Export Formats**: JSON, Excel, PDF, CCM
- **Modern Web Interface**: User-friendly compliance documentation management
- **Flexible Storage**: Supports both TrueNAS datasets and host paths
- **Health Checks**: Automatic container health monitoring
- **Web Portal**: One-click access to the web interface

### Approval Process

1. **Automated Tests**: GitHub Actions CI validates the app structure
2. **Code Review**: TrueNAS maintainers review the submission
3. **Feedback**: Address any requested changes
4. **Approval**: Once approved, PR is merged
5. **Availability**: App appears in official catalog after merge

---

## Comparison of Approaches

| Feature | Official Catalog | Custom App | Helm Chart |
|---------|-----------------|------------|------------|
| **Availability** | After PR approval | Immediate | Immediate |
| **Discoverability** | ✅ Yes | ❌ No | ❌ No |
| **Configuration UI** | ✅ Full UI | ⚠️ Basic | ❌ CLI only |
| **Updates** | ✅ Automatic | ❌ Manual | ⚠️ Manual |
| **Setup Time** | ⏱️ 5 min | ⏱️ 10 min | ⏱️ 15 min |
| **Difficulty** | ⭐ Easy | ⭐⭐ Medium | ⭐⭐⭐ Advanced |
| **Maintenance** | TrueNAS team | Self | Self |

---

## For End Users

### Current Installation (Before Approval)

Use **Option 2: Custom App** method until the PR is approved.

### Future Installation (After Approval)

Use **Option 1: Official Catalog** for the easiest installation experience.

### Checking PR Status

Monitor the pull request status: https://github.com/truenas/apps/pull/4144

---

## For Developers

### How to Contribute to TrueNAS Apps

If you want to contribute your own app to TrueNAS:

1. **Fork Repository**: https://github.com/truenas/apps
2. **Create App Structure**: Follow official format
3. **Test Locally**: Use CI scripts to validate
4. **Submit PR**: Open pull request to main repository
5. **Documentation**: See [CONTRIBUTIONS.md](https://github.com/truenas/apps/blob/master/CONTRIBUTIONS.md)

### Local Testing

The converted app files are available in: `truenas-apps-format/oscal-report-generator/`

---

## References

- **Official PR**: https://github.com/truenas/apps/pull/4144
- **TrueNAS Apps Repository**: https://github.com/truenas/apps
- **Contribution Guide**: https://github.com/truenas/apps/blob/master/CONTRIBUTIONS.md
- **TrueNAS SCALE Docs**: https://www.truenas.com/docs/scale/
- **Docker Hub**: https://hub.docker.com/r/keekar/oscal_reports
- **GitHub**: https://github.com/keekar2022/OSCAL-Reports

---

**Last Updated**: January 2026  
**Status**: Submitted to official catalog (PR #4144)  
**Author**: Mukesh Kesharwani
