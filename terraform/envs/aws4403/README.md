# AWS4403 Greenfield Deployment

Terraform working directory for **AWS4403** (Account ID `442277170733`). State and variables are isolated from the default `terraform/` directory (AWS4379 Sandbox). Do not use this directory for AWS4379.

## Prerequisites

- **Pass:** AWS credentials in `AWS/AMS_4403-STG` with `aws_access_key_id`, `aws_secret_access_key`, and optionally `aws_session_token`.
- **EC2 key (optional):** Create a key pair in the AWS4403 account (Console or CLI), or store private key in Pass at `AWS/OSCAL-AWS4403-SSH` and import (see below). Set `key_name` in `terraform.tfvars` (copy from `terraform.tfvars.example` if needed).

## Terraform (from repo root)

Use the wrapper so credentials are loaded from Pass and Terraform runs in this directory:

```bash
export AWS_PASS_ENTRY=AWS/AMS_4403-STG
export TERRAFORM_DIR=$PWD/terraform/envs/aws4403   # or absolute path to this dir

./terraform/run-with-aws-pass.sh init
./terraform/run-with-aws-pass.sh plan -out=tfplan
./terraform/run-with-aws-pass.sh apply tfplan
```

Or run Terraform directly from this directory after loading credentials:

```bash
cd terraform/envs/aws4403
# Load AWS_* from pass (e.g. eval "$(pass show AWS/AMS_4403-STG | sed 's/^/export /')" if format allows, or use run-with-aws-pass.sh)
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

## Import EC2 key from Pass (optional)

If your SSH private key is in Pass at `AWS/OSCAL-AWS4403-SSH`:

```bash
export AWS_PASS_ENTRY=AWS/AMS_4403-STG
export AWS_PASS_SSH_ENTRY=AWS/OSCAL-AWS4403-SSH
export EC2_KEY_NAME=oscal-aws4403
export TERRAFORM_DIR=$PWD/terraform/envs/aws4403
./terraform/run-with-aws-pass.sh import-key us-east-1
```

Then set `key_name = "oscal-aws4403"` in `terraform.tfvars` and run plan/apply.

## Deploy application (after Terraform apply)

From repo root:

```bash
export AWS_PASS_ENTRY=AWS/AMS_4403-STG
export TERRAFORM_DIR=$PWD/terraform/envs/aws4403
export AWS_PASS_SSH_ENTRY=AWS/OSCAL-AWS4403-SSH   # if using Pass for SSH key

./scripts/deploy-to-ec2.sh
```

The deploy script reads instance IPs and S3 bucket from this directory’s state when `TERRAFORM_DIR` points here.

## Variables

- `terraform.tfvars` is gitignored; copy from `terraform.tfvars.example` and set `key_name` and any overrides.
- Key settings: `aws_account_id = "442277170733"`, `s3_logs_bucket_name = "ams-oscal-442277170733"`.

## Troubleshooting

### "UnauthorizedOperation" / "explicit deny in a service control policy" on EC2 RunInstances

If `terraform apply` fails with **403 UnauthorizedOperation** when creating `aws_instance.oscal_green` or `aws_instance.oscal_blue`, and the error mentions **"explicit deny in a service control policy"** (e.g. `arn:aws:organizations::...:policy/.../service_control_policy/...`), then an **AWS Organization SCP** is blocking `ec2:RunInstances` in this account.

**This cannot be fixed in Terraform.** You must:

1. **Request an SCP exception** from your AWS/cloud platform team for account **442277170733** (or for the OU this account is in) so that `ec2:RunInstances` is allowed for your role (e.g. `klam-master-role-*` or the permission set you use).
2. Or **use a different AWS account** where EC2 launch is permitted by the organization’s SCPs.

Include in your request: account ID `442277170733`, that you need **ec2:RunInstances** for OSCAL Report Generator (Green/Blue EC2 instances), and the role/principal that runs Terraform.

### "You are not authorized to use launch template"

If apply fails with **AccessDenied: You are not authorized to use launch template**, set an approved Image Factory AMI in `terraform.tfvars`: `image_factory_amazon_linux_ami_us_east_1 = "ami-xxxxxxxx"` (get from platform team).
