# AWS4403 (default)

Terraform working directory for **AWS4403** (Account ID `442277170733`). **This is the default.** Scripts (`run-with-aws-pass.sh`, `deploy-to-ec2.sh`) use this env when `TERRAFORM_DIR` is not set, so you do not accidentally change AWS4379 Sandbox. For AWS4379 use `terraform/envs/aws4379` and set `TERRAFORM_DIR` and `AWS_PASS_ENTRY` explicitly.

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

If `terraform apply` fails with **403 UnauthorizedOperation** when creating **launch templates / Auto Scaling Groups** (or legacy `aws_instance` resources), and the error mentions **"explicit deny in a service control policy"** (e.g. `arn:aws:organizations::...:policy/.../service_control_policy/...`), then an **AWS Organization SCP** is blocking **`ec2:RunInstances`** (used when the ASG launches an instance) in this account.

**This cannot be fixed in Terraform.** You must:

1. **Request an SCP exception** from your AWS/cloud platform team for account **442277170733** (or for the OU this account is in) so that `ec2:RunInstances` is allowed for your role (e.g. `klam-master-role-*` or the permission set you use).
2. Or **use a different AWS account** where EC2 launch is permitted by the organization’s SCPs.

Include in your request: account ID `442277170733`, that you need **ec2:RunInstances** for OSCAL Report Generator (Green/Blue **ASG instances**), and the role/principal that runs Terraform.

### "You are not authorized to use launch template"

If apply fails with **AccessDenied: You are not authorized to use launch template**, set an approved Image Factory AMI in `terraform.tfvars`: `image_factory_amazon_linux_ami_us_east_1 = "ami-xxxxxxxx"` (get from platform team).

## SSAAU-169 (Image Factory Amazon Linux 2023 EMR)

InfraSec tickets for AMS-OSCAL-Reporter Non-Prod (account **442277170733**) require the **latest** [Amazon Linux 2023 **EMR** flavor](https://imagefactory.corp.adobe.com/imagefactoryui/ui/flavor?orgName=DME&ownerTeamName=ImageFactory&typeName=aws&flavorName=Amazon%20Linux%202023%20EMR) from Image Factory, not the public Amazon `al2023-ami-*` fallback.

1. **Confirm env:** `TERRAFORM_DIR=$PWD/terraform/envs/aws4403`, `AWS_PASS_ENTRY=AWS/AMS_4403-STG`, `aws_region = "us-east-1"` in `terraform.tfvars`.
2. **Get AMI:** Open Image Factory EMR flavor (use your org if not DME), copy the newest **us-east-1** AMI for **x86_64** (this env uses `t3a.small`) or **arm64** if you use `t4g.small`. Optionally run (from repo root, with AWS creds):
   ```bash
   ./terraform/scripts/list-emr-candidate-amis.sh us-east-1 x86_64
   ```
3. **Pin:** Set `image_factory_amazon_linux_ami_us_east_1 = "ami-..."` in `terraform.tfvars` and keep `instance_architecture` aligned.
4. **Apply:** `./terraform/run-with-aws-pass.sh plan -out=tfplan` then `./terraform/run-with-aws-pass.sh apply tfplan`.
5. **Data / app:** New instances get new **root** volumes each launch; when **persistent EBS** is enabled, **`/opt/oscal`** survives replacement on the same gp3 volume (AZ must stay aligned with each role’s subnet). Otherwise restore `/opt/oscal/data` from S3 (ec2_automation backups) and run `./scripts/deploy-to-ec2.sh` with the same `TERRAFORM_DIR` and Pass entries. Optional **`oscal_ssm_release_s3_prefix`** can sync packaged app bits from the logs bucket on an SSM schedule. Check ALB target health and `/health` on 3019/3020.
6. **Close ticket:** After CrowdStrike/Nexpose rescan is clean, close **SSAAU-169** (or use Adobe exception tooling if blocked).

---

**Version:** 1.7.12 · **Last updated:** April 2026
