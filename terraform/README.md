# Terraform: OSCAL on AWS

This directory contains Terraform to provision the AWS architecture for the OSCAL Report Generator (ALB, Green/Blue OSCAL instances, S3). AI is provided via AWS Bedrock (no self-hosted Ollama).

**Usage and variables:** See [docs/AWS_TERRAFORM.md](../docs/AWS_TERRAFORM.md).

## Environments (default: aws4403)

**Default:** Scripts use **terraform/envs/aws4403** (account 442277170733) so you do not accidentally change AWS4379 Sandbox.

| Env        | Account       | Pass entry            | When to use |
|------------|---------------|------------------------|-------------|
| **aws4403** (default) | 442277170733  | AWS/AMS_4403-STG      | Normal runs; `./terraform/run-with-aws-pass.sh plan` and `./scripts/deploy-to-ec2.sh` use this unless overridden. |
| **aws4379**           | 432417415905  | AWS/AWS4379 Sandbox   | Only when you need to change AWS4379 Sandbox. Set `TERRAFORM_DIR=$PWD/terraform/envs/aws4379` and `AWS_PASS_ENTRY="AWS/AWS4379 Sandbox"`. |

- [envs/aws4403/README.md](envs/aws4403/README.md) – default env (AWS4403)
- [envs/aws4379/README.md](envs/aws4379/README.md) – AWS4379 Sandbox (use only when intended)

**Main files (shared by all envs via symlinks in envs/*):**

- `main.tf` – provider and Terraform block
- `variables.tf` – input variables
- `outputs.tf` – ALB URL, instance IDs, S3 bucket, VPC, etc.
- `vpc.tf` – VPC, subnets, internet gateway
- `security_groups.tf` – ALB, OSCAL security groups
- `alb.tf` – Application Load Balancer and target groups (Green 3019, Blue 3020)
- `oscal_instances.tf` – Green and Blue EC2 instances
- `s3.tf` – S3 bucket for logs, config, users (Public Access Block for PCL rule `custom-s3-pab-check`)
- `iam.tf` – OSCAL instance profile (S3, SSM)

Each env has its own `terraform.tfvars` (copy from `envs/<env>/terraform.tfvars.example`) and state under `envs/<env>/`.

**Run mode:** By default (`run_oscal_via_docker = false`) EC2 runs OSCAL directly with Node.js and mounts config/users from S3 (destroy/rebuild instances without data loss). After apply, deploy code from repo root: `./scripts/deploy-to-ec2.sh`. To use Docker on EC2 instead, set `run_oscal_via_docker = true` in that env’s `terraform.tfvars`.

**Credentials from Pass (default aws4403):** With [Pass](https://www.passwordstore.org/) and credentials in `AWS/AMS_4403-STG`:

```bash
./run-with-aws-pass.sh plan
./run-with-aws-pass.sh apply
```

For AWS4379 Sandbox: `AWS_PASS_ENTRY="AWS/AWS4379 Sandbox" TERRAFORM_DIR=$PWD/terraform/envs/aws4379 ./run-with-aws-pass.sh plan`

**Tagging and stack lifecycle:** Every resource created by this Terraform stack is tagged via the provider `default_tags` with: `Project`, `Environment`, `ManagedBy`, `Stack`, plus any `common_tags` you set in `terraform.tfvars` (e.g. `Team`, `Account`). In any AWS account you can:

- **Find all stack resources:** In the console, use Tag Editor or Resource Groups and filter by `Stack = <project_name>` (e.g. `oscal-reports`) or by `Project` and `Environment`.
- **Add the stack:** From the correct env directory (e.g. `terraform/envs/aws4403`) run `terraform apply`; all created resources are tagged consistently.
- **Remove the stack:** From the same directory run `terraform destroy`; Terraform removes all resources it created. (S3 bucket must be empty before destroy; see `s3.tf` comment.)

Use a separate Terraform working directory (and state) per account so one `apply`/`destroy` only affects that account.

**EC2 key from Pass (aws4403):** If your SSH private key is in Pass under `AWS/OSCAL-AWS4403-SSH`, import it into AWS once (with `TERRAFORM_DIR` defaulting to aws4403):

```bash
./run-with-aws-pass.sh import-key us-east-1
```

Then set `key_name = "oscal-aws4403"` in `envs/aws4403/terraform.tfvars` and run `./run-with-aws-pass.sh apply`. For AWS4379 use `TERRAFORM_DIR=$PWD/terraform/envs/aws4379` and Pass entry `AWS/OSCAL-AWS4379-SSH`. Requires AWS CLI (`brew install awscli`).

**SSH key in Pass:** Store the EC2 SSH key in pass (e.g. `AWS/OSCAL-AWS4403-SSH` for aws4403 or `AWS/OSCAL-AWS4379-SSH` for aws4379). Deploy script uses it when `AWS_PASS_SSH_ENTRY` is set or default.

## Troubleshooting

### DependencyViolation when deleting a security group

If `terraform apply` fails with `DependencyViolation: resource sg-xxx has a dependent object` (e.g. when replacing the OSCAL security group after PCL remediation or create-before-destroy), something still references that SG (usually an ENI). Fix it then re-run apply:

1. **Find what uses the SG** (replace `sg-0c7ef7d9fd21a63d6` and `us-east-1` with the SG ID and your region):

   ```bash
   ./scripts/terraform-find-sg-dependencies.sh sg-0c7ef7d9fd21a63d6 us-east-1
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
./scripts/debug/import-alb-http-redirect-listener.sh
```

From the env directory (e.g. `terraform/envs/aws4403`), run `terraform apply` again. AWS credentials must be set (Pass entry `AWS/AMS_4403-STG` or env).
