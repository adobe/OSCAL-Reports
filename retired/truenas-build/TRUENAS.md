# TrueNAS SCALE – Installation and Reference

**Single guide for installing and running OSCAL Report Generator on TrueNAS SCALE.**

*This doc is retired; kept in `retired/truenas-build/` for reference. See [README.md](README.md) in this folder.*

---

## Quick Reference (5-Minute Setup)

### Via Custom App

1. **TrueNAS Web UI** → Apps → Discover Apps → **Custom App**
2. **Configure:**
   - Application Name: `oscal-report-generator`
   - Image Repository: `keekar/oscal_reports`
   - Image Tag: `latest`
   - Container Port: `3020`
   - Node Port: `30200`
   - Storage Host Path: `/mnt/pool1/apps/oscal/config`
   - Storage Mount Path: `/app/config`
3. **Save** and wait ~2 minutes.
4. **Access:** `http://[truenas-ip]:30200`

### Quick Commands

```bash
# Status
k3s kubectl get pods -A | grep oscal

# Logs
k3s kubectl logs -n ix-oscal-report-generator -l app.kubernetes.io/name=oscal-report-generator --tail=50 -f

# Credentials
k3s kubectl exec -n ix-oscal-report-generator deployment/oscal-report-generator -- cat /app/credentials.txt

# Restart
k3s kubectl rollout restart deployment/oscal-report-generator -n ix-oscal-report-generator

# Health
curl http://localhost:30200/health
```

### Default Credentials

Extract from image:
```bash
docker pull keekar/oscal_reports:latest
docker create --name temp-oscal keekar/oscal_reports:latest
docker cp temp-oscal:/app/credentials.txt ./credentials.txt
cat credentials.txt
docker rm temp-oscal
```
**Change default credentials after first login.**

---

## Prerequisites

- **TrueNAS SCALE**: 22.02 or later (Bluefin+)
- **Storage**: ≥1 GB for app data
- **Memory**: ≥512 MB RAM
- **Port**: NodePort in 30000–32767 (e.g. 30200)

Create storage (recommended):
```bash
sudo mkdir -p /mnt/pool1/apps/oscal/config
sudo chmod 755 /mnt/pool1/apps/oscal/config
```

---

## Installation Methods

### Method 1: Custom App (Recommended)

Best for quick install without catalog setup.

1. Apps → Discover Apps → **Custom App**
2. **Application Name:** `oscal-report-generator`
3. **Container Images:** Repository `keekar/oscal_reports`, Tag `latest`, Pull Policy `IfNotPresent`
4. **Networking:** NodePort, Container Port `3020`, Node Port `30200`
5. **Storage:** Add Host Path – Host: `/mnt/pool1/apps/oscal/config`, Mount: `/app/config`
6. **Environment (optional):** `NODE_ENV=production`, `PORT=3020`
7. **Health Check (recommended):** HTTP, Path `/health`, Port `3020`, Initial Delay 30s, Period 10s
8. Save and wait for deployment.

### Method 2: Helm Chart

For CLI-based deployment:

```bash
# Clone or download chart
git clone https://github.com/keekar2022/OSCAL-Reports.git
cd OSCAL-Reports/truenas-chart

# Create namespace and install
k3s kubectl create namespace ix-oscal-report-generator
k3s helm install oscal-report-generator . --namespace ix-oscal-report-generator --values my-values.yaml --wait
```

Use a `my-values.yaml` with `image.repository: keekar/oscal_reports`, `image.tag: latest`, `service.nodePort: 30200`, and `persistence.hostPath: /mnt/pool1/apps/oscal/config`.

### Method 3: Official TrueNAS Apps Catalog

**Status:** PR submitted (https://github.com/truenas/apps/pull/4144). Until merged, use Method 1 or 2.

After approval: Apps → Discover Apps → search "OSCAL Report Generator" → Install and configure.

---

## App Catalog Integration

| Option            | Availability   | Discoverable | Setup      |
|-------------------|----------------|---------------|------------|
| Official catalog  | After PR merge| Yes           | Easiest    |
| Custom App        | Immediate      | No            | Manual form|
| Helm              | Immediate      | No            | CLI        |

---

## Post-Installation

1. **Credentials:** Use the quick command above or extract from the image; log in and change the default password.
2. **Access:** `http://[truenas-ip]:30200`
3. **Backup config:** `sudo tar -czf oscal-backup-$(date +%Y%m%d).tar.gz /mnt/pool1/apps/oscal/config`

---

## Troubleshooting

- **Pod won't start:** `k3s kubectl describe pod -n ix-oscal-report-generator [pod-name]` and check logs.
- **Storage permissions:** `sudo chown -R 568:568 /mnt/pool1/apps/oscal/config` and `sudo chmod -R 755 ...`
- **Can't access:** Confirm pod running, service exists, and NodePort/firewall allow 30200.

---

## Update and Uninstall

- **Update (UI):** Apps → Installed → oscal-report-generator → Edit → change Image Tag → Save.
- **Update (Helm):** `k3s helm upgrade oscal-report-generator . --namespace ix-oscal-report-generator --reuse-values`
- **Uninstall (UI):** Apps → Installed → oscal-report-generator → Delete. Storage is not removed by default.

---

## Links

- Docker Hub: https://hub.docker.com/r/keekar/oscal_reports
- GitHub: https://github.com/keekar2022/OSCAL-Reports
- TrueNAS Apps PR: https://github.com/truenas/apps/pull/4144

---

*Last updated: February 2026. Retired to retired/truenas-build/ March 2026.*
