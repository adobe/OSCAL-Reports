# TrueNAS SCALE Quick Reference Card

## 5-Minute Installation

### Via Custom App (Recommended)

1. **Open TrueNAS Web UI** → Apps → Discover Apps → **Custom App**

2. **Configure**:
   ```
   Application Name:    oscal-report-generator
   Image Repository:    keekar/oscal_reports
   Image Tag:          latest
   Container Port:     3020
   Node Port:          30200
   Storage Host Path:  /mnt/pool1/apps/oscal/config
   Storage Mount Path: /app/config
   ```

3. **Save** and wait ~2 minutes

4. **Access**: `http://[truenas-ip]:30200`

---

## Quick Commands

### Check Status
```bash
k3s kubectl get pods -A | grep oscal
```

### View Logs
```bash
k3s kubectl logs -n ix-oscal-report-generator -l app.kubernetes.io/name=oscal-report-generator --tail=50 -f
```

### Get Credentials
```bash
k3s kubectl exec -n ix-oscal-report-generator deployment/oscal-report-generator -- cat /app/credentials.txt
```

### Restart App
```bash
k3s kubectl rollout restart deployment/oscal-report-generator -n ix-oscal-report-generator
```

### Test Health
```bash
curl http://localhost:30200/health
```

---

## Troubleshooting

### Pod Won't Start
```bash
k3s kubectl describe pod -n ix-oscal-report-generator [pod-name]
k3s kubectl logs -n ix-oscal-report-generator [pod-name]
```

### Storage Permissions
```bash
sudo chown -R 568:568 /mnt/pool1/apps/oscal/config
sudo chmod -R 755 /mnt/pool1/apps/oscal/config
```

### Can't Access
1. Check pod is running: `k3s kubectl get pods -A | grep oscal`
2. Check service: `k3s kubectl get svc -A | grep oscal`
3. Test locally: `curl http://localhost:30200/health`
4. Check firewall on NodePort range

---

## Default Credentials

Extract from Docker image:
```bash
docker pull keekar/oscal_reports:latest
docker create --name temp-oscal keekar/oscal_reports:latest
docker cp temp-oscal:/app/credentials.txt ./credentials.txt
cat credentials.txt
docker rm temp-oscal
```

**⚠️ Change immediately after first login!**

---

## Useful Ports

- **Container Port**: 3020 (internal)
- **NodePort**: 30200 (default, adjustable 30000-32767)
- **Access URL**: `http://[truenas-ip]:[nodeport]`

---

## Resource Requirements

| Usage | CPU | Memory |
|-------|-----|--------|
| Light (1-5 users) | 100m-500m | 256Mi-512Mi |
| Medium (5-20 users) | 500m-1000m | 512Mi-1Gi |
| Heavy (20+ users) | 1000m-2000m | 1Gi-2Gi |

---

## Backup

```bash
# Backup config
sudo tar -czf oscal-backup-$(date +%Y%m%d).tar.gz /mnt/pool1/apps/oscal/config

# Restore
sudo tar -xzf oscal-backup-20260123.tar.gz -C /
```

---

## Update App

### Via Web UI
1. Apps → Installed → oscal-report-generator → Edit
2. Change Image Tag to new version
3. Save

### Via Helm
```bash
k3s helm upgrade oscal-report-generator . --reuse-values
```

---

## Uninstall

### Via Web UI
Apps → Installed → oscal-report-generator → Delete

### Via Helm
```bash
k3s helm uninstall oscal-report-generator -n ix-oscal-report-generator
```

**Note**: Storage is NOT deleted automatically

---

## Links

- **Full Guide**: [TRUENAS_INSTALLATION.md](TRUENAS_INSTALLATION.md)
- **Docker Hub**: https://hub.docker.com/r/keekar/oscal_reports
- **GitHub**: https://github.com/keekar2022/OSCAL-Reports
- **Documentation**: https://github.com/keekar2022/OSCAL-Reports/tree/main/docs

---

**Version**: 1.6.3 | **Last Updated**: January 2026
