# Terraform: network segments, allow lists, and ALB tags (PCL / corporate firewall)

This document captures **best practices encoded in this repository’s Terraform** for securing Application Load Balancers (ALB), EC2 instances, security groups, and subnets—so you can **reproduce the same patterns in other projects** (same IdP/account policies optional).

**Source files:** [`terraform/`](../terraform/) — notably [`vpc.tf`](../terraform/vpc.tf), [`security_groups.tf`](../terraform/security_groups.tf), [`alb.tf`](../terraform/alb.tf), [`prefix_list_au.tf`](../terraform/prefix_list_au.tf), [`main.tf`](../terraform/main.tf), [`variables.tf`](../terraform/variables.tf).

**Related:** [AWS_OPERATIONS.md](AWS_OPERATIONS.md) (broader ops), [README.md](README.md) index.

---

## 1. Why tags on the ALB (80 / 443 and corporate rules)

Adobe Managed Services **posture / compliance (PCL)** and automation expect any load balancer that **exposes ports** to be labeled with **which ports** and **why**. That helps scanners and corporate firewall workflows **allow** intentional public web entry (typically **TCP 443**, and **TCP 80** when HTTP is part of the approved design) instead of treating them as rogue exposure.

On the **Application Load Balancer** resource, Terraform applies:

| Tag key | Purpose | Example value (this project) |
|--------|---------|--------------------------------|
| **`Adobe:PublicPorts`** | Space-separated list of public listener ports | With HTTPS enabled: **`80 443`** (tag documents both; actual SG rules still follow §3). Without HTTPS path in use: **`80`**. |
| **`Adobe:PortJustification`** | Human-readable business/technical justification (letters, numbers, spaces, and `_ . : / = + - @` per variable description—**no parentheses** in value if tooling is strict) | Default in Terraform: `alb_port_justification` → e.g. *OSCAL Report Generator web access HTTPS and HTTP* — **override in `terraform.tfvars`** for your workload. |

**Alternative key names** (if a tool cannot use `:` in keys), per comments in [`alb.tf`](../terraform/alb.tf): `Adobe-PublicPorts` or `Adobe.PublicPorts` — confirm with your **AMS / InfraSec** team which variant your account’s automation reads.

Setting these tags does **not** replace security groups; it **aligns** the ELB with org policy so **443/80 are not blocked by generic “block unknown ELB” rules** when those rules are tag-aware.

---

## 2. Network segments (subnets) in this design

| Segment | Terraform | CIDR pattern | Role |
|---------|-----------|--------------|------|
| **VPC** | `aws_vpc.main` | `var.vpc_cidr` (default `10.0.0.0/16`) | Single VPC for the stack. |
| **Public subnets** | `aws_subnet.public` (×2 AZs) | `cidrsubnet(var.vpc_cidr, 8, count.index)` → e.g. `10.0.0.0/24`, `10.0.1.0/24` | **Internet-facing:** ALB and EC2 with `map_public_ip_on_launch = true`, route to IGW `0.0.0.0/0`. |
| **Private subnets (RDS only)** | `aws_subnet.private_rds` (×2 AZs, when RDS enabled) | `cidrsubnet(var.vpc_cidr, 8, 10 + count.index)` | **No IGW route.** RDS subnet group only; DB not internet-reachable. |

Private subnets for DB are **not** used for ALB or general app tiers in this layout (comments in [`vpc.tf`](../terraform/vpc.tf)).

---

## 3. Ingress “allow list” (what can reach the ALB and instances)

**Rule:** **No `0.0.0.0/0` on ingress** for ALB or EC2 SSH/app ports — enforced by `validation` on `default_allowed_cidr_blocks` in [`variables.tf`](../terraform/variables.tf). Egress to `0.0.0.0/0` is allowed where documented (ALB → targets; EC2 → HTTPS/SMTP; standard pattern).

### 3.1 Primary variable: `default_allowed_cidr_blocks`

- **Used for:** ALB HTTPS in some modes, ALB HTTP (when enabled), **SSH (22)** to EC2, **direct** Green/Blue app ports **3019** and **3020** from outside the ALB (tight testing or ops paths).
- **Recommendation (stage / PCL):** Prefer **`/32`** host routes for fixed egress IPs (e.g. VPN or home office) to avoid **“broad CIDR”** quarantine behaviors noted in comments (`FluffyJaws` / AMS PCL).
- **Example shape:** `["203.0.113.10/32", "198.51.100.0/24"]` — tune per your org.

#### 3.1a What goes in `terraform.tfvars` (the list itself—reference and practices)

Real deployments often keep a **mixed** `default_allowed_cidr_blocks` list in **`terraform.tfvars`** (root or per-environment copy under `terraform/envs/<account>/`). That block was not spelled out line-by-line in the first version of this doc because the focus was on **security group logic** and **ALB tags**; **composition and operations** of the CIDR list belong here.

| Entry type | When to use | Notes |
|------------|---------------|--------|
| **`x.x.x.x/32`** | A **single** public IP: one user, one NAT egress, one partner edge, **today’s IP** for access | **Smallest blast radius**; best default for PCL/stage. Home and mobile IPs **change**—treat as **temporary** unless static. |
| **`x.x.x.x/24` (or larger)** | An **approved** corporate, VPN, or office **pool** that many users share | Use only when **confirmed** with networking / InfraSec. Larger ranges are more likely to trigger **“broad CIDR”** scrutiny or auto-remediation in some accounts. |

**Best practices**

1. **Document each entry** in `terraform.tfvars` with an end-of-line comment (`# VPN exit`, `# Adobe site`, `# temp home`) so the next operator knows what to remove during cleanup.
2. **Never** add **`0.0.0.0/0`** — Terraform [`variables.tf`](../terraform/variables.tf) **rejects** it at validate time.
3. **Current public IP** (e.g. before `terraform apply` from a new location):  
   `curl -s --connect-timeout 5 --max-time 10 https://ifconfig.me`  
   Then add `"YOUR_IP/32"` to the list and re-apply—or rely on the wrapper below.
4. **`run-with-aws-pass.sh`** ([`terraform/run-with-aws-pass.sh`](../terraform/run-with-aws-pass.sh)): before plan/apply, **`ensure_current_ip_in_tfvars`** can **append** the machine’s current public IP as `your.ip/32` to `default_allowed_cidr_blocks` in **`terraform.tfvars`** (same directory the script uses) so you do not lock yourself out of SSH/ALB testing. Set **`SKIP_CURRENT_IP_ADD=1`** in CI or automation where mutating `tfvars` is wrong.
5. **Hygiene:** Remove **stale** `/32` entries when people or offices change; avoid duplicating the same IP under different comments.
6. **Secrets:** `terraform.tfvars` is usually **gitignored**; use **`terraform.tfvars.example`** for **shape only**, not live CIDRs.

**Relationship to Australia-only mode:** If **`alb_restrict_to_australia = true`**, ALB **443** may be driven by **managed prefix lists** (see §3.2); **`default_allowed_cidr_blocks`** still applies to **SSH**, **direct instance ports**, and other paths per [`security_groups.tf`](../terraform/security_groups.tf). Keep the list accurate for those surfaces.

### 3.2 ALB HTTPS (443) — three mutually reinforcing modes

Controlled by **`alb_allow_443_from_all`**, **`alb_restrict_to_australia`**, and the absence/presence of Australia managed prefix lists — see [`security_groups.tf`](../terraform/security_groups.tf).

| Mode | Behavior (443) |
|------|------------------|
| **`alb_allow_443_from_all = true`** | Ingress 443 from **`default_allowed_cidr_blocks` only** (still **not** open world; name is historical). |
| **`alb_restrict_to_australia = true`** (and not using the “443 from allowed list only” path that bypasses AU lists) | 443 from **managed prefix lists** built from **Australia aggregated CIDRs** ([`prefix_list_au.tf`](../terraform/prefix_list_au.tf) — HTTP fetch of IPdeny `au-aggregated.zone`, chunked to AWS prefix list limits). |
| Neither AU-only nor `alb_allow_443_from_all` | 443 from **`default_allowed_cidr_blocks` only**. |

**Australia lists:** `aws_ec2_managed_prefix_list.au` — one list per 100 entries (AWS API limit). **Requires** the `http` Terraform provider to fetch the zone file at plan/apply time.

### 3.3 ALB HTTP (80)

- **`alb_allow_http_for_testing`:** When **`true`**, port **80** is allowed from **`default_allowed_cidr_blocks` only**.
- When **HTTPS is enabled** (`alb_use_https` in [`alb.tf`](../terraform/alb.tf): cert ready or ACM ARN set), the ALB security group is intended to stay **443-centric** for **PCL `custom-elb-restricted-ports-check`** (no gratuitous 80 on SG when HTTPS is the real path). HTTP listener behavior for redirect may still exist in listeners; **SG rules** follow `security_groups.tf` + locals.

### 3.4 EC2 instance security group (`oscal`)

- **From ALB:** **3019**, **3020** TCP from ALB SG only (Green / Blue target ports).
- **Self:** **3019** / **3020** for Blue↔Green on private IPs.
- **From VPC CIDR:** **80**, **443**, **3019–3020** for in-VPC access (health, mesh, debugging inside VPC).
- **From `default_allowed_cidr_blocks`:** **22** (SSH), **3019**, **3020** (direct to instances when needed).

### 3.5 RDS (PostgreSQL)

- **Private subnets only**; **`publicly_accessible = false`**.
- **Ingress:** **`aws_security_group.oscal`** → **5432**; optional extra CIDRs via **`rds_additional_ingress_ipv4_cidr_blocks`** (VPC-internal / routed corporate ranges only — **not** `0.0.0.0/0`, validated in variables).

---

## 4. Provider default tags (every resource)

Merged in [`main.tf`](../terraform/main.tf) `provider "aws"` → `default_tags`:

- **`Project`** = `var.project_name`
- **`Environment`** = `var.environment`
- **`ManagedBy`** = `terraform`
- **`Stack`** = `var.project_name` (single tag to filter the whole stack)
- **`Service ID`** = `var.adobe_service_id_tag` (Adobe CMDB / chargeback, e.g. `602844`)

Plus **`var.common_tags`** from `terraform.tfvars` (e.g. `Team = "Compliance"` in examples).

Use the same **`Stack` + `Service ID`** pattern in other projects if your org requires CMDB alignment.

---

## 5. PCL / scanner hooks referenced in Terraform comments

Exact rule IDs may vary by account; names appear in-repo:

- **`custom-elb-restricted-ports-check`** — ALB security group should not allow **extraneous** ports; design keeps **443** as the primary public path when HTTPS is on.
- **`custom-config-ec2-sg-port-check`** — Avoid **0.0.0.0/0** ingress on EC2; broad CIDRs may be **auto-remediated** in stage.

---

## 6. HTTPS listener hardening (ALB)

When the HTTPS listener exists: **`ssl_policy`** default **`ELBSecurityPolicy-TLS13-1-2-Res-PQ-2025-09`** (`var.alb_ssl_policy`) — see [`alb.tf`](../terraform/alb.tf) / [`variables.tf`](../terraform/variables.tf).

---

## 7. Portability checklist (copy to another project)

1. **VPC:** Define **public** subnets for ALB + web tier; **private** subnets only for data tier if required; **no** `0.0.0.0/0` **ingress** on SGs for admin/app.
2. **Allow list:** Central variable for **trusted CIDRs** (`/32` where possible); validate **reject `0.0.0.0/0`** in Terraform `validation` blocks.
3. **ALB tags:** Set **`Adobe:PublicPorts`** and **`Adobe:PortJustification`** (or approved alternates) on **`aws_lb`**.
4. **AU-only option (if applicable):** Managed prefix lists from a vetted AU CIDR source + chunking; or regional equivalent for your country.
5. **Default tags:** `Stack`, `Service ID`, `ManagedBy`, `Environment`, `Project`.
6. **RDS:** Private subnets, SG from app only, optional bastion/VPN CIDRs via a **separate** variable with strong validation.

---

## 8. Variables quick reference (this repo)

| Variable | Role |
|----------|------|
| `default_allowed_cidr_blocks` | Main ingress allow list (ALB/SSH/direct app ports); **no** `0.0.0.0/0`. For **how to compose the list** in **`terraform.tfvars`** (mixed /32 and /24, comments, curl, `run-with-aws-pass.sh`), see **§3.1a** above. |
| `alb_restrict_to_australia` | Use AU prefix lists for 443 when policy fits. |
| `alb_allow_443_from_all` | 443 from `default_allowed_cidr_blocks` (not the whole internet). |
| `alb_allow_http_for_testing` | HTTP 80 from allow list only when HTTPS not forcing 443-only SG pattern. |
| `alb_port_justification` | String for **`Adobe:PortJustification`**. |
| `rds_additional_ingress_ipv4_cidr_blocks` | Extra **5432** sources beyond EC2 SG; VPC-safe CIDRs only. |

See [`terraform.tfvars.example`](../terraform/terraform.tfvars.example) for commented examples.

---

## 9. Disclaimer

Policies (PCL, AMS, corporate firewall) **change**; this file reflects **as-built Terraform in this repository**. For **binding** requirements, use **Adobe / AMS InfraSec** guidance for your account and **import** this checklist only as a **technical companion**.
