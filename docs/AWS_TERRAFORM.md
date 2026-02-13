# AWS Terraform for OSCAL + Ollama

This document describes how to provision the AWS architecture for the OSCAL Report Generator with Ollama AI using Terraform. The layout matches the [architecture diagram](diagrams/generate-diagram.html) (ALB, Green/Blue, **Ollama NLB**, ASG, Lambda) and [AWS_COST_ESTIMATE.md](AWS_COST_ESTIMATE.md). Use the **ollama_url** Terraform output as **OLLAMA_URL** so any system in the VPC can reach Ollama; when the ASG is scaled to 0, Lambda can start it and the same URL works again.

## Architecture

- **VPC** and public subnets (2 AZs)
- **Application Load Balancer** (ALB) with HTTP (and optional HTTPS) listeners
- **OSCAL Green** (port 3019) and **OSCAL Blue** (port 3020) EC2 instances (always on, t3.small, 20 GB each). By default they run the app **directly** (Node.js + systemd) with **config and users stored in S3** (mounted via s3fs); set `run_oscal_via_docker = true` to use Docker/podman and the GHCR image instead.
- **Ollama** Auto Scaling Group (default min 3, max 3, desired 3 at init; each instance writes boot time to `ollama-activity/last.json`; 1 hr no activity → scale to 0; t3.2xlarge, 100 GB each)
- **Lambda** wake/sleep controller and **EventBridge** rule (every 30 min idle check)
- **S3** bucket for logs, `ollama-activity/last.json` activity state, and (for direct run) **config/users** per instance (`config/green/`, `config/blue/`) so EC2 instances can be destroyed and rebuilt without data loss (see [workflow diagram](diagrams/workflow-timeline.mmd))

Account ID (e.g. 432417415905) is set via variable; no credentials are stored in code. For **Adobe/AMS** deployments, EC2 instances must use **Adobe Image Factory** images (RHEL9 preferred); see [IMAGE_FACTORY.md](IMAGE_FACTORY.md).

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

- `alb_dns_name` / `alb_url_http` – URL to access the app (HTTP)
- `oscal_green_instance_id`, `oscal_blue_instance_id` – EC2 instance IDs
- `oscal_green_public_ip`, `oscal_blue_public_ip` – public IPs for SSH and deploy (when in public subnets)
- `s3_logs_bucket_name`, `s3_activity_key` – for logging and Lambda
- `lambda_ollama_controller_name` – for OSCAL backend config (wake Ollama)
- `ollama_asg_name` – Ollama Auto Scaling Group name
- **`ollama_url`** / **`ollama_nlb_dns_name`** – **Use this as `OLLAMA_URL`** so any system in the same VPC can reach Ollama; when the ASG is scaled to 0, Lambda can start it and the same URL works once instances are up.

Use these to configure the OSCAL backend (Lambda name, and **OLLAMA_URL** as below).

### 5. Direct run on EC2 (default) and S3-mounted config/users

By default (`run_oscal_via_docker = false`), EC2 instances:

- Install **Node.js 20** and **s3fs** (FUSE).
- Mount S3 prefixes **config/green/** (Green) and **config/blue/** (Blue) to **/opt/oscal/data** so config and users are stored in S3. You can destroy and rebuild instances without losing data.
- Run the app via **systemd** (`oscal-reporter.service`) after code is deployed.

To **deploy application code** after Terraform apply, run from the repo root (SSH key from [Pass](https://www.passwordstore.org/) entry `AWS/OSCAL-AWS4379-SSH` or set `SSH_KEY_FILE`):

```bash
./scripts/deploy-to-ec2.sh
```

**RHEL9 / Amazon Linux:** Use `SSH_USER=ec2-user ./scripts/deploy-to-ec2.sh` (default is `ubuntu` for Ubuntu AMI).

**If `oscal-data-mount.service` fails** (S3 mount): SSH to the instance and run `sudo journalctl -xeu oscal-data-mount.service`. Ensure `/etc/fuse.conf` contains `user_allow_other` (Terraform user_data sets this for Ubuntu and RHEL9 on new instances). For an existing RHEL9 instance created before this fix, add `user_allow_other` to `/etc/fuse.conf`, then `sudo systemctl start oscal-data-mount.service`.

This syncs the repo to `/opt/oscal/app` on both instances, runs `npm install` and frontend build, copies the build into `backend/public`, and restarts the systemd service. To deploy to one instance only:

```bash
./scripts/deploy-to-ec2.sh --green-only $(terraform -chdir=terraform output -raw oscal_green_public_ip)
./scripts/deploy-to-ec2.sh --blue-only $(terraform -chdir=terraform output -raw oscal_blue_public_ip)
```

Config and users live in S3 (bucket prefixes `config/green/`, `config/blue/`), mounted at `/opt/oscal/data` on each instance. To use **Docker on EC2** instead of direct run, set `run_oscal_via_docker = true` in `terraform.tfvars` and apply.

### Blue/Green host-based routing (optional)

To access Blue and Green with two different hostnames (e.g. `blue.oscal.example.com` and `green.oscal.example.com`) so both run the same app at `/` with no application code changes:

1. Set in `terraform.tfvars`: `alb_blue_hostname = "blue.oscal.example.com"` and `alb_green_hostname = "green.oscal.example.com"` (use your own domain).
2. Create **CNAME** DNS records: `blue.oscal.example.com` and `green.oscal.example.com` both pointing to the ALB DNS name (output `alb_dns_name`).
3. Run `terraform apply`. The ALB will route by **Host** header: requests to the blue hostname go to Blue (port 3020), requests to the green hostname go to Green (port 3019). Default action (e.g. raw ALB DNS) forwards to Blue.

For HTTPS, use an ACM certificate that covers both hostnames (e.g. wildcard `*.oscal.example.com` or a cert with both SANs).

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

1. Set the OSCAL backend to call the Lambda to wake Ollama before AI requests (see [AWS_COST_ESTIMATE.md](AWS_COST_ESTIMATE.md) for integration example).
2. Set `OLLAMA_CONTROLLER_LAMBDA` (or equivalent) to the value of `lambda_ollama_controller_name` output.
3. **Ollama URL (recommended):** Set **`OLLAMA_URL`** to the **`ollama_url`** Terraform output (internal NLB). Example:
   - `OLLAMA_URL=http://<ollama_nlb_dns_name>:11434`
   - Get the value: `terraform -chdir=terraform output -raw ollama_url`
   - Any system in the same VPC (e.g. OSCAL Green/Blue, or another app) can use this URL. When the Ollama ASG is scaled to 0, the backend invokes the Lambda to wake the ASG; once instances are up and registered with the NLB, the same URL works again. No need to use instance private IPs.

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
