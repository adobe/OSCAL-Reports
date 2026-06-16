---
concept: Mukesh Kesharwani
contact: mukesh.kesharwani@adobe.com
---

# TLS certificates and corporate PKI (OSCAL Report Generator)

This document records **where TLS material lives** (outside Git), how the **CSR** was produced, how to store the **issued certificate**, and how to **replace the Let's Encrypt stopgap** on the AWS ALB via Terraform.

**Related:** [AWS_OPERATIONS.md](AWS_OPERATIONS.md) (ALB HTTPS, ACM), [logs/SSL_CERT_PKI_REQUEST_2026-05-27.md](../logs/SSL_CERT_PKI_REQUEST_2026-05-27.md) (request audit record).

---

## Summary

| Item | Location / value |
|------|----------------|
| **PKI request portal** | [Adobe PLM](https://plm.corp.adobe.com/#/) |
| **CSR & private key (never commit)** | `OSCAL_Reports_data/tls/` (sibling of repo; see below) |
| **Issued cert (when received)** | Same directory — filenames below |
| **Production HTTPS today (stopgap)** | Let's Encrypt → imported to **ACM**; ARN in env `terraform.tfvars` |
| **Target state** | Corporate PKI cert imported to ACM → `alb_ssl_certificate_arn` in Terraform |

---

## File storage (outside Git)

TLS files **must not** live under the `OSCAL_Reports` repository. Use the same local data directory as config/users:

| Environment | Absolute path (example) |
|-------------|-------------------------|
| **macOS (this project)** | `/Users/mkesharw/Documents/OSCAL_Reports_data/tls/` |
| **Generic layout** | `<parent-of-repo>/OSCAL_Reports_data/tls/` |

Example: if the repo is `.../Documents/OSCAL_Reports`, data is `.../Documents/OSCAL_Reports_data/tls/`.

### Directory layout

```text
OSCAL_Reports_data/tls/
├── README.txt              # Short pointer (optional; created with CSR move)
├── oscal.csr               # Certificate Signing Request (submitted to PKI)
├── oscal-private.key       # Private key (chmod 600) — keep with issued cert for ACM import
├── oscal-signed.crt        # Server certificate from PKI (add when received)
├── oscal-chain.crt         # Intermediate / chain from PKI (add when provided)
└── oscal-fullchain.pem     # Optional: cat server + chain for tooling
```

| File | Purpose |
|------|---------|
| `oscal.csr` | Paste into PLM / PKI CSR field; safe to re-read, not secret |
| `oscal-private.key` | **Secret** — required for ACM `import-certificate`; never commit or share |
| `oscal-signed.crt` | End-entity certificate from Adobe PKI (name may vary, e.g. `.cer` / `.pem`) |
| `oscal-chain.crt` | CA bundle / intermediate(s) for ACM import |

`.gitignore` in the repo blocks `*.csr`, `*.key`, and root-level `oscal.csr` / `oscal-private.key` if copied back by mistake.

---

## PKI request (Adobe PLM)

1. Open **[https://plm.corp.adobe.com/#/](https://plm.corp.adobe.com/#/)** and start a certificate request per your team’s process.
2. Use **4096-bit RSA** if the portal recommends it (PKI may warn on 2048).
3. **Common Name (CN):** primary browser FQDN (e.g. `oscal.amsgovcloud.com.au` or your approved hostname).
4. **SANs:** any additional hostnames on the same ALB (e.g. Blue/Green hostnames from `alb_blue_hostname` / `alb_green_hostname` in Terraform).
5. Upload or paste the contents of **`oscal.csr`** from `OSCAL_Reports_data/tls/oscal.csr`.

See [logs/SSL_CERT_PKI_REQUEST_2026-05-27.md](../logs/SSL_CERT_PKI_REQUEST_2026-05-27.md) for the dated request record.

---

## Generating the CSR (reference)

Generated on the operator machine with OpenSSL (4096-bit example). Adjust **CN** and **subject** to match PKI / DNS.

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

Use AWS CLI credentials for the **ALB account** (e.g. Pass `AWS/AMS_4403-STG` or env vars). Region must match the ALB.

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

Copy the returned **CertificateArn**.

### 2. Update Terraform

In your environment tfvars (e.g. `terraform/envs/aws4403/terraform.tfvars`):

```hcl
create_alb_certificate   = false
alb_ssl_certificate_arn  = "arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/CERT_ID"
# alb_domain_name        = "oscal.amsgovcloud.com.au"   # DNS CNAME/alias to ALB unchanged
```

Apply from the env directory (see [AWS_OPERATIONS.md](AWS_OPERATIONS.md)):

```bash
export TERRAFORM_DIR=terraform/envs/aws4403
./terraform/run-with-aws-pass.sh plan
./terraform/run-with-aws-pass.sh apply
```

Verify: `terraform output alb_url_https` and browser `https://<your-domain>/health`.

### 3. Replace Let's Encrypt stopgap

Current interim approach (documented in [AWS_OPERATIONS.md](AWS_OPERATIONS.md)):

- Script: `scripts/debug/letsencrypt-acm-import.sh`
- Issues short-lived Let's Encrypt cert, imports to ACM, can set `alb_ssl_certificate_arn` in tfvars.

**Cutover to corporate PKI:**

1. Import PKI cert to ACM (steps above) — new ARN.
2. Set `alb_ssl_certificate_arn` to the **new** ARN (replace the Let's Encrypt ARN).
3. `terraform apply` — ALB HTTPS listener uses the new cert.
4. Optionally remove the old ACM imported cert in the console after validation.
5. Do **not** renew Let's Encrypt for production once PKI is live.

---

## Hostnames and Terraform variables

| Terraform variable | Typical use |
|--------------------|-------------|
| `alb_domain_name` | Primary CN / main URL |
| `alb_ssl_certificate_arn` | ACM ARN (Let's Encrypt **or** PKI import) |
| `create_alb_certificate` | `false` when using imported PKI or existing ARN |
| `alb_blue_hostname` / `alb_green_hostname` | Extra SANs on the same cert |

Example primary domain from `terraform/terraform.tfvars.example`: `oscal.amsgovcloud.com.au`.

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
- [scripts/debug/letsencrypt-acm-import.sh](../scripts/debug/letsencrypt-acm-import.sh) — stopgap LE → ACM
