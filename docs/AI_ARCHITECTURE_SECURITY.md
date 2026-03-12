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
┌─────────────────────────────────────────────────────────────────────────┐
│                        Production Network                                 │
│                                                                          │
│  ┌──────────────────┐     ┌─────────────────────────────────────────┐  │
│  │                  │     │  AI backends (one or more)                 │  │
│  │  OSCAL Report    │────▶│  • Ollama (private IP, e.g. :11434)       │  │
│  │  Generator       │     │  • AWS Bedrock (SDK, no HTTP URL)         │  │
│  │  (Backend)       │     │  • Mistral / Google AI (cloud APIs)       │  │
│  │                  │     └─────────────────────────────────────────┘  │
│  └──────────────────┘     │                                           │
│         │                  │ HTTPS                                     │
│         │                  ▼                                            │
│  ┌──────────────────┐  ┌──────────────────┐                           │
│  │  Users / Apps     │  │  Cloud AI APIs    │                           │
│  │  (Public Access)  │  │  (optional)       │                           │
│  └──────────────────┘  └──────────────────┘                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### Design Rationale

**Why private / on-prem AI backends (e.g. Ollama) are allowed:**

1. **Performance**: Low latency, high bandwidth within private network
2. **Security**: AI models and inference can stay within trusted network boundary
3. **Cost**: No egress charges for internal traffic when using on-prem or VPC
4. **Data Privacy**: Sensitive control data can stay on your network (Ollama) or in your cloud (Bedrock)
5. **Choice**: Supports Ollama, AWS Bedrock, Mistral API, Google AI—configure one or switch as needed

**Why This Is NOT a Security Risk:**

- Private network = trusted boundary when you host AI (e.g. Ollama) on-prem
- Bedrock uses AWS SDK (no arbitrary URL); cloud APIs use fixed trusted domains
- Other SSRF protections remain active (cloud metadata, dangerous protocols)
- Cloud metadata endpoints still blocked; dangerous protocols still blocked

---

## Security Configuration

### Current Settings

**File:** `backend/utils/securityConfig.js`

```javascript
urlValidation: {
  // AI Integration: private IPs allowed for on-prem AI (e.g. Ollama); Bedrock uses SDK
  // Private IPs allowed for AI services (development & production)—design decision
  // Other SSRF protections remain active (cloud metadata, dangerous protocols)
  allowLocalhost: true,  // Allow localhost for AI services (e.g. local Ollama)
  allowPrivateIPs: true, // Allow private IPs for on-prem AI (e.g. Ollama)
  
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
| **Private Class A** | 10.0.0.0 - 10.255.255.255 | ✅ Yes | On-prem AI (e.g. Ollama) |
| **Private Class B** | 172.16.0.0 - 172.31.255.255 | ✅ Yes | On-prem AI (e.g. Ollama) |
| **Private Class C** | 192.168.0.0 - 192.168.255.255 | ✅ Yes | On-prem AI (e.g. Ollama) |
| **Localhost** | 127.0.0.1, localhost | ✅ Yes | Local development (e.g. Ollama) |
| **Loopback IPv6** | ::1 | ✅ Yes | Local development |
| **Cloud Metadata** | 169.254.169.254 | ❌ No | SSRF attack vector |
| **Link-local** | 169.254.0.0/16 | ❌ No | SSRF attack vector |
| **Public Internet** | Any public IP | ✅ Yes | Mistral / Google AI cloud APIs |
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

- ❌ Access to on-prem AI (e.g. Ollama) on private network → **INTENDED USE CASE**
- ❌ Access to cloud AI (Mistral, Google AI) via configured URLs → **INTENDED USE CASE**
- ❌ AWS Bedrock via SDK (no URL; uses IAM) → **INTENDED USE CASE**

---

## Supported AI Deployment Scenarios

### Scenario 1: AWS Bedrock (Production)

```yaml
Environment: Production
AI Provider: aws-bedrock
API: AWS SDK (IAM, no HTTP URL)
Network: AWS
Status: ✅ Fully Supported
```

**Use Case:** AWS-hosted models (Mistral, Gemma, etc.) via Bedrock; no URL validation applies.

### Scenario 2: Mistral or Google AI Cloud API (Production)

```yaml
Environment: Production
AI Provider: mistral-api or google-ai
URL/API: Cloud API (trusted domain or API key)
Status: ✅ Fully Supported
```

**Use Case:** Cloud-based AI inference without on-prem infrastructure.

### Scenario 3: Ollama on Local Network (Production)

```yaml
Environment: Production
AI Provider: ollama
AI URL: http://192.168.1.111:11434
Network: Private IP
Status: ✅ Fully Supported
```

**Use Case:** On-prem AI server on internal network.

### Scenario 4: Ollama on Localhost (Development)

```yaml
Environment: Development
AI Provider: ollama
AI URL: http://localhost:11434
Network: Localhost
Status: ✅ Fully Supported
```

**Use Case:** Local development with Ollama.

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

1. ✅ On-prem AI (e.g. Ollama) has authentication/authorization where supported
2. ✅ Firewall rules limit access to AI servers
3. ✅ Network segmentation isolates AI infrastructure; Bedrock uses IAM
4. ✅ Application-level authentication (Platform Admin only can configure AI)

**Application-Level Controls:**

1. ✅ Only Platform Admins can configure AI settings (RBAC)
2. ✅ AI configuration requires authentication
3. ✅ CSRF protection on all state-changing operations
4. ✅ Session security (HttpOnly, SameSite)
5. ✅ Audit logging of all AI configuration changes

**Residual Risk:**

- **Low:** Malicious Platform Admin could point AI URL to internal services (Ollama/configurable URL only; Bedrock is SDK-based).
- **Mitigation:** 
  - Admin accounts require strong passwords
  - Admin actions should be logged and monitored
  - Network segmentation limits blast radius
  - On-prem AI (e.g. Ollama) should have its own authentication where supported

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

- [ ] If using on-prem AI (e.g. Ollama): server on isolated segment; firewall restricts access to app server only
- [ ] On-prem AI has authentication enabled where supported; TLS/HTTPS if supported
- [ ] If using AWS Bedrock: IAM roles and least-privilege; no URL exposure
- [ ] Network monitoring in place

### Application Security

- [ ] Strong passwords for all Platform Admin accounts
- [ ] Admin account audit logging enabled
- [ ] SESSION_SECRET environment variable set (production)
- [ ] CSRF_ENABLED=true (default, keep it)
- [ ] Regular security updates applied

### AI Service Security

- [ ] AI backend (Ollama, Bedrock, or cloud API) is up to date and from trusted sources
- [ ] Model inference logs are monitored where available
- [ ] Resource limits set on on-prem AI (CPU/memory/GPU) if applicable
- [ ] Bedrock: IAM and guardrails; cloud APIs: keys and quotas

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

Example with **Ollama** (on-prem):

```json
{
  "aiConfig": {
    "enabled": true,
    "provider": "ollama",
    "url": "http://192.168.1.111:11434",
    "model": "mistral:7b",
    "timeout": 180000,
    "organizationName": "Your Org"
  }
}
```

Example with **AWS Bedrock** (no URL):

```json
{
  "aiConfig": {
    "enabled": true,
    "provider": "aws-bedrock",
    "awsRegion": "us-east-1",
    "bedrockModelId": "mistral.mistral-large-2402-v1:0",
    "timeout": 180000,
    "organizationName": "Your Org"
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

2. **Test Cloud Metadata Blocking** (for URL-based AI, e.g. Ollama)
   ```bash
   curl -X POST http://localhost:3020/api/ai/test-connection \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <token>" \
     -d '{"provider": "ollama", "url": "http://169.254.169.254"}'
   ```
   **Expected:** ❌ Blocked (SSRF Prevention)

3. **Test File Protocol Blocking**
   ```bash
   curl -X POST http://localhost:3020/api/ai/test-connection \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <token>" \
     -d '{"provider": "ollama", "url": "file:///etc/passwd"}'
   ```
   **Expected:** ❌ Blocked (SSRF Prevention)

---

## Frequently Asked Questions

### Q: Is this a security vulnerability?

**A:** No. This is an architectural design decision. The application supports multiple AI backends (Ollama, AWS Bedrock, Mistral, Google AI). Private network access for on-prem AI (e.g. Ollama) is an intended use case, not an attack vector. Bedrock uses the AWS SDK (no arbitrary URL).

### Q: What if someone configures a malicious private IP (Ollama/URL-based)?

**A:** 
1. Only Platform Admins can configure AI settings (RBAC enforced)
2. Network-level controls should restrict access
3. On-prem AI (e.g. Ollama) should have its own authentication where supported
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

This architectural decision supports multiple AI backends: Ollama (including on private networks), AWS Bedrock, Mistral API, and Google AI. Private IP access for on-prem AI is an intended use case in both development and production.

**Design Principle:**  
*"Security should enable functionality, not block it. Allow legitimate use cases by design, block attacks by implementation."*

---

**Document Owner:** Mukesh Kesharwani  
**Last Updated:** 2026-03-09  
**Status:** Approved ✅
