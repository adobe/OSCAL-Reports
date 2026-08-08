# AWS4403 (default)

Terraform working directory for **AWS4403** (Account ID `442277170733`). **This is the default.** Scripts (`run-with-aws-pass.sh`, `deploy-to-ec2.sh`) use this env when `TERRAFORM_DIR` is not set.

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

## SSAAU-169 / SSAAU-209 / SSAAU-216 (Image Factory Amazon Linux 2023 EMR)

InfraSec tickets for AMS-OSCAL-Reporter Non-Prod (account **442277170733**) require the **latest** [Amazon Linux 2023 **EMR** flavor](https://imagefactory.corp.adobe.com/imagefactoryui/ui/flavor?orgName=DME&ownerTeamName=ImageFactory&typeName=aws&flavorName=Amazon%20Linux%202023%20EMR) from Image Factory (target **IF 3.0.2** or newer for SSAAU-216), not the public Amazon `al2023-ami-*` fallback.

1. **Confirm env:** `TERRAFORM_DIR=$PWD/terraform/envs/aws4403`, `AWS_PASS_ENTRY=AWS/AMS_4403-STG`, `aws_region = "us-east-1"` in `terraform.tfvars`.
2. **Dynamic AMI (recommended):** Set `image_factory_dynamic_emr_lookup_enabled = true`, `image_factory_prefer_dynamic_emr_lookup = true`, and `image_factory_amazon_linux_ami_us_east_1 = null` in `terraform.tfvars`. Optionally list candidates:
   ```bash
   ./terraform/scripts/list-emr-candidate-amis.sh us-east-1 x86_64
   ```
3. **Apply + refresh:** `./terraform/run-with-aws-pass.sh plan -out=tfplan` then `apply tfplan`. With `oscal_ami_auto_refresh_on_change = true`, apply runs staggered ASG refresh (Green then Blue). Or manually: `TERRAFORM_DIR=$PWD/terraform/envs/aws4403 ./scripts/oscal-staggered-ami-refresh.sh`
4. **Verify:** `terraform output oscal_resolved_ami_id` (must not be stale). Check SSM Patch Manager compliance and CrowdStrike `If_Info` ≥ latest EMR.
5. **Drift check:** `TERRAFORM_DIR=$PWD/terraform/envs/aws4403 ./scripts/check-ami-drift.sh` (weekly via `.github/workflows/ami-drift-check.yml` on personal fork).

## SSAAU-212 (Splunk SCC / NotSendingSyslog)

Security syslog compliance requires Splunk UF configured for Adobe SCC:

- `oscal_splunk_uf_bootstrap_enabled = true` (default) — writes `deploymentclient.conf` + `00-secops_meta_app/local/inputs.conf` via user-data and SSM post-boot
- `oscal_splunk_client_name = "DC-ue1-journald_seclogs-ams-oscal"` (AL2023 journald)
- `oscal_splunk_deployment_server = "ds2.splunk.adobe.net:443"`
- After bootstrap, wait up to **30 minutes** for deployment-server handshake (`Handshake done` in `splunkd.log`)

6. **Splunk UF version:** SSM post-boot warns when Universal Forwarder is below `oscal_splunk_uf_min_version` (default 9.3.9).
7. **Data / app:** When **persistent EBS** is enabled, **`/opt/oscal`** survives replacement. Otherwise restore from S3 and run `./scripts/deploy-to-ec2.sh`. Check ALB `/health/ready` on port **3020**.
8. **Close tickets:** After CrowdStrike/Nexpose rescan and Splunk verification dashboard show logs, Zeus auto-closes SSAAU-216 (~2 days) and SSAAU-212 (~4 days).

---

**Version:** 1.7.27 · **Last updated:** July 2026
