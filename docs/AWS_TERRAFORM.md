# AWS Terraform for OSCAL (AI via Bedrock)

This document describes how to provision the AWS architecture for the OSCAL Report Generator using Terraform. **AI is provided by AWS Bedrock** (or Mistral API); there is no self-hosted Ollama. The layout matches the [architecture diagram](diagrams/generate-diagram.html) (ALB, Green/Blue, S3, Bedrock) and [AWS_COST_ESTIMATE.md](AWS_COST_ESTIMATE.md).

## Architecture

- **VPC** and public subnets (2 AZs)
- **Application Load Balancer** (ALB) with HTTP (and optional HTTPS) listeners
- **OSCAL Green** (port 3019) and **OSCAL Blue** (port 3020) each run as a **single-instance Auto Scaling Group** (Launch Template + ELB health checks) so a failed or terminated instance is replaced automatically. **Preferred instance:** Graviton **t4g.small** (default), then AMD **t3a.small**; set `instance_type` and `instance_architecture` in tfvars. With **direct run** (`run_oscal_via_docker = false`, default), optional **dedicated gp3 volumes** (`oscal_persistent_ebs_enabled = true`) are created per role, tagged for discovery, and mounted at **`/opt/oscal`** on boot (application tree and `/opt/oscal/data`); volumes are **not** deleted when the instance is replaced. **SSM** runs a periodic **Command** document on instances tagged `OSCAL_SSM_TARGET=true` (mount check, optional `aws s3 sync` from `oscal_ssm_release_s3_prefix` inside the logs bucket, `systemctl restart oscal-reporter` when the unit exists). Config and users on the instance are backed up to **S3** via **ec2_automation** every 10 min. Set `run_oscal_via_docker = true` to use Docker/podman and the GHCR image instead (no extra data volumes; ASGs still provide replacement).
- **S3** bucket for **logs**, **config**, and **users** (subfolders: `logs/`, `config/green/`, `config/blue/`, `users/`). ec2_automation backs up instance data to S3 so it is retained if instances are replaced.
- **Optional RDS PostgreSQL** (`create_rds_postgres = true` in tfvars): RDS is placed in **dedicated private subnets** (no route to the internet gateway, `map_public_ip_on_launch = false`, **`publicly_accessible = false`**), so it has **no public IP** and is reachable only on **private addresses** inside the VPC. The RDS security group allows PostgreSQL **only** from the OSCAL EC2 security group; you may add **`rds_additional_ingress_ipv4_cidr_blocks`** for extra **internal** ranges (e.g. a bastion subnet), never `0.0.0.0/0`. OSCAL instances egress to PostgreSQL **only toward those private subnet CIDRs**, not the open internet. **IAM database authentication**, master password in **Secrets Manager** (RDS-managed), app user `rds_iam_app_username` (default `oscal_app`). Green/Blue **user_data** bootstraps the IAM role and injects **systemd** `OSCAL_DATABASE_*`. The Node app uses `@aws-sdk/rds-signer` for tokens. **Tables** are created on first successful DB connection. **GUI:** Platform Settings → Database. **Cost:** RDS is billed separately; leave `create_rds_postgres = false` (default) if you use an external database. **`default_allowed_cidr_blocks`** still applies only to **ALB / SSH / direct app ports** (admin paths), not to exposing RDS on the public internet.
- **Tagging:** All resources receive `Project`, `Environment`, `ManagedBy`, and `Stack` (plus any `common_tags`). Filter by `Stack = <project_name>` in any account to find or remove the stack. See [terraform/README.md](../terraform/README.md) for add/remove lifecycle.

Account ID is set via variable; no credentials are stored in code. For **Adobe/AMS** deployments, the template can use **Adobe Image Factory Amazon Linux 2023** (when configured) or **native Amazon Linux 2023**; see [IMAGE_FACTORY.md](IMAGE_FACTORY.md). **Per-account layouts** live under `terraform/envs/` (e.g. `envs/aws4403`); use `TERRAFORM_DIR` and `run-with-aws-pass.sh` for that env.

## Prerequisites

- [Terraform](https://www.terraform.io/downloads) 1.0 or later
- [AWS CLI](https://aws.amazon.com/cli/) configured (or environment variables)
- S3 bucket name that is globally unique (for logs and activity state)
- **EC2 key pair (optional):** Only if you want SSH access. Create or import in AWS (EC2 → Key Pairs, same region). This is **not** the same as credentials in Pass: Pass stores **AWS API credentials** (access key/secret/token); an **EC2 key pair** is an SSH key registered in your AWS account for EC2 instances. Set `key_name = null` in `terraform.tfvars` to launch without SSH key.

## Authentication

Use one of:

- **Environment variables**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and optionally `AWS_SESSION_TOKEN`
- **AWS profile**: `export AWS_PROFILE=your-profile` then run Terraform from the `terraform/` directory
- **IAM role**: when running on EC2/ECS/CodeBuild with an instance/task role

Do not put access keys in `.tf` or `.tfvars` files committed to the repo. Use `terraform.tfvars` for non-secret variables and keep that file gitignored (see `terraform/.gitignore`).

## Before `terraform apply` (after reboot or expired token)

If your AWS session token has expired (e.g. after rebooting your laptop or the next day), refresh credentials **before** running `terraform apply`:

**If you use Pass** (e.g. `terraform/run-with-aws-pass.sh`):

1. Refresh the credentials stored in Pass (e.g. re-run your org’s AWS SSO or login flow and update the Pass entry with new `aws_access_key_id`, `aws_secret_access_key`, `aws_session_token`).
2. Then run Terraform via the script (it loads from Pass each time):

   ```bash
   cd terraform
   ./run-with-aws-pass.sh plan    # optional: review
   ./run-with-aws-pass.sh apply
   ```

**If you use AWS SSO:**

```bash
aws sso login --profile your-profile
cd terraform
export AWS_PROFILE=your-profile
terraform init    # safe to run again
terraform plan -out=tfplan
terraform apply tfplan
```

**If you use environment variables:**

Re-export (or re-run the script that sets) `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_SESSION_TOKEN`, then:

```bash
cd terraform
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

**Quick check:** After refreshing credentials, run `aws sts get-caller-identity` (or `./run-with-aws-pass.sh plan`); if it succeeds, you can run `terraform apply`.

## Usage

### 1. Copy example variables

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` and set at least:

- `s3_logs_bucket_name` – globally unique bucket name (e.g. `ams-oscal-432417415905`; bucket subfolders: logs, config, users)
- `key_name` – existing EC2 key pair name in AWS (same region), or `null` to launch without SSH key

Optionally set `default_allowed_cidr_blocks`, `alb_ssl_certificate_arn`, and `alb_blue_hostname` / `alb_green_hostname` for host-based Blue/Green routing (see below). Use **per-account** tfvars under `terraform/envs/<env>/` when using multiple AWS accounts.

### 2. Initialize and plan

```bash
cd terraform   # or terraform/envs/aws4403 when using env-specific dir
terraform init
terraform plan -out=tfplan
```

Review the plan. It will create VPC, subnets, security groups, ALB, target groups, OSCAL Green/Blue **Auto Scaling Groups** (launch templates, optional persistent EBS, SSM document/association when enabled), S3 bucket, and IAM roles.

### 3. Apply

```bash
terraform apply tfplan
```

Or, to approve in the same step:

```bash
terraform apply
```

### 4. Outputs

After apply, Terraform prints outputs such as:

- `alb_dns_name` / `alb_url_http` – URL to access the app (HTTP). When `alb_ssl_certificate_arn` is set, use `alb_url_https` for HTTPS.
- `oscal_green_instance_id`, `oscal_blue_instance_id` – current EC2 instance IDs for each ASG (null until the group launches a member)
- `oscal_green_autoscaling_group_name`, `oscal_blue_autoscaling_group_name` – ASG names (for Console / CLI)
- `oscal_green_public_ip`, `oscal_blue_public_ip` – public IPs for SSH and deploy when the instance has a public IP
- `oscal_post_boot_ssm_document_name` – SSM Command document used by the periodic association
- `s3_logs_bucket_name` – S3 bucket for logs, config, and users

**AI:** Configure the OSCAL app to use **AWS Bedrock** (or Mistral API) via Settings → AI Integration or `config/app/config.json`. No OLLAMA_URL or Lambda is used; see [AWS_BEDROCK_SETUP.md](AWS_BEDROCK_SETUP.md).

### 5. Direct run on EC2 (default): config and S3

By default (`run_oscal_via_docker = false`), EC2 instances:

- Install **Node.js 20**.
- When **`oscal_persistent_ebs_enabled`** is true (default), attach and mount **dedicated gp3 data volumes** at **`/opt/oscal`** (same path for app and data). When false or in Docker mode, only the root volume is used.
- Store **config and users on EBS** at **/opt/oscal/data** (no S3 mount). **ec2_automation** (cron every 10 min) backs up config, users, and logs to S3 (`config/green/`, `config/blue/`, `logs/green/`, `logs/blue/`) so data is retained if instances are replaced (max 10 min loss).
- Run the app via **systemd** (`oscal-reporter.service`) after code is deployed.

To **deploy or update application code** after Terraform apply, keep using **`./scripts/deploy-to-ec2.sh`** from the repo root. That remains the intended path for real releases: full `rsync` of the repo, `npm install`, frontend build, `ec2_automation` setup, and `systemctl restart oscal-reporter`. **SSM** (optional `oscal_ssm_release_s3_prefix` and the periodic association) is only for light verification, optional artifact sync from a prefix in the logs bucket, and service nudges—not a substitute for this script when you need a normal code deploy.

Set **`TERRAFORM_DIR`** to your env (e.g. `export TERRAFORM_DIR=$PWD/terraform/envs/aws4403`) so Terraform outputs resolve to the current ASG instance IPs. SSH key from [Pass](https://www.passwordstore.org/) (e.g. `AWS/OSCAL-AWS4403-SSH`) or **`SSH_KEY_FILE`**.

```bash
export TERRAFORM_DIR=$PWD/terraform/envs/aws4403   # if not already the default
./scripts/deploy-to-ec2.sh
```

**Amazon Linux 2023 (Image Factory or native):** Use `SSH_USER=ec2-user ./scripts/deploy-to-ec2.sh`.

The deploy script syncs the repo to `/opt/oscal/app` on both instances, runs `npm install` and frontend build, copies the build into `backend/public`, writes **ec2_automation.env** (S3 bucket and paths for backup), installs **ec2_automation** cron, and restarts `oscal-reporter.service`. With **persistent EBS** mounted at `/opt/oscal`, the same paths apply; data under `/opt/oscal/data` survives instance replacement. To deploy to one role only (IPs from Terraform via `run-with-aws-pass.sh`):

```bash
export TERRAFORM_DIR=$PWD/terraform/envs/aws4403
./scripts/deploy-to-ec2.sh --green-only "$(./terraform/run-with-aws-pass.sh output -raw oscal_green_public_ip 2>/dev/null || ./terraform/run-with-aws-pass.sh output -raw oscal_green_private_ip)"
./scripts/deploy-to-ec2.sh --blue-only "$(./terraform/run-with-aws-pass.sh output -raw oscal_blue_public_ip 2>/dev/null || ./terraform/run-with-aws-pass.sh output -raw oscal_blue_private_ip)"
```

Config and users live on each instance at `/opt/oscal/data`; the deploy script does **not** sync them to S3 (ec2_automation performs backups every 10 min). To use **Docker on EC2** instead of direct run, set `run_oscal_via_docker = true` in `terraform.tfvars` and apply.

#### S3 backup layout (ec2_automation)

In the AWS S3 console, open your bucket → **`config`** or **`logs`** → **`green`** or **`blue`**. ec2_automation on each instance uploads:
- `config/green/config.json`, `config/green/users.json` (Green)
- `config/blue/config.json`, `config/blue/users.json` (Blue)
- `logs/green/`, `logs/blue/` (log files)

Terraform creates folder placeholders; ec2_automation populates them. For new instances, ensure `/opt/oscal/data/config.json` and `users.json` exist (e.g. copy from backup or create from examples) before or after first deploy.

### Migrating Terraform state from standalone `aws_instance` to ASG

If your state still contains **`aws_instance.oscal_green` / `oscal_blue`** and **`aws_lb_target_group_attachment`** resources from an older layout, Terraform will want to **destroy** those and create ASGs, launch templates, volumes, and attachments. Before apply in a shared account:

1. **Back up** `/opt/oscal` (or rely on S3 `config/` and `logs/` from ec2_automation) and note current instance IDs.
2. **Remove old resources from state** (addresses must match `terraform state list`):

   ```bash
   terraform state list | grep -E 'aws_instance\.oscal_|aws_lb_target_group_attachment'
   terraform state rm '<each-address-from-the-list-above>'
   ```

   Typical older addresses include `aws_instance.oscal_green`, `aws_instance.oscal_blue`, and one or more `aws_lb_target_group_attachment.*` resources that registered fixed instance IDs to the Green/Blue target groups.

3. **Apply** so Terraform creates **`aws_ebs_volume`**, **`aws_launch_template`**, **`aws_autoscaling_group`**, **`aws_autoscaling_attachment`**, and SSM resources. **Data volumes start empty** unless you snapshot/restore or copy data onto them after first attach (e.g. from S3 or an old volume snapshot in the same AZ as each subnet).

4. **Tune** `oscal_asg_health_check_grace_period` if the ASG replaces instances too aggressively while user_data installs Node and mounts disk.

**EventBridge:** Per-instance “EC2 running → Run Command” rules need the event’s `instance-id` passed into `SendCommand`; the managed layout uses a **scheduled SSM association** (`rate(30 minutes)`) instead so replacements are not coupled to global EC2 events. You can add a custom EventBridge rule later if your org requires immediate post-boot runs.

### Checklist: precautions, apply, and verification

**Before plan/apply**

- **Credentials:** Refresh AWS session if needed (`aws sts get-caller-identity` or `./terraform/run-with-aws-pass.sh plan`). Wrong account → set `TERRAFORM_DIR` and `AWS_PASS_ENTRY` for the intended env (e.g. aws4403).
- **State vs code:** If you still have old **`aws_instance`** / **`aws_lb_target_group_attachment`** in state, follow **Migrating Terraform state** above *before* apply, or Terraform may try to destroy/recreate in the wrong order.
- **AMI:** Ensure `oscal_ami_id` / Image Factory / `image_factory_amazon_linux_ami_us_east_1` resolves (`terraform plan` must not fail the launch template precondition).
- **AZ and EBS:** Green uses `public[0]` AZ, Blue uses `public[1]` AZ. Persistent volumes are created in those AZs only—do not change subnet/AZ in tfvars without a volume migration plan.
- **SCP / IAM:** Org SCPs must allow **`ec2:RunInstances`**, **`autoscaling:*`** (as needed), **SSM**, and **ELB** APIs your role uses. PCL still applies to SGs and S3.
- **S3 bucket:** Empty-bucket rules apply on destroy; for apply, bucket name must remain globally unique.
- **`oscal_asg_health_check_grace_period`:** Default (e.g. 420s) allows user_data (mount, Node install, service start) before ELB health drives ASG replacement. If you see **replace loops**, increase it; if failover feels too slow, decrease carefully.

**Plan review**

- Confirm **destroy/create** list matches intent (especially first cutover from standalone EC2).
- New resources should include **`aws_autoscaling_group`**, **`aws_launch_template`**, **`aws_autoscaling_attachment`**, optional **`aws_ebs_volume`**, **`aws_ssm_document`**, **`aws_ssm_association`**.

**After apply**

1. **Outputs:** `terraform output` (via wrapper) — `oscal_green_instance_id`, `oscal_*_public_ip` / `private_ip` should be non-null once instances are **running** (ASG may take a few minutes).
2. **ALB targets:** EC2 → Target Groups → Green/Blue → targets **healthy** (HTTP `/health` on 3019 / 3020 per `alb.tf`).
3. **SSH / deploy:** `./scripts/deploy-to-ec2.sh` (or `--both`) so **`/opt/oscal/app`** matches your repo; restores full build after a fresh instance.
4. **Data:** If new persistent volumes are **empty**, seed **`/opt/oscal/data`** from S3 `config/<green|blue>/` or snapshots before expecting the app to serve traffic.
5. **SSM:** Systems Manager → **Run Command** / **Compliance** — association on document `oscal_post_boot_ssm_document_name` (output) should show successful invocations on tagged instances after ~30 minutes (or run the document manually once).
6. **Persistence:** On a **replacement** test (optional), terminate one instance in the ASG (console) and confirm a new instance attaches the **same** gp3 data volume and service recovers (only when `oscal_persistent_ebs_enabled` is true).

**Quick tests**

| Check | Command / action |
|--------|-------------------|
| ALB health | `curl -sS -o /dev/null -w "%{http_code}" "http://$(terraform output -raw alb_dns_name)/health"` (or HTTPS URL if cert in use); expect **200** from default routing or host rules. |
| Green direct | From a host allowed by SGs: `curl -sS -o /dev/null -w "%{http_code}" "http://<green-ip>:3019/health"` |
| Blue direct | `curl ... "http://<blue-ip>:3020/health"` |
| App UI | Open ALB URL or green/blue hostnames in browser; exercise login and one report path. |
| Logs | Instance: `journalctl -u oscal-reporter -n 50 --no-pager`; S3: `logs/green/` or `logs/blue/` after ec2_automation runs. |

**Launch template note:** Instances launched from the template are tagged with **`Stack = project_name`** explicitly (required for Terraform outputs, SSM association targets, and **`ec2:AttachVolume`** IAM conditions). Provider **`default_tags`** alone do not propagate to LT-launched instances.

### Blue/Green host-based routing (optional)

To access Blue and Green with two different hostnames (e.g. `blue.oscal.example.com` and `green.oscal.example.com`) so both run the same app at `/` with no application code changes:

1. Set in `terraform.tfvars`: `alb_blue_hostname = "blue.oscal.example.com"` and `alb_green_hostname = "green.oscal.example.com"` (use your own domain).
2. Create **CNAME** DNS records: `blue.oscal.example.com` and `green.oscal.example.com` both pointing to the ALB DNS name (output `alb_dns_name`).
3. Run `terraform apply`. The ALB will route by **Host** header: requests to the blue hostname go to Blue (port 3020), requests to the green hostname go to Green (port 3019). Default action (e.g. raw ALB DNS) forwards to Blue.

For HTTPS, use an ACM certificate that covers both hostnames (e.g. wildcard `*.oscal.example.com` or a cert with both SANs).

### ALB without ACM (HTTP-only testing)

If your organisation does not authorize `acm:RequestCertificate`, you can establish and test the ALB using **HTTP only**. No Terraform code changes are required.

1. **In your env’s `terraform.tfvars`** (e.g. `terraform/envs/aws4403/terraform.tfvars`), set:
   - `create_alb_certificate = false` – Terraform will not create an ACM certificate (no `acm:RequestCertificate` call).
   - `alb_ssl_certificate_arn = null` – no existing cert attached.
   - `alb_allow_http_for_testing = true` – ALB security group allows port 80 from `default_allowed_cidr_blocks` so you can reach the ALB for testing.
2. **Apply:** From repo root with `TERRAFORM_DIR` set to your env (e.g. `terraform/envs/aws4403`), run `./terraform/run-with-aws-pass.sh apply`.
3. **Use the ALB:** After apply, run `terraform output alb_url_http` (or `alb_dns_name`). From a machine whose IP is in `default_allowed_cidr_blocks`, open **http://&lt;alb_dns_name&gt;** in a browser or run `curl http://&lt;alb_dns_name&gt;/health`.
4. **If direct instance URLs work (e.g. http://&lt;green-ip&gt;:3019) but the ALB URL does not:** The ALB allows port 80 only from `default_allowed_cidr_blocks`. Add your current public IP (run `curl -s ifconfig.me` to see it) as `"x.x.x.x/32"` in `default_allowed_cidr_blocks` in tfvars, then run `terraform apply` again. Also check in the AWS Console that the ALB target groups show the ASG-registered targets as **Healthy** (Targets tab); if they are Unhealthy, the ALB returns 503.
5. **Add a certificate later:** When your organisation provides an ACM certificate (same account/region), set `alb_ssl_certificate_arn = "arn:aws:acm:us-east-1:ACCOUNT:certificate/CERT_ID"` in tfvars, keep `create_alb_certificate = false`, and run `terraform apply` again. Terraform will add the HTTPS listener (443) and HTTP→HTTPS redirect; no ACM request is made.

**Let's Encrypt and import into ACM:** If you use Let's Encrypt (e.g. when ACM *request* is not allowed but ACM *import* is), run the script `scripts/letsencrypt-acm-import.sh` from the repo root. It uses **manual DNS-01** validation: you add the TXT record in Route53 yourself (Route53 may be in a different AWS account; the script prompts you with exact steps). The script then imports the issued cert into ACM and can update your env's `terraform.tfvars` with the new cert ARN. Prerequisites: `certbot` installed, AWS CLI credentials for the ALB account (Pass entry `AWS/AMS_4403-STG` or env). See the script header for usage and environment variables.

### HTTPS setup (ACM and HTTP-to-HTTPS redirect)

To serve the app over HTTPS with an AWS-issued certificate and redirect all HTTP traffic to HTTPS:

1. **Request an ACM certificate** (AWS Console → Certificate Manager, or CLI) for a **custom domain** you own (e.g. `oscal.example.com`). ACM does **not** issue certificates for the default ALB DNS name (e.g. `ams-oscal-alb-....elb.amazonaws.com`). Create the certificate in the **same region** as the ALB (e.g. us-east-1).
2. **Validate the certificate** via DNS (add the CNAME record ACM provides) or email.
3. **Create a CNAME** (or Route53 alias): your custom domain → ALB DNS name (output `alb_dns_name`). Example: `oscal.example.com` → `ams-oscal-alb-94037178.us-east-1.elb.amazonaws.com`.
4. **Set in `terraform.tfvars`:** `alb_ssl_certificate_arn = "arn:aws:acm:region:account:certificate/id"` (use the ARN from Certificate Manager). Optionally set `alb_green_hostname` and `alb_blue_hostname` for green/blue hostnames (use the same cert with SANs or a wildcard).
5. **Apply:** `terraform apply`. The ALB will have an HTTPS listener on port 443 using the ACM certificate. The HTTP listener (port 80) will **redirect** all requests to HTTPS (301). Use `alb_url_https` output or `https://your-domain.com`.
6. **Use:** `https://your-domain.com` for production. HTTP requests to the ALB (e.g. `http://your-domain.com`) will redirect to `https://your-domain.com`.

**Direct instance URLs (IP:3019, IP:3020):** AWS ACM certificates cannot be installed on EC2 instances; ACM works only with AWS services (ALB, CloudFront, API Gateway). To access Green or Blue over HTTPS, use **ALB hostnames** (`alb_green_hostname`, `alb_blue_hostname`) with a CNAME to the ALB and the same ACM cert—traffic is then HTTPS via the ALB. The raw IP:port URLs (e.g. `http://3.234.177.204:3019`, `http://54.145.135.149:3020`) remain HTTP and are suitable for debug or internal use only.

### PCL auto-remediation: ALB security group (recovery)

Stage-account PCL (Policy Compliance Layer) may flag the ALB for **port 443** and **automatically replace** its security group with a different one (e.g. `sg-01b7bbf8677bf26b9`). The replacement SG often has no usable 443 ingress, so the ALB stops accepting traffic and appears broken.

**PCL-friendly ALB SG pattern (per AMS PCL / FluffyJaws):**

- The Terraform ALB security group uses **explicit TCP 443 and 80 only** (no "All traffic" / ANY protocol).
- Ingress does **not** use `0.0.0.0/0`; it uses `default_allowed_cidr_blocks` only.
- For **stage accounts**, PCL may treat CIDRs **broader than /32 as "broad"** and revert the SG. **Prefer /32 or the smallest range needed** in `default_allowed_cidr_blocks` to avoid quarantine. Keep `alb_restrict_to_australia = false` per org restrictions.
- **Resource tagging:** The ALB is tagged with **Adobe:PublicPorts** (space-separated ports, e.g. `80 443`) and **Adobe:PortJustification** (set via `alb_port_justification` in tfvars). These tags are required for open ports to be compliant; for STG you may also need a formal exception. Override `alb_port_justification` with a short description of the public service (e.g. "OSCAL Report Generator production access for AMS Gov Cloud").

**Recovery (restore Terraform-managed ALB SG):**

1. From repo root, run apply for the affected env so Terraform re-attaches the correct ALB security group:

   ```bash
   cd /path/to/OSCAL_Reports
   TERRAFORM_DIR=$PWD/terraform/envs/aws4403 ./terraform/run-with-aws-pass.sh apply
   ```

   Terraform will see the drift (ALB currently has the PCL-applied SG) and update the ALB back to `aws_security_group.alb.id`. No other resources need to change.

2. If you use a different env, set `TERRAFORM_DIR` to that env (e.g. `terraform/envs/aws4379`) and use the matching Pass entry (e.g. `AWS_PASS_ENTRY="AWS/AWS4379 Sandbox"`).

**Reducing recurrence:** Prefer **/32** entries in `default_allowed_cidr_blocks` (e.g. known VPN egress IPs) to avoid "broad CIDR" quarantine. Replace any /24 or larger ranges with /32 or the smallest range you actually need, then run `terraform apply`.


## Key variables

| Variable | Description | Default |
|---------|-------------|---------|
| `aws_region` | AWS region | `us-east-1` |
| `aws_account_id` | Account ID (for ARNs) | (set in tfvars) |
| `project_name` | Project name (tags, resource names) | `oscal-reports` |
| `environment` | Environment (e.g. prod, staging) | `prod` |
| `instance_type` | EC2 type: preferred **t4g.small** (Graviton), then **t3a.small** (AMD) | `t4g.small` |
| `instance_architecture` | **arm64** for t4g (default), **x86_64** for t3a | `arm64` |
| `key_name` | EC2 key pair name (or null) | (required or null) |
| `run_oscal_via_docker` | If false, EC2 runs Node.js directly with S3-mounted config/users; if true, Docker/podman + GHCR image | `false` |
| `s3_logs_bucket_name` | S3 bucket for logs and activity | (required) |
| `default_allowed_cidr_blocks` | CIDRs allowed for ALB HTTPS and SSH ingress | `["130.248.32.17/32", "203.191.182.150/32"]` (do not use `0.0.0.0/0`) |
| `alb_ssl_certificate_arn` | ACM cert for HTTPS | `null` (HTTP only) |
| `alb_blue_hostname` | Hostname for Blue (e.g. blue.oscal.example.com); ALB routes by Host header | `null` |
| `alb_green_hostname` | Hostname for Green (e.g. green.oscal.example.com); ALB routes by Host header | `null` |
| `alb_port_justification` | Free-form text for Adobe:PortJustification tag on ALB (AMS PCL requirement); only letters, numbers, spaces, _.:/=+-@ | `"OSCAL Report Generator web access HTTPS and HTTP"` |
| `use_image_factory_ami` | Use Image Factory Amazon Linux 2023 when available | `true` |
| `run_oscal_via_docker` | If true, EC2 runs Docker/podman + GHCR image | `false` |
| `common_tags` | Tags applied to all resources (e.g. Team, Account) | `{}` |

See `terraform/variables.tf` and `terraform/terraform.tfvars.example` (or `terraform/envs/<env>/`) for the full list. **AI** is via AWS Bedrock or Mistral API; configure in the app (Settings or config.json). See [AWS_BEDROCK_SETUP.md](AWS_BEDROCK_SETUP.md).


## Troubleshooting: Access broken (direct instances and ALB)

When **all** of the following are unreachable — `http://<green-ip>:3019/`, `http://<blue-ip>:3020/`, and `https://<alb-dns-name>/`:

**1. Your IP is not in the allow list**  
Access is restricted to `default_allowed_cidr_blocks`. If you changed networks (e.g. home vs office, different VPN), your public IP may no longer be allowed.

- **Check your current IP:** `curl -s ifconfig.me` (or open https://ifconfig.me).
- **Add it:** In your env's `terraform.tfvars` (e.g. `terraform/envs/aws4403/terraform.tfvars`), add `"YOUR_IP/32"` to `default_allowed_cidr_blocks`, then run `terraform apply`. When you use `./terraform/run-with-aws-pass.sh plan` or `apply`, the script automatically adds your current IP to `default_allowed_cidr_blocks` in `terraform.tfvars` if it is missing (so lockout is avoided on a new network). To disable this (e.g. in CI), set `SKIP_CURRENT_IP_ADD=1`.

**2. ALB security group was replaced by PCL**  
PCL may have swapped the ALB's security group again, so the ALB no longer allows 443 (and the ALB URL fails). Direct instance access can still work if your IP is allowed; if direct is also broken, see (1).

- **Fix:** Run `terraform apply` so Terraform re-attaches the correct ALB security group and applies tags (e.g. `TERRAFORM_DIR=$PWD/terraform/envs/aws4403 ./terraform/run-with-aws-pass.sh apply`). Ensure `alb_port_justification` uses only characters allowed by AWS for ELB tags (no parentheses).

**3. Instances stopped or app not running**  
- In AWS Console: **EC2 → Instances** — confirm Green and Blue are **running**.
- **EC2 → Target Groups → Targets** — confirm targets are **Healthy**. If Unhealthy, fix the app or health check on the instance.

**4. ALB works but direct instance URLs (http://&lt;green-ip&gt;:3019, http://&lt;blue-ip&gt;:3020) are broken**  
The ALB and the instances use the same `default_allowed_cidr_blocks`; if the ALB is reachable, your IP is in the list. Direct access is allowed by the **OSCAL** security group (ports 3019, 3020). If that SG is out of sync (e.g. a previous apply failed after updating the ALB SG, or rules were changed in the console), the OSCAL SG may be missing your CIDR.

- **Fix:** Run `terraform apply` again so the OSCAL security group is updated to match `default_allowed_cidr_blocks` (e.g. `TERRAFORM_DIR=$PWD/terraform/envs/aws4403 ./terraform/run-with-aws-pass.sh apply`).
- **Verify:** In AWS Console, **EC2 → Security Groups** → find the OSCAL SG (name like `ams-oscal-reports-oscal-*`) → **Inbound rules** → confirm there are rules for ports **3019** and **3020** from your IP or CIDR (e.g. `203.191.182.150/32`). If those rules are missing, apply again or fix drift.

---

## Troubleshooting: 503 Service Unavailable

The ALB returns **503 Service Temporarily Unavailable** when the target group that was selected for the request has **no healthy targets**. Even if one instance (e.g. Blue) is up and responding, you can still see 503 in these cases:

1. **You are using the Green hostname**  
   If `alb_green_hostname` is set (e.g. `green.oscal.example.com`), requests to that host go **only** to the Green target group (priority 100). If Green has no healthy targets (instance down, app not on 3019, or `/health` failing), the ALB returns 503. Blue being healthy does not help for that hostname.

2. **Both target groups are unhealthy**  
   The default action forwards with weights (50/50 or 99/1 Green/Blue). The ALB only routes to healthy targets; if **both** Green and Blue have no healthy targets, every request gets 503.

3. **Blue is unhealthy in the ALB’s view**  
   “Blue works” from your laptop (e.g. `curl http://blue-ip:3020/health`) can still be **Unhealthy** in the target group if the ALB health check fails (e.g. health checks use the instance **private** IP from inside the VPC; security group or app binding could differ).

**What to do**

- **Check target health**  
  From the repo root (with Terraform applied and AWS credentials as for Terraform):

  ```bash
  ./scripts/debug/check-alb-target-health.sh
  ```

  Or in the AWS Console: **EC2 → Target Groups →** select the Green/Blue target groups and open the **Targets** tab to see Healthy/Unhealthy.

- **Use the Blue URL when only Blue is up**  
  If Green is unhealthy, use the **Blue** URL (e.g. `alb_blue_hostname` or the main ALB URL). With weighted forwarding, the ALB sends traffic only to healthy target groups, so the main ALB URL will use Blue if Green has no healthy targets. If you were using the **Green** hostname, switch to the Blue hostname or the main ALB DNS name.

- **Fix Green so both are healthy**  
  On the Green instance: ensure the app is listening on **port 3019**, bound to **0.0.0.0** (not only 127.0.0.1), and that `GET http://<green-private-ip>:3019/health` returns **200**. Security groups already allow the ALB to reach instances on 3019 and 3020.

## Remote state (optional)

For team use or production, use an S3 backend and DynamoDB table for state locking. Example (uncomment and set in `terraform/main.tf`):

```hcl
backend "s3" {
  bucket         = "your-terraform-state-bucket"
  key            = "oscal-reports/terraform.tfstate"
  region         = "us-east-1"
  dynamodb_table = "terraform-state-lock"
  encrypt        = true
}
```

Create the bucket and table first; do not commit state or credentials.

## Destroy and S3 bucket

When you run **`terraform destroy`**, the S3 bucket created by the template is **not** deleted if it is non-empty. Empty the bucket (e.g. in AWS Console or `aws s3 rm s3://bucket-name --recursive`) then run destroy again if needed. See `terraform/s3.tf` for details. Logs, config, and users in S3 should be backed up or migrated before destroy if required.

## Validation

From the `terraform/` directory (requires [Terraform](https://www.terraform.io/downloads) 1.x installed):

```bash
terraform init
terraform validate
terraform plan
```

`terraform validate` checks configuration syntax and internal consistency. `terraform plan` requires variables (`key_name`, `s3_logs_bucket_name`) to be set (e.g. via `terraform.tfvars` or `-var`).

## References

- [docs/diagrams/generate-diagram.html](diagrams/generate-diagram.html) – architecture diagram
- [AWS_COST_ESTIMATE.md](AWS_COST_ESTIMATE.md) – cost breakdown
- [CLOUD_DEPLOYMENT.md](CLOUD_DEPLOYMENT.md) – general cloud deployment options
