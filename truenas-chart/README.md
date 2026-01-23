# OSCAL Report Generator Helm Chart

A Helm chart for deploying the OSCAL Report Generator on TrueNAS SCALE.

## Description

OSCAL Report Generator is a comprehensive web application for generating compliance documentation from OSCAL (Open Security Controls Assessment Language) catalogs. It supports creating Statement of Applicability (SOA), System Security Plans (SSP), and Cloud Control Matrix (CCM) documents.

## Features

- ✨ AI-powered automated control suggestions
- 📊 OpenTelemetry-compliant telemetry logging
- 📚 Support for multiple frameworks (NIST SP 800-53, Australian ISM, Singapore IM8)
- 📈 Multiple export formats (OSCAL JSON, Excel, PDF, CCM)
- 🔄 Smart catalog updates with automatic change detection
- 💾 Persistent data storage
- ⚡ Auto-save functionality
- 🎨 Modern, responsive UI

## Prerequisites

- TrueNAS SCALE 22.02 or later
- Kubernetes cluster (included with TrueNAS SCALE)
- At least 1GB of available storage
- At least 256MB of available memory

## Installation

### Via TrueNAS Web UI

1. **Navigate to Apps**:
   - Open TrueNAS SCALE web interface
   - Go to **Apps** → **Discover Apps**

2. **Install Custom App**:
   - Click **Custom App** button (top right)
   - Fill in the configuration form

3. **Basic Configuration**:
   - **Application Name**: `oscal-report-generator`
   - **Version**: Select latest version

4. **Container Images**:
   - **Repository**: `keekar/oscal_reports`
   - **Tag**: `latest` (or `edge` for development)
   - **Pull Policy**: `IfNotPresent`

5. **Networking**:
   - **Service Type**: `NodePort`
   - **Node Port**: `30200` (or any available port 30000-32767)

6. **Storage**:
   - **Enable Persistent Storage**: Yes
   - **Storage Type**: `Host Path`
   - **Host Path**: `/mnt/pool1/apps/oscal/config` (or your preferred path)

7. **Resources** (adjust based on your needs):
   - **CPU Limit**: `1000m` (1 core)
   - **Memory Limit**: `1Gi`
   - **CPU Request**: `100m`
   - **Memory Request**: `256Mi`

8. Click **Save** to deploy

### Via Helm CLI

```bash
# Add the chart repository (if using a catalog)
helm repo add oscal https://your-catalog-url
helm repo update

# Install the chart
helm install oscal-report-generator oscal/oscal-report-generator \
  --namespace ix-oscal-report-generator \
  --create-namespace \
  --set service.nodePort=30200 \
  --set persistence.hostPath=/mnt/pool1/apps/oscal/config

# Or install from local chart directory
helm install oscal-report-generator ./truenas-chart \
  --namespace ix-oscal-report-generator \
  --create-namespace
```

## Accessing the Application

After installation:

1. **Find your TrueNAS IP address**: e.g., `192.168.1.100`
2. **Access the application**:
   - URL: `http://[truenas-ip]:[node-port]`
   - Example: `http://192.168.1.100:30200`

3. **Get default credentials**:
   ```bash
   # Via kubectl
   kubectl exec -n ix-oscal-report-generator \
     deployment/oscal-report-generator \
     -- cat /app/credentials.txt
   
   # Or extract from Docker image
   docker pull keekar/oscal_reports:latest
   docker create --name temp-oscal keekar/oscal_reports:latest
   docker cp temp-oscal:/app/credentials.txt ./credentials.txt
   cat credentials.txt
   docker rm temp-oscal
   ```

4. **Login** with the default credentials
5. **Change passwords immediately** for security!

## Configuration

### Key Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `image.repository` | Docker image repository | `keekar/oscal_reports` |
| `image.tag` | Image tag | `latest` |
| `service.type` | Kubernetes service type | `NodePort` |
| `service.nodePort` | External access port | `30200` |
| `persistence.enabled` | Enable persistent storage | `true` |
| `persistence.hostPath` | TrueNAS host path | `""` (must be set) |
| `resources.limits.cpu` | CPU limit | `1000m` |
| `resources.limits.memory` | Memory limit | `1Gi` |

### Advanced Configuration

See `values.yaml` for all available configuration options.

## Storage

The application requires persistent storage for:
- User authentication data
- Application configuration
- User preferences
- Session data

**Recommended host path**: `/mnt/pool1/apps/oscal/config`

Ensure the path exists and has appropriate permissions:
```bash
mkdir -p /mnt/pool1/apps/oscal/config
chmod 755 /mnt/pool1/apps/oscal/config
```

## Upgrading

### Via TrueNAS Web UI

1. Go to **Apps** → **Installed Apps**
2. Find `oscal-report-generator`
3. Click **⋮** → **Edit**
4. Change **Image Tag** to desired version
5. Click **Save**

### Via Helm CLI

```bash
# Update to latest version
helm upgrade oscal-report-generator oscal/oscal-report-generator \
  --namespace ix-oscal-report-generator \
  --reuse-values

# Or upgrade to specific version
helm upgrade oscal-report-generator oscal/oscal-report-generator \
  --namespace ix-oscal-report-generator \
  --version 1.6.3 \
  --reuse-values
```

## Uninstalling

### Via TrueNAS Web UI

1. Go to **Apps** → **Installed Apps**
2. Find `oscal-report-generator`
3. Click **⋮** → **Delete**
4. Confirm deletion

**Note**: This does NOT delete the persistent storage data.

### Via Helm CLI

```bash
# Uninstall the release
helm uninstall oscal-report-generator --namespace ix-oscal-report-generator

# Optionally delete the namespace
kubectl delete namespace ix-oscal-report-generator
```

## Troubleshooting

### App Won't Start

**Check pod status**:
```bash
kubectl get pods -n ix-oscal-report-generator
kubectl describe pod -n ix-oscal-report-generator
```

**View logs**:
```bash
kubectl logs -n ix-oscal-report-generator -l app.kubernetes.io/name=oscal-report-generator
```

### Cannot Access Application

1. **Verify pod is running**:
   ```bash
   kubectl get pods -n ix-oscal-report-generator
   ```

2. **Check service**:
   ```bash
   kubectl get svc -n ix-oscal-report-generator
   ```

3. **Test connectivity**:
   ```bash
   kubectl exec -n ix-oscal-report-generator \
     deployment/oscal-report-generator \
     -- curl http://localhost:3020/health
   ```

### Storage Permission Issues

If you see permission errors:

1. **Check host path permissions**:
   ```bash
   ls -la /mnt/pool1/apps/oscal/config
   ```

2. **Fix permissions if needed**:
   ```bash
   chmod 755 /mnt/pool1/apps/oscal/config
   chown 1000:1000 /mnt/pool1/apps/oscal/config  # Adjust UID/GID as needed
   ```

## Support

- **Documentation**: https://github.com/keekar2022/OSCAL-Reports/tree/main/docs
- **Docker Hub**: https://hub.docker.com/r/keekar/oscal_reports
- **GitHub**: https://github.com/keekar2022/OSCAL-Reports
- **Issues**: https://github.com/keekar2022/OSCAL-Reports/issues

## License

This project is licensed under the GNU General Public License v3.0 (GPL-3.0).

## Author

**Mukesh Kesharwani**
- Email: mukesh.kesharwani@adobe.com
- GitHub: [@keekar2022](https://github.com/keekar2022)

---

**Chart Version**: 1.6.3  
**App Version**: 1.6.3  
**Last Updated**: January 2026
