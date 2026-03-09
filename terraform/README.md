# Terraform: OSCAL on AWS

This directory contains Terraform to provision the AWS architecture for the OSCAL Report Generator (ALB, Green/Blue OSCAL instances, S3). AI is provided via AWS Bedrock (no self-hosted Ollama).

**Usage and variables:** See [docs/AWS_TERRAFORM.md](../docs/AWS_TERRAFORM.md).

**Main files:**

- `main.tf` – provider and Terraform block
- `variables.tf` – input variables
- `outputs.tf` – ALB URL, instance IDs, S3 bucket, VPC, etc.
- `vpc.tf` – VPC, subnets, internet gateway
- `security_groups.tf` – ALB, OSCAL security groups
- `alb.tf` – Application Load Balancer and target groups (Green 3019, Blue 3020)
- `oscal_instances.tf` – Green and Blue EC2 instances (t3.small)
- `s3.tf` – S3 bucket for logs, config, users
- `iam.tf` – OSCAL instance profile (S3, SSM)

Copy `terraform.tfvars.example` to `terraform.tfvars`, set `key_name` and `s3_logs_bucket_name`, then run `terraform init` and `terraform apply`.

**Run mode:** By default (`run_oscal_via_docker = false`) EC2 runs OSCAL directly with Node.js and mounts config/users from S3 (destroy/rebuild instances without data loss). After apply, deploy code from repo root: `./scripts/deploy-to-ec2.sh`. To use Docker on EC2 instead, set `run_oscal_via_docker = true` in `terraform.tfvars`.

**Credentials from Pass:** If you store AWS credentials in [Pass](https://www.passwordstore.org/) under `AWS/AWS4379 Sandbox`, use:

```bash
./run-with-aws-pass.sh plan
./run-with-aws-pass.sh apply
```

Override the entry with `AWS_PASS_ENTRY="Other/Entry" ./run-with-aws-pass.sh plan` if needed.

**Multiple accounts (e.g. AWS4403):** Use a separate Terraform working directory and state so the existing AWS4379 Sandbox is not touched. See [envs/aws4403/README.md](envs/aws4403/README.md). Use `TERRAFORM_DIR` when calling `run-with-aws-pass.sh` and `deploy-to-ec2.sh`.

**Tagging and stack lifecycle:** Every resource created by this Terraform stack is tagged via the provider `default_tags` with: `Project`, `Environment`, `ManagedBy`, `Stack`, plus any `common_tags` you set in `terraform.tfvars` (e.g. `Team`, `Account`). In any AWS account you can:

- **Find all stack resources:** In the console, use Tag Editor or Resource Groups and filter by `Stack = <project_name>` (e.g. `oscal-reports`) or by `Project` and `Environment`.
- **Add the stack:** From the correct env directory (e.g. `terraform/envs/aws4403`) run `terraform apply`; all created resources are tagged consistently.
- **Remove the stack:** From the same directory run `terraform destroy`; Terraform removes all resources it created. (S3 bucket must be empty before destroy; see `s3.tf` comment.)

Use a separate Terraform working directory (and state) per account so one `apply`/`destroy` only affects that account.

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
