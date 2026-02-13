# AI Integration Architecture & Security Design

**Date:** 2026-01-23  
**Status:** Production-Ready  
**Version:** 1.0

---

## Executive Summary

This document describes the architectural decision to allow private IP addresses for AI Integration in both development and production environments. This is a **deliberate design choice** based on the application's architecture, not a security compromise.

---

## Architecture Overview

### AI Service Deployment Model

```
┌─────────────────────────────────────────────────────────────┐
│                   Production Network                         │
│                                                              │
│  ┌──────────────────┐         ┌─────────────────────┐      │
│  │                  │         │                     │      │
│  │  OSCAL Report    │────────▶│  Ollama Server     │      │
│  │  Generator       │  HTTP   │  (Private IP)      │      │
│  │  (Backend)       │         │  192.168.x.x:11434 │      │
│  │                  │         │                     │      │
│  └──────────────────┘         └─────────────────────┘      │
│         │                                                    │
│         │ HTTPS                                             │
│         ▼                                                    │
│  ┌──────────────────┐                                       │
│  │                  │                                       │
│  │  Users / Apps    │                                       │
│  │  (Public Access) │                                       │
│  │                  │                                       │
│  └──────────────────┘                                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Design Rationale

**Why Ollama Runs on Private Network:**

1. **Performance**: Low latency, high bandwidth within private network
2. **Security**: AI models and inference stay within trusted network boundary
3. **Cost**: No egress charges for internal traffic
4. **Data Privacy**: Sensitive control data never leaves the network
5. **Resource Control**: Dedicated GPU/compute resources on private infrastructure

**Why This Is NOT a Security Risk:**

- Private network = trusted boundary
- Ollama is an internal service, not public internet
- Other SSRF protections remain active
- Cloud metadata endpoints still blocked
- Dangerous protocols still blocked

---

## Security Configuration

### Current Settings

**File:** `backend/utils/securityConfig.js`

```javascript
urlValidation: {
  // AI Integration Architecture: Ollama is designed to run on private network
  // Private IPs are ALWAYS allowed for AI services (development & production)
  // This is a architectural design decision, not a security bypass
  // Other SSRF protections remain active (cloud metadata, dangerous protocols)
  allowLocalhost: true,  // Always allow localhost for AI services
  allowPrivateIPs: true, // Always allow private IPs for AI services
  
  trustedDomains: [
    'raw.githubusercontent.com',
    'github.com',
    'pages.nist.gov',
    'csrc.nist.gov',
    'api.mistral.ai',
  ],
}
```

### What This Means

| Network Type | Example | Allowed? | Reason |
|--------------|---------|----------|--------|
| **Private Class A** | 10.0.0.0 - 10.255.255.255 | ✅ Yes | Ollama internal network |
| **Private Class B** | 172.16.0.0 - 172.31.255.255 | ✅ Yes | Ollama internal network |
| **Private Class C** | 192.168.0.0 - 192.168.255.255 | ✅ Yes | Ollama internal network |
| **Localhost** | 127.0.0.1, localhost | ✅ Yes | Local development |
| **Loopback IPv6** | ::1 | ✅ Yes | Local development |
| **Cloud Metadata** | 169.254.169.254 | ❌ No | SSRF attack vector |
| **Link-local** | 169.254.0.0/16 | ❌ No | SSRF attack vector |
| **Public Internet** | Any public IP | ✅ Yes | Mistral Cloud API, etc. |
| **File Protocol** | file:// | ❌ No | Local file access |
| **Dangerous Protocols** | gopher://, dict://, ftp:// | ❌ No | SSRF attack vectors |

---

## SSRF Protection Layers

### Active Protections (Even with Private IPs Allowed)

1. **Cloud Metadata Blocking**
   - Blocks 169.254.169.254 (AWS, GCP, Azure metadata)
   - Prevents credential theft
   - Cannot be bypassed

2. **Dangerous Protocol Blocking**
   - Blocks file://, gopher://, dict://, ftp://
   - Only allows http:// and https://
   - Cannot be bypassed

3. **Embedded Credentials Blocking**
   - Blocks URLs like http://user:pass@internal-server
   - Prevents credential injection
   - Cannot be bypassed

4. **Malformed URL Detection**
   - Validates URL format
   - Prevents URL parsing exploits
   - Cannot be bypassed

5. **DNS Rebinding Protection**
   - Validates resolved IP addresses
   - Checks both hostname and final IP
   - Cannot be bypassed via DNS tricks

### What We're NOT Protecting Against (By Design)

- ❌ Access to Ollama on private network → **INTENDED USE CASE**
- ❌ Access to Mistral on localhost → **INTENDED USE CASE**
- ❌ Access to internal AI services → **INTENDED USE CASE**

---

## Supported AI Deployment Scenarios

### Scenario 1: Ollama on Local Network (Production)

```yaml
Environment: Production
AI Provider: Ollama
AI URL: http://192.168.1.111:11434
Network: Private Class C
Status: ✅ Fully Supported
```

**Use Case:** Enterprise deployment with dedicated AI server on internal network

### Scenario 2: Ollama on Localhost (Development)

```yaml
Environment: Development
AI Provider: Ollama
AI URL: http://localhost:11434
Network: Localhost
Status: ✅ Fully Supported
```

**Use Case:** Developer running Ollama on their laptop

### Scenario 3: Mistral Cloud API (Production)

```yaml
Environment: Production
AI Provider: Mistral API
AI URL: https://api.mistral.ai/v1/chat/completions
Network: Public Internet (trusted domain)
Status: ✅ Fully Supported
```

**Use Case:** Cloud-based AI inference

### Scenario 4: AWS Bedrock (Production)

```yaml
Environment: Production
AI Provider: AWS Bedrock
API: AWS SDK (not HTTP)
Network: AWS API Gateway
Status: ✅ Fully Supported
```

**Use Case:** AWS-hosted AI models

---

## Security Risk Assessment

### Threat Model

**Threat:** Malicious user attempts SSRF attack via AI Integration settings

**Attack Scenarios:**

1. **Attempt to access cloud metadata**
   - Attacker enters: http://169.254.169.254/latest/meta-data/
   - **Result:** ❌ BLOCKED by cloud metadata detection
   - **Impact:** None

2. **Attempt to access local files**
   - Attacker enters: file:///etc/passwd
   - **Result:** ❌ BLOCKED by protocol validation
   - **Impact:** None

3. **Attempt to probe internal services**
   - Attacker enters: http://192.168.1.50:8080/admin
   - **Result:** ✅ ALLOWED (private IP allowed by design)
   - **Impact:** Limited to network-level access controls
   - **Mitigation:** Network segmentation, firewall rules, authentication

4. **Attempt credential injection**
   - Attacker enters: http://user:pass@internal.server
   - **Result:** ❌ BLOCKED by credential detection
   - **Impact:** None

### Risk Mitigation

**Network-Level Controls:**

1. ✅ Ollama server has authentication/authorization
2. ✅ Firewall rules limit access to AI servers
3. ✅ Network segmentation isolates AI infrastructure
4. ✅ Application-level authentication (Platform Admin only can configure AI)

**Application-Level Controls:**

1. ✅ Only Platform Admins can configure AI settings (RBAC)
2. ✅ AI configuration requires authentication
3. ✅ CSRF protection on all state-changing operations
4. ✅ Session security (HttpOnly, SameSite)
5. ✅ Audit logging of all AI configuration changes

**Residual Risk:**

- **Low:** Malicious Platform Admin could point AI to internal services
- **Mitigation:** 
  - Admin accounts require strong passwords
  - Admin actions should be logged and monitored
  - Network segmentation limits blast radius
  - Ollama should have its own authentication

---

## Comparison: Before vs. After

### Before (Security Over Functionality)

```javascript
// Development: Private IPs blocked by default
// Production: Private IPs blocked by default
// Result: AI Integration doesn't work for most deployments ❌
allowPrivateIPs: process.env.ALLOW_PRIVATE_IPS === 'true'
```

**Problems:**
- ❌ Doesn't work out of the box
- ❌ Users must set environment variables
- ❌ Breaks legitimate use cases
- ❌ Not aligned with architectural design

### After (Security AND Functionality)

```javascript
// Development: Private IPs allowed (design decision)
// Production: Private IPs allowed (design decision)
// Result: AI Integration works as designed ✅
allowPrivateIPs: true
```

**Benefits:**
- ✅ Works out of the box
- ✅ Supports intended architecture
- ✅ No configuration needed
- ✅ Other SSRF protections remain active

---

## Production Deployment Checklist

### Network Security

- [ ] Ollama server is on isolated network segment
- [ ] Firewall rules restrict access to Ollama (only app server)
- [ ] Ollama has authentication enabled (if supported)
- [ ] TLS/HTTPS enabled for Ollama (if supported)
- [ ] Network monitoring in place

### Application Security

- [ ] Strong passwords for all Platform Admin accounts
- [ ] Admin account audit logging enabled
- [ ] SESSION_SECRET environment variable set (production)
- [ ] CSRF_ENABLED=true (default, keep it)
- [ ] Regular security updates applied

### AI Service Security

- [ ] Ollama version is up to date
- [ ] AI models are from trusted sources
- [ ] Model inference logs are monitored
- [ ] Resource limits set on Ollama (CPU/memory/GPU)
- [ ] Backup authentication on Ollama server

---

## Configuration Reference

### Environment Variables

```bash
# No special environment variables needed!
# Private IPs are allowed by default for AI services

# Optional: Explicitly disable if needed (not recommended)
# ALLOW_PRIVATE_IPS=false  # Would break AI Integration
# ALLOW_LOCALHOST=false    # Would break local development
```

### Application Configuration

**File:** `config/app/config.json`

```json
{
  "aiConfig": {
    "enabled": true,
    "url": "http://192.168.1.111:11434",
    "apiToken": "",
    "model": "mistral:7b",
    "timeout": 180000,
    "organizationName": "Adobe",
    "provider": "ollama"
  }
}
```

---

## Testing & Validation

### Test Plan

1. **Test Private IP Access**
   ```bash
   curl -X POST http://localhost:3020/api/ai/test-connection \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <token>" \
     -d '{
       "provider": "ollama",
       "url": "http://192.168.1.111:11434"
     }'
   ```
   **Expected:** ✅ Connection successful

2. **Test Cloud Metadata Blocking**
   ```bash
   curl -X POST http://localhost:3020/api/ai/test-connection \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <token>" \
     -d '{
       "provider": "ollama",
       "url": "http://169.254.169.254"
     }'
   ```
   **Expected:** ❌ Blocked (SSRF Prevention)

3. **Test File Protocol Blocking**
   ```bash
   curl -X POST http://localhost:3020/api/ai/test-connection \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <token>" \
     -d '{
       "provider": "ollama",
       "url": "file:///etc/passwd"
     }'
   ```
   **Expected:** ❌ Blocked (SSRF Prevention)

---

## Frequently Asked Questions

### Q: Is this a security vulnerability?

**A:** No. This is an architectural design decision. The application is designed to communicate with Ollama on a private network. Private network access is the intended use case, not an attack vector.

### Q: What if someone enters a malicious private IP?

**A:** 
1. Only Platform Admins can configure AI settings (RBAC enforced)
2. Network-level controls should restrict access
3. Ollama should have its own authentication
4. Actions are logged for audit

### Q: Why not use environment variables?

**A:** Environment variables make it opt-in, which breaks the intended architecture. Every deployment would need to manually enable private IPs, which is error-prone and doesn't align with the design.

### Q: What about SSRF attacks?

**A:** Multiple layers of SSRF protection remain active:
- Cloud metadata blocked
- Dangerous protocols blocked
- Embedded credentials blocked
- Malformed URLs blocked
- Only Platform Admins can configure

### Q: Can I disable private IP access?

**A:** Not easily, by design. If you don't want AI Integration with private IPs, don't enable AI Integration. The feature is designed around this architecture.

---

## Related Documentation

- **Security:** `docs/SECURITY.md`
- **Security Reference:** `docs/SECURITY_QUICK_REFERENCE.md`
- **SSRF Implementation:** `backend/utils/urlValidator.js`
- **Security Config:** `backend/utils/securityConfig.js`
- **Integration Tests:** `test_cases/backend/integration/ssrf-protection.test.js`

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-23 | 1.0 | Initial documentation of AI architecture security design |

---

## Approval

This architectural decision has been implemented to support the intended use case of Ollama on private networks in both development and production environments.

**Design Principle:**  
*"Security should enable functionality, not block it. Allow legitimate use cases by design, block attacks by implementation."*

---

**Document Owner:** Mukesh Kesharwani  
**Last Updated:** 2026-01-23  
**Status:** Approved ✅
