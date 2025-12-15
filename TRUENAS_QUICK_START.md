# ⚡ TrueNAS SCALE - Quick Start Guide

## OSCAL Report Generator Deployment in 5 Minutes

**Target Server**: http://nas.keekar.com

---

## 🚀 Fastest Way (Custom App - GUI)

### 1. Build Docker Image (On Your PC)

```bash
cd /path/to/OSCAL-Report-Generator-V1
docker build -t oscal-report-generator:latest .
docker save -o oscal-report-generator.tar oscal-report-generator:latest
```

### 2. Transfer to TrueNAS

```bash
scp oscal-report-generator.tar admin@nas.keekar.com:/mnt/tank/
```

### 3. Load on TrueNAS

```bash
ssh admin@nas.keekar.com
docker load -i /mnt/tank/oscal-report-generator.tar
```

### 4. Deploy via GUI

1. Open: http://nas.keekar.com/ui/apps/available
2. Click: **"Launch Docker Image"** or **"Custom App"**
3. Fill in:

```
Application Name: oscal-report-generator

Container Image:
- Repository: oscal-report-generator
- Tag: latest
- Pull Policy: Never

Port Forwarding:
- Container Port: 3019
- Node Port: 3019 (or any available port)

Environment Variables:
- NODE_ENV = production
- PORT = 3019

Health Check:
- Type: HTTP
- Path: /health
- Port: 3019
- Initial Delay: 40 seconds
```

4. Click **"Save"** → Wait for **"Running"** status

### 5. Access

```
http://nas.keekar.com:3019
```

---

## ✅ Quick Verification

```bash
# Health check
curl http://nas.keekar.com:3019/health

# Should return:
# {"status":"healthy","service":"Keekar's OSCAL SOA/SSP/CCM Generator"}
```

---

## 🔧 GUI Configuration Parameters

| Parameter | Value | Adjustable? |
|-----------|-------|-------------|
| **Application Name** | oscal-report-generator | ✅ Yes |
| **Container Port** | 3019 | ❌ No (fixed) |
| **External Port** | 3019 | ✅ Yes (any available) |
| **CPU Limit** | 2 cores | ✅ Yes |
| **Memory Limit** | 2GB | ✅ Yes |
| **NODE_ENV** | production | ✅ Yes |
| **Health Check Path** | /health | ❌ No |

---

## 📝 Quick Checklist

- [ ] Docker image built
- [ ] Image transferred to TrueNAS
- [ ] Image loaded in TrueNAS
- [ ] App deployed via GUI
- [ ] Port 3019 accessible
- [ ] Health check passing
- [ ] Application interface loads

---

## 🆘 Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| Port already in use | Change External Port to 8080 or 8081 |
| App won't start | Check logs in TrueNAS GUI |
| Can't access | Check firewall, verify port forwarding |
| Health check fails | Increase initial delay to 60 seconds |

---

**For detailed instructions, see**: `TRUENAS_DEPLOYMENT_GUIDE.md`

**Author**: Mukesh Kesharwani <mukesh.kesharwani@adobe.com>

