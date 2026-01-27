# TrueNAS Official Apps Conversion Guide

Your Helm chart has been successfully converted to the official TrueNAS Apps format!

## 📁 What Was Created

The `truenas-apps-format/oscal-report-generator/` directory contains:

```
oscal-report-generator/
├── app.yaml                          ✅ App metadata (converted from Chart.yaml)
├── ix_values.yaml                    ✅ Static defaults (converted from values.yaml)
├── questions.yaml                    ✅ User configuration schema (adapted to official format)
├── README.md                         ✅ Short description
├── app-readme.md                     ✅ Detailed app information
├── .helmignore                       ✅ Files to ignore
├── templates/
│   ├── docker-compose.yaml           ✅ Jinja2 template using TrueNAS library
│   └── test_values/
│       ├── basic-values.yaml         ✅ Basic test configuration
│       └── hostpath-values.yaml      ✅ Host path test configuration
└── migrations/                       📁 (empty, for future use)
```

## 🔄 Key Changes Made

### 1. **app.yaml** (Metadata)
- Converted from Helm Chart.yaml format
- Added `lib_version: 2.1.60` (latest library)
- Added `run_as_context` (runs as root for Node.js)
- Added `train: community`
- Set initial `version: 1.0.0`

### 2. **ix_values.yaml** (Static Values)
- Image configuration with `keekar/oscal_reports:latest`
- Container name constants
- Run-as user/group settings
- Application defaults

### 3. **questions.yaml** (Configuration UI)
- Adapted to official group structure:
  - OSCAL Configuration
  - User and Group Configuration
  - Network Configuration
  - Storage Configuration
  - Resources Configuration
  - Advanced
- Changed storage format to support both `ix_volume` and `host_path`
- Simplified network configuration (removed ingress for initial version)
- Added proper `show_if` conditions

### 4. **docker-compose.yaml** (Template)
- Uses TrueNAS library system instead of direct Kubernetes YAML
- Implements:
  - Container creation with `tpl.add_container()`
  - Environment variable configuration
  - Port mapping with `app.add_port()`
  - Storage mounting with `app.add_storage()`
  - Permissions container with `tpl.deps.perms()`
  - Health check with `app.healthcheck.set_test()`
  - Portal creation with `tpl.portals.add()`

### 5. **Test Files**
- `basic-values.yaml`: Tests with ix_volume storage
- `hostpath-values.yaml`: Tests with host path storage and custom env vars
- Both use `/opt/tests/mnt/` paths for macOS compatibility

## 🚀 Next Steps

### Step 1: Fork Official Repository

```bash
# Fork on GitHub: https://github.com/truenas/apps
# Then clone your fork
git clone https://github.com/YOUR_USERNAME/apps.git
cd apps
```

### Step 2: Copy Your App

```bash
# Copy the converted app to the community train
cp -r /Users/mkesharw/Documents/OSCAL_Reports/truenas-apps-format/oscal-report-generator \
      ix-dev/community/
```

### Step 3: Install Required Tools

```bash
# Install Helm (if not already installed)
brew install helm

# Install Python dependencies (or use devbox as mentioned in contribution guide)
pip install pyyaml psutil pytest pytest-cov bcrypt pydantic
```

### Step 4: Test Locally

```bash
# Navigate to the apps repository
cd apps

# Test with basic configuration
./.github/scripts/ci.py --app oscal-report-generator --train community --test-file basic-values.yaml

# Test with host path configuration
./.github/scripts/ci.py --app oscal-report-generator --train community --test-file hostpath-values.yaml

# Test and keep running for manual verification
./.github/scripts/ci.py --app oscal-report-generator --train community --test-file basic-values.yaml --wait=true
```

**Expected output**: The app should deploy successfully and health checks should pass.

### Step 5: Generate Metadata

```bash
# Generate capabilities metadata
./.github/scripts/generate_metadata.py --app oscal-report-generator --train community

# Validate ports
./.github/scripts/port_validation.py
```

This will update `app.yaml` with auto-detected capabilities and validate port uniqueness.

### Step 6: Verify Generated Files

After running CI, these files will be auto-generated (DO NOT edit manually):

- `item.yaml` - Catalog entry
- `templates/library/` - Library files copied automatically
- `app.yaml` - Updated with `lib_version_hash`

### Step 7: Create Pull Request

```bash
# Create a new branch
git checkout -b add-oscal-report-generator

# Add your app
git add ix-dev/community/oscal-report-generator

# Commit
git commit -m "Add OSCAL Report Generator to community catalog

- Compliance documentation tool
- Generates SOA, SSP, and CCM documents
- AI-powered control suggestions
- Multiple framework support (NIST, ISM, IM8)
"

# Push to your fork
git push origin add-oscal-report-generator
```

### Step 8: Open PR on GitHub

1. Go to https://github.com/truenas/apps
2. Click "New Pull Request"
3. Select your fork and branch
4. Use the auto-populated PR template
5. Fill in:
   - **Description**: Brief overview of OSCAL Report Generator
   - **App Information**: Links to GitHub repo, Docker Hub, license
   - **Testing**: Check all test scenarios you've verified
   - **Icons/Screenshots**: Attach or provide URLs
   - **Special Notes**: Mention it runs as root (Node.js requirement)

## 📝 Important Notes

### About Running as Root

Your app currently runs as `root` (UID 0, GID 0) because:
- It's a Node.js application that may need root permissions
- Your original configuration used root

**Security consideration**: If your app can run as non-root, update:
- `app.yaml`: Change `run_as_context` to use UID 568
- `ix_values.yaml`: Change `run_as.user` and `run_as.group` to 568
- `questions.yaml`: Change defaults in User and Group Configuration

### About Library Version

- Using `lib_version: 2.1.60` (check for latest in `/library/`)
- The `lib_version_hash` will be auto-generated by CI script
- Always use the latest 2.x version available

### About Storage

The app now supports two storage types:
1. **ix_volume** (default): TrueNAS-managed dataset
2. **host_path**: Direct host path mount

This is more flexible than your original chart.

### About Networking

Simplified to use direct port mapping (no ingress in initial version):
- Default port: 30200
- Internal port: 3020
- Service type: NodePort equivalent

You can add ingress support in a future version if needed.

### About Resources

Resource limits are now in the official format:
- CPUs: Float (e.g., 2.0 = 2 cores)
- Memory: Integer in MB (e.g., 2048 = 2GB)

## 🐛 Troubleshooting

### If CI Tests Fail

1. **Check rendered compose file**:
   ```bash
   ./.github/scripts/ci.py --app oscal-report-generator --train community --test-file basic-values.yaml --render-only=true
   cat ix-dev/community/oscal-report-generator/templates/rendered/docker-compose.yaml
   ```

2. **Check container logs**:
   ```bash
   docker logs oscal-report-generator
   ```

3. **Validate template syntax**:
   - Ensure all Jinja2 syntax is correct
   - Check that all `values.*` paths exist

### If Health Check Fails

- Verify your app exposes `/health` endpoint on port 3020
- If using different endpoint, update in `docker-compose.yaml`:
  ```jinja
  {% do app.healthcheck.set_test("curl", {"port": 3020, "path": "/your-health-path"}) %}
  ```
- Or disable health check in test files: `enable_health_check: false`

### If Permission Errors Occur

- Check that permissions container is activated
- Verify storage paths are correct
- Ensure UID/GID match your app requirements

## 📚 Additional Resources

- **Contribution Guide**: https://github.com/truenas/apps/blob/master/CONTRIBUTIONS.md
- **TrueNAS Docs**: https://www.truenas.com/docs/scale/
- **Your Original Chart**: `/Users/mkesharw/Documents/OSCAL_Reports/truenas-chart/`

## ✅ Pre-Submission Checklist

Before submitting your PR:

- [ ] App deploys successfully with `basic-values.yaml`
- [ ] App deploys successfully with `hostpath-values.yaml`
- [ ] Health check passes (or is appropriately disabled)
- [ ] Web portal opens and app is accessible
- [ ] Metadata generated with `generate_metadata.py`
- [ ] Port validation passes
- [ ] README.md and app-readme.md are complete
- [ ] Icon URL is provided (or attach to PR)
- [ ] No auto-generated files are committed (item.yaml, library/, rendered/)
- [ ] Commit message is descriptive

## 🎉 Success Metrics

Your app will be successfully integrated when:
1. ✅ CI passes all checks
2. ✅ Reviewer approves the PR
3. ✅ App is merged to community train
4. ✅ Users can discover and install your app in TrueNAS

---

**Good luck with your contribution!** 🚀

If you encounter issues, reference the [official contribution guide](https://github.com/truenas/apps/blob/master/CONTRIBUTIONS.md) or ask in [GitHub Discussions](https://github.com/truenas/apps/discussions).
