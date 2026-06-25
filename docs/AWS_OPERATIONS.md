# AWS: Terraform, EC2 hosting, Bedrock, Image Factory, and costs

**Consolidated guide:** Terraform layout for OSCAL on AWS, Image Factory AMIs, Bedrock IAM and setup, EC2 Blue/Green hosting practices, and cost estimates.

---

## Table of contents

- [AWS Terraform for OSCAL (AI via Bedrock)](#aws-terraform-for-oscal-ai-via-bedrock)
- [Adobe Image Factory – AMI usage for Terraform](#adobe-image-factory-ami-usage-for-terraform)
- [Amazon Bedrock Integration – Step-by-Step AWS Setup](#amazon-bedrock-integration-step-by-step-aws-setup)
- [EC2 Web Hosting Best Practices](#ec2-web-hosting-best-practices)
- [💰 AWS EC2 Cost Estimate for OSCAL Report Generator + Ollama](#aws-ec2-cost-estimate-for-oscal-report-generator-ollama)

---

<a id="aws-terraform-for-oscal-ai-via-bedrock"></a>

## AWS Terraform for OSCAL (AI via Bedrock)

This document describes how to provision the AWS architecture for the OSCAL Report Generator using Terraform. **AI is provided by AWS Bedrock** (or Mistral API); there is no self-hosted Ollama. The layout matches the [architecture diagram](diagrams/generate-diagram.html) (ALB, Green/Blue, S3, Bedrock) and [AWS cost estimate](#aws-ec2-cost-estimate-for-oscal-report-generator-ollama).

### Architecture

- **VPC** and public subnets (2 AZs)
- **Application Load Balancer** (ALB) with HTTP (and optional HTTPS) listeners
- **OSCAL Green** and **OSCAL Blue** each run as a **single-instance Auto Scaling Group** (Launch Template + ELB health checks) so a failed or terminated instance is replaced automatically. Both instances listen on the **same app port** (`oscal_app_port`, default **3020**). **Preferred instance:** Graviton **t4g.small** (default), then AMD **t3a.small**; set `instance_type` and `instance_architecture` in tfvars. With **direct run** (`run_oscal_via_docker = false`, default), optional **dedicated gp3 volumes** (`oscal_persistent_ebs_enabled = true`) are created per role, tagged for discovery, and mounted at **`/opt/oscal`** on boot (application tree and `/opt/oscal/data`); volumes are **not** deleted when the instance is replaced. **SSM** runs a periodic **Command** document on instances tagged `OSCAL_SSM_TARGET=true` (mount check, optional `aws s3 sync` from `oscal_ssm_release_s3_prefix` inside the logs bucket, `systemctl restart oscal-reporter` when the unit exists). **OS patching** uses **SSM Patch Manager** with staggered Blue/Green maintenance windows ([OS patching](#os-patching-ssm-patch-manager)). Config and users on the instance are backed up to **S3** via **ec2_automation** every 10 min. Set `run_oscal_via_docker = true` to use Docker/podman and the GHCR image instead (no extra data volumes; ASGs still provide replacement).
- **S3** bucket for **logs**, **config**, and **users** (subfolders: `logs/`, `config/green/`, `config/blue/`, `users/`). ec2_automation backs up instance data to S3 so it is retained if instances are replaced.
- **Optional RDS PostgreSQL** (`create_rds_postgres = true` in tfvars): RDS is placed in **dedicated private subnets** (no route to the internet gateway, `map_public_ip_on_launch = false`, **`publicly_accessible = false`**), so it has **no public IP** and is reachable only on **private addresses** inside the VPC. The RDS security group allows PostgreSQL **only** from the OSCAL EC2 security group; you may add **`rds_additional_ingress_ipv4_cidr_blocks`** for extra **internal** ranges (e.g. a bastion subnet), never `0.0.0.0/0`. OSCAL instances egress to PostgreSQL **only toward those private subnet CIDRs**, not the open internet. **IAM database authentication**, admin password in **Secrets Manager** (RDS-managed), app user `rds_iam_app_username` (default `oscal_app`). Green/Blue **user_data** bootstraps the IAM role and injects **systemd** `OSCAL_DATABASE_*`. The Node app uses `@aws-sdk/rds-signer` for tokens. **Tables** are created on first successful DB connection. **GUI:** Platform Settings → Database. **Cost:** RDS is billed separately; leave `create_rds_postgres = false` (default) if you use an external database. **`default_allowed_cidr_blocks`** still applies only to **ALB / SSH / direct app ports** (admin paths), not to exposing RDS on the public internet.
- **Tagging:** All resources receive `Project`, `Environment`, `ManagedBy`, and `Stack` (plus any `common_tags`). Filter by `Stack = <project_name>` in any account to find or remove the stack. See [terraform/README.md](../terraform/README.md) for add/remove lifecycle.

Account ID is set via variable; no credentials are stored in code. For **Adobe/AMS** deployments, the template can use **Adobe Image Factory Amazon Linux 2023** (when configured) or **native Amazon Linux 2023**; see [Image Factory AMIs](#adobe-image-factory-ami-usage-for-terraform). **Per-account layouts** live under `terraform/envs/` (e.g. `envs/aws4403`); use `TERRAFORM_DIR` and `run-with-aws-pass.sh` for that env.

### Prerequisites

- [Terraform](https://www.terraform.io/downloads) 1.0 or later
- [AWS CLI](https://aws.amazon.com/cli/) configured (or environment variables)
- S3 bucket name that is globally unique (for logs and activity state)
- **EC2 key pair (optional):** Only if you want SSH access. Create or import in AWS (EC2 → Key Pairs, same region). This is **not** the same as credentials in Pass: Pass stores **AWS API credentials** (access key/secret/token); an **EC2 key pair** is an SSH key registered in your AWS account for EC2 instances. Set `key_name = null` in `terraform.tfvars` to launch without SSH key.

### Authentication

Use one of:

- **Environment variables**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and optionally `AWS_SESSION_TOKEN`
- **AWS profile**: `export AWS_PROFILE=your-profile` then run Terraform from the `terraform/` directory
- **IAM role**: when running on EC2/ECS/CodeBuild with an instance/task role

Do not put access keys in `.tf` or `.tfvars` files committed to the repo. Use `terraform.tfvars` for non-secret variables and keep that file gitignored (see `terraform/.gitignore`).

### Before `terraform apply` (after reboot or expired token)

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

### Usage

#### 1. Copy example variables

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` and set at least:

- `s3_logs_bucket_name` – globally unique bucket name (e.g. `ams-oscal-442277170733`; bucket subfolders: logs, config, users)
- `key_name` – existing EC2 key pair name in AWS (same region), or `null` to launch without SSH key

Optionally set `default_allowed_cidr_blocks`, `alb_ssl_certificate_arn`, and `alb_blue_hostname` / `alb_green_hostname` for host-based Blue/Green routing (see below). Use **per-account** tfvars under `terraform/envs/<env>/` when using multiple AWS accounts.

#### 2. Initialize and plan

```bash
cd terraform   # or terraform/envs/aws4403 when using env-specific dir
terraform init
terraform plan -out=tfplan
```

Review the plan. It will create VPC, subnets, security groups, ALB, target groups, OSCAL Green/Blue **Auto Scaling Groups** (launch templates, optional persistent EBS, SSM document/association when enabled), S3 bucket, and IAM roles.

#### 3. Apply

```bash
terraform apply tfplan
```

Or, to approve in the same step:

```bash
terraform apply
```

#### 4. Outputs

After apply, Terraform prints outputs such as:

- `alb_dns_name` / `alb_url_http` – URL to access the app (HTTP). When `alb_ssl_certificate_arn` is set, use `alb_url_https` for HTTPS.
- `oscal_green_instance_id`, `oscal_blue_instance_id` – current EC2 instance IDs for each ASG (null until the group launches a member)
- `oscal_green_autoscaling_group_name`, `oscal_blue_autoscaling_group_name` – ASG names (for Console / CLI)
- `oscal_green_public_ip`, `oscal_blue_public_ip` – public IPs for SSH and deploy when the instance has a public IP
- `oscal_post_boot_ssm_document_name` – SSM Command document used by the periodic association
- `s3_logs_bucket_name` – S3 bucket for logs, config, and users

**AI:** Configure the OSCAL app to use **AWS Bedrock** (or Mistral API) via Settings → AI Integration or `config/app/config.json`. No OLLAMA_URL or Lambda is used; see [Amazon Bedrock setup](#amazon-bedrock-integration-step-by-step-aws-setup).

#### 5. Direct run on EC2 (default): config and S3

By default (`run_oscal_via_docker = false`), EC2 instances:

- Install **Node.js 20**.
- When **`oscal_persistent_ebs_enabled`** is true (default), attach and mount **dedicated gp3 data volumes** at **`/opt/oscal`** (same path for app and data). When false or in Docker mode, only the root volume is used.
- Store **config and users on EBS** at **/opt/oscal/data** (no S3 mount). **ec2_automation** (cron every 10 min) backs up config, users, and logs to S3 (`config/green/`, `config/blue/`, `logs/green/`, `logs/blue/`) so data is retained if instances are replaced (max 10 min loss).
- Run the app via **systemd** (`oscal-reporter.service`) after code is deployed.

To **deploy or update application code** after Terraform apply, keep using **`./scripts/deploy-to-ec2.sh`** from the repo root. That remains the intended path for real releases: full `rsync` of the repo, `npm install`, frontend build, `ec2_automation` setup, and `systemctl restart oscal-reporter`. **SSM** (optional `oscal_ssm_release_s3_prefix` and the periodic association) is only for light verification, optional artifact sync from a prefix in the logs bucket, and service nudges—not a substitute for this script when you need a normal code deploy.

Set **`TERRAFORM_DIR`** to your env (e.g. `export TERRAFORM_DIR=$PWD/terraform/envs/aws4403`) so Terraform outputs resolve to the current ASG instance IPs. SSH key from [Pass](https://www.passwordstore.org/) (e.g. `AWS/OSCAL-AWS4403-SSH`) or **`SSH_KEY_FILE`**.

```bash
export TERRAFORM_DIR=$PWD/terraform/envs/aws4403   # if not already the default
./scripts/deploy-to-ec2.sh --update-s3   # upload repo to s3://<bucket>/installer/ (once per release)
./scripts/deploy-to-ec2.sh --both        # Green + Blue pull installer/, build, restart (1.7.21+)
```

**Release 1.7.21:** Installer manifest `.installer-build.json` on S3 records package version; instances reconcile `package.json` on pull. Before deploy, ensure SSO/config backups under `config/active/` are current—force sync on deploy can overwrite local `config.json` with the newest S3 copy.

**Amazon Linux 2023 (Image Factory or native):** Use `SSH_USER=ec2-user ./scripts/deploy-to-ec2.sh`.

The deploy script syncs the repo to `/opt/oscal/app` on both instances, runs `npm install` and frontend build, copies the build into `backend/public`, writes **ec2_automation.env** (S3 bucket and paths for backup), installs **ec2_automation** cron, and restarts `oscal-reporter.service`. With **persistent EBS** mounted at `/opt/oscal`, the same paths apply; data under `/opt/oscal/data` survives instance replacement. To deploy to one role only (IPs from Terraform via `run-with-aws-pass.sh`):

```bash
export TERRAFORM_DIR=$PWD/terraform/envs/aws4403
./scripts/deploy-to-ec2.sh --green-only "$(./terraform/run-with-aws-pass.sh output -raw oscal_green_public_ip 2>/dev/null || ./terraform/run-with-aws-pass.sh output -raw oscal_green_private_ip)"
./scripts/deploy-to-ec2.sh --blue-only "$(./terraform/run-with-aws-pass.sh output -raw oscal_blue_public_ip 2>/dev/null || ./terraform/run-with-aws-pass.sh output -raw oscal_blue_private_ip)"
```

Config and users live on each instance at `/opt/oscal/data`; the deploy script does **not** sync them to S3 (ec2_automation performs backups every 10 min). To use **Docker on EC2** instead of direct run, set `run_oscal_via_docker = true` in `terraform.tfvars` and apply.

##### S3 backup layout (ec2_automation)

In the AWS S3 console, open your bucket → **`config`** or **`logs`** → **`green`** or **`blue`**. ec2_automation on each instance uploads:
- `config/green/config.json`, `config/green/users.json` (Green)
- `config/blue/config.json`, `config/blue/users.json` (Blue)
- `logs/green/`, `logs/blue/` (log files)

Terraform creates folder placeholders; ec2_automation populates them. For new instances, ensure `/opt/oscal/data/config.json` and `users.json` exist (e.g. copy from backup or create from examples) before or after first deploy.

#### Migrating Terraform state from standalone `aws_instance` to ASG

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


<a id="os-patching-ssm-patch-manager"></a>

### OS patching (SSM Patch Manager)

OSCAL Green/Blue instances are patched via **AWS Systems Manager Patch Manager**, not per-instance cron. Terraform provisions a patch baseline (Amazon Linux 2023), **Patch Group** tags on launch templates, and **maintenance windows** that run `AWS-RunPatchBaseline` with staggered schedules so Blue and Green are not patched on the same Mondays.

| Role | Maintenance windows (UTC) | Patch Group tag |
|------|---------------------------|-----------------|
| **Blue** | 1st and 3rd Monday at `oscal_os_patch_hour` (default 02:00) | `<project_name>-blue` |
| **Green** | 2nd and 4th Monday at `oscal_os_patch_hour` | `<project_name>-green` |

**Terraform variables** (see `terraform.tfvars.example`):

- `oscal_os_patch_enabled` (default `true`)
- `oscal_os_patch_hour` — UTC hour 0–23 (default `2`)
- `oscal_os_patch_reboot_option` — `RebootIfNeeded` (default) or `NoReboot`
- `oscal_os_patch_approval_days` — auto-approve patches within N days (default `7`)

**Central tracking:** AWS Console → **Systems Manager** → **Patch Manager** → **Compliance** / **Dashboard**. Run Command output is also written to `s3://<logs-bucket>/ssm-patch/blue/` and `.../green/` when maintenance tasks run.

**New ASG instances:** Launch templates add the `Patch Group` tag automatically; no manual crontab. **Existing instances** after `terraform apply` need the tag once (instance refresh, or tag manually) before the next maintenance window includes them.

**Remove legacy cron** (if you previously added manual root crontab entries):

```bash
sudo ./scripts/remove-legacy-os-patch-cron.sh
```

**Verify after apply:**

```bash
terraform output oscal_os_patch_baseline_id
terraform output oscal_os_patch_maintenance_window_ids
```

In the console: **Fleet Manager** → instances **Online**; **Patch Manager** → **Patch groups** shows `<project>-blue` and `<project>-green`.

**Reboot note:** With `RebootIfNeeded`, kernel updates may reboot the instance during the maintenance window. ALB health checks and ASG should replace unhealthy nodes; tune `oscal_asg_health_check_grace_period` if needed after large patch cycles.


#### Checklist: precautions, apply, and verification

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
- New resources should include **`aws_autoscaling_group`**, **`aws_launch_template`**, **`aws_autoscaling_attachment`**, optional **`aws_ebs_volume`**, **`aws_ssm_document`**, **`aws_ssm_association`**, and when `oscal_os_patch_enabled` is true: **`aws_ssm_patch_baseline`**, **`aws_ssm_patch_group`**, **`aws_ssm_maintenance_window`**.

**After apply**

1. **Outputs:** `terraform output` (via wrapper) — `oscal_green_instance_id`, `oscal_*_public_ip` / `private_ip` should be non-null once instances are **running** (ASG may take a few minutes).
2. **ALB targets:** EC2 → Target Groups → Green/Blue → targets **healthy** (HTTP `/health` on `oscal_app_port`, default 3020, per `alb.tf`).
3. **SSH / deploy:** `./scripts/deploy-to-ec2.sh` (or `--both`) so **`/opt/oscal/app`** matches your repo; restores full build after a fresh instance.
4. **Data:** If new persistent volumes are **empty**, seed **`/opt/oscal/data`** from S3 `config/<green|blue>/` or snapshots before expecting the app to serve traffic.
5. **SSM:** Systems Manager → **Run Command** / **Compliance** — association on document `oscal_post_boot_ssm_document_name` (output) should show successful invocations on tagged instances after ~30 minutes (or run the document manually once).
6. **Persistence:** On a **replacement** test (optional), terminate one instance in the ASG (console) and confirm a new instance attaches the **same** gp3 data volume and service recovers (only when `oscal_persistent_ebs_enabled` is true).

**Quick tests**

| Check | Command / action |
|--------|-------------------|
| ALB health | `curl -sS -o /dev/null -w "%{http_code}" "http://$(terraform output -raw alb_dns_name)/health"` (or HTTPS URL if cert in use); expect **200** from default routing or host rules. |
| Green direct | From a host allowed by SGs: `curl -sS -o /dev/null -w "%{http_code}" "http://<green-ip>:3020/health"` |
| Blue direct | `curl ... "http://<blue-ip>:3020/health"` |
| App UI | Open ALB URL or green/blue hostnames in browser; exercise login and one report path. |
| Logs | Instance: `journalctl -u oscal-reporter -n 50 --no-pager`; S3: `logs/green/` or `logs/blue/` after ec2_automation runs. |

**Launch template note:** Instances launched from the template are tagged with **`Stack = project_name`** explicitly (required for Terraform outputs, SSM association targets, and **`ec2:AttachVolume`** IAM conditions). Provider **`default_tags`** alone do not propagate to LT-launched instances.

#### Blue/Green host-based routing (optional)

To access Blue and Green with two different hostnames (e.g. `blue.oscal.example.com` and `green.oscal.example.com`) so both run the same app at `/` with no application code changes:

1. Set in `terraform.tfvars`: `alb_blue_hostname = "blue.oscal.example.com"` and `alb_green_hostname = "green.oscal.example.com"` (use your own domain).
2. Create **CNAME** DNS records: `blue.oscal.example.com` and `green.oscal.example.com` both pointing to the ALB DNS name (output `alb_dns_name`).
3. Run `terraform apply`. The ALB will route by **Host** header: requests to the blue hostname go to Blue, requests to the green hostname go to Green. Default action (e.g. raw ALB DNS) forwards with weighted Green/Blue routing.

For HTTPS, use an ACM certificate that covers both hostnames (e.g. wildcard `*.oscal.example.com` or a cert with both SANs).

#### ALB without ACM (HTTP-only testing)

If your organisation does not authorize `acm:RequestCertificate`, you can establish and test the ALB using **HTTP only**. No Terraform code changes are required.

1. **In your env’s `terraform.tfvars`** (e.g. `terraform/envs/aws4403/terraform.tfvars`), set:
   - `create_alb_certificate = false` – Terraform will not create an ACM certificate (no `acm:RequestCertificate` call).
   - `alb_ssl_certificate_arn = null` – no existing cert attached.
   - `alb_allow_http_for_testing = true` – ALB security group allows port 80 from `default_allowed_cidr_blocks` so you can reach the ALB for testing.
2. **Apply:** From repo root with `TERRAFORM_DIR` set to your env (e.g. `terraform/envs/aws4403`), run `./terraform/run-with-aws-pass.sh apply`.
3. **Use the ALB:** After apply, run `terraform output alb_url_http` (or `alb_dns_name`). From a machine whose IP is in `default_allowed_cidr_blocks`, open **http://&lt;alb_dns_name&gt;** in a browser or run `curl http://&lt;alb_dns_name&gt;/health`.
4. **If direct instance URLs work (e.g. http://&lt;green-ip&gt;:3020) but the ALB URL does not:** The ALB allows port 80 only from `default_allowed_cidr_blocks`. Add your current public IP (run `curl -s ifconfig.me` to see it) as `"x.x.x.x/32"` in `default_allowed_cidr_blocks` in tfvars, then run `terraform apply` again. Also check in the AWS Console that the ALB target groups show the ASG-registered targets as **Healthy** (Targets tab); if they are Unhealthy, the ALB returns 503.
5. **Add a certificate later:** When your organisation provides an ACM certificate (same account/region), set `alb_ssl_certificate_arn = "arn:aws:acm:us-east-1:ACCOUNT:certificate/CERT_ID"` in tfvars, keep `create_alb_certificate = false`, and run `terraform apply` again. Terraform will add the HTTPS listener (443) and HTTP→HTTPS redirect; no ACM request is made.

**Corporate PKI (Adobe PLM):** CSR, private key, and issued cert storage paths, PLM portal, and cutover from Let's Encrypt are documented in [TLS_CERTIFICATE_AND_PKI.md](TLS_CERTIFICATE_AND_PKI.md). Request audit log: [logs/SSL_CERT_PKI_REQUEST_2026-05-27.md](../logs/SSL_CERT_PKI_REQUEST_2026-05-27.md).

**Let's Encrypt and import into ACM:** If you use Let's Encrypt (e.g. when ACM *request* is not allowed but ACM *import* is), run the script `scripts/debug/letsencrypt-acm-import.sh` from the repo root. It uses **manual DNS-01** validation: you add the TXT record in Route53 yourself (Route53 may be in a different AWS account; the script prompts you with exact steps). The script then imports the issued cert into ACM and can update your env's `terraform.tfvars` with the new cert ARN. Prerequisites: `certbot` installed, AWS CLI credentials for the ALB account (Pass entry `AWS/AMS_4403-STG` or env). See the script header for usage and environment variables.

#### HTTPS setup (ACM and HTTP-to-HTTPS redirect)

To serve the app over HTTPS with an AWS-issued certificate and redirect all HTTP traffic to HTTPS:

1. **Request an ACM certificate** (AWS Console → Certificate Manager, or CLI) for a **custom domain** you own (e.g. `oscal.example.com`). ACM does **not** issue certificates for the default ALB DNS name (e.g. `ams-oscal-alb-....elb.amazonaws.com`). Create the certificate in the **same region** as the ALB (e.g. us-east-1).
2. **Validate the certificate** via DNS (add the CNAME record ACM provides) or email.
3. **Create a CNAME** (or Route53 alias): your custom domain → ALB DNS name (output `alb_dns_name`). Example: `oscal.example.com` → `ams-oscal-alb-94037178.us-east-1.elb.amazonaws.com`.
4. **Set in `terraform.tfvars`:** `alb_ssl_certificate_arn = "arn:aws:acm:region:account:certificate/id"` (use the ARN from Certificate Manager). Optionally set `alb_green_hostname` and `alb_blue_hostname` for green/blue hostnames (use the same cert with SANs or a wildcard).
5. **Apply:** `terraform apply`. The ALB will have an HTTPS listener on port 443 using the ACM certificate. The HTTP listener (port 80) will **redirect** all requests to HTTPS (301). Use `alb_url_https` output or `https://your-domain.com`.
6. **Use:** `https://your-domain.com` for production. HTTP requests to the ALB (e.g. `http://your-domain.com`) will redirect to `https://your-domain.com`.

**Direct instance URLs (IP:3020):** AWS ACM certificates cannot be installed on EC2 instances; ACM works only with AWS services (ALB, CloudFront, API Gateway). To access Green or Blue over HTTPS, use **ALB hostnames** (`alb_green_hostname`, `alb_blue_hostname`) with a CNAME to the ALB and the same ACM cert—traffic is then HTTPS via the ALB. The raw IP:port URLs (e.g. `http://<green-ip>:3020`, `http://<blue-ip>:3020`) remain HTTP and are suitable for debug or internal use only.

#### PCL auto-remediation: ALB security group (recovery)

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

2. If you use a different Terraform working directory, set `TERRAFORM_DIR` to that directory and use the matching Pass entry for that account.

**Reducing recurrence:** Prefer **/32** entries in `default_allowed_cidr_blocks` (e.g. known VPN egress IPs) to avoid "broad CIDR" quarantine. Replace any /24 or larger ranges with /32 or the smallest range you actually need, then run `terraform apply`.


### Key variables

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

See `terraform/variables.tf` and `terraform/terraform.tfvars.example` (or `terraform/envs/<env>/`) for the full list. **AI** is via AWS Bedrock or Mistral API; configure in the app (Settings or config.json). See [Amazon Bedrock setup](#amazon-bedrock-integration-step-by-step-aws-setup).


### Troubleshooting: Access broken (direct instances and ALB)

When **all** of the following are unreachable — `http://<green-ip>:3020/`, `http://<blue-ip>:3020/`, and `https://<alb-dns-name>/`:

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

**4. ALB works but direct instance URLs (http://&lt;green-ip&gt;:3020, http://&lt;blue-ip&gt;:3020) are broken**  
The ALB and the instances use the same `default_allowed_cidr_blocks`; if the ALB is reachable, your IP is in the list. Direct access is allowed by the **OSCAL** security group (app port 3020). If that SG is out of sync (e.g. a previous apply failed after updating the ALB SG, or rules were changed in the console), the OSCAL SG may be missing your CIDR.

- **Fix:** Run `terraform apply` again so the OSCAL security group is updated to match `default_allowed_cidr_blocks` (e.g. `TERRAFORM_DIR=$PWD/terraform/envs/aws4403 ./terraform/run-with-aws-pass.sh apply`).
- **Verify:** In AWS Console, **EC2 → Security Groups** → find the OSCAL SG (name like `ams-oscal-reports-oscal-*`) → **Inbound rules** → confirm there is a rule for port **3020** from your IP or CIDR (e.g. `203.191.182.150/32`). If that rule is missing, apply again or fix drift.

---

### Troubleshooting: 503 Service Unavailable

The ALB returns **503 Service Temporarily Unavailable** when the target group that was selected for the request has **no healthy targets**. Even if one instance (e.g. Blue) is up and responding, you can still see 503 in these cases:

1. **You are using the Green hostname**  
   If `alb_green_hostname` is set (e.g. `green.oscal.example.com`), requests to that host go **only** to the Green target group (priority 100). If Green has no healthy targets (instance down, app not on 3020, or `/health` failing), the ALB returns 503. Blue being healthy does not help for that hostname.

2. **Both target groups are unhealthy**  
   The default action forwards with weights (50/50 or 99/1 Green/Blue). The ALB only routes to healthy targets; if **both** Green and Blue have no healthy targets, every request gets 503.

3. **Blue is unhealthy in the ALB’s view**  
   “Blue works” from your laptop (e.g. `curl http://blue-ip:3020/health`) can still be **Unhealthy** in the target group if the ALB health check fails (e.g. health checks use the instance **private** IP from inside the VPC; security group or app binding could differ).

**What to do**

- **Check target health**  
  From the repo root (with Terraform applied and AWS credentials as for Terraform):

  ```bash
  # Example: list target health (replace TG_ARN from EC2 → Target Groups, or from terraform state)
  aws elbv2 describe-target-health --target-group-arn "<TARGET_GROUP_ARN>" --region "<AWS_REGION>"
  ```

  Or in the AWS Console: **EC2 → Target Groups →** select the Green/Blue target groups and open the **Targets** tab to see Healthy/Unhealthy.

- **Use the Blue URL when only Blue is up**  
  If Green is unhealthy, use the **Blue** URL (e.g. `alb_blue_hostname` or the main ALB URL). With weighted forwarding, the ALB sends traffic only to healthy target groups, so the main ALB URL will use Blue if Green has no healthy targets. If you were using the **Green** hostname, switch to the Blue hostname or the main ALB DNS name.

- **Fix Green so both are healthy**  
  On each instance: ensure the app is listening on **port 3020**, bound to **0.0.0.0** (not only 127.0.0.1), and that `GET http://<instance-private-ip>:3020/health` returns **200**. Security groups allow the ALB to reach instances on 3020.

### Remote state (optional)

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

### Destroy and S3 bucket

When you run **`terraform destroy`**, the S3 bucket created by the template is **not** deleted if it is non-empty. Empty the bucket (e.g. in AWS Console or `aws s3 rm s3://bucket-name --recursive`) then run destroy again if needed. See `terraform/s3.tf` for details. Logs, config, and users in S3 should be backed up or migrated before destroy if required.

### Validation

From the `terraform/` directory (requires [Terraform](https://www.terraform.io/downloads) 1.x installed):

```bash
terraform init
terraform validate
terraform plan
```

`terraform validate` checks configuration syntax and internal consistency. `terraform plan` requires variables (`key_name`, `s3_logs_bucket_name`) to be set (e.g. via `terraform.tfvars` or `-var`).

### References

- [docs/diagrams/generate-diagram.html](diagrams/generate-diagram.html) – architecture diagram
- [AWS cost estimate](#aws-ec2-cost-estimate-for-oscal-report-generator-ollama) – cost breakdown
- [CLOUD_DEPLOYMENT.md](CLOUD_DEPLOYMENT.md) – general cloud deployment options

---

<a id="adobe-image-factory-ami-usage-for-terraform"></a>

## Adobe Image Factory – AMI usage for Terraform

EC2 instances use **Adobe Image Factory Amazon Linux 2023** when AMI IDs are provided; otherwise **native Amazon Linux 2023** is used.

### EC2 instance preference (Graviton then AMD)

Preferred instance families for OSCAL Green/Blue:

1. **Graviton (t4g)** – preferred: set `instance_type = "t4g.small"` and `instance_architecture = "arm64"` (Terraform defaults). Use an ARM64 AMI (Image Factory or native Amazon Linux 2023 for arm64).
2. **AMD (t3a)** – fallback: set `instance_type = "t3a.small"` and `instance_architecture = "x86_64"`. Use an x86_64 AMI.

Ensure the AMI you use matches `instance_architecture` (arm64 for t4g, x86_64 for t3a). Image Factory and native Amazon Linux 2023 are available for both architectures.

### References

- **Wiki:** [Adobe Image Factory](https://wiki.corp.adobe.com/pages/viewpage.action?spaceKey=imagefactory&title=Adobe+Image+Factory) – overview, process, and how to find approved AMIs.
- **UI:** [Adobe Image Factory UI](https://imagefactory.corp.adobe.com/imagefactoryui/ui/) – browse and select released images (filter by AWS, **Amazon Linux 2023**).
- **EMR flavor (InfraSec):** [Amazon Linux 2023 EMR](https://imagefactory.corp.adobe.com/imagefactoryui/ui/flavor?orgName=DME&ownerTeamName=ImageFactory&typeName=aws&flavorName=Amazon%20Linux%202023%20EMR) – use the **latest** released AMI for your region and architecture when remediating tickets such as **SSAAU-169** (AMS-OSCAL-Reporter). “EMR” here is the Image Factory **flavor name**, not AWS EMR clusters.

### Amazon Linux 2023 EMR vs generic AL2023

InfraSec vulnerability tickets often require the **Amazon Linux 2023 EMR** Image Factory build so host scanning (CrowdStrike Spotlight / Nexpose) aligns with Adobe’s hardened image line.

- **Pinning (recommended):** In `terraform.tfvars`, set `image_factory_amazon_linux_ami_us_east_1 = "ami-..."` (for `aws_region = "us-east-1"`) to the **latest EMR** AMI ID from the Image Factory UI. Match **`instance_architecture`** (`arm64` for Graviton / `x86_64` for AMD) to the AMI.
- **Discovery (CLI):** With AWS credentials for the target account, run from the repo root:
  ```bash
  ./terraform/scripts/list-emr-candidate-amis.sh us-east-1 x86_64
  # or: ./terraform/scripts/list-emr-candidate-amis.sh us-east-1 arm64
  ```
  Pick the newest row that matches the EMR flavor you selected in Image Factory, then paste its `ami-*` into `terraform.tfvars`.
- **If you omit a pinned Image Factory AMI** and do not configure dynamic lookup (`image_factory_owner_id` + `image_factory_ami_name_pattern`), Terraform falls back to **Amazon-owned** `al2023-ami-*`. That is still “Amazon Linux 2023” in AWS but **may not satisfy** EMR-specific InfraSec asks—always pin EMR for AMS production/stage when the ticket requires it.

### AMI selection: Image Factory Amazon Linux 2023, then native Amazon Linux 2023

The template **prefers Adobe Image Factory Amazon Linux 2023** when AMI IDs are added in `image_factory_amazon_linux_by_region`. **When the map is empty or has no entry for your region, native Amazon Linux 2023 is used.**

**OSCAL (Green/Blue) and Ollama use the same AMI chain:** 1) optional override (`oscal_ami_id` / `ollama_ami_id`), 2) Image Factory Amazon Linux 2023 when in map, 3) native Amazon Linux 2023. There is no separate RHEL9 path for Ollama in the current template.

- **Default (`use_image_factory_ami = true`)**: Use **Image Factory Amazon Linux 2023** if an AMI ID exists in `image_factory_ami.tf` for your region; otherwise use **native Amazon Linux 2023**.
- **`use_image_factory_ami = false`**: Use **only native Amazon Linux 2023** (e.g. sandbox without Image Factory access).

### First choice: Adobe Image Factory Amazon Linux 2023

Add **Image Factory Amazon Linux 2023** AMI IDs by region in `terraform/image_factory_ami.tf` in the map `image_factory_amazon_linux_by_region`. Get AMI IDs from [Image Factory UI](https://imagefactory.corp.adobe.com/imagefactoryui/ui/) (filter by AWS, Amazon Linux 2023). When an entry exists for your `aws_region`, that AMI is used. When the map is empty or has no entry for your region, **native Amazon Linux 2023** is used (maintained by Amazon).

For other regions, set `oscal_ami_id` and `ollama_ami_id` explicitly in `terraform.tfvars`.

### Troubleshooting

#### "Not authorized for images: [ami-xxxxxxxx]"

The Image Factory AMI may be in a different AWS account. Your account (e.g. 442277170733) must have **launch permission** for that AMI (owner shares the AMI with your account in EC2 → AMI → Permissions).

**Fix:** Set **`use_image_factory_ami = false`** in `terraform.tfvars` to **skip Image Factory** and use **only native Amazon Linux 2023**. No Image Factory access is required. After the Image Factory AMI is shared with your account for your region, set `use_image_factory_ami = true` (default) again and apply; the template will prefer Image Factory and fall back to native Amazon Linux only if needed.

#### "AMIs are shared with me but my project is not picking up Image Factory images"

**Cause:** Terraform only uses the Image Factory AMI map when **`use_image_factory_ami = true`**. If this variable is missing or set to `false`, the template uses Amazon Linux 2023 and never tries the Image Factory AMIs.

**Fix:** In `terraform.tfvars` set:
```hcl
use_image_factory_ami = true
```
Leave `oscal_ami_id` and `ollama_ami_id` as **null**. Then run `terraform plan` / `terraform apply`. The template will use the built-in region map (or optional dynamic lookup; see below).

### How to use Image Factory in this template

1. **Set variables in `terraform.tfvars`**
   - **Default (`use_image_factory_ami = true`)**: **First choice** = Image Factory Amazon Linux 2023 (add AMI IDs in `image_factory_ami.tf` when available), **else** native Amazon Linux 2023. Leave `oscal_ami_id` and `ollama_ami_id` **null**:
   ```hcl
   aws_region             = "us-east-1"
   use_image_factory_ami   = true   # Image Factory Amazon Linux 2023 when in map; else native Amazon Linux 2023
   # oscal_ami_id and ollama_ami_id left null → Image Factory AL2023 or native AL2023
   ```
   - **`use_image_factory_ami = false`**: Use **only native Amazon Linux 2023** (vanilla Amazon-maintained); no Image Factory.
   - Or override with a specific AMI:
   ```hcl
   oscal_ami_id  = "ami-xxxxxxxx"   # optional override
   ollama_ami_id = "ami-xxxxxxxx"   # optional override
   ```

2. **Apply**
   - Run `./run-with-aws-pass.sh plan` then `./run-with-aws-pass.sh apply`.
   - User_data uses `dnf` (Amazon Linux 2023–compatible).

#### Optional: dynamic lookup (automation_framework style)

If you prefer to resolve the **latest** Image Factory AMI by owner and name (e.g. to align with [automation_framework](https://git.corp.adobe.com/spartans/automation_framework/tree/main/terraform/templates)), set in `terraform.tfvars`:

```hcl
use_image_factory_ami          = true
image_factory_owner_id         = "<AWS_ACCOUNT_ID_OWNING_AMIS>"   # e.g. Image Factory account
image_factory_ami_name_pattern = "<NAME_PATTERN>"                # e.g. "Adobe*Amazon*Linux*"
```

Terraform will use `data "aws_ami"` with `most_recent = true` and the given owner + name filter instead of the static map. Use a pattern that matches **only** the EMR line you intend (e.g. include `*EMR*` in the pattern if Image Factory AMI names include it). Leave both **null** to use the built-in static map (Image Factory Amazon Linux 2023 when in map; else native Amazon Linux 2023).

### S3 bucket naming (AMS)

S3 bucket names **must be lowercase**. Use the AMS prefix, e.g. in `terraform.tfvars`:

```hcl
s3_logs_bucket_name = "ams-oscal-442277170733"
```

(Terraform will lowercase the value if you use uppercase.)

### If the running Ollama instance is still RHEL9

The Terraform template uses the **same** AMI resolution for Ollama as for Green/Blue (Image Factory Amazon Linux 2023 when in map, else native Amazon Linux 2023). A running Ollama instance can still be RHEL9 if:

- It was launched from an **older** apply (e.g. before the template was aligned, or when `ollama_ami_id` was set to a RHEL9 AMI).
- The ASG does not replace existing instances when only the launch template AMI changes; the **next new** instance (after scale 0→1) will use the current template.

**To align Ollama with Green/Blue on Image Factory Amazon Linux 2023:**

1. In `terraform.tfvars`, set **`image_factory_amazon_linux_ami_us_east_1 = "ami-xxxxxxxx"`** with the Adobe Image Factory Amazon Linux 2023 AMI ID for us-east-1 (from [Image Factory UI](https://imagefactory.corp.adobe.com/imagefactoryui/ui/)). Leave `oscal_ami_id` and `ollama_ami_id` **null** so Green, Blue, and Ollama all use this AMI.
2. Run **`terraform apply`** (e.g. `cd terraform && ./run-with-aws-pass.sh apply -auto-approve`) so the launch templates are updated.
3. Replace the Ollama instance so the new one uses the new AMI: set ASG desired capacity to 0, wait for termination, set to 1, then complete any remaining Ollama bootstrap on the new instance per your runbook (legacy; Ollama was removed in favor of Bedrock—see [Amazon Bedrock Integration](#amazon-bedrock-integration-step-by-step-aws-setup)).

### Summary

| Item | Action |
|------|--------|
| AMI preference | **First choice:** Adobe Image Factory **Amazon Linux 2023 EMR** (or approved AL2023) when pinned or resolved. **Fallback:** native Amazon Linux 2023. **Ollama and OSCAL use the same chain.** |
| Where to find AMIs | [Image Factory UI](https://imagefactory.corp.adobe.com/imagefactoryui/ui/) — **EMR:** [Amazon Linux 2023 EMR flavor](https://imagefactory.corp.adobe.com/imagefactoryui/ui/flavor?orgName=DME&ownerTeamName=ImageFactory&typeName=aws&flavorName=Amazon%20Linux%202023%20EMR) |
| SSAAU-169 / InfraSec | Pin latest EMR `ami-*` in `terraform.tfvars`; run `terraform/scripts/list-emr-candidate-amis.sh` to list candidates; replace EC2 via `terraform apply`. |
| Terraform variables | `use_image_factory_ami` (default **true** = Image Factory Amazon Linux 2023 when in map, else native AL2023); `oscal_ami_id`, `ollama_ami_id` (null = use preference order) |
| Add Image Factory Amazon Linux | In `terraform.tfvars` set `image_factory_amazon_linux_ami_us_east_1 = "ami-xxxxxxxx"` (from Image Factory UI), or add entries in `terraform/image_factory_ami.tf` in `image_factory_amazon_linux_by_region`. Both Green/Blue and Ollama use it. |
| Replace Ollama instance for new AMI | Legacy Ollama path only; current stacks use Bedrock (see [Amazon Bedrock Integration](#amazon-bedrock-integration-step-by-step-aws-setup)). |
| Bucket naming | Lowercase; AMS prefix `ams-oscal-<account-id>` (e.g. `ams-oscal-442277170733`). Terraform lowercases the value. |

---

<a id="amazon-bedrock-integration-step-by-step-aws-setup"></a>

## Amazon Bedrock Integration – Step-by-Step AWS Setup

This guide walks you through setting up **AWS** so the OSCAL Report Generator’s AI integration can call **Amazon Bedrock** and use supported LLM models (e.g. Mistral, Claude, Gemma) for control implementation suggestions.

---

### Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Step 1: Choose an AWS Region](#step-1-choose-an-aws-region)
- [Step 2: Enable Amazon Bedrock and Request Model Access](#step-2-enable-amazon-bedrock-and-request-model-access)
- [Step 3: Create an IAM User and Policy for Bedrock](#step-3-create-an-iam-user-and-policy-for-bedrock)
- [Step 4: Create Access Keys and Store Them Securely](#step-4-create-access-keys-and-store-them-securely)
- [Step 5: Configure the Application](#step-5-configure-the-application)
- [Step 6: Verify the Integration](#step-6-verify-the-integration)
- [Using multiple models (e.g. Gemma)](#using-multiple-models-eg-gemma)
- [Troubleshooting](#troubleshooting)
- [Cross-account and network access](#cross-account-and-network-access)
- [AWS Cloud Shell / CLI Commands](#aws-cloud-shell--cli-commands)
- [References](#references)

---

### Overview

The application uses the **Bedrock Runtime Converse API** (`InvokeModel` via the Converse API). It needs:

- **IAM**: A user (or role) with permission to call `bedrock:InvokeModel` in your chosen region.
- **Credentials**: AWS Access Key ID and Secret Access Key (or equivalent, e.g. role credentials when running on AWS).
- **Config**: `provider: "aws-bedrock"`, `awsRegion`, `bedrockModelId`, and credentials (in app config or via Settings UI).

Supported model families and routing are described in [AI integration – models and configuration](AI_INTEGRATION.md#ai-models-and-configuration).

---

### Prerequisites

- An **AWS account** with permissions to create IAM users and policies and to use Bedrock.
- **AWS Console** access (or AWS CLI) for the steps below.
- The application already has the Bedrock SDK dependency: `@aws-sdk/client-bedrock-runtime` (see `backend/package.json`).

---

### Step 1: Choose an AWS Region

Bedrock and model availability are **region-specific**. Use a region where the models you want are available.

- **Common regions**: `us-east-1` (N. Virginia), `us-west-2` (Oregon), `eu-west-1` (Ireland).
- Check current offerings: [AWS Console → Amazon Bedrock → Model access](https://console.aws.amazon.com/bedrock/) (left menu: **Model access**), or the [Bedrock user guide](https://docs.aws.amazon.com/bedrock/latest/userguide/models-regions.html).

**Example**: `us-east-1`. Use this value for `awsRegion` in the app config.

---

### Step 2: Enable Amazon Bedrock and Request Model Access

1. **Open Bedrock in the correct region**
   - AWS Console → switch region (top-right) to your chosen region (e.g. **us-east-1**).
   - Search for **Amazon Bedrock** and open it.

2. **Enable Bedrock and request models**
   - In the left menu, go to **Model access** (under **Settings** or **Get started**).
   - **Enable** Amazon Bedrock for your account in this region if prompted.
   - For each **foundation model** you want to use (e.g. Mistral Large, Claude, Gemma), click **Manage model access** (or **Request model access**) and **Enable** the model.
   - Model IDs you’ll use in the app look like:
     - Mistral: `mistral.mistral-large-2402-v1:0`, `mistral.mixtral-8x7b-v0:1`
     - Anthropic Claude: `anthropic.claude-3-sonnet-20240229-v1:0`, `anthropic.claude-3-haiku-20240307-v1:0`
     - Meta Llama: `meta.llama3-70b-instruct-v1:0`
     - Google Gemma: `google.gemma-3-12b-it`, `google.gemma-3-4b-it`
   - Wait until the model status is **Access granted** (can take a few minutes).

3. **Note the exact model ID**
   - Use the **Model ID** shown in the console (e.g. `mistral.mistral-large-2402-v1:0`) as `bedrockModelId` in the app. The router uses names containing `mistral`/`mixtral` for Mistral service and `gemma` for Gemma service; see [AI integration – models and configuration](AI_INTEGRATION.md#ai-models-and-configuration).

---

### Step 3: Create an IAM User and Policy for Bedrock

Use a dedicated IAM user (or role) with least privilege: only Bedrock invoke in the chosen region.

1. **Create an IAM policy**
   - IAM → **Policies** → **Create policy**.
   - **JSON** tab, use a policy like (replace `REGION` and `ACCOUNT_ID` if you want to restrict further; or use `*` for region/account for simplicity in a single-account setup):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "BedrockInvokeModel",
         "Effect": "Allow",
         "Action": [
           "bedrock:InvokeModel",
           "bedrock:InvokeModelWithResponseStream"
         ],
         "Resource": "arn:aws:bedrock:REGION::foundation-model/*"
       }
     ]
   }
   ```

   - **Example for us-east-1, all foundation models**:  
     `"Resource": "arn:aws:bedrock:us-east-1::foundation-model/*"`
   - Name the policy (e.g. `OSCAL-BedrockInvoke`) and create it.

2. **Create an IAM user**
   - IAM → **Users** → **Create user** (e.g. `oscal-bedrock-app`).
   - **Attach policies directly** → select the policy you created (e.g. `OSCAL-BedrockInvoke`).
   - Create the user.

This user will only be able to call Bedrock’s invoke APIs in the specified region(s), which is sufficient for the app.

**Using Gemma (and other models) with the same user:** The policy uses `arn:aws:bedrock:REGION::foundation-model/*`, so **one user can invoke any foundation model** (Mistral, Gemma, Claude, Llama, etc.) in that region. You do **not** need a new IAM user or policy to add Gemma. You only need to (1) enable the Gemma model in Bedrock (Model access), and (2) set `bedrockModelId` to a Gemma model ID in the app when you want to use Gemma. See [Using multiple models (e.g. Gemma)](#using-multiple-models-eg-gemma) below.

---

### Step 4: Create Access Keys and Store Them Securely

1. **Create access key for the IAM user**
   - IAM → **Users** → select the user (e.g. `oscal-bedrock-app`) → **Security credentials** tab.
   - **Access keys** → **Create access key**.
   - Choose **Application running outside AWS** (or as appropriate).
   - Create the key; **download or copy the Access Key ID and Secret Access Key once**. The secret is not shown again.

2. **Store credentials securely**
   - **Do not** commit keys to git or put them in plain text in config that is committed.
   - Prefer:
     - **Settings UI**: Enter in the AI Integration screen (stored in your app config; ensure config and backups are protected and access is restricted).
     - **Config file**: Use `config/app/config.json` with file permissions restricted, or use pointers to a secret manager (e.g. [pass](https://www.passwordstore.org/) as in [DEPLOYMENT.md](DEPLOYMENT.md): e.g. `"_pass": "OSCAL/ai-aws-access-key-id"` and `"_pass": "OSCAL/ai-aws-secret-access-key"`).
   - For production, use a secret manager (AWS Secrets Manager, HashiCorp Vault, or your org’s standard) and resolve credentials at runtime; the app expects `awsAccessKeyId` and `awsSecretAccessKey` in the config object it receives (see [Step 5](#step-5-configure-the-application)).

---

### Step 5: Configure the Application

Provide Bedrock as the AI provider and the required parameters.

**Option A – Settings UI (recommended for quick setup)**

1. Log in as an admin.
2. Open **Settings** → **AI Integration**.
3. Set:
   - **Provider**: **AWS Bedrock**.
   - **AWS Region**: e.g. `us-east-1`.
   - **Bedrock Model ID**: e.g. `mistral.mistral-large-2402-v1:0` (must match a model you enabled in [Step 2](#step-2-enable-amazon-bedrock-and-request-model-access)).
   - **AWS Access Key ID** and **AWS Secret Access Key**: the keys from [Step 4](#step-4-create-access-keys-and-store-them-securely).
4. Save. The app will persist these in `config/app/config.json` (or your configured config store).

**Option B – Config file**

Edit `config/app/config.json` (or the config that your deployment uses) so that the AI section looks like this (credentials can be replaced by env or secret-manager resolution if your setup supports it):

```json
{
  "aiConfig": {
    "enabled": true,
    "provider": "aws-bedrock",
    "awsRegion": "us-east-1",
    "awsAccessKeyId": "YOUR_ACCESS_KEY_ID",
    "awsSecretAccessKey": "YOUR_SECRET_ACCESS_KEY",
    "bedrockModelId": "mistral.mistral-large-2402-v1:0",
    "timeout": 120000
  }
}
```

- Use the **exact** `bedrockModelId` from the Bedrock console.
- For **Gemma**-based models, set `bedrockModelId` to a Gemma model ID (e.g. `google.gemma-3-12b-it` or `google.gemma-3-4b-it`); the app will route to the Gemma service. See [AI integration – models and configuration](AI_INTEGRATION.md#ai-models-and-configuration).

**Option C – Environment variables (if your config layer supports it)**

Some deployments resolve secrets from the environment. The app itself reads from the resolved `aiConfig` (e.g. from `configManager`). If your config builder maps environment variables into `aiConfig`, you could use e.g.:

- `AWS_REGION` or `AWS_DEFAULT_REGION` (documented in [ARCHITECTURE.md](ARCHITECTURE.md))
- AWS credentials: typically `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (if your config populates `aiConfig.awsAccessKeyId` and `aiConfig.awsSecretAccessKey` from these).

Ensure the backend is restarted (or config reloaded) after changes.

**Where Bedrock credentials (Access Key ID and Secret) are stored**

- **Config file** (`config/app/config.json`) never holds the actual secret values when using [pass](https://www.passwordstore.org/). It only holds **pointers** like `{ "_pass": "AWS/1590_Oz_Stage/BEDROCK-01" }` for `awsAccessKeyId` and `{ "_pass": "AWS/1590_Oz_Stage/BEDROCK-02" }` for `awsSecretAccessKey`. At runtime the backend runs `pass show <entry>` and substitutes the value.
- **Actual storage** is in **pass** at the paths you set:
  - If you use custom pass entries (e.g. `AWS/1590_Oz_Stage/BEDROCK-01` and `BEDROCK-02`), the Access Key ID and Secret are stored only there. They do **not** appear under `OSCAL/` in `pass ls`; they appear under `AWS/1590_Oz_Stage/`.
  - If you **type** credentials in the Settings UI and click **Save**, the app writes them into pass at **`OSCAL/ai-aws-access-key-id`** and **`OSCAL/ai-aws-secret-access-key`** (and updates config to point to those). So after a save from the UI, `pass ls OSCAL/` would show those entries.
- To use credentials that already live in pass under a different path (e.g. `AWS/1590_Oz_Stage/BEDROCK-01`), edit `config/app/config.json` and set `aiConfig.awsAccessKeyId` and `aiConfig.awsSecretAccessKey` to `{ "_pass": "AWS/1590_Oz_Stage/BEDROCK-01" }` and `{ "_pass": "AWS/1590_Oz_Stage/BEDROCK-02" }` (or your paths). Do not overwrite by saving from the UI with new typed values, or the app will write to `OSCAL/ai-aws-*` and replace the pointers.

---

### Step 6: Verify the Integration

1. **Backend**
   - Restart the backend so it loads the new config (or use your app’s config reload if available).

2. **Status endpoint**
   - Call `GET /api/ai/status` (with auth if required). You should see `provider: "aws-bedrock"` and no error reason; the app may report that credentials are not validated until the first call.

3. **Connection test from the UI**
   - In **Settings** → **AI Integration**, use the **Test connection** (or equivalent) control. It should call Bedrock with a small prompt and report success or a clear error.

4. **Generate a suggestion**
   - Open a control and trigger an AI-generated implementation suggestion. The first successful call confirms that Bedrock and the chosen model are working.

If you see **Access Denied**, check IAM policy and that the correct access key is used. If you see **Model not found**, confirm the model ID and that the model is enabled in that region (Step 2).

---

### Using multiple models (e.g. Gemma)

**IAM:** You do **not** need to create a new user or change the IAM policy. The policy `arn:aws:bedrock:REGION::foundation-model/*` allows invoking **all** foundation models in that region (Mistral, Gemma, Claude, Llama, etc.). The same user can call any of them.

**To use Gemma (or another model family) with the same user:**

1. **Enable the model in Bedrock**  
   In the **Bedrock** console (same region as your `awsRegion`): **Model access** → find the Gemma model(s) you want (e.g. **Gemma 3 12B**, **Gemma 3 4B**) → **Enable** / request access. Wait until access is granted. Note the exact **Model ID** (e.g. `google.gemma-3-12b-it`, `google.gemma-3-4b-it`).

2. **Switch the app to that model**  
   In **Settings** → **AI Integration** (or in `config/app/config.json`):
   - Keep **Provider**: **AWS Bedrock**.
   - Set **Bedrock Model ID** to the Gemma model ID (e.g. `google.gemma-3-12b-it` or `google.gemma-3-4b-it`).
   - Keep the same **AWS Region** and credentials (same user).

3. **No code or IAM change**  
   The app’s router detects the model family from `bedrockModelId`: if it contains `gemma`, requests go to the Gemma service; if it contains `mistral` or `mixtral`, they go to the Mistral service. You can switch between Mistral and Gemma anytime by changing only `bedrockModelId`.

**Summary:** Same user, same credentials; enable the Gemma model in Bedrock, then set `bedrockModelId` to the Gemma model ID when you want to use Gemma.

---

### Troubleshooting

| Symptom | What to check |
|--------|----------------|
| **AccessDeniedException** | IAM user has `bedrock:InvokeModel` (and optionally `bedrock:InvokeModelWithResponseStream`) on `arn:aws:bedrock:REGION::foundation-model/*`; correct keys and region in config. |
| **ResourceNotFoundException** | Model ID matches the console exactly; model is **Enabled** in **Model access** in the same region as `awsRegion`. |
| **ThrottlingException** | Request limits for the model in that region; retry with backoff or request a quota increase. |
| **Credentials not configured** | `awsAccessKeyId` and `awsSecretAccessKey` are both set in the config the app reads (Settings or config file / secret resolution). |
| **AWS SDK not installed** | Run `npm install @aws-sdk/client-bedrock-runtime` in the backend directory and restart. |

For more on AI configuration and model families, see [AI integration – models and configuration](AI_INTEGRATION.md#ai-models-and-configuration) and [AI integration – architecture and security](AI_INTEGRATION.md#ai-integration-architecture-security-design).

---

### Cross-account Bedrock — Terraform and Account B runbook

**Phase 1 (infrastructure, no app change):** Full step-by-step Account B CLI runbook, Terraform file list, tfvars, and validation commands are in **[CROSS_ACCOUNT_BEDROCK_PHASE1.md](CROSS_ACCOUNT_BEDROCK_PHASE1.md)**.

After Terraform apply in Account A:

- `terraform output oscal_ec2_iam_role_arn` — put in Account B role **trust** policy.
- Enable `bedrock_cross_account_enabled`, `bedrock_account_id` (or `bedrock_assume_role_arn`), and `bedrock_external_id` in `terraform.tfvars`, then apply again.

**Phase 2 (application, later):** Settings will keep **access keys** (today) and add **assume IAM role** with a user-supplied role ARN; see Phase 2 section in [CROSS_ACCOUNT_BEDROCK_PHASE1.md](CROSS_ACCOUNT_BEDROCK_PHASE1.md).

---

### Cross-account and network access

If your **GUI/backend runs in one AWS account** and you want to use **Bedrock in another account** (or you’re unsure what to allow), use this section.

#### How Bedrock works across accounts

- **Bedrock is a regional API service.** You don’t “have Bedrock” inside a VPC. Your app (in any account or on-prem) calls the Bedrock endpoint (e.g. `bedrock-runtime.us-east-1.amazonaws.com`) over HTTPS.
- **Billing** goes to the account whose **IAM credentials** are used for the call. So “Bedrock in account B” usually means “use credentials from account B when calling Bedrock.”

You only need two things: **credentials** (who is allowed and who is billed) and **network** (can the app reach the Bedrock API).

---

#### 1. Network access (same account or cross-account)

The app must be able to open **outbound HTTPS (port 443)** to the Bedrock API in the chosen region.

| Where the app runs | What you need |
|--------------------|----------------|
| **Public internet or EC2 with public IP / NAT** | No extra config. Default outbound rules usually allow HTTPS. |
| **Private subnet (no internet)** | Either **(a)** a **NAT Gateway** (or similar) so the app can reach the internet, or **(b)** a **VPC endpoint** for Bedrock in the **same account and region** as the app so traffic stays inside AWS. |
| **On-prem or another cloud** | Outbound HTTPS to `bedrock-runtime.<region>.amazonaws.com` allowed (and any proxy/firewall rules). No AWS VPC peering or PrivateLink between accounts is required for Bedrock. |

**No special “network between the two accounts”** is required. Bedrock is not in your VPC; the app always talks to the public (or endpoint) Bedrock hostname. There is no VPC peering or PrivateLink *between* account A and account B for Bedrock.

**If the app runs in a VPC in the GUI account (Account A):**

- Ensure the subnet has a route to the internet (e.g. via NAT) **or** create an interface endpoint in that VPC for **Bedrock Runtime**:
  - Service name: `com.amazonaws.<region>.bedrock-runtime`  
  - Example: `com.amazonaws.us-east-1.bedrock-runtime`
- Security groups must allow **outbound** HTTPS (443) to that endpoint or to the internet, as applicable.

---

#### 2. Cross-account: use credentials from the “Bedrock account” (Account B)

If the **GUI/backend is in Account A** and you want **Account B to be billed** and authorized for Bedrock:

1. **In Account B (Bedrock account)**  
   - Create an IAM role (e.g. `OSCAL-BedrockCrossAccount`) with:
     - **Trust policy:** allow Account A (or a specific IAM role/user in A) to assume this role.
     - **Permissions:** same as in [Step 3](#step-3-create-an-iam-user-and-policy-for-bedrock) — `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` on `arn:aws:bedrock:<region>::foundation-model/*`.

2. **In Account A (app account)**  
   - Give the app permission to call **STS AssumeRole** on Account B’s role (e.g. attach a policy allowing `sts:AssumeRole` on `arn:aws:iam::B_ACCOUNT_ID:role/OSCAL-BedrockCrossAccount`).

3. **In the application**  
   - Instead of storing long-lived Access Key / Secret Key from B, the app (or a small service in A) **assumes** B’s role, gets temporary credentials, and uses those to call Bedrock. The app still uses the same Bedrock **region** and **model ID**; only the credential source changes.

The OSCAL app today is built to use **static credentials** (Access Key ID + Secret Access Key). To use cross-account cleanly you’d either:

- Run a small credential helper in Account A that assumes the role in B and exposes temporary keys (or an endpoint that the app calls), or  
- Use the same pattern as today but with **temporary** keys from B (e.g. you assume the role in B, get temp credentials, and put them in the app for a limited time — not ideal for production), or  
- Extend the app to support **assuming an IAM role** (e.g. via `AWS_STS_REGIONAL_ENDPOINTS` and the SDK) when `provider` is `aws-bedrock`.

So for **cross-account**, the main work is **IAM (trust + assume role)**; you do **not** need to “allow network access” between the two accounts for Bedrock specifically. The app in A still talks to the Bedrock API endpoint; only the credentials identify (and bill) Account B.

---

#### 3. Same account: GUI and Bedrock in one account

If both the app and the Bedrock credentials are in the **same** account:

- **Credentials:** Create the IAM user and policy in that account as in [Step 3](#step-3-create-an-iam-user-and-policy-for-bedrock) and [Step 4](#step-4-create-access-keys-and-store-them-securely).
- **Network:** Ensure the host running the app can reach the Bedrock API (outbound HTTPS, or VPC endpoint for Bedrock in that account as above). No cross-account setup.

---

#### Summary

| Scenario | Network | Credentials / IAM |
|----------|---------|-------------------|
| App and Bedrock in **same account** | Outbound HTTPS to Bedrock (or VPC endpoint in that account) | IAM user/role in that account with `bedrock:InvokeModel`. |
| App in **Account A**, Bedrock billing in **Account B** | Same as above (no link between A and B networks). App in A must reach Bedrock API. | Role in B with Bedrock permissions; trust A to assume it. App (or helper in A) assumes B’s role and uses temp credentials. |
| App **on-prem / other cloud** | Allow outbound HTTPS to `bedrock-runtime.<region>.amazonaws.com`. | Use IAM user (or role) credentials from the account that should be billed; no cross-account network. |

So: **you do not need to “allow network access” between two AWS accounts for Bedrock.** You only need the app to reach the Bedrock API (HTTPS or VPC endpoint) and the right credentials (same-account or cross-account assume-role).

---

### AWS Cloud Shell / CLI Commands

You can run the following in **AWS Cloud Shell** (or any environment with AWS CLI configured with sufficient permissions). Set variables at the top, then run each block in order.

#### 1. Set variables and list available models

```bash
# Region (e.g. us-east-1, us-west-2, eu-west-1)
export AWS_REGION=us-east-1

# Optional: list TEXT foundation models to see model IDs
aws bedrock list-foundation-models \
  --region "$AWS_REGION" \
  --by-output-modality TEXT \
  --query 'modelSummaries[*].[modelId,modelName,providerName]' \
  --output table
```

#### 2. Request model access (enable a foundation model) — optional for many models

Set `BEDROCK_MODEL_ID` to the model you want (e.g. `mistral.mistral-large-2402-v1:0`). Only run the agreement commands if the model uses the offer flow.

```bash
# Model to use (must match a model ID from list-foundation-models)
export BEDROCK_MODEL_ID=mistral.mistral-large-2402-v1:0

# Try to get offer token and create agreement (skip if you see "Agreement not supported")
OFFER_TOKEN=$(aws bedrock list-foundation-model-agreement-offers \
  --region "$AWS_REGION" \
  --model-id "$BEDROCK_MODEL_ID" \
  --query 'offers[0].offerToken' \
  --output text 2>/dev/null) || true

if [ -n "$OFFER_TOKEN" ] && [ "$OFFER_TOKEN" != "None" ]; then
  aws bedrock create-foundation-model-agreement \
    --region "$AWS_REGION" \
    --model-id "$BEDROCK_MODEL_ID" \
    --offer-token "$OFFER_TOKEN"
else
  echo "Agreement not required for this model (or not supported). Proceed to IAM and invoke."
fi
```

**If you see `ValidationException: Agreement not supported for this model`:**  
That model (e.g. Mistral) does not use the agreement API. You can **skip this step**. In many regions, such models are already available or get access on first invocation. Proceed to [Step 3](#3-create-iam-policy-for-bedrock-invoke) (IAM policy and user).

#### 3. Create IAM policy for Bedrock invoke

```bash
# Policy name (change if you prefer)
export POLICY_NAME=OSCAL-BedrockInvoke

# Create the policy (allows InvokeModel in your region)
aws iam create-policy \
  --policy-name "$POLICY_NAME" \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "BedrockInvokeModel",
        "Effect": "Allow",
        "Action": [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream"
        ],
        "Resource": "arn:aws:bedrock:'"$AWS_REGION"'::foundation-model/*"
      }
    ]
  }' \
  --description "Allow Bedrock InvokeModel for OSCAL Report Generator"
```

Note the returned **Arn** (e.g. `arn:aws:iam::123456789012:policy/OSCAL-BedrockInvoke`). Use your account ID in the next step if you don’t capture it.

#### 4. Create IAM user and attach policy

```bash
# User name (change if you prefer)
export BEDROCK_USER_NAME=oscal-bedrock-app

# Create user
aws iam create-user --user-name "$BEDROCK_USER_NAME"

# Get your account ID and attach the policy (replace ACCOUNT_ID if you know it)
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws iam attach-user-policy \
  --user-name "$BEDROCK_USER_NAME" \
  --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/${POLICY_NAME}"
```

#### 5. Create access key and show credentials

```bash
# Create access key for the user
OUTPUT=$(aws iam create-access-key --user-name "$BEDROCK_USER_NAME" --output json)

# Display credentials (store securely; secret is shown only once)
echo "=== Store these securely; SecretAccessKey is not shown again ==="
echo "AWS Region (use as awsRegion in app): $AWS_REGION"
echo "Bedrock Model ID (use as bedrockModelId in app): $BEDROCK_MODEL_ID"
echo "AWS Access Key ID: $(echo "$OUTPUT" | jq -r '.AccessKey.AccessKeyId')"
echo "AWS Secret Access Key: $(echo "$OUTPUT" | jq -r '.AccessKey.SecretAccessKey')"
```

Copy **Access Key ID** and **Secret Access Key** into your app config (Settings → AI Integration or `config/app/config.json`). Do not commit them to git.

#### 6. Optional: enable more models

For models that use the agreement API (e.g. some Anthropic/Claude models), repeat step 2 with the new model ID. If you get **"Agreement not supported for this model"**, skip the agreement and use the model directly—access may be automatic.

#### 6b. Enable Gemma models (Model access) via CLI

Use these commands to **list Gemma models** in your region and **enable** them (request model access) when the agreement API is supported.

**1. List Gemma foundation models and note Model IDs**

```bash
# Same region as your app (e.g. us-east-1)
export AWS_REGION=us-east-1

# List Gemma models (provider = Google)
aws bedrock list-foundation-models \
  --region "$AWS_REGION" \
  --by-provider "Google" \
  --by-output-modality TEXT \
  --query 'modelSummaries[*].[modelId,modelName,providerName]' \
  --output table
```

Note the **Model ID** you want (e.g. `google.gemma-3-12b-it`, `google.gemma-3-4b-it`).

**2. Request model access (enable) for a Gemma model**

Replace `GEMMA_MODEL_ID` with the exact ID from the list (e.g. `google.gemma-3-12b-it`).

```bash
# Gemma model to enable (e.g. Gemma 3 12B)
export GEMMA_MODEL_ID=google.gemma-3-12b-it

# Get offer token and create agreement (skip if "Agreement not supported")
OFFER_TOKEN=$(aws bedrock list-foundation-model-agreement-offers \
  --region "$AWS_REGION" \
  --model-id "$GEMMA_MODEL_ID" \
  --query 'offers[0].offerToken' \
  --output text 2>/dev/null) || true

if [ -n "$OFFER_TOKEN" ] && [ "$OFFER_TOKEN" != "None" ]; then
  aws bedrock create-foundation-model-agreement \
    --region "$AWS_REGION" \
    --model-id "$GEMMA_MODEL_ID" \
    --offer-token "$OFFER_TOKEN"
  echo "Enabled: $GEMMA_MODEL_ID"
else
  echo "Agreement not supported for $GEMMA_MODEL_ID (may already be available). Use this model ID in the app."
fi
```

**3. Enable multiple Gemma variants (optional)**

```bash
# Example: enable Gemma 3 12B and Gemma 3 4B
for ID in google.gemma-3-12b-it google.gemma-3-4b-it; do
  OFFER_TOKEN=$(aws bedrock list-foundation-model-agreement-offers \
    --region "$AWS_REGION" --model-id "$ID" \
    --query 'offers[0].offerToken' --output text 2>/dev/null) || true
  if [ -n "$OFFER_TOKEN" ] && [ "$OFFER_TOKEN" != "None" ]; then
    aws bedrock create-foundation-model-agreement \
      --region "$AWS_REGION" --model-id "$ID" --offer-token "$OFFER_TOKEN"
    echo "Enabled: $ID"
  else
    echo "Skip or already available: $ID"
  fi
done
```

If you see **"Agreement not supported for this model"**, the model may be available without this step; use the Model ID in **Settings → AI Integration → Bedrock Model ID** and test.

#### 7. Optional: verify from CLI (invoke Bedrock)

```bash
# Quick test (uses default credentials in Cloud Shell; or set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)
aws bedrock-runtime converse \
  --region "$AWS_REGION" \
  --model-id "$BEDROCK_MODEL_ID" \
  --messages '[{"role":"user","content":[{"text":"Say OK"}]}]' \
  --inference-config '{"maxTokens":10,"temperature":0}'
```

If this succeeds, the same region, model ID, and credentials will work in the OSCAL Report Generator when configured in Settings → AI Integration.

---

### References

- [AI integration – models and configuration](AI_INTEGRATION.md#ai-models-and-configuration) – Supported models, config, and routing (Mistral vs Gemma).
- [ARCHITECTURE.md](ARCHITECTURE.md) – Environment variables and high-level AI integration.
- [DEPLOYMENT.md](DEPLOYMENT.md) – Secret storage (e.g. pass) for production.
- [AWS Bedrock User Guide](https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-bedrock.html)
- [Bedrock Converse API (Mistral example)](https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-runtime_example_bedrock-runtime_Converse_Mistral_section.html)
- [Bedrock model IDs and regions](https://docs.aws.amazon.com/bedrock/latest/userguide/models-regions.html)

---

<a id="ec2-web-hosting-best-practices"></a>

## EC2 Web Hosting Best Practices

This document consolidates best practices evolved for hosting the OSCAL Report Generator on AWS EC2 (Green/Blue) with direct Node.js + systemd (no Docker). It complements [Terraform on AWS](#aws-terraform-for-oscal-ai-via-bedrock) (provisioning) and focuses on **application deployment, layout, automation, and operations**.

---

### Table of Contents

1. [Directory layout](#1-directory-layout)
2. [Service account and AWS Secrets Manager](#2-service-account-and-aws-secrets-manager)
3. [Config and users: single canonical location](#3-config-and-users-single-canonical-location)
4. [Deploy workflow](#4-deploy-workflow)
5. [Cron and ec2_automation (Green vs Blue)](#5-cron-and-ec2_automation-green-vs-blue)
6. [Blue/Green ports and health](#6-bluegreen-ports-and-health)
7. [Troubleshooting](#7-troubleshooting)
8. [Scripts reference](#8-scripts-reference)
9. [Terraform and SSH](#9-terraform-and-ssh)
10. [ALB and timeouts](#10-alb-and-timeouts)
11. [Image and OS](#11-image-and-os)

---

### 1. Directory layout

Use a **strict layout** so config is never confused with app code:

| Path | Purpose |
|------|--------|
| `/opt/oscal/app` | **App code only** (repo sync via rsync). No `config/` or `config.json`/`users.json` here. |
| `/opt/oscal/data` | **Canonical config and users** on EBS: `config.json`, `users.json`. Used by systemd via `CONFIG_PATH`/`USERS_PATH`. |
| `/opt/oscal/scripts` | Automation and helpers: `ec2_automation.sh`, `ec2_automation.env`, `reactivate-admin.sh`, `consolidate-users.sh`, etc. |
| `/opt/oscal/app/logs` | Application and ec2_automation logs. |

**Best practice:** The deploy script **excludes** the repo `config/` directory from rsync so `/opt/oscal/app/config` is never created. Config and users live **only** in `/opt/oscal/data`. Seeding comes from S3 (last backup) or from the repo `config/app/*.json` when local files are missing.

---

### 2. Service account and AWS Secrets Manager

- **Run the app and cron as a dedicated user**, not root: `svc_ams-oscal` (group `oscal`), home `/var/lib/svc_ams-oscal`.
- **EC2 secrets (1.7.19+):** The Node app reads and writes a **single AWS Secrets Manager JSON bundle** (`entries` + `_meta`). `config.json` stores only `{ "_sm": "OSCAL/..." }` pointers — never plaintext. Systemd sets `OSCAL_SECRETS_MODE=aws-sm` and `OSCAL_SECRETS_MANAGER_ARN` (from Terraform output `oscal_pass_secrets_sync_secret_arn`). Secrets are cached **in memory** at startup and after GUI save; they are not written to `process.env` or disk.
- **GUI save:** Settings merges changed keys into the SM bundle (compare-and-swap) and rewrites config with `_sm` pointers. Green and Blue share one bundle — concurrent saves retry on version conflict.
- **One-time migration:** If config still has plaintext or legacy `_pass` pointers, deploy runs `backend/scripts/migrate-config-to-sm.mjs`, or run `./scripts/debug/migrate-config-secrets-to-sm.sh green|blue` from the laptop.
- **Local / Docker:** Default `OSCAL_SECRETS_MODE=config` — secrets in `config.json` (or optional laptop `pass` via `_pass` pointers). Do not commit real secrets; use `config.json.example` as a template.
- **Deprecated on EC2:** `pass` vault, `PASSWORD_STORE_DIR`, and cron Pass ↔ SM sync (`ec2-automation-pass-sync.sh`). Laptop `pass` remains for Terraform/AWS SSH only (`run-with-aws-pass.sh`).

---

### 3. Config and users: single canonical location

- **On EC2 the app reads only:**  
  `CONFIG_PATH=/opt/oscal/data/config.json`  
  `USERS_PATH=/opt/oscal/data/users.json`  
  (set in `oscal-reporter.service`.)
- **Do not** place `config.json` or `users.json` under `/opt/oscal/app`; the deploy script removes any leftover `app/config` from older deploys.
- **Backup:** `ec2_automation.sh` (when cron is enabled) backs up these files to S3 every 10 minutes (`config/green/`, `config/blue/`). On new or replaced instances, deploy restores from S3 first; if still missing, it seeds from the repo `config/app/config.json` and `config/app/users.json`.

---

### 4. Deploy workflow

- **Full deploy (both instances):**  
  `./scripts/deploy-to-ec2.sh`  
  (SSH key from Pass entry `AWS/OSCAL-AWS4403-SSH` or `SSH_KEY_FILE=/path/to/key.pem`.)
- **Single instance:**  
  `./scripts/deploy-to-ec2.sh --green-only <green_ip>`  
  `./scripts/deploy-to-ec2.sh --blue-only <blue_ip>`  
  Get IPs from Terraform:  
  `terraform -chdir=terraform output -raw oscal_green_public_ip` (and `oscal_blue_public_ip`).
- **What deploy does:**  
  - Ensures service account `svc_ams-oscal`.  
  - Creates `/opt/oscal/app`, `/opt/oscal/scripts`, `/opt/oscal/data`.  
  - Restores config/users from S3 if available; otherwise seeds from repo if missing.  
  - Writes `ec2_automation.env` and installs/removes cron per role (see below).  
  - Rsyncs repo to `/opt/oscal/app` (excludes `config/`, `node_modules`, `.git`, etc.), runs `npm install` and frontend build, copies build into `backend/public`.  
  - Installs/updates `oscal-reporter.service` (Node, PORT, CONFIG_PATH, USERS_PATH, `OSCAL_SECRETS_MODE`, `OSCAL_SECRETS_MANAGER_ARN`).  
  - Migrates plaintext secrets to SM when needed; restarts the service and verifies `/health`.

**Best practice:** Run Terraform via `terraform/run-with-aws-pass.sh` (output, apply). Do not commit AWS credentials; use Pass or env.

---

### 5. Cron and ec2_automation (Green vs Blue)

- **ec2_automation.sh** backs up config, users, and logs to S3 and (optionally) syncs application code from **`s3://<bucket>/installer/`** (same prefix as `deploy-to-ec2.sh`), then `npm install` / frontend build / service restart. There is **no** scheduled Git pull; updates come from whatever was last uploaded to `installer/`.
- **Green:** By default deploy installs a **cron** for user `svc_ams-oscal` every 10 minutes:  
  `*/10 * * * * ... /opt/oscal/scripts/ec2_automation.sh ...`  
  **`ENABLE_S3_INSTALLER_UPDATE` defaults to true** in deploy-generated `ec2_automation.env` (`DEPLOY_ENABLE_S3_INSTALLER_UPDATE` defaults to **1**). When enabled, a **counter** in `/opt/oscal/data/.ec2_automation_installer_cycle` advances each run; a full `aws s3 sync` from `installer/` runs only every **`S3_CODE_UPDATE_EVERY_N_CYCLES`** runs (default **100** → about **1000 minutes** at a 10-minute cron). Set **`DEPLOY_ENABLE_S3_INSTALLER_UPDATE=0`** when deploying (or `ENABLE_S3_INSTALLER_UPDATE=false` on the instance) to skip scheduled code sync while keeping S3 backup.
- **Blue:** By default deploy installs the **same** cron on Blue (`DEPLOY_BLUE_AUTO_UPDATE` defaults to `1`) so S3 backup and optional installer sync run on both instances. Set **`DEPLOY_BLUE_AUTO_UPDATE=0`** when running deploy if you want Blue **manual-only** (no cron; deploy removes the ec2_automation line from Blue’s crontab).
- **ec2_automation.env** (per instance):  
  `S3_BUCKET`, `S3_CONFIG_PREFIX`, `S3_LOGS_PREFIX`, `DEPLOYMENT_ROLE`, `AWS_DEFAULT_REGION`, `S3_INSTALLER_PREFIX` (usually `installer`), `S3_CODE_UPDATE_EVERY_N_CYCLES`, `ENABLE_S3_INSTALLER_UPDATE`, `S3_SYNC_CHOWN_USER` / `S3_SYNC_CHOWN_GROUP` (for `aws s3 sync` as `ec2-user`). App secrets are **not** synced by cron — the Node process uses AWS Secrets Manager directly.
  Deploy overwrites this file on each run.

---

### 6. Blue/Green ports and health

- **Green and Blue:** port **3020** (same on both EC2 instances; `oscal_app_port` in Terraform, `OSCAL_APP_PORT` in deploy scripts).
- Green and Blue differ by **role** (`DEPLOYMENT_ROLE`, ALB target group, S3 log prefix `logs/green` vs `logs/blue`), not by TCP port. Config and users are shared via `config/active/` on S3.
- **Health:** ALB checks `http://<target>:3020/health`. After deploy, the script waits ~20s and retries up to 5 times. If health fails, it prints recent `journalctl -u oscal-reporter.service` for debugging.
- **Common causes of failure:** Bad or missing config/users in `/opt/oscal/data`, missing or broken Pass vault, wrong PORT in the unit file (deploy forces `3020`).

---

### 7. Troubleshooting

- **Instance not responding / health failing:**  
  - SSH and run:  
    `sudo systemctl status oscal-reporter.service`  
    `sudo journalctl -u oscal-reporter.service -n 50 --no-pager`  
  - From repo root, SSH to the instance (e.g. `./scripts/ssh-ec2.sh blue`) and inspect the same items: `systemctl`, `journalctl`, disk, `sudo crontab -u svc_ams-oscal -l`, `/opt/oscal/scripts/ec2_automation.env`, `/opt/oscal/app/logs/`, and `curl -sf http://127.0.0.1:3020/health` (Green or Blue).
- **Blue only – disable cron and fix env now (one-off):**  
  `./scripts/debug/fix-blue-no-cron.sh`  
  (or with explicit IP). This sets `ENABLE_S3_INSTALLER_UPDATE=false` and removes the ec2_automation cron on Blue.
- **Backup/restore verification:**  
  On the instance: confirm `sudo crontab -u svc_ams-oscal -l` includes `ec2_automation.sh`, check `/opt/oscal/scripts/ec2_automation.env` for `S3_BUCKET`, and run `/opt/oscal/scripts/ec2_automation.sh` once and confirm S3 objects update under `config/<role>/`.
- **Pass vault on instances:**  
  Compare `config.json` `_sm` (or legacy `_pass`) references with the SM bundle in AWS console or `migrate-config-secrets-to-sm.sh`.
- **AI engine unreachable from Green/Blue:**  
  See [Terraform on AWS – troubleshooting (AI engine unreachable)](#aws-terraform-for-oscal-ai-via-bedrock). On the instance, verify Bedrock IAM role/keys in `config.json`, systemd env, and backend logs (`journalctl -u oscal-reporter.service`).

---

### 8. Scripts reference

| Script | Purpose |
|--------|--------|
| `scripts/deploy-to-ec2.sh` | Full deploy to Green/Blue: code, config seed, cron, systemd, health check. |
| `scripts/ec2_automation.sh` | Backup to S3; optional sync from `installer/` + build + restart (every N cron runs). Runs from cron on Green by default. |
| `scripts/reactivate-admin.sh` | Reactivate admin user in `users.json`. Use repo path or pass path; works with `/opt/oscal/data/users.json`. |
| `scripts/debug/fix-blue-no-cron.sh` | One-off: set ENABLE_S3_INSTALLER_UPDATE=false and remove ec2_automation cron on Blue. |
| `scripts/debug/diagnose-okta-on-ec2.sh` | Diagnose Okta SSO on EC2 (config paths, tokens). |
| `scripts/debug/alb-target-health.sh` | Print ALB Green/Blue target health via AWS CLI. |
| `scripts/debug/restore-blue-config.sh` | Copy config/users from Green to Blue (e.g. after replacing Blue). |
| `scripts/debug/migrate-config-secrets-to-sm.sh` | One-time: migrate plaintext / `_pass` secrets in config to AWS SM + `_sm` pointers on EC2. |
| `scripts/debug/backup-config-to-s3.sh` | On-instance backup of config/users to S3 (cron companion). |
| `scripts/debug/sync-config-from-s3-newest.sh` | Pull newest shared config from S3 `config/active/` prefixes. |
| `scripts/debug/scp-to-ec2.sh` | Copy a debug script from laptop to Green/Blue via SSH. |

---

### 9. Terraform and SSH

- **Terraform:** Run via `terraform/run-with-aws-pass.sh` so AWS credentials are loaded from Pass (no credentials in repo). Example:  
  `./terraform/run-with-aws-pass.sh output`  
  `./terraform/run-with-aws-pass.sh apply -auto-approve`
- **Instance type:** Prefer **Graviton (t4g.small)**, then **AMD (t3a.small)**. Defaults in `terraform/variables.tf` are t4g.small and arm64; see [Terraform on AWS](#aws-terraform-for-oscal-ai-via-bedrock).
- **SSH key:** Stored in Pass entry `AWS/OSCAL-AWS4403-SSH` or provided as `SSH_KEY_FILE`. Same key is used for Green, Blue, and (if used) Ollama instances.
- **SSH user:** `ec2-user` (Amazon Linux 2023 / RHEL). Set `SSH_USER` if different.
- **Deploy** uses this key to rsync and run remote commands; it does not use Session Manager.

---

### 10. ALB and timeouts

- ALB **idle timeout** should be at least **300 seconds** (e.g. in `terraform/alb.tf`) to avoid 504 on long-running requests (e.g. AI, large reports).
- If you see **502 Bad Gateway** after deploy, wait 1–2 minutes for target health checks to pass, then retry the ALB URL. Default route is to Blue (3020).

---

### 11. Image and OS

- **Amazon Linux 2023** (or Adobe Image Factory Amazon Linux 2023 when configured). See [Image Factory AMIs](#adobe-image-factory-ami-usage-for-terraform).
- Use `SSH_USER=ec2-user` for Amazon Linux 2023.
- Node.js 20 is installed by the deploy script if not present (e.g. via NodeSource).

---

### Summary checklist

- [ ] Config and users only in `/opt/oscal/data`; no duplicate under `/opt/oscal/app`.
- [ ] App and cron run as `svc_ams-oscal`; Pass vault used for secrets.
- [ ] Deploy via `./scripts/deploy-to-ec2.sh`; Terraform via `run-with-aws-pass.sh`.
- [ ] Green and Blue: cron every 10 min by default (S3 backup + Pass/SM sync; optional S3 `installer/` sync every 100 runs unless `DEPLOY_ENABLE_S3_INSTALLER_UPDATE=0`). Blue manual-only: deploy with `DEPLOY_BLUE_AUTO_UPDATE=0`.
- [ ] Health verified after deploy; troubleshoot with SSH, `journalctl`, S3 backup paths, and Pass as needed.
- [ ] ALB idle timeout ≥ 300 s; SSH key from Pass or `SSH_KEY_FILE`.

---

<a id="aws-ec2-cost-estimate-for-oscal-report-generator-ollama"></a>

## 💰 AWS EC2 Cost Estimate for OSCAL Report Generator + Ollama

**Configuration:** 2 OSCAL instances (Blue/Green) + Ollama Auto Scaling Group. **Terraform default:** 3 Ollama instances at init; each instance writes boot time to `ollama-activity/last.json`; 1 hr no activity → scale to 0 (see [Terraform on AWS](#aws-terraform-for-oscal-ai-via-bedrock) and [workflow diagram](diagrams/workflow-timeline.mmd)).

**Last Updated:** January 29, 2026

---

### 🚀 TL;DR - Quick Answer

#### 💎 **BEST SETUP: Auto-Scaling with 4-Hour Idle Timeout**

**Monthly Cost:** **$94.68** | **Annual Cost:** **$1,136**

**What You Get:**
- ✅ Application Load Balancer (high availability)
- ✅ 2x OSCAL instances (Blue/Green deployment, always-on)
- ✅ Ollama AI server (auto-scales based on activity, 32 GB RAM / t3.2xlarge)
  - Shuts down when idle
  - Wakes up in 2-3 minutes when AI query received
  - Stays active for 1 hour after last activity
  - Auto-shuts down after 1 hour if no activity
- ✅ Lambda automation + CloudWatch monitoring
- ✅ **Cost-optimized** vs always-on

**Perfect for:** 5-10 users, moderate AI usage (~10-12% uptime ~75-90 hours/month)

---

#### 📊 Quick Comparison

| Setup | Monthly | Annual | Ollama Uptime | Best For |
|-------|---------|--------|---------------|----------|
| **Auto-Scale (CPU)** ⭐ | **~$99.70** | **~$1,196** | ~10-12% | **Most users** |
| Auto-Scale (GPU) | $148.62 | $1,783 | 20% | Fast AI responses |
| Always-On (CPU) | $163.03 | $1,956 | 100% | 24/7 availability |
| Always-On (GPU) | $425.52 | $5,106 | 100% | Enterprise |

**💡 Recommendation:** Start with Auto-Scale t3.2xlarge (32 GB), 1-hour idle. Significant savings vs always-on.

---

### 📚 Detailed Breakdown Below

Continue reading for:
- Architecture diagrams
- Cost breakdowns by scenario
- Implementation guide (Lambda code, CloudWatch setup)
- Real-world usage examples
- Optimization strategies

---

### 📊 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      AWS Cloud (US-East-1)                   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐      ┌──────────────────┐            │
│  │   EC2 Instance   │      │   EC2 Instance   │            │
│  │  OSCAL - Green   │      │  OSCAL - Blue    │            │
│  │  Port: 3020      │      │  Port: 3020      │            │
│  │  t4g.small       │      │  t4g.small       │            │
│  │  2 vCPU, 2GB RAM │      │  2 vCPU, 2GB RAM │            │
│  └──────────────────┘      └──────────────────┘            │
│           │                          │                       │
│           └──────────┬───────────────┘                       │
│                      │                                       │
│               ┌──────▼──────────┐                           │
│               │  Load Balancer  │ (Optional)                │
│               │   ALB/ELB       │                           │
│               └─────────────────┘                           │
│                                                               │
│  ┌──────────────────────────────────┐                       │
│  │       EC2 Instance               │                       │
│  │       Ollama AI Server           │                       │
│  │       Port: 11434                │                       │
│  │       g4dn.xlarge / t3.2xlarge   │                       │
│  │       GPU or 8 vCPU, 32 GB RAM   │                       │
│  │       Models: Mistral 7B + Llama │                       │
│  └──────────────────────────────────┘                       │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

### 💵 Detailed Cost Breakdown

#### Option 1: Production Setup (Recommended) ⭐

##### 🟢 OSCAL Generator Instances (x2)

**Instance Type:** Preferred **t4g.small** (Graviton, 2 vCPU, 2 GB RAM); fallback **t3a.small** (AMD). Default in Terraform is t4g.small.

| Component | Specification | Unit Cost | Monthly Cost |
|-----------|--------------|-----------|--------------|
| **Instance 1 (Green)** | t4g.small (Graviton) | ~$0.0164/hour | **~$11.97** |
| **Instance 2 (Blue)** | t4g.small (Graviton) | ~$0.0164/hour | **~$11.97** |
| EBS Storage (20 GB each) | gp3 | $0.08/GB-month | $3.20 |
| Data Transfer (within VPC) | First 100 GB | FREE | $0.00 |
| Elastic IP (x2) | While attached | FREE | $0.00 |

**Subtotal for OSCAL Instances:** **~$27.14/month** (t4g.small Graviton; use t3a.small for x86_64 if needed)

---

##### 🤖 Ollama AI Server Instance (x1)

**Instance Type:** `g4dn.xlarge` (4 vCPU, 16 GB RAM, NVIDIA T4 GPU)

| Component | Specification | Unit Cost | Monthly Cost |
|-----------|--------------|-----------|--------------|
| **Instance (GPU)** | g4dn.xlarge | $0.526/hour | **$383.96** |
| EBS Storage (100 GB) | gp3 (for models) | $0.08/GB-month | $8.00 |
| Data Transfer (to OSCAL) | Within same region | FREE | $0.00 |

**Note:** Ollama with Mistral 7B + Llama requires:
- Mistral 7B: ~4.5 GB disk space + 4-8 GB RAM when loaded
- Llama 2 7B: ~4 GB disk space + 4-8 GB RAM when loaded
- Running both models simultaneously: 12-16 GB RAM (GPU accelerated)

**Subtotal for Ollama Instance:** **$391.96/month**

---

#### 📊 Monthly Cost Summary (Option 1 - Production)

| Component | Monthly Cost |
|-----------|-------------|
| OSCAL Green Instance (t4g.small Graviton) | ~$11.97 |
| OSCAL Blue Instance (t4g.small Graviton) | ~$11.97 |
| OSCAL Storage (40 GB total) | $3.20 |
| Ollama Instance (g4dn.xlarge with GPU) | $383.96 |
| Ollama Storage (100 GB) | $8.00 |
| **TOTAL MONTHLY** | **$425.52** |
| **TOTAL ANNUAL** | **$5,106.24** |

---

### 💡 Option 2: Cost-Optimized Setup (CPU-Only)

If GPU acceleration is not required, you can run Ollama on CPU:

##### 🤖 Ollama AI Server (CPU-Only)

**Instance Type:** `t3.2xlarge` (8 vCPU, 32 GB RAM) - No GPU

| Component | Specification | Unit Cost | Monthly Cost |
|-----------|--------------|-----------|--------------|
| **Instance (CPU)** | t3.2xlarge | $0.3328/hour | **$242.94** (always-on) |
| EBS Storage (100 GB) | gp3 | $0.08/GB-month | $8.00 |

**Subtotal:** **$129.47/month**

#### 📊 Monthly Cost Summary (Option 2 - CPU-Only)

| Component | Monthly Cost |
|-----------|-------------|
| OSCAL Green Instance (t4g.small Graviton) | ~$11.97 |
| OSCAL Blue Instance (t4g.small Graviton) | ~$11.97 |
| OSCAL Storage (40 GB total) | $3.20 |
| Ollama Instance (t3.2xlarge CPU-only, 32 GB) | $242.94 (always-on) |
| Ollama Storage (100 GB) | $8.00 |
| **TOTAL MONTHLY** | **$284.50** (always-on) |
| **TOTAL ANNUAL** | **$3,414** (always-on) |

**⚠️ Note:** With 1-hour idle auto-scale, Ollama runs ~75-90 hours/month (~$25-30) — see Auto-Scaling section.

---

### 💎 Option 3: Budget Setup (Single OSCAL Instance)

If you don't need Blue/Green deployment:

#### 📊 Monthly Cost Summary (Option 3 - Single OSCAL)

| Component | Monthly Cost |
|-----------|-------------|
| OSCAL Single Instance (t4g.small) | ~$11.97 |
| OSCAL Storage (20 GB) | $1.60 |
| Ollama Instance (t3.2xlarge CPU-only, 32 GB) | $242.94 (always-on) |
| Ollama Storage (100 GB) | $8.00 |
| **TOTAL MONTHLY** | **$267.72** (always-on) |
| **TOTAL ANNUAL** | **$3,213** (always-on) |

---

### 🎯 Cost Optimization Strategies

#### 1. Reserved Instances (1-Year Commitment)
Save up to 40% with reserved instances:

| Instance Type | On-Demand | 1-Year Reserved | Savings |
|--------------|-----------|-----------------|---------|
| t4g.small (x2) | ~$23.94/mo | ~$15.34/mo | **36%** |
| g4dn.xlarge | $383.96/mo | $254.00/mo | **34%** |
| **Total Savings** | **$414.32/mo** | **$273.44/mo** | **$141/mo** |

**Annual Savings:** ~$1,692

#### 2. Spot Instances (70-90% Discount)
For non-critical workloads:

| Instance Type | On-Demand | Spot Price | Savings |
|--------------|-----------|------------|---------|
| t4g.small | ~$11.97/mo | ~$4.50/mo | **62%** |
| g4dn.xlarge | $383.96/mo | $115.00/mo | **70%** |

**⚠️ Warning:** Spot instances can be terminated with 2-minute notice when AWS needs capacity.

#### 3. Savings Plans (Flexible Commitment)
- 1-Year Plan: 30-35% discount
- 3-Year Plan: 50-55% discount
- Applies across any instance family

#### 4. Auto-Scaling / Scheduled Shutdown
- **Business Hours Only** (8am-6pm, M-F): Save ~70%
- **Development Environment**: Run only when needed
- **Monthly Cost (40 hours/week):**
  - Option 1 (GPU): ~$100/month
  - Option 2 (CPU): ~$35/month

---

### 🚀 Advanced Setup: Load Balancer + Intelligent Auto-Scaling

#### 📥 Get PNG Diagrams for Email

**Quick Access:**
- **Interactive HTML:** Open `docs/diagrams/generate-diagram.html` in your browser
- **Mermaid Files:** `docs/diagrams/*.mmd` files
- **Convert to PNG:** See `docs/diagrams/README.md` (Mermaid Live, VS Code, or `mmdc` command line)

**Three Easy Ways to Get PNG:**

1. **Browser (Easiest):** 
   - Open `docs/diagrams/generate-diagram.html`
   - Click "Download Architecture PNG" or "Download Workflow PNG"
   - Or right-click → "Save Image As..."

2. **Online Tool:**
   - Visit https://mermaid.live/
   - Copy contents from `docs/diagrams/aws-auto-scaling-architecture.mmd`
   - Click "Download PNG"

3. **Command Line:**
   ```bash
   cd docs/diagrams
   npm install -g @mermaid-js/mermaid-cli
   for file in *.mmd; do mmdc -i "$file" -o "${file%.mmd}.png" -w 1920 -H 1080 -b white; done
   ```

**Output:** High-resolution PNG images ready for email!

---

#### Architecture with ALB and Auto-Scaling (Text Version)

```
┌───────────────────────────────────────────────────────────────────┐
│                       AWS Cloud (US-East-1)                        │
├───────────────────────────────────────────────────────────────────┤
│                                                                     │
│                    ┌─────────────────────┐                        │
│         ┌──────────│ Application Load    │──────────┐            │
│         │          │ Balancer (ALB)      │          │            │
│         │          │ Port: 80/443        │          │            │
│         │          └─────────────────────┘          │            │
│         │                                            │            │
│    ┌────▼─────────┐                        ┌────────▼────┐      │
│    │ EC2 Instance │                        │ EC2 Instance│      │
│    │ OSCAL-Green  │◄──Health Check────────►│ OSCAL-Blue  │      │
│    │ Port: 3020   │                        │ Port: 3020  │      │
│    │ t4g.small    │                        │ t4g.small   │      │
│    └──────┬───────┘                        └──────┬──────┘      │
│           │                                        │              │
│           └────────────────┬───────────────────────┘              │
│                            │ AI API Calls                         │
│                            │                                      │
│                   ┌────────▼──────────┐                          │
│                   │  Lambda Function  │                          │
│                   │  (Wake/Sleep)     │                          │
│                   └────────┬──────────┘                          │
│                            │                                      │
│           ┌────────────────▼──────────────────┐                 │
│           │      Ollama AI Server              │                 │
│           │      Auto-Scaling Group            │                 │
│           │      • Scales 0→1 on demand        │                 │
│           │      • Stays up 1 hour idle        │                 │
│           │      • Auto-shutdown if inactive   │                 │
│           │      g4dn.xlarge or t3.2xlarge    │                 │
│           └────────────────────────────────────┘                 │
│                            │                                      │
│                   ┌────────▼──────────┐                          │
│                   │   CloudWatch       │                          │
│                   │   Monitoring       │                          │
│                   │   • Activity logs  │                          │
│                   │   • Idle timer     │                          │
│                   └────────────────────┘                          │
│                                                                     │
└───────────────────────────────────────────────────────────────────┘
```

---

### 💰 Cost Breakdown with Load Balancer & Auto-Scaling

#### Core Infrastructure Costs

| Component | Specification | Monthly Cost |
|-----------|--------------|-------------|
| **Application Load Balancer** | Base cost | $16.20 |
| **ALB LCU Hours** | ~10 LCU-hours/month (light traffic) | $5.76 |
| **OSCAL Green** | t4g.small (24/7) | ~$11.97 |
| **OSCAL Blue** | t4g.small (24/7) | ~$11.97 |
| **Route 53** | Hosted zone + DNS queries | $1.00 |
| **CloudWatch Logs** | 10 GB/month ingested | $5.00 |
| **Lambda Executions** | 10,000 invocations/month | $0.20 |
| **EBS Storage** | 40 GB (OSCAL) + 100 GB (Ollama) | $11.20 |

**Subtotal (Always-On Infrastructure):** **~$66.06/month** (OSCAL on t4g.small)

---

#### 🤖 Ollama Auto-Scaling Cost Models

##### Scenario 1: Light Usage (~10-12% Uptime) ⭐ **RECOMMENDED**

**Usage Pattern:**
- Active: wake on demand, **1-hour idle timeout** (auto-shutdown after 1 hour unused)
- Monthly uptime: ~75-90 hours (~10-12% of 730 hours)
- Typical for: 5-10 users, 50-100 AI queries/day
- **Ollama instance:** t3.2xlarge (8 vCPU, **32 GB RAM**) — $0.3328/hour

**Cost Breakdown:**

| Instance Type | Hourly Rate | Monthly Hours | Monthly Cost |
|--------------|-------------|---------------|-------------|
| **g4dn.xlarge (GPU)** | $0.526 | 90 | $47.34 |
| **t3.2xlarge (CPU, 32 GB)** | $0.3328 | 90 | $29.95 |

**Total Monthly Cost (Light Usage):**
- **With GPU:** $69.72 (infra) + $47.34 (Ollama) = **$117.06/month** ($1,405/year)
- **With CPU (32 GB):** $69.72 (infra) + $29.95 (Ollama) = **$99.67/month** ($1,196/year)

**Savings vs Always-On:**
- GPU: Significant savings (Ollama runs only when needed)
- CPU (32 GB): Save **$173/month** vs always-on t3.2xlarge

---

##### Scenario 2: Medium Usage (50% Uptime)

**Usage Pattern:**
- Active: 10-14 hours/day
- Monthly uptime: ~365 hours (50% of 730 hours)
- Typical for: 10-20 users, 200-400 AI queries/day

**Cost Breakdown:**

| Instance Type | Hourly Rate | Monthly Hours | Monthly Cost |
|--------------|-------------|---------------|-------------|
| **g4dn.xlarge (GPU)** | $0.526 | 365 | $192.00 |
| **t3.xlarge (CPU)** | $0.1664 | 365 | $60.74 |

**Total Monthly Cost (Medium Usage):**
- **With GPU:** $69.72 + $192.00 = **$261.72/month** ($3,141/year)
- **With CPU:** $69.72 + $60.74 = **$130.46/month** ($1,566/year)

---

##### Scenario 3: Business Hours Only (25% Uptime)

**Usage Pattern:**
- Active: 8am-6pm, Monday-Friday (10 hours × 5 days)
- Monthly uptime: ~180 hours (25% of 730 hours)
- Typical for: Business applications, development environments

**Cost Breakdown:**

| Instance Type | Hourly Rate | Monthly Hours | Monthly Cost |
|--------------|-------------|---------------|-------------|
| **g4dn.xlarge (GPU)** | $0.526 | 180 | $94.68 |
| **t3.xlarge (CPU)** | $0.1664 | 180 | $29.95 |

**Total Monthly Cost (Business Hours):**
- **With GPU:** $69.72 + $94.68 = **$164.40/month** ($1,973/year)
- **With CPU:** $69.72 + $29.95 = **$99.67/month** ($1,196/year)

---

### 📊 Complete Cost Comparison Table

| Configuration | Monthly | Annual | Ollama Uptime | Best For |
|--------------|---------|--------|---------------|----------|
| **Basic (No ALB, 24/7)** | $163.03 | $1,956 | 100% | Simple deployments |
| **Auto-Scale Light (CPU 32 GB)** ⭐ | ~$99.67 | ~$1,196 | ~10-12% | 5-10 users, 1hr idle |
| **Auto-Scale Light (GPU)** | ~$117 | ~$1,405 | ~12% | 5-10 users, fast AI responses |
| **Auto-Scale Business (CPU)** | $99.67 | $1,196 | 25% | Office hours only |
| **Auto-Scale Business (GPU)** | $164.40 | $1,973 | 25% | Office hours, high performance |
| **Auto-Scale Medium (CPU)** | $130.46 | $1,566 | 50% | 10-20 users |
| **Auto-Scale Medium (GPU)** | $261.72 | $3,141 | 50% | 10-20 users, high usage |
| **Always-On (CPU)** | $163.03 | $1,956 | 100% | 24/7 availability needed |
| **Always-On (GPU)** | $425.52 | $5,106 | 100% | Enterprise, high availability |

---

### 🎯 **RECOMMENDED: Auto-Scale Light with 32 GB RAM, 1-Hour Idle**

#### 💎 Best Value Setup

**Monthly Cost:** **~$99.67** | **Annual Cost:** **~$1,196**

**What you get:**
- ✅ Application Load Balancer (high availability)
- ✅ Blue/Green OSCAL deployment
- ✅ Intelligent Ollama auto-scaling (**t3.2xlarge**, 8 vCPU, **32 GB RAM**)
- ✅ **1-hour idle timeout** — auto-shutdown if Ollama not used for 1 hour
- ✅ Wakes on-demand when AI query received
- ✅ ~10-12% uptime (~75-90 hours/month)
- ✅ **Significant savings** vs always-on 32 GB

**Savings:** ~$173/month vs always-on t3.2xlarge setup.

---

#### 📐 Reference: 1-Hour Idle + 32 GB RAM (t3.2xlarge) — Standard Setup

The recommended setup uses **1-hour idle timeout** and **32 GB RAM (t3.2xlarge)**. For reference, if you had used different settings:

| Change | Effect on cost |
|--------|-----------------|
| **1-hour idle** | Instance shuts down after 1 hour unused → **fewer running hours** (~75–90/month). |
| **32 GB RAM (t3.2xlarge)** | 8 vCPU, 32 GB — **$0.3328/hour** (us-east-1 on-demand). |

**Instance:** `t3.2xlarge` (8 vCPU, 32 GB RAM) — **$0.3328/hour** (us-east-1 on-demand).

**Rough impact (same usage pattern as “Light”):**

- **1-hour idle + t3.2xlarge (32 GB)** is the standard: ~75–90 hours/month × $0.3328 = **~$25–30** (Ollama).
- Shorter idle (1 hr) = fewer running hours; 32 GB = $0.3328/hour (us-east-1).

**Summary:** Standard setup is **1-hour idle + t3.2xlarge (32 GB)**. Set `IDLE_TIMEOUT_HOURS = 1` in the Lambda and use a launch template with `t3.2xlarge`. Total auto-scale ~$99.67/month.

---

### 🔧 Implementation: Auto-Scaling Ollama with 1-Hour Idle Timeout

#### How It Works: Real-World Example

**Scenario:** A typical workday with your OSCAL application

```
Timeline                      Ollama Status              Cost Impact
─────────────────────────────────────────────────────────────────────

8:00 AM  User logs in         [SLEEPING - Scaled to 0]  $0/hour
         Views reports         

8:15 AM  Clicks "AI Suggest"  [WAKING UP...]            Starting...
         (First AI request)    Lambda triggers scale-up
         
8:18 AM  Ollama responds      [ACTIVE ✅]               $0.3328/hour (t3.2xlarge)
         Models loaded         Last activity: 8:18 AM
         
8:30 AM  Another AI request   [ACTIVE ✅]               $0.3328/hour
                               Last activity: 8:30 AM
         
9:15 AM  No AI activity       [ACTIVE ✅]               $0.3328/hour
         (Just viewing)        Last activity: 8:30 AM
                               Idle: 45 min
         
9:31 AM  1 hour since last    [SLEEPING]                $0/hour
         activity              Lambda scales to 0
         
1:45 PM  Clicks "AI Suggest"  [WAKING UP...]            Starting...
         Lambda triggers scale-up
         
1:48 PM  Ollama active        [ACTIVE ✅]               $0.3328/hour (t3.2xlarge)
                               Last activity: 1:48 PM
         
2:30 PM  Last AI query        [ACTIVE ✅]               $0.3328/hour
                               Last activity: 2:30 PM
         
3:31 PM  1 hour idle          [SLEEPING]                $0/hour
         Auto-shutdown         Scaled to 0
         
─────────────────────────────────────────────────────────────────────

Daily Summary:
  Active periods: 8:18 AM - 9:31 AM (~1.2 hr), 1:48 PM - 3:31 PM (~1.7 hr)
  Total active: ~2.9 hours
  Total cost: 2.9 × $0.3328 = ~$0.97/day
  
Monthly estimate (22 workdays): 22 × $0.97 = ~$21.34 (Ollama)
Plus infrastructure ($69.72) = ~$91/month total
```

**Key Benefits:**
- ✅ No wasted compute — shuts down after 1 hour idle
- ✅ No cost during nights/weekends
- ✅ Automatic wake-up when needed (2-3 min delay)
- ✅ 1-hour idle keeps cost low while allowing short breaks
- ✅ Significant savings vs always-on t3.2xlarge

---

#### Architecture Components

1. **Lambda Function** (Wake/Sleep Controller)
2. **CloudWatch Events** (Idle timeout monitoring)
3. **Auto Scaling Group** (0-1 instance scaling)
4. **Application Load Balancer** (Health checks & routing)
5. **S3** (Track last activity timestamp – same bucket used for application logs)

Activity state is stored as a single JSON object in your existing logs bucket (e.g. `s3://your-logs-bucket/ollama-activity/last.json`), so no separate DynamoDB table is required. **Terraform:** Each Ollama instance writes its boot time to this key on startup; Lambda uses `last_activity` for the 1-hour idle check (see [workflow-timeline.mmd](diagrams/workflow-timeline.mmd)).

---

#### Lambda Function: Ollama Controller

*(Lambda artifact `terraform/lambda/ollama_controller.zip` has been removed from this repo. The section below is for reference only.)*

Uses **S3** (same bucket as your application logs) to store `last_activity`. Set Lambda environment variables: `S3_ACTIVITY_BUCKET`, `S3_ACTIVITY_KEY` (e.g. `ollama-activity/last.json`).

```python
# ollama_controller.py (reference; not in repo)
import boto3
import json
from datetime import datetime, timedelta
import os

ec2 = boto3.client('ec2')
asg = boto3.client('autoscaling')
s3 = boto3.client('s3')

OLLAMA_ASG_NAME = 'ollama-ai-server-asg'
IDLE_TIMEOUT_HOURS = 1
S3_BUCKET = os.environ.get('S3_ACTIVITY_BUCKET', '')
S3_KEY = os.environ.get('S3_ACTIVITY_KEY', 'ollama-activity/last.json')

def lambda_handler(event, context):
    """
    Handles Ollama instance lifecycle:
    - Wakes up instance when AI query received
    - Monitors activity and shuts down after 1 hour idle
    State stored in S3 (same bucket as logs).
    """
    
    action = event.get('action')
    
    if action == 'wake':
        return wake_ollama_instance()
    elif action == 'check_idle':
        return check_and_shutdown_if_idle()
    else:
        return {'statusCode': 400, 'body': 'Invalid action'}

def wake_ollama_instance():
    """Scale up Ollama ASG to OLLAMA_DESIRED_CAPACITY (Terraform default: 3 instances)."""
    
    # Check if already running
    response = asg.describe_auto_scaling_groups(
        AutoScalingGroupNames=[OLLAMA_ASG_NAME]
    )
    
    current_capacity = response['AutoScalingGroups'][0]['DesiredCapacity']
    desired = int(os.environ.get('OLLAMA_DESIRED_CAPACITY', '3'))
    
    if current_capacity < desired:
        print("🚀 Waking up Ollama instances...")
        asg.set_desired_capacity(
            AutoScalingGroupName=OLLAMA_ASG_NAME,
            DesiredCapacity=desired
        )
        
        # Wait for instance(s) to be ready (Terraform Lambda waits for OLLAMA_DESIRED_CAPACITY, default 3)
        waiter = ec2.get_waiter('instance_running')
        instance_id = get_asg_instance_id()
        if instance_id:
            waiter.wait(InstanceIds=[instance_id])
            print(f"✅ Ollama instance {instance_id} is ready")
    else:
        print("✅ Ollama instance(s) already running")
    
    # Update last activity timestamp in S3 (same bucket as logs)
    update_activity_timestamp()
    
    return {
        'statusCode': 200,
        'body': json.dumps({'message': 'Ollama instance active'})
    }

def check_and_shutdown_if_idle():
    """Check if Ollama has been idle for 1 hour and shut down"""
    
    if not S3_BUCKET or not S3_KEY:
        print("⚠️ S3_ACTIVITY_BUCKET/S3_ACTIVITY_KEY not set, skipping shutdown check")
        return {'statusCode': 200, 'body': 'No activity config'}
    
    try:
        response = s3.get_object(Bucket=S3_BUCKET, Key=S3_KEY)
        data = json.loads(response['Body'].read().decode())
        last_activity = datetime.fromisoformat(data['last_activity'])
    except Exception:
        print("⚠️ No activity recorded, skipping shutdown check")
        return {'statusCode': 200, 'body': 'No activity data'}
    
    now = datetime.utcnow()
    idle_duration = now - last_activity
    
    print(f"⏱️ Idle duration: {idle_duration}")
    
    if idle_duration > timedelta(hours=IDLE_TIMEOUT_HOURS):
        print("😴 Ollama idle for 1+ hour, shutting down...")
        asg.set_desired_capacity(
            AutoScalingGroupName=OLLAMA_ASG_NAME,
            DesiredCapacity=0
        )
        return {
            'statusCode': 200,
            'body': json.dumps({'message': 'Ollama instance shut down due to inactivity'})
        }
    else:
        remaining = timedelta(hours=IDLE_TIMEOUT_HOURS) - idle_duration
        print(f"✅ Still active, {remaining} until auto-shutdown")
        return {
            'statusCode': 200,
            'body': json.dumps({'message': f'Active, {remaining} remaining'})
        }

def update_activity_timestamp():
    """Update last activity timestamp in S3 (same bucket as logs)"""
    if not S3_BUCKET or not S3_KEY:
        return
    body = json.dumps({'last_activity': datetime.utcnow().isoformat()})
    s3.put_object(Bucket=S3_BUCKET, Key=S3_KEY, Body=body, ContentType='application/json')
    print("📝 Updated activity timestamp in S3")

def get_asg_instance_id():
    """Get instance ID from Auto Scaling Group"""
    response = asg.describe_auto_scaling_groups(
        AutoScalingGroupNames=[OLLAMA_ASG_NAME]
    )
    instances = response['AutoScalingGroups'][0]['Instances']
    return instances[0]['InstanceId'] if instances else None
```

---

#### CloudWatch Events Rules

```yaml
# cloudwatch-rules.yaml

# Rule 1: Check idle status every 30 minutes
OllamaIdleCheckRule:
  Type: AWS::Events::Rule
  Properties:
    Name: ollama-idle-check
    Description: Check if Ollama instance should be shut down
    ScheduleExpression: rate(30 minutes)
    State: ENABLED
    Targets:
      - Arn: !GetAtt OllamaControllerLambda.Arn
        Input: '{"action": "check_idle"}'

# Rule 2: Wake on API Gateway request (triggered by OSCAL app)
OllamaWakeRule:
  Type: AWS::Events::Rule
  Properties:
    Name: ollama-wake-on-request
    Description: Wake Ollama when AI query received
    EventPattern:
      source:
        - oscal.ai.request
      detail-type:
        - AI Query
    State: ENABLED
    Targets:
      - Arn: !GetAtt OllamaControllerLambda.Arn
        Input: '{"action": "wake"}'
```

---

#### OSCAL Application Integration

Modify your OSCAL backend to trigger Ollama wake-up:

```javascript
// backend/server.js - AI integration endpoint

const AWS = require('aws-sdk');
const lambda = new AWS.Lambda();

app.post('/api/ai/suggest-controls', async (req, res) => {
  try {
    // 1. Wake up Ollama instance if needed
    console.log('🤖 Checking Ollama instance status...');
    
    const wakeResponse = await lambda.invoke({
      FunctionName: 'ollama-controller',
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({ action: 'wake' })
    }).promise();
    
    const wakeResult = JSON.parse(wakeResponse.Payload);
    
    if (wakeResult.statusCode !== 200) {
      throw new Error('Failed to wake Ollama instance');
    }
    
    // 2. Wait for instance to be ready (if just woken)
    await waitForOllamaReady();
    
    // 3. Make AI request to Ollama
    const aiResponse = await makeOllamaRequest(req.body);
    
    // 4. Return response
    res.json({ success: true, data: aiResponse });
    
  } catch (error) {
    console.error('AI request error:', error);
    res.status(500).json({ error: 'AI service unavailable' });
  }
});

async function waitForOllamaReady(maxWaitSeconds = 120) {
  const startTime = Date.now();
  const ollamaUrl = process.env.OLLAMA_URL || 'http://YOUR-OLLAMA-NLB-DNS:11434'; // Set from Terraform output: terraform -chdir=terraform output -raw ollama_url
  
  while (Date.now() - startTime < maxWaitSeconds * 1000) {
    try {
      const response = await axios.get(`${ollamaUrl}/api/tags`, { timeout: 2000 });
      if (response.status === 200) {
        console.log('✅ Ollama is ready');
        return true;
      }
    } catch (error) {
      console.log('⏳ Waiting for Ollama to be ready...');
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    }
  }
  
  throw new Error('Ollama instance failed to become ready');
}
```

---

#### Auto Scaling Group Configuration

```bash
# Create Launch Template for Ollama
aws ec2 create-launch-template \
  --launch-template-name ollama-ai-server \
  --version-description "Ollama with Mistral 7B + Llama" \
  --launch-template-data '{
    "ImageId": "ami-0c55b159cbfafe1f0",
    "InstanceType": "t3.2xlarge",
    "KeyName": "your-key-pair",
    "SecurityGroupIds": ["sg-ollama"],
    "UserData": "<base64-encoded-startup-script>",
    "BlockDeviceMappings": [{
      "DeviceName": "/dev/xvda",
      "Ebs": {
        "VolumeSize": 100,
        "VolumeType": "gp3"
      }
    }],
    "TagSpecifications": [{
      "ResourceType": "instance",
      "Tags": [
        {"Key": "Name", "Value": "ollama-ai-server"},
        {"Key": "Purpose", "Value": "AI-Inference"}
      ]
    }]
  }'

# Create Auto Scaling Group (scales 0 to 1)
aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name ollama-ai-server-asg \
  --launch-template LaunchTemplateName=ollama-ai-server \
  --min-size 0 \
  --max-size 1 \
  --desired-capacity 0 \
  --vpc-zone-identifier "subnet-abc123,subnet-def456" \
  --health-check-type EC2 \
  --health-check-grace-period 300 \
  --tags "Key=Name,Value=ollama-ai-server,PropagateAtLaunch=true"
```

---

#### S3 Activity State (Same Bucket as Logs)

Use your **existing logs bucket**; no new table or bucket required. Store the last-activity timestamp in a single JSON object (e.g. `ollama-activity/last.json`).

- **Bucket**: Same S3 bucket you use for application logs.
- **Key**: e.g. `ollama-activity/last.json` (recommended prefix to keep it separate from log objects).
- **Object body**: `{"last_activity": "2026-02-08T12:00:00Z"}` (written by Lambda on wake; read by Lambda on idle check).

**Lambda IAM permissions** (add to the role used by `ollama-controller`):

```json
{
  "Effect": "Allow",
  "Action": ["s3:GetObject", "s3:PutObject"],
  "Resource": "arn:aws:s3:::YOUR-LOGS-BUCKET/ollama-activity/*"
}
```

Set Lambda environment variables when creating/updating the function:

```bash
# Use same bucket as your application logs
S3_ACTIVITY_BUCKET=your-logs-bucket
S3_ACTIVITY_KEY=ollama-activity/last.json
```

---

### 💰 Additional Service Costs (Auto-Scaling Setup)

| Service | Monthly Cost | Notes |
|---------|-------------|-------|
| **Lambda Executions** | $0.20 | 10,000 invocations @ $0.20/million |
| **Lambda Duration** | $0.02 | 10,000 × 1s @ $0.0000166667/GB-sec |
| **S3 (activity state)** | Negligible | Same bucket as logs; one small JSON object (GET/PUT) |
| **CloudWatch Logs** | $0.50 | 1 GB ingested @ $0.50/GB |
| **CloudWatch Events** | FREE | First 1M events free |
| **Auto Scaling** | FREE | No additional charge |

**Total Additional Cost:** **~$0.75/month** (no DynamoDB; S3 cost folded into existing logs bucket usage)

---

### 📈 Additional AWS Costs to Consider

#### Optional Components

| Service | Use Case | Monthly Cost |
|---------|----------|-------------|
| **Application Load Balancer** | Distribute traffic between Blue/Green | $16.20 + $0.008/LCU-hour |
| **Route 53** | DNS management | $0.50/hosted zone + $0.40/million queries |
| **CloudWatch** | Monitoring & logs | $0.50/GB ingested (first 5GB free) |
| **EBS Snapshots** | Backups | $0.05/GB-month |
| **Data Transfer Out** | Internet egress (after 100GB free) | $0.09/GB |
| **VPC** | Networking | FREE (standard config) |
| **Security Groups** | Firewall rules | FREE |
| **IAM** | Access management | FREE |

#### Estimated Additional Costs (Optional)
- **With ALB + Monitoring:** Add ~$20-25/month
- **With backups (100GB snapshots):** Add ~$5/month
- **With high data transfer (500GB/mo):** Add ~$36/month

---

### 🌍 Regional Pricing Variations

Prices shown are for **US East (N. Virginia) - us-east-1**

| Region | Price Difference |
|--------|-----------------|
| US East (Ohio) - us-east-2 | ~Same |
| US West (Oregon) - us-west-2 | +5% |
| EU (Ireland) - eu-west-1 | +10% |
| Asia Pacific (Singapore) | +15% |
| Asia Pacific (Sydney) | +18% |

---

### 📋 Recommended Setup by Use Case

#### 🏢 Enterprise Production (Current Your Setup)
**Estimated Cost:** $425/month ($5,106/year)

✅ Blue/Green deployment for zero-downtime updates  
✅ GPU-accelerated AI inference  
✅ High availability  
✅ Best performance

**Instances:**
- 2x t4g.small (OSCAL Blue/Green, Graviton)
- 1x g4dn.xlarge (Ollama with GPU)

---

#### 🏗️ Small Team / Startup
**Estimated Cost:** $163/month ($1,956/year)

✅ Blue/Green deployment  
✅ CPU-only AI (slower but functional)  
✅ Cost-effective

**Instances:**
- 2x t4g.small (OSCAL Blue/Green, Graviton)
- 1x t3.2xlarge (Ollama CPU-only, 32 GB)

---

#### 🧪 Development / Testing
**Estimated Cost:** $146/month ($1,755/year)

✅ Single OSCAL instance  
✅ CPU-only AI  
✅ Lowest cost

**Instances:**
- 1x t4g.small (OSCAL)
- 1x t3.2xlarge (Ollama CPU-only, 32 GB)

---

#### ⚡ Ultra-Budget (Auto-Scaling)
**Estimated Cost:** $35-50/month ($420-600/year)

✅ Runs during business hours only  
✅ Auto-shutdown nights/weekends  
✅ Development environments

**Strategy:**
- Use AWS Lambda + CloudWatch Events for scheduled start/stop
- Run 40-50 hours/week vs 730 hours/month

---

### 🔧 Performance Expectations

#### OSCAL Generator (t4g.small)
- **Report Generation:** 2-5 seconds
- **AI Control Suggestions:** 5-15 seconds (depends on Ollama)
- **PDF Export:** 3-8 seconds
- **Concurrent Users:** 10-20
- **Memory Usage:** 300-500MB

#### Ollama on g4dn.xlarge (GPU)
- **First Request:** 2-5 seconds (model loading)
- **Subsequent Requests:** 0.5-2 seconds
- **Concurrent Requests:** 3-5
- **Model Switch Time:** 3-5 seconds

#### Ollama on t3.2xlarge (CPU, 32 GB)
- **First Request:** 10-20 seconds
- **Subsequent Requests:** 5-10 seconds
- **Concurrent Requests:** 1-2
- **Model Switch Time:** 10-15 seconds

---

### 📊 Final Cost Comparison Table (Updated with Auto-Scaling)

| Configuration | Monthly | Annual | Ollama Uptime | Best For |
|--------------|---------|--------|---------------|----------|
| **🏆 Auto-Scale Light (CPU + ALB)** | **$94.68** | **$1,136** | 20% | **Most users - Best Value!** |
| **Auto-Scale Business (CPU + ALB)** | $99.67 | $1,196 | 25% | Business hours only |
| **Auto-Scale Light (GPU + ALB)** | $148.62 | $1,783 | 20% | Light usage, fast AI |
| **Budget (Single + CPU, No ALB)** | $146.25 | $1,755 | 100% | Simple deployment |
| **Auto-Scale Business (GPU + ALB)** | $164.40 | $1,973 | 25% | Business hours, high perf |
| **Cost-Optimized (CPU, No ALB)** | $163.03 | $1,956 | 100% | Always-on, moderate usage |
| **Auto-Scale Medium (CPU + ALB)** | $130.46 | $1,566 | 50% | Medium usage |
| **Auto-Scale Medium (GPU + ALB)** | $261.72 | $3,141 | 50% | Heavy usage |
| **Reserved Instances (GPU)** | $273.44 | $3,281 | 100% | Long-term commitment |
| **Production (GPU, No ALB)** | $425.52 | $5,106 | 100% | Enterprise, 24/7 |

---

### 💡 My Recommendations (Updated)

#### 🏆 **BEST CHOICE: Auto-Scale Light with ALB + CPU**

**Cost:** **$94.68/month** ($1,136/year) ⭐

**Why This is Best:**
- ✅ **42% cheaper** than always-on setup ($68/month savings)
- ✅ **High Availability** with Application Load Balancer
- ✅ **Blue/Green deployment** maintained
- ✅ **Intelligent scaling** - Ollama wakes on-demand
- ✅ **1-hour idle timeout** - auto-shutdown when inactive
- ✅ **~10-12% uptime** (~75-90 hours/month) - typical for 5-10 users
- ✅ **Zero waste** - only pay when AI is actually used
- ✅ **Professional setup** with monitoring & automation

**What You Get:**
1. Application Load Balancer (ALB) for traffic distribution
2. 2x OSCAL instances (Blue/Green) running 24/7
3. Ollama instance that auto-scales based on activity:
   - Shuts down when idle
   - Wakes up in ~2-3 minutes when AI query received
   - Stays active for 1 hour after last activity
   - Auto-shuts down again if no activity
4. Lambda functions for orchestration
5. CloudWatch monitoring
6. S3 activity state (same bucket as logs)

**Perfect For:** Most deployments with 5-10 users and moderate AI usage

---

#### 🥈 **Second Best: Auto-Scale Business Hours**

**Cost:** $99.67/month ($1,196/year)

**Best for:** Teams that only work during business hours (8am-6pm, M-F)
- 25% uptime (180 hours/month)
- Save $63/month vs always-on

---

#### 🥉 **Third Best: Traditional Cost-Optimized (No Auto-Scale)**

**Cost:** $163/month ($1,956/year)

**Best for:** Organizations that need 24/7 Ollama availability
- Always-on AI server
- No wake-up delay
- Simpler architecture (no Lambda/auto-scaling)
- CPU-only inference

---

#### 💎 **Premium Option: Auto-Scale Light with GPU**

**Cost:** $148.62/month ($1,783/year)

**Best for:** Teams needing fast AI responses but not 24/7
- 10x faster AI inference
- Same auto-scaling benefits
- Only $54/month more than CPU version

---

### 📞 Implementation Steps

#### Quick Start: Deploy Auto-Scaling Setup

**Estimated Setup Time:** 2-3 hours

##### Step 1: Deploy Core Infrastructure (30 minutes)

```bash
# 1. Create VPC and subnets (if not exists)
aws cloudformation create-stack \
  --stack-name oscal-vpc \
  --template-body file://cloudformation/vpc.yaml

# 2. Deploy Application Load Balancer
aws cloudformation create-stack \
  --stack-name oscal-alb \
  --template-body file://cloudformation/alb.yaml \
  --parameters ParameterKey=VPCId,ParameterValue=vpc-xxx

# 3. Deploy OSCAL instances (Blue/Green)
aws cloudformation create-stack \
  --stack-name oscal-instances \
  --template-body file://cloudformation/oscal-ec2.yaml
```

##### Step 2: Set Up Ollama Auto-Scaling (45 minutes)

Use your **existing S3 logs bucket** for activity state; no DynamoDB table.

```bash
# 1. Ensure Lambda role has S3 access to your logs bucket (see "S3 Activity State" section)
#    e.g. s3:GetObject, s3:PutObject on arn:aws:s3:::YOUR-LOGS-BUCKET/ollama-activity/*

# 2. Create Launch Template for Ollama
aws ec2 create-launch-template \
  --launch-template-name ollama-ai-server \
  --launch-template-data file://ollama-launch-template.json

# 3. Create Auto Scaling Group (0-1 instance)
aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name ollama-ai-server-asg \
  --launch-template LaunchTemplateName=ollama-ai-server \
  --min-size 0 \
  --max-size 1 \
  --desired-capacity 0 \
  --vpc-zone-identifier "subnet-abc,subnet-def"
```

##### Step 3: Deploy Lambda Controller (30 minutes)

```bash
# 1. Package Lambda function
cd lambda
zip -r ollama-controller.zip ollama_controller.py

# 2. Create Lambda function (set S3 bucket/key – same bucket as logs)
aws lambda create-function \
  --function-name ollama-controller \
  --runtime python3.11 \
  --handler ollama_controller.lambda_handler \
  --role arn:aws:iam::ACCOUNT:role/lambda-execution-role \
  --zip-file fileb://ollama-controller.zip \
  --timeout 300 \
  --memory-size 256 \
  --environment "Variables={S3_ACTIVITY_BUCKET=your-logs-bucket,S3_ACTIVITY_KEY=ollama-activity/last.json}"

# 3. Grant Lambda permissions
aws lambda add-permission \
  --function-name ollama-controller \
  --statement-id AllowCloudWatchEvents \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com
```

##### Step 4: Configure CloudWatch Events (15 minutes)

```bash
# 1. Create idle check rule (every 30 minutes)
aws events put-rule \
  --name ollama-idle-check \
  --schedule-expression "rate(30 minutes)" \
  --state ENABLED

# 2. Add Lambda target
aws events put-targets \
  --rule ollama-idle-check \
  --targets "Id"="1","Arn"="arn:aws:lambda:REGION:ACCOUNT:function:ollama-controller","Input"='{"action":"check_idle"}'
```

##### Step 5: Update OSCAL Backend (30 minutes)

1. Modify `backend/server.js` to integrate Lambda wake-up
2. Add environment variables:
   ```bash
   OLLAMA_CONTROLLER_LAMBDA=ollama-controller
   OLLAMA_URL=$(terraform -chdir=terraform output -raw ollama_url)   # e.g. http://oscal-ollama-ollama-nlb-xxx.elb.region.amazonaws.com:11434
   AWS_REGION=us-east-1
   ```
3. Deploy updated OSCAL application
4. Test AI query triggers wake-up

##### Step 6: Configure Monitoring (15 minutes)

```bash
# 1. Create CloudWatch Dashboard
aws cloudwatch put-dashboard \
  --dashboard-name oscal-monitoring \
  --dashboard-body file://cloudwatch-dashboard.json

# 2. Set up billing alerts
aws budgets create-budget \
  --account-id YOUR_ACCOUNT_ID \
  --budget file://budget-alert.json

# 3. Enable detailed monitoring
aws ec2 monitor-instances \
  --instance-ids i-xxx i-yyy
```

---

#### Cost Monitoring & Optimization

1. **Set Up AWS Budget Alerts**
   ```bash
   # Alert when costs exceed $100/month
   aws budgets create-budget \
     --account-id YOUR_ACCOUNT_ID \
     --budget '{
       "BudgetName": "oscal-monthly-budget",
       "BudgetLimit": {
         "Amount": "100",
         "Unit": "USD"
       },
       "TimeUnit": "MONTHLY",
       "BudgetType": "COST"
     }'
   ```

2. **Monitor Ollama Uptime**
   ```bash
   # Check actual vs estimated uptime
   aws cloudwatch get-metric-statistics \
     --namespace AWS/EC2 \
     --metric-name CPUUtilization \
     --dimensions Name=AutoScalingGroupName,Value=ollama-ai-server-asg \
     --start-time 2026-01-01T00:00:00Z \
     --end-time 2026-01-31T23:59:59Z \
     --period 3600 \
     --statistics Average
   ```

3. **Track Monthly Costs**
   - Use AWS Cost Explorer
   - Review monthly statements
   - Adjust auto-scaling parameters based on actual usage

4. **Optimize Based on Usage**
   - If uptime > 50%: Consider always-on setup
   - If uptime < 8%: Consider increasing idle timeout to 2 hours
   - Monitor Lambda invocation costs

---

### 📊 Visual Cost Comparison: Auto-Scaling Impact

#### Ollama Instance Costs by Uptime

```
┌────────────────────────────────────────────────────────────┐
│          Monthly Cost by Uptime Percentage (CPU)           │
├────────────────────────────────────────────────────────────┤
│                                                              │
│  100% │████████████████████████████████████│ $121.47       │
│       │ (730 hours/month - Always On)       │              │
│       │                                      │              │
│   50% │████████████████│                    │ $60.74       │
│       │ (365 hours/month - Medium Usage)    │              │
│       │                                      │              │
│   25% │████████│                            │ $29.95       │
│       │ (180 hours/month - Business Hours)  │              │
│       │                                      │              │
│  ~10% │██████│                              │ $29.95 ⭐    │
│       │ (90 hours/month - Light, 1hr idle)   │ RECOMMENDED  │
│       │                                      │              │
│   10% │███│                                 │ $12.48       │
│       │ (75 hours/month - Very Light)       │              │
│       │                                      │              │
└────────────────────────────────────────────────────────────┘

💰 Savings vs Always-On (100%):
  • ~10% uptime (1hr idle): Save ~$213/month vs always-on t3.2xlarge
  • 25% uptime: Save ~$91/month ($1,097/year) - 75% savings
  • 50% uptime: Save ~$61/month ($730/year)   - 50% savings
```

#### Total Monthly Cost Breakdown

```
┌──────────────────────────────────────────────────────────────┐
│              Component Cost Breakdown (Light Usage)           │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  Load Balancer (ALB)        │████████│ $21.96    23.2%       │
│  OSCAL Green (t4g.small)    │█████│   ~$11.97    12.8%       │
│  OSCAL Blue (t4g.small)     │█████│   ~$11.97    12.8%       │
│  Ollama (t3.2xlarge @ ~10%) │██████│   $29.95    30.0%       │
│  Storage (EBS)              │████│     $11.20    11.8%       │
│  Monitoring & Lambda        │██│       $6.20      6.6%       │
│                                                                │
│  TOTAL: ~$93.25/month (OSCAL on t4g.small)                    │
└──────────────────────────────────────────────────────────────┘
```

#### Annual Cost Comparison

```
                      Auto-Scale    Always-On      Savings
                      (~10% uptime) (100% uptime)
────────────────────────────────────────────────────────────
CPU 32 GB (1hr idle): ~$1,196       ~$3,414        ~$2,218 ⭐
With GPU:             ~$1,405       $5,106         $3,701
Business Hours:       $1,196        $1,956         $760

🏆 Best Value: Auto-Scale t3.2xlarge (32 GB) at 1hr idle, ~$1,196/year
```

---

### 🔗 Additional Resources

- [AWS EC2 Pricing Calculator](https://calculator.aws/)
- [AWS Cost Management Console](https://console.aws.amazon.com/cost-management/)
- [Ollama GPU vs CPU Performance](https://github.com/ollama/ollama/blob/main/docs/gpu.md)
- [AWS Reserved Instances](https://aws.amazon.com/ec2/pricing/reserved-instances/)
- [AWS Spot Instances](https://aws.amazon.com/ec2/spot/)

---

**Last Updated:** January 29, 2026  
**Author:** Mukesh Kesharwani  
**Pricing Source:** AWS US-East-1 (January 2026)

---

**Note:** All prices are estimates based on AWS pricing as of January 2026. Actual costs may vary based on:
- Regional pricing differences
- Actual usage patterns
- Data transfer volumes
- Additional services used
- Reserved Instance/Savings Plan commitments

Always use [AWS Pricing Calculator](https://calculator.aws/) for precise quotes.

---

