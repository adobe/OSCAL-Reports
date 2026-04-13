# AWS4379 Sandbox

Terraform working directory for **AWS4379 Sandbox** (Account ID `432417415905`). State and variables are isolated here so that the default workflow (aws4403) does not affect this account.

**By default, scripts use `terraform/envs/aws4403`.** To work with this account you must set `TERRAFORM_DIR` and `AWS_PASS_ENTRY` explicitly.

## Prerequisites

- **Pass:** AWS credentials in `AWS/AWS4379 Sandbox` with `aws_access_key_id`, `aws_secret_access_key`, and optionally `aws_session_token`.
- **EC2 key (optional):** Create a key pair in the AWS4379 account, or store private key in Pass at `AWS/OSCAL-AWS4379-SSH` and import (see below). Set `key_name` in `terraform.tfvars` (copy from `terraform.tfvars.example` if needed).

## Terraform (from repo root)

Use the wrapper with **TERRAFORM_DIR** and **AWS_PASS_ENTRY** so this account is used:

```bash
export AWS_PASS_ENTRY="AWS/AWS4379 Sandbox"
export TERRAFORM_DIR=$PWD/terraform/envs/aws4379

./terraform/run-with-aws-pass.sh init
./terraform/run-with-aws-pass.sh plan -out=tfplan
./terraform/run-with-aws-pass.sh apply tfplan
```

## Import EC2 key from Pass (optional)

If your SSH private key is in Pass at `AWS/OSCAL-AWS4379-SSH`:

```bash
export AWS_PASS_ENTRY="AWS/AWS4379 Sandbox"
export AWS_PASS_SSH_ENTRY=AWS/OSCAL-AWS4379-SSH
export EC2_KEY_NAME=oscal-aws4379
export TERRAFORM_DIR=$PWD/terraform/envs/aws4379
./terraform/run-with-aws-pass.sh import-key us-east-1
```

Then set `key_name = "oscal-aws4379"` in `terraform.tfvars` and run plan/apply.

## Deploy application (after Terraform apply)

From repo root:

```bash
export AWS_PASS_ENTRY="AWS/AWS4379 Sandbox"
export TERRAFORM_DIR=$PWD/terraform/envs/aws4379
export AWS_PASS_SSH_ENTRY=AWS/OSCAL-AWS4379-SSH   # if using Pass for SSH key

./scripts/deploy-to-ec2.sh
```

## Variables

- `terraform.tfvars` is gitignored; copy from `terraform.tfvars.example` and set `key_name` and any overrides.
- Key settings: `aws_account_id = "432417415905"`, `s3_logs_bucket_name = "ams-oscal-432417415905"`.

## Migrating from root terraform/

If you previously used `terraform/` (root) for AWS4379, copy your existing `terraform/terraform.tfvars` to `terraform/envs/aws4379/terraform.tfvars` and copy or move `terraform/terraform.tfstate` (and `.backup`) to `terraform/envs/aws4379/` so state is preserved. Then use `TERRAFORM_DIR=$PWD/terraform/envs/aws4379` for all Terraform and deploy commands.

---

**Version:** 1.7.12 · **Last updated:** April 2026
