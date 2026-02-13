# Terraform: OSCAL + Ollama on AWS

This directory contains Terraform to provision the full AWS architecture for the OSCAL Report Generator with Ollama AI (ALB, Green/Blue OSCAL instances, Ollama auto-scaling, Lambda wake/sleep controller, S3 activity state, EventBridge).

**Usage and variables:** See [docs/AWS_TERRAFORM.md](../docs/AWS_TERRAFORM.md).

**Main files:**

- `main.tf` – provider and Terraform block
- `variables.tf` – input variables
- `outputs.tf` – ALB URL, instance IDs, Lambda name, S3 bucket, **ollama_url** / **ollama_nlb_dns_name** (use as OLLAMA_URL), etc.
- `vpc.tf` – VPC, subnets, internet gateway
- `security_groups.tf` – ALB, OSCAL, Ollama security groups
- `alb.tf` – Application Load Balancer and target groups (Green 3019, Blue 3020)
- `oscal_instances.tf` – Green and Blue EC2 instances (t3.small)
- `ollama_asg.tf` – Ollama launch template and ASG (default min 0, max 1, desired 0 when idle; boot time → ollama-activity/last.json; 1 hr idle → scale to 0)
- `ollama_nlb.tf` – Internal NLB for Ollama (port 11434). Use **`ollama_url`** output as **OLLAMA_URL** so any system in the VPC can reach Ollama; Lambda can start the ASG when scaled to 0.
- `lambda.tf` – Ollama controller Lambda and EventBridge rule (30 min)
- `s3.tf` – S3 bucket for logs and `ollama-activity/last.json`
- `iam.tf` – Lambda execution role and OSCAL instance profile (Lambda invoke)
- `lambda/ollama_controller.py` – Lambda handler (wake/check_idle)

Copy `terraform.tfvars.example` to `terraform.tfvars`, set `key_name` and `s3_logs_bucket_name`, then run `terraform init` and `terraform apply`.

**Run mode:** By default (`run_oscal_via_docker = false`) EC2 runs OSCAL directly with Node.js and mounts config/users from S3 (destroy/rebuild instances without data loss). After apply, deploy code from repo root: `./scripts/deploy-to-ec2.sh`. To use Docker on EC2 instead, set `run_oscal_via_docker = true` in `terraform.tfvars`.

**Credentials from Pass:** If you store AWS credentials in [Pass](https://www.passwordstore.org/) under `AWS/AWS4379 Sandbox`, use:

```bash
./run-with-aws-pass.sh plan
./run-with-aws-pass.sh apply
```

Override the entry with `AWS_PASS_ENTRY="Other/Entry" ./run-with-aws-pass.sh plan` if needed.

**EC2 key from Pass:** If your SSH private key is in Pass under `AWS/OSCAL-AWS4379-SSH`, import it into AWS once:

```bash
./run-with-aws-pass.sh import-key us-east-1
```

Then set `key_name = "oscal-aws4379"` in `terraform.tfvars` and run `./run-with-aws-pass.sh apply`. Requires AWS CLI (`brew install awscli`).

**SSH key in Pass:** To store the EC2 SSH key (e.g. `oscal-aws4379.pem`) in pass for retrieval when needed:

```bash
# One-time: insert the key (paste the full PEM when prompted, then Ctrl-D)
pass insert -m "AWS/OSCAL-AWS4379-SSH"
```

To retrieve and use the key (e.g. for SSH or Terraform):

```bash
# Print key to stdout
pass show "AWS/OSCAL-AWS4379-SSH"

# Use with SSH (writes to a temp file, connects, then removes file)
ssh -i <(pass show "AWS/OSCAL-AWS4379-SSH") ec2-user@<instance-ip>
```
