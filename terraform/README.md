# Terraform: OSCAL on AWS

This directory contains Terraform to provision the AWS architecture for the OSCAL Report Generator (ALB, Green/Blue OSCAL **Auto Scaling Groups**, S3). AI is provided via AWS Bedrock (no self-hosted Ollama).

**Usage and variables:** See [docs/AWS_OPERATIONS.md](../docs/AWS_OPERATIONS.md#aws-terraform-for-oscal-ai-via-bedrock).

## Environment (aws4403)

**Default:** Scripts use **terraform/envs/aws4403** (account 442277170733).

| Env        | Account       | Pass entry            | When to use |
|------------|---------------|------------------------|-------------|
| **aws4403** (default) | 442277170733  | AWS/AMS_4403-STG      | Normal runs; `./terraform/run-with-aws-pass.sh plan` and `./scripts/deploy-to-ec2.sh` use this unless `TERRAFORM_DIR` overrides. |

- [envs/aws4403/README.md](envs/aws4403/README.md) – default env (AWS4403)

**Main files (shared by all envs via symlinks in envs/*):**

- `main.tf` – provider and Terraform block
- `variables.tf` – input variables
- `outputs.tf` – ALB URL, instance IDs, S3 bucket, VPC, etc.
- `vpc.tf` – VPC, subnets, internet gateway
- `security_groups.tf` – ALB, OSCAL security groups
- `alb.tf` – Application Load Balancer and target groups (Green and Blue, same app port)
- `oscal_instances.tf` – Green/Blue user data (Node/Docker), locals for persistent EBS snippets
- `oscal_asg_ebs.tf` – Launch templates, Auto Scaling Groups (size 1), optional gp3 volumes, ALB attachments
- `oscal_ssm.tf` – SSM Command document and optional periodic association (post-boot checks / optional S3 sync)
- `oscal_ssm_patch.tf` – SSM Patch Manager baseline, patch groups, and staggered Blue/Green maintenance windows
- `rds.tf` – Amazon RDS PostgreSQL (Database Integration; IAM DB auth) when `create_rds_postgres = true` (default **true**; set `false` in `terraform.tfvars` to skip RDS)
- `s3.tf` – S3 bucket for logs, config, users (Public Access Block for PCL rule `custom-s3-pab-check`)
- `oscal_pass_sync_secret.tf` – Secrets Manager JSON bundle for Pass vault sync (`oscal_pass_secrets_sync_enabled`; output `oscal_pass_secrets_sync_secret_arn` for deploy)
- `iam.tf` – OSCAL instance profile (S3, SSM, optional Pass-sync secret Get/Put, optional RDS Secrets Manager + `rds-db:connect`)
- `templates/oscal-rds-bootstrap.sh.tftpl` – EC2 user_data fragment: IAM DB user + systemd `OSCAL_DATABASE_*` env vars
- `bedrock_cross_account.tf` – optional `sts:AssumeRole` on Bedrock account role + systemd `BEDROCK_*` env (see [docs/CROSS_ACCOUNT_BEDROCK_PHASE1.md](../docs/CROSS_ACCOUNT_BEDROCK_PHASE1.md))
- `bedrock_vpc_endpoint.tf` – optional interface endpoint for `bedrock-runtime`
- `templates/oscal-bedrock-bootstrap.sh.tftpl` – systemd drop-in for cross-account Bedrock (Phase 2 app)

Each env has its own `terraform.tfvars` (copy from `envs/<env>/terraform.tfvars.example`) and state under `envs/<env>/`. **Every** shared root `*.tf` (including `rds.tf`, `oscal_asg_ebs.tf`, `oscal_ssm.tf`) must be **symlinked** into each env directory; `run-with-aws-pass.sh` defaults to `terraform/envs/aws4403`, so a missing symlink omits that file from the module and causes errors such as undeclared `aws_db_instance.oscal`.

**Image Factory EMR (InfraSec):** To list candidate **Amazon Linux 2023 EMR** AMIs launchable in your account, run [scripts/list-emr-candidate-amis.sh](scripts/list-emr-candidate-amis.sh) with AWS credentials (see [docs/AWS_OPERATIONS.md – Image Factory](../docs/AWS_OPERATIONS.md#adobe-image-factory-ami-usage-for-terraform) and [envs/aws4403/README.md](envs/aws4403/README.md) § SSAAU-169).

**Run mode:** By default (`run_oscal_via_docker = false`) EC2 runs OSCAL directly with Node.js; config/users live under **`/opt/oscal/data`** on the instance (persistent gp3 at **`/opt/oscal`** when enabled) with **ec2_automation** backups to S3. After apply, deploy code from repo root: `./scripts/deploy-to-ec2.sh`. To use Docker on EC2 instead, set `run_oscal_via_docker = true` in that env’s `terraform.tfvars`.

**Credentials from Pass (default aws4403):** With [Pass](https://www.passwordstore.org/) and credentials in `AWS/AMS_4403-STG`:

```bash
./run-with-aws-pass.sh plan
./run-with-aws-pass.sh apply
```

**Tagging and stack lifecycle:** Every resource created by this Terraform stack is tagged via the provider `default_tags` with: `Project`, `Environment`, `ManagedBy`, `Stack`, **`Service ID`** (default `602844`; override with `adobe_service_id_tag` in `terraform.tfvars`), plus any `common_tags` you set in `terraform.tfvars` (e.g. `Team`, `Account`). In any AWS account you can:

- **Find all stack resources:** In the console, use Tag Editor or Resource Groups and filter by `Stack = <project_name>` (e.g. `oscal-reports`) or by `Project` and `Environment`.
- **Add the stack:** From the correct env directory (e.g. `terraform/envs/aws4403`) run `terraform apply`; all created resources are tagged consistently.
- **Remove the stack:** From the same directory run `terraform destroy`; Terraform removes all resources it created. (S3 bucket must be empty before destroy; see `s3.tf` comment.)

Use a separate Terraform working directory (and state) per account so one `apply`/`destroy` only affects that account.

**EC2 key from Pass (aws4403):** If your SSH private key is in Pass under `AWS/OSCAL-AWS4403-SSH`, import it into AWS once (with `TERRAFORM_DIR` defaulting to aws4403):

```bash
./run-with-aws-pass.sh import-key us-east-1
```

Then set `key_name = "oscal-aws4403"` in `envs/aws4403/terraform.tfvars` and run `./run-with-aws-pass.sh apply`. Requires AWS CLI (`brew install awscli`).

**SSH key in Pass:** Store the EC2 SSH key in pass (e.g. `AWS/OSCAL-AWS4403-SSH`). Deploy script uses it when `AWS_PASS_SSH_ENTRY` is set or default.

## Troubleshooting

### DependencyViolation when deleting a security group

If `terraform apply` fails with `DependencyViolation: resource sg-xxx has a dependent object` (e.g. when replacing the OSCAL security group after PCL remediation or create-before-destroy), something still references that SG (usually an ENI). Fix it then re-run apply:

1. **Find what uses the SG** (replace `sg-0c7ef7d9fd21a63d6` and `us-east-1` with the SG ID and your region):

   ```bash
   ./scripts/debug/terraform-find-sg-dependencies.sh sg-0c7ef7d9fd21a63d6 us-east-1
   ```

   Or manually:

   ```bash
   aws ec2 describe-network-interfaces --filters "Name=group-id,Values=sg-0c7ef7d9fd21a63d6" --region us-east-1 --query 'NetworkInterfaces[*].[NetworkInterfaceId,Description,Status,Attachment.InstanceId]' --output table
   ```

2. **If an ENI is attached to a running instance:** Detach or stop the instance, or change the ENI’s security groups to a different SG (e.g. the new OSCAL SG from Terraform state).

3. **If the ENI is “available” (orphaned):** Either attach it to an instance that should use it, or delete the ENI if it’s no longer needed:  
   `aws ec2 delete-network-interface --network-interface-id eni-xxxxx --region us-east-1`

4. **Re-run apply:**  
   `./run-with-aws-pass.sh apply` (or `terraform apply` from the env directory).

Security groups have `revoke_rules_on_delete = true` so Terraform revokes the group’s own rules before delete; the dependency is usually an ENI that still has this SG attached.

### DuplicateListener when enabling HTTPS

If `terraform apply` fails with `DuplicateListener: A listener already exists on this port` when adding `alb_ssl_certificate_arn` (switching to HTTPS), the ALB already has a listener on port 80 and Terraform is trying to create the HTTP→HTTPS redirect listener. Import the existing listener into state, then re-run apply:

```bash
# From your env directory (e.g. terraform/envs/aws4403), with AWS credentials set:
region=$(terraform output -raw aws_region)
alb_arn=$(terraform output -raw alb_arn)
listener_arn=$(aws elbv2 describe-listeners --load-balancer-arn "$alb_arn" --region "$region" --query "Listeners[?Port==\`80\`].ListenerArn" --output text)
terraform import 'aws_lb_listener.http_redirect[0]' "$listener_arn"
```

Then run `terraform plan` and `terraform apply` again. AWS credentials must be set (Pass entry `AWS/AMS_4403-STG` or env).

---

**Version:** 1.7.23 · **Last updated:** June 2026
