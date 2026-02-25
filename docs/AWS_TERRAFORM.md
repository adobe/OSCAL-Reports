# AWS Terraform for OSCAL + Ollama

This document describes how to provision the AWS architecture for the OSCAL Report Generator with Ollama AI using Terraform. The layout matches the [architecture diagram](diagrams/generate-diagram.html) (ALB, Green/Blue, **Ollama NLB**, ASG, Lambda) and [AWS_COST_ESTIMATE.md](AWS_COST_ESTIMATE.md). Use the **ollama_url** Terraform output as **OLLAMA_URL** so any system in the VPC can reach Ollama; when the ASG is scaled to 0, Lambda can start it and the same URL works again.

## Architecture

- **VPC** and public subnets (2 AZs)
- **Application Load Balancer** (ALB) with HTTP (and optional HTTPS) listeners
- **OSCAL Green** (port 3019) and **OSCAL Blue** (port 3020) EC2 instances (always on, t3.small, 20 GB each). By default they run the app **directly** (Node.js + systemd) with **config and users on EBS** at `/opt/oscal/data` (no S3 mount); **ec2_automation** backs up config, users, and logs to S3 every 10 min. Set `run_oscal_via_docker = true` to use Docker/podman and the GHCR image instead.
- **Ollama** Auto Scaling Group (default min 3, max 3, desired 3 at init; each instance writes boot time to `ollama-activity/last.json`; 1 hr no activity → scale to 0; t3.2xlarge, 100 GB each)
- **Lambda** wake/sleep controller and **EventBridge** rule (every 30 min idle check)
- **S3** bucket for logs, `ollama-activity/last.json` activity state, and **backup** targets (`config/green/`, `config/blue/`, `logs/green/`, `logs/blue/`) populated by ec2_automation so data is retained if instances are replaced (max 10 min loss). See [workflow diagram](diagrams/workflow-timeline.mmd).

Account ID (e.g. 432417415905) is set via variable; no credentials are stored in code. For **Adobe/AMS** deployments, the template **prefers Adobe Image Factory Amazon Linux 2023** (when in map) and **falls back to native Amazon Linux 2023**; see [IMAGE_FACTORY.md](IMAGE_FACTORY.md).

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

- `s3_logs_bucket_name` – globally unique bucket name (e.g. `ams-oscal-432417415905`; bucket contains subfolders: logs, ollama-activity, config, users)
- `key_name` – existing EC2 key pair name in AWS (same region), or `null` to launch without SSH key

Optionally set `allowed_ssh_cidr` to your IP (e.g. `1.2.3.4/32`), `alb_ssl_certificate_arn` for HTTPS, and `alb_blue_hostname` / `alb_green_hostname` for host-based Blue/Green routing (see below).

### 2. Initialize and plan

```bash
terraform init
terraform plan -out=tfplan
```

Review the plan. It will create VPC, subnets, security groups, ALB, target groups, OSCAL instances, Ollama ASG, Lambda, EventBridge rule, S3 bucket, and IAM roles.

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

- `alb_dns_name` / `alb_url_http` – URL to access the app (HTTP). When `alb_ssl_certificate_arn` is set, HTTP redirects to HTTPS; use `alb_url_https` for the HTTPS URL.
- `oscal_green_instance_id`, `oscal_blue_instance_id` – EC2 instance IDs
- `oscal_green_public_ip`, `oscal_blue_public_ip` – public IPs for SSH and deploy (when in public subnets)
- `s3_logs_bucket_name`, `s3_activity_key` – for logging and Lambda
- `lambda_ollama_controller_name` – for OSCAL backend config (wake Ollama)
- `ollama_asg_name` – Ollama Auto Scaling Group name
- **`ollama_public_ip`** – Public IP of the running Ollama instance (for **SSH from your laptop**). Use this IP with `ssh -i <key> ec2-user@<ollama_public_ip>`. If the ASG just scaled up, run `terraform refresh` then `terraform output ollama_public_ip`. If the output is empty, the ASG has 0 instances.
- **`ollama_instance_id`** – Instance ID of the running Ollama instance (for **Session Manager** or AWS CLI).
- **`ollama_url`** / **`ollama_nlb_dns_name`** – **Use this as `OLLAMA_URL`** so any system in the same VPC can reach Ollama; when the ASG is scaled to 0, Lambda can start it and the same URL works once instances are up.

Use these to configure the OSCAL backend (Lambda name, and **OLLAMA_URL** as below).

### Connecting to the Ollama instance (SSH / Session Manager)

Green and Blue have fixed public IPs in Terraform output. The **Ollama** instance is in an Auto Scaling Group, so its public IP is not fixed. To log in from your laptop:

1. **Use the public IP, not the private IP.** The instance summary in the AWS console shows both. From outside the VPC (e.g. your laptop), you must use the **Public IPv4 address**. Using the private IP will fail (timeout or no route).

2. **Get the public IP:**
   - After the Ollama ASG has a running instance, run:
     ```bash
     cd terraform && terraform refresh && terraform output ollama_public_ip
     ```
   - Or in AWS Console: EC2 → Instances → select the instance named `AMS-OSCAL-ollama` → copy **Public IPv4 address**.
   - Or by instance ID: `aws ec2 describe-instances --instance-ids i-064e57c765ad6f493 --query 'Reservations[].Instances[].[PublicIpAddress]' --output text --region <region>`

3. **SSH** (same key as Green/Blue): `ssh -i <path-to-key.pem> ec2-user@<ollama_public_ip>`

4. **Session Manager** (no SSH key): In EC2 console, select the Ollama instance → Connect → **Session Manager** → Connect. The instance has the required IAM policy (`AmazonSSMManagedInstanceCore`). If Session Manager does not appear or fails, wait 2–3 minutes after the instance started for the SSM agent to register.

### 5. Direct run on EC2 (default): config on EBS, backup to S3

By default (`run_oscal_via_docker = false`), EC2 instances:

- Install **Node.js 20**.
- Store **config and users on EBS** at **/opt/oscal/data** (no S3 mount). **ec2_automation** (cron every 10 min) backs up config, users, and logs to S3 (`config/green/`, `config/blue/`, `logs/green/`, `logs/blue/`) so data is retained if instances are replaced (max 10 min loss).
- Run the app via **systemd** (`oscal-reporter.service`) after code is deployed.

To **deploy application code** after Terraform apply, run from the repo root (SSH key from [Pass](https://www.passwordstore.org/) entry `AWS/OSCAL-AWS4379-SSH` or set `SSH_KEY_FILE`):

```bash
./scripts/deploy-to-ec2.sh
```

**Amazon Linux 2023 (Image Factory or native):** Use `SSH_USER=ec2-user ./scripts/deploy-to-ec2.sh`.

The deploy script syncs the repo to `/opt/oscal/app` on both instances, runs `npm install` and frontend build, copies the build into `backend/public`, writes **ec2_automation.env** (S3 bucket and paths for backup), installs **ec2_automation** cron, and restarts `oscal-reporter.service`. To deploy to one instance only:

```bash
./scripts/deploy-to-ec2.sh --green-only $(terraform -chdir=terraform output -raw oscal_green_public_ip)
./scripts/deploy-to-ec2.sh --blue-only $(terraform -chdir=terraform output -raw oscal_blue_public_ip)
```

Config and users live on each instance at `/opt/oscal/data`; the deploy script does **not** sync them to S3 (ec2_automation performs backups every 10 min). To use **Docker on EC2** instead of direct run, set `run_oscal_via_docker = true` in `terraform.tfvars` and apply.

#### S3 backup layout (ec2_automation)

In the AWS S3 console, open your bucket → **`config`** or **`logs`** → **`green`** or **`blue`**. ec2_automation on each instance uploads:
- `config/green/config.json`, `config/green/users.json` (Green)
- `config/blue/config.json`, `config/blue/users.json` (Blue)
- `logs/green/`, `logs/blue/` (log files)

Terraform creates folder placeholders; ec2_automation populates them. For new instances, ensure `/opt/oscal/data/config.json` and `users.json` exist (e.g. copy from backup or create from examples) before or after first deploy.

### Blue/Green host-based routing (optional)

To access Blue and Green with two different hostnames (e.g. `blue.oscal.example.com` and `green.oscal.example.com`) so both run the same app at `/` with no application code changes:

1. Set in `terraform.tfvars`: `alb_blue_hostname = "blue.oscal.example.com"` and `alb_green_hostname = "green.oscal.example.com"` (use your own domain).
2. Create **CNAME** DNS records: `blue.oscal.example.com` and `green.oscal.example.com` both pointing to the ALB DNS name (output `alb_dns_name`).
3. Run `terraform apply`. The ALB will route by **Host** header: requests to the blue hostname go to Blue (port 3020), requests to the green hostname go to Green (port 3019). Default action (e.g. raw ALB DNS) forwards to Blue.

For HTTPS, use an ACM certificate that covers both hostnames (e.g. wildcard `*.oscal.example.com` or a cert with both SANs).

### HTTPS setup (ACM and HTTP-to-HTTPS redirect)

To serve the app over HTTPS with an AWS-issued certificate and redirect all HTTP traffic to HTTPS:

1. **Request an ACM certificate** (AWS Console → Certificate Manager, or CLI) for a **custom domain** you own (e.g. `oscal.example.com`). ACM does **not** issue certificates for the default ALB DNS name (e.g. `ams-oscal-alb-....elb.amazonaws.com`). Create the certificate in the **same region** as the ALB (e.g. us-east-1).
2. **Validate the certificate** via DNS (add the CNAME record ACM provides) or email.
3. **Create a CNAME** (or Route53 alias): your custom domain → ALB DNS name (output `alb_dns_name`). Example: `oscal.example.com` → `ams-oscal-alb-94037178.us-east-1.elb.amazonaws.com`.
4. **Set in `terraform.tfvars`:** `alb_ssl_certificate_arn = "arn:aws:acm:region:account:certificate/id"` (use the ARN from Certificate Manager). Optionally set `alb_green_hostname` and `alb_blue_hostname` for green/blue hostnames (use the same cert with SANs or a wildcard).
5. **Apply:** `terraform apply`. The ALB will have an HTTPS listener on port 443 using the ACM certificate. The HTTP listener (port 80) will **redirect** all requests to HTTPS (301). Use `alb_url_https` output or `https://your-domain.com`.
6. **Use:** `https://your-domain.com` for production. HTTP requests to the ALB (e.g. `http://your-domain.com`) will redirect to `https://your-domain.com`.

**Direct instance URLs (IP:3019, IP:3020):** AWS ACM certificates cannot be installed on EC2 instances; ACM works only with AWS services (ALB, CloudFront, API Gateway). To access Green or Blue over HTTPS, use **ALB hostnames** (`alb_green_hostname`, `alb_blue_hostname`) with a CNAME to the ALB and the same ACM cert—traffic is then HTTPS via the ALB. The raw IP:port URLs (e.g. `http://3.234.177.204:3019`, `http://54.145.135.149:3020`) remain HTTP and are suitable for debug or internal use only.

### Troubleshooting: AI Engine unreachable from Green/Blue

If the app on Green or Blue shows "Cannot reach AI Engine at http://...-nlb-....elb.us-east-1.amazonaws.com:11434/", the issue is connectivity from the EC2 instance to the Ollama NLB (not application code). Check in this order:

1. **Run the connectivity script** (from repo root, same SSH key as deploy):
   ```bash
   ./scripts/debug/check-ollama-connectivity.sh
   ```
   This SSHs to Green and Blue, runs `curl` to the NLB URL, and prints firewalld status and DNS. Use `--green-only <ip>` or `--blue-only <ip>` to test one instance.

2. **Ollama ASG and target group:** Ensure at least one Ollama instance is running and healthy. In AWS Console: EC2 → Target Groups → select the `*-ollama-11434` group → Targets. If there are no healthy targets, the NLB will accept TCP but the connection may fail or time out. Start the ASG (e.g. trigger Lambda or set desired capacity to 1) and wait for the target to become healthy. **New Ollama instance:** If the target stays **Unhealthy** after scale-up or replace (e.g. user_data timed out), run `./scripts/debug/run-install-ollama-on-instance.sh` (full flow) or `./scripts/debug/run-install-ollama-on-instance.sh listener <ip>` to ensure Ollama listens on 0.0.0.0 and firewalld allows 11434; wait 1–2 min for the target to become healthy.

3. **Security groups (Terraform):** OSCAL instances have egress TCP 11434 to the VPC CIDR; Ollama instances have ingress 11434 from the OSCAL security group and from the VPC CIDR (for NLB health checks). No change needed unless you modified SGs.

4. **RHEL firewalld:** If `curl` from the instance fails but security groups are correct, firewalld may be blocking outbound. On the instance:
   ```bash
   sudo firewall-cmd --list-all
   ```
   To allow outbound to port 11434:
   ```bash
   sudo firewall-cmd --add-rich-rule='rule family=ipv4 direction=out destination port port=11434 protocol=tcp accept' --permanent
   sudo firewall-cmd --reload
   ```
   New instances created by Terraform (direct run) already add this rule in user_data.

5. **NACLs:** Default VPC NACLs allow all. If you use custom NACLs, ensure they allow outbound TCP 11434 from the OSCAL subnets and inbound to the Ollama/NLB subnets as needed.

6. **Ollama install not completing on Amazon Linux 2023:** User_data installs Ollama at boot; on AL2023, dnf/network can be briefly unavailable. The template retries package install (zstd, curl) a few times. If the instance comes up but Ollama is not running or models are missing:
   - Check `/var/log/cloud-init-output.log` on the Ollama instance (SSH or Session Manager). Look for errors from `dnf install`, `curl ... ollama.com/install.sh`, or "zstd".
   - Run the manual install from your laptop (same SSH key and AWS credentials): `./scripts/debug/run-install-ollama-on-instance.sh`. This installs Ollama and models and applies the 0.0.0.0 listen fix. Wait 1–2 min for NLB target health, then test from Green/Blue.

## Key variables

| Variable | Description | Default |
|---------|-------------|---------|
| `aws_region` | AWS region | `us-east-1` |
| `aws_account_id` | Account ID (for ARNs) | `432417415905` |
| `key_name` | EC2 key pair name | (required) |
| `run_oscal_via_docker` | If false, EC2 runs Node.js directly with S3-mounted config/users; if true, Docker/podman + GHCR image | `false` |
| `s3_logs_bucket_name` | S3 bucket for logs and activity | (required) |
| `allowed_ssh_cidr` | CIDR allowed for SSH | `0.0.0.0/0` |
| `alb_ssl_certificate_arn` | ACM cert for HTTPS | `null` (HTTP only) |
| `alb_blue_hostname` | Hostname for Blue (e.g. blue.oscal.example.com); ALB routes by Host header | `null` |
| `alb_green_hostname` | Hostname for Green (e.g. green.oscal.example.com); ALB routes by Host header | `null` |
| `ollama_min_size` | Ollama ASG minimum size | `3` |
| `ollama_max_size` | Ollama ASG maximum size | `3` |
| `ollama_desired_capacity` | Ollama ASG desired capacity at init | `3` |
| `ollama_idle_timeout_hours` | Idle hours before scale to 0 (no activity) | `1` |

See `terraform/variables.tf` and `terraform/terraform.tfvars.example` for the full list.

## Post-deploy: OSCAL backend and Ollama URL

1. **Ollama URL (required):** Set **`OLLAMA_URL`** to the **`ollama_url`** Terraform output (internal NLB). Example:
   - `OLLAMA_URL=http://<ollama_nlb_dns_name>:11434`
   - Get the value: `terraform -chdir=terraform output -raw ollama_url`
   - Any system in the same VPC (e.g. OSCAL Green/Blue) can use this URL.
2. **Wake Lambda (so the Ollama instance comes up on first AI request):** Set **`OLLAMA_WAKE_LAMBDA`** on Green/Blue to the Terraform output **`lambda_ollama_controller_name`** (e.g. `AMS-OSCAL-ollama-controller`). Then when the app makes an AI request and Ollama is unreachable (ASG at 0), the backend invokes the Lambda to scale the ASG to 1, waits ~90s, and retries once. Without this, requests from Blue/Green reach the NLB but the NLB has no healthy targets when ASG is 0, so the instance never "comes up" from the user's perspective. Add to the oscal-reporter systemd unit: `Environment=OLLAMA_WAKE_LAMBDA=<lambda_ollama_controller_name>`.
3. **Alternative:** Set `ollama_min_size = 1` (and `ollama_desired_capacity = 1`) in Terraform so one Ollama instance is always running; then wake-on-request is optional.

## Ollama lifecycle: shutdown is STOP (never terminate)

The idle Lambda **stops** the instance and detaches it from the ASG; it does **not** terminate. The instance ID is saved to S3 so the next **wake** can start that same instance (or launch a new one if that instance was terminated elsewhere). Blue/Green should invoke the wake Lambda when an AI request fails so the instance comes back.

## Troubleshooting: Ollama instance not coming up despite requests from Blue/Green

**Cause:** The Ollama ASG can scale to 0 after idle (1 hr by default). When Blue or Green makes an AI API call, the request goes to the NLB; if the ASG has 0 instances, the NLB has **no healthy targets**, so the connection fails (timeout or refused). The Lambda "wake" action scales the ASG to 1, but **nothing was invoking that Lambda** when the app tried to reach Ollama—so the instance never came up.

**Fix:** (1) Set **`OLLAMA_WAKE_LAMBDA`** on Green and Blue to the Terraform output `lambda_ollama_controller_name`. The backend invokes this Lambda when an Ollama request fails, waits ~90s, then retries once. Add to the oscal-reporter systemd unit: `Environment=OLLAMA_WAKE_LAMBDA=<lambda_ollama_controller_name>`. (2) Or set `ollama_min_size = 1` and `ollama_desired_capacity = 1` in Terraform so one instance is always running.

## Troubleshooting: Why doesn’t `terraform apply` create a new Ollama instance?

**Cause:** The idle Lambda sets the ASG **desired_capacity** to 0 in AWS. Terraform **does not invoke the Lambda**; it only updates infrastructure from config. If Terraform **state** still shows desired_capacity=1 (from a previous apply), then on the next `apply` Terraform sees no change (state 1 vs config 1) and does **not** update the ASG—so the ASG stays at 0 in AWS (state drift).

**Fix:** (1) **Preferred:** Invoke the wake Lambda so the **stopped** instance is started (or a new one is launched): run `./scripts/debug/run-install-ollama-on-instance.sh wake` from the repo root (uses Pass for AWS). (2) **Or** sync state with AWS then apply: `cd terraform && ./run-with-aws-pass.sh refresh && ./run-with-aws-pass.sh apply -auto-approve`. After refresh, state will show desired_capacity=0; apply will then set it to 1 and the ASG will launch an instance.

## Troubleshooting: Cannot reach Ollama NLB from Blue (or Green)

The NLB does **not** bind to Ollama’s private IP directly. It has its own private IP(s); traffic to the NLB is **forwarded** to Ollama only if the Ollama instance is **registered** in the NLB target group and **healthy**. If you added the NLB after the Ollama instance was already running, that instance may not be registered.

**1. Check target group targets and health** (from a machine with AWS CLI and Terraform; replace region if needed):

```bash
cd terraform
REGION=us-east-1   # or your aws_region
TG_ARN=$(terraform output -raw ollama_target_group_arn)
aws elbv2 describe-target-health --target-group-arn "$TG_ARN" --region "$REGION"
```

If **TargetHealthDescriptions** is empty or state is **Unhealthy**, register the Ollama instance:

**2. Register the Ollama instance with the target group**

```bash
cd terraform
REGION=us-east-1   # or your aws_region
TG_ARN=$(terraform output -raw ollama_target_group_arn)
ASG_NAME=$(terraform output -raw ollama_asg_name)

# Get the Ollama instance ID (from the ASG)
INSTANCE_ID=$(aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names "$ASG_NAME" \
  --region "$REGION" \
  --query 'AutoScalingGroups[0].Instances[0].InstanceId' --output text)

# If INSTANCE_ID is empty or "None", the ASG has 0 instances (scale up via Lambda wake first).

# Register the instance with the target group
aws elbv2 register-targets --target-group-arn "$TG_ARN" \
  --targets Id="$INSTANCE_ID" --region "$REGION"
```

Wait 1–2 minutes for the target to become **healthy** (TCP health check on port 11434). Then from the Blue instance:

```bash
curl -s http://AMS-OSCAL-ollama-nlb-1e9cc53ead74707a.elb.us-east-1.amazonaws.com:11434/api/tags
```

**3. Ensure Ollama is listening on the instance**

On the Ollama instance, the service must be running and listening on 11434 (we fixed this earlier with systemd). If the target stays **Unhealthy**, SSH to the Ollama instance and run: `sudo systemctl status ollama` and `curl -s http://127.0.0.1:11434/api/tags`.

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
  ./scripts/check-alb-target-health.sh
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
  key            = "oscal-ollama/terraform.tfstate"
  region         = "us-east-1"
  dynamodb_table = "terraform-state-lock"
  encrypt        = true
}
```

Create the bucket and table first; do not commit state or credentials.

## Destroy and S3 bucket

When you run **`terraform destroy`**, the S3 bucket created by the template is **not** deleted. It is **renamed** to a new bucket whose name starts with **`2bedeleted-`** followed by the UTC date-time (e.g. `2bedeleted-2026-02-12-14-30-00`). All objects are copied into the new bucket, then the original bucket is removed. This keeps logs, config, and ollama-activity data available for audit or recovery. The renamed bucket is no longer managed by Terraform; you can delete it manually when no longer needed.

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
- [AWS_COST_ESTIMATE.md](AWS_COST_ESTIMATE.md) – cost breakdown and Lambda logic
- [CLOUD_DEPLOYMENT.md](CLOUD_DEPLOYMENT.md) – general cloud deployment options
