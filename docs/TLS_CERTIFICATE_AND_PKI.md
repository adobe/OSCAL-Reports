---
concept: Mukesh Kesharwani
contact: mukesh.kesharwani@adobe.com
---

# TLS certificates and corporate PKI (OSCAL Report Generator)

Runbook for **where TLS material lives** (outside Git), **ACM import**, **ALB attachment via Terraform**, and **Let's Encrypt emergency fallback**. Includes the full certificate request and cutover history for `oscal.amsgovcloud.com.au`.

**Related:** [AWS_OPERATIONS.md](AWS_OPERATIONS.md) (ALB HTTPS, ACM).

---

## Summary

| Item | Location / value |
|------|----------------|
| **PKI request portal** | [Adobe PLM](https://plm.corp.adobe.com/#/) |
| **CSR & private key (never commit)** | `OSCAL_Reports_data/tls/` (sibling of repo; see below) |
| **Production HTTPS (live)** | **DigiCert / Adobe PLM** → imported to **ACM** → ALB |
| **Active ACM ARN** | `arn:aws:acm:us-east-1:442277170733:certificate/ea8cd251-30e1-406d-b7aa-5effccc24fe7` |
| **Cert expiry** | **2027-01-20** (renew by ~2026-12-21) |
| **Emergency fallback** | [`scripts/letsencrypt-acm-import.sh`](../scripts/letsencrypt-acm-import.sh) → ACM import → swap `alb_ssl_certificate_arn` |

---

## Certificate history

### PKI request — 2026-05-27

| Field | Value |
|-------|--------|
| **Date** | 2026-05-27 |
| **Portal** | [Adobe PLM](https://plm.corp.adobe.com/#/) |
| **Purpose** | Replace **Let's Encrypt** stopgap on AWS ALB with **corporate PKI** certificate |
| **CSR file** | `OSCAL_Reports_data/tls/oscal.csr` |
| **Private key** | `OSCAL_Reports_data/tls/oscal-private.key` (4096-bit RSA, not in Git) |
| **Absolute path (operator Mac)** | `/Users/mkesharw/Documents/OSCAL_Reports_data/tls/` |

**Actions completed on 2026-05-27:**

1. Generated CSR and private key (OpenSSL, 4096-bit recommended by PKI).
2. Moved `oscal.csr` and `oscal-private.key` out of repo root into `OSCAL_Reports_data/tls/`.
3. Set private key permissions to `600`.
4. Updated repo `.gitignore` for `*.csr` and explicit `oscal.csr` / `oscal-private.key`.
5. Raised certificate request via **PLM**.

**Status:** Issued and live — see cutover below.

---

### Cutover to DigiCert — 2026-07-07

Production HTTPS for `oscal.amsgovcloud.com.au` now uses the corporate PKI certificate on the ALB (ACM import). Let's Encrypt remains available as emergency fallback via [`scripts/letsencrypt-acm-import.sh`](../scripts/letsencrypt-acm-import.sh).

| Field | Value |
|-------|--------|
| **PLM Order ID** | 1554677369 |
| **PLM Certificate ID** | 1559874641 |
| **CN / SAN** | `oscal.amsgovcloud.com.au` |
| **Issuer** | DigiCert Global G2 TLS RSA SHA256 2020 CA1 |
| **Not Before** | 2026-07-06 UTC |
| **Not After** | **2027-01-20 UTC** (~199-day validity window) |

**ACM ARNs (account 442277170733, us-east-1):**

| Role | ARN |
|------|-----|
| **Active (DigiCert)** | `arn:aws:acm:us-east-1:442277170733:certificate/ea8cd251-30e1-406d-b7aa-5effccc24fe7` |
| **Previous (Let's Encrypt, optional delete after stable)** | `arn:aws:acm:us-east-1:442277170733:certificate/fc47dd2e-d4ba-49f6-aabb-3c8da1d51518` |

**Terraform:** `terraform/envs/aws4403/terraform.tfvars` — `create_alb_certificate = false`, `alb_ssl_certificate_arn` set to active DigiCert ARN. Applied `terraform apply -target=aws_lb_listener.https[0]` on 2026-07-07.

**Validation:** `https://oscal.amsgovcloud.com.au/health/ready` → HTTP 200; TLS issuer DigiCert; ALB listener 443 ARN matches active PKI ARN.

**Renewal:** Start PLM reissue by ~**2026-12-21** (30 days before expiry). Long-term: consider **DigiCert ACME** via PLM Portal for automated renewal (199-day cycle after Feb 2026).

---

## File storage (outside Git)

TLS files **must not** live under the `OSCAL_Reports` repository. Use the same local data directory as config/users:

| Environment | Absolute path (example) |
|-------------|-------------------------|
| **macOS (this project)** | `/Users/mkesharw/Documents/OSCAL_Reports_data/tls/` |
| **Generic layout** | `<parent-of-repo>/OSCAL_Reports_data/tls/` |

### Directory layout

```text
OSCAL_Reports_data/tls/
├── README.txt              # Short pointer (optional)
├── oscal.csr               # Certificate Signing Request (submitted to PKI)
├── oscal-private.key       # Private key (chmod 600) — required for ACM import
├── oscal-signed.crt        # Server certificate from PKI
├── oscal-chain.crt         # Intermediate / chain from PKI
├── oscal-fullchain.pem     # Optional: cat server + chain for tooling
├── active-acm-arn.txt      # Current production ACM ARN (operator note)
└── letsencrypt-rollback-acm-arn.txt  # Previous LE ARN (optional rollback)
```

| File | Purpose |
|------|---------|
| `oscal.csr` | Paste into PLM / PKI CSR field; safe to re-read, not secret |
| `oscal-private.key` | **Secret** — required for ACM `import-certificate`; never commit or share |
| `oscal-signed.crt` | End-entity certificate from Adobe PKI |
| `oscal-chain.crt` | CA bundle / intermediate(s) for ACM import |

`.gitignore` in the repo blocks `*.csr`, `*.key`, and root-level `oscal.csr` / `oscal-private.key` if copied back by mistake.

---

## PKI request (Adobe PLM)

1. Open **[https://plm.corp.adobe.com/#/](https://plm.corp.adobe.com/#/)** and start a certificate request per your team’s process.
2. Use **4096-bit RSA** if the portal recommends it (PKI may warn on 2048).
3. **Common Name (CN):** primary browser FQDN (e.g. `oscal.amsgovcloud.com.au`).
4. **SANs:** any additional hostnames on the same ALB (e.g. Blue/Green hostnames from `alb_blue_hostname` / `alb_green_hostname` in Terraform).
5. Upload or paste the contents of **`oscal.csr`** from `OSCAL_Reports_data/tls/oscal.csr`.

---

## Generating the CSR (reference)

```bash
TLS_DIR="${HOME}/Documents/OSCAL_Reports_data/tls"   # adjust if your path differs
mkdir -p "$TLS_DIR"
chmod 700 "$TLS_DIR"

openssl req -new -newkey rsa:4096 -nodes \
  -keyout "$TLS_DIR/oscal-private.key" \
  -out "$TLS_DIR/oscal.csr" \
  -subj "/C=AU/O=Adobe Inc./OU=Your-Team/CN=oscal.amsgovcloud.com.au"

chmod 600 "$TLS_DIR/oscal-private.key"
```

To view the CSR:

```bash
openssl req -in "$TLS_DIR/oscal.csr" -noout -text
```

---

## When PKI delivers the certificate

1. Save the **server certificate** as `OSCAL_Reports_data/tls/oscal-signed.crt` (or `.pem`).
2. Save **intermediate / chain** as `oscal-chain.crt` (concatenate intermediates if multiple files).
3. Confirm the cert matches the CSR key:

```bash
TLS_DIR="${HOME}/Documents/OSCAL_Reports_data/tls"
openssl x509 -in "$TLS_DIR/oscal-signed.crt" -noout -subject -dates
openssl rsa -in "$TLS_DIR/oscal-private.key" -noout -modulus | openssl md5
openssl x509 -in "$TLS_DIR/oscal-signed.crt" -noout -modulus | openssl md5
# Modulus MD5 hashes must match
```

4. Optional full chain file:

```bash
cat "$TLS_DIR/oscal-signed.crt" "$TLS_DIR/oscal-chain.crt" > "$TLS_DIR/oscal-fullchain.pem"
```

---

## Import corporate cert into ACM and attach via Terraform

ACM is used on the **ALB** (same region as the load balancer, typically **us-east-1**). The app on EC2 does not terminate TLS for production traffic.

### 1. Import into ACM

```bash
TLS_DIR="${HOME}/Documents/OSCAL_Reports_data/tls"
AWS_REGION=us-east-1

aws acm import-certificate \
  --region "$AWS_REGION" \
  --certificate "fileb://${TLS_DIR}/oscal-signed.crt" \
  --private-key "fileb://${TLS_DIR}/oscal-private.key" \
  --certificate-chain "fileb://${TLS_DIR}/oscal-chain.crt" \
  --query CertificateArn \
  --output text
```

### 2. Update Terraform

In your environment tfvars (e.g. `terraform/envs/aws4403/terraform.tfvars`):

```hcl
create_alb_certificate   = false
alb_ssl_certificate_arn  = "arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/CERT_ID"
```

Apply (see [AWS_OPERATIONS.md](AWS_OPERATIONS.md)):

```bash
cd terraform
export TERRAFORM_DIR="$(pwd)/envs/aws4403"
./run-with-aws-pass.sh apply
```

Verify: `terraform output alb_url_https` and `https://<your-domain>/health/ready`.

---

## Let's Encrypt emergency fallback

When Adobe PKI renewal is delayed or a new corporate cert is not yet available, use the core script [`scripts/letsencrypt-acm-import.sh`](../scripts/letsencrypt-acm-import.sh). It issues a short-lived Let's Encrypt cert (manual DNS-01 in Route53), imports to ACM, and can update `alb_ssl_certificate_arn` in tfvars.

```bash
LETSENCRYPT_EMAIL=you@adobe.com \
  DOMAIN=oscal.amsgovcloud.com.au \
  TFVARS=terraform/envs/aws4403/terraform.tfvars \
  ./scripts/letsencrypt-acm-import.sh

cd terraform && ./run-with-aws-pass.sh apply
```

When the PKI cert is ready again, import to ACM and swap `alb_ssl_certificate_arn` back to the DigiCert ARN.

**Important:** LE and PKI use separate ACM imports — always update `alb_ssl_certificate_arn` to whichever cert is active.

---

## Hostnames and Terraform variables

| Terraform variable | Typical use |
|--------------------|-------------|
| `alb_domain_name` | Primary CN / main URL |
| `alb_ssl_certificate_arn` | ACM ARN (DigiCert PKI **or** Let's Encrypt import) |
| `create_alb_certificate` | `false` when using imported PKI or existing ARN |
| `alb_blue_hostname` / `alb_green_hostname` | Extra SANs on the same cert |

---

## Security

- Never commit `oscal-private.key`, issued certs, or CSRs to Git.
- Restrict directory: `chmod 700` on `tls/`, `chmod 600` on `oscal-private.key`.
- Rotate key + CSR if the private key was exposed.
- ACM holds the operational cert for the ALB; filesystem copies are for import and audit only.

---

## References

- [AWS_OPERATIONS.md — HTTPS and Let's Encrypt](AWS_OPERATIONS.md#https-setup-acm-and-http-to-https-redirect)
- [terraform/terraform.tfvars.example](../terraform/terraform.tfvars.example) — `alb_ssl_certificate_arn`
- [scripts/letsencrypt-acm-import.sh](../scripts/letsencrypt-acm-import.sh) — Let's Encrypt → ACM emergency fallback
