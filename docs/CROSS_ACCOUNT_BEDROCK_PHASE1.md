---
concept: Mukesh Kesharwani
contact: mukesh.kesharwani@adobe.com
---

# Cross-account Bedrock — Phase 1 (Terraform + Account B runbook)

**Account A:** OSCAL EC2/ASG (this repo’s Terraform). **Account B:** Bedrock models and billing.

Phase 1 adds **IAM AssumeRole** on Account A and documents **Account B** setup. The application still uses **access keys** until Phase 2 (Settings: access keys **or** assume-role ARN).

---

## Order of operations

1. `terraform apply` in Account A (with `bedrock_cross_account_enabled = false` or unset).
2. `terraform output oscal_ec2_iam_role_arn` → use in Account B trust policy.
3. Run **Account B** steps below → record `bedrock_assume_role_arn` and `bedrock_external_id`.
4. Enable cross-account in Account A `terraform.tfvars` → `terraform apply` again.
5. Validate from Account A EC2 (SSM): `aws sts assume-role` + `aws bedrock list-foundation-models` (no app change).

---

## Account B runbook (copy-paste)

Run in **Account B** (CloudShell or CLI with IAM + Bedrock permissions).

### B0 — Variables

```bash
export AWS_REGION="us-east-1"
export ACCOUNT_A_ID="442277170733"
export OSCAL_EC2_ROLE_ARN="arn:aws:iam::442277170733:role/ams-oscal-reports-oscal-XXXXXXXX"
export BEDROCK_ROLE_NAME="OSCAL-BedrockCrossAccount"
export BEDROCK_POLICY_NAME="OSCAL-BedrockInvoke"
export EXTERNAL_ID="$(openssl rand -hex 16)"

export ACCOUNT_B_ID="$(aws sts get-caller-identity --query Account --output text)"
echo "Account B: $ACCOUNT_B_ID  Region: $AWS_REGION  ExternalId: $EXTERNAL_ID"
```

Replace `OSCAL_EC2_ROLE_ARN` with `terraform output -raw oscal_ec2_iam_role_arn` from Account A.

### B1 — Model access

Console: **Amazon Bedrock** → **Model access** → enable models (e.g. Mistral, Gemma).

```bash
aws bedrock list-foundation-models \
  --region "$AWS_REGION" \
  --query "modelSummaries[?contains(modelId, 'mistral') || contains(modelId, 'gemma')].{modelId:modelId,modelName:modelName}" \
  --output table
```

### B2 — Invoke policy

```bash
cat > /tmp/oscal-bedrock-invoke-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BedrockInvokeFoundationModels",
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": "arn:aws:bedrock:${AWS_REGION}::foundation-model/*"
    }
  ]
}
EOF

aws iam create-policy \
  --policy-name "$BEDROCK_POLICY_NAME" \
  --policy-document file:///tmp/oscal-bedrock-invoke-policy.json \
  --description "OSCAL cross-account Bedrock invoke in ${AWS_REGION}" \
  2>/dev/null || true

export BEDROCK_POLICY_ARN="arn:aws:iam::${ACCOUNT_B_ID}:policy/${BEDROCK_POLICY_NAME}"
echo "Policy ARN: $BEDROCK_POLICY_ARN"
```

### B3 — Trust policy

```bash
cat > /tmp/oscal-bedrock-trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowOscalEc2InAccountA",
      "Effect": "Allow",
      "Principal": {
        "AWS": "${OSCAL_EC2_ROLE_ARN}"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "${EXTERNAL_ID}"
        }
      }
    }
  ]
}
EOF
```

### B4 — Role

```bash
aws iam create-role \
  --role-name "$BEDROCK_ROLE_NAME" \
  --assume-role-policy-document file:///tmp/oscal-bedrock-trust-policy.json \
  --description "Cross-account Bedrock invoke for OSCAL EC2 in Account ${ACCOUNT_A_ID}"

aws iam attach-role-policy \
  --role-name "$BEDROCK_ROLE_NAME" \
  --policy-arn "$BEDROCK_POLICY_ARN"

export BEDROCK_ASSUME_ROLE_ARN="arn:aws:iam::${ACCOUNT_B_ID}:role/${BEDROCK_ROLE_NAME}"
echo "bedrock_assume_role_arn = \"$BEDROCK_ASSUME_ROLE_ARN\""
echo "bedrock_external_id     = \"$EXTERNAL_ID\""
```

### B5 — Validate from Account A EC2 (after Account A Terraform apply)

```bash
export BEDROCK_ASSUME_ROLE_ARN="arn:aws:iam::ACCOUNT_B_ID:role/OSCAL-BedrockCrossAccount"
export EXTERNAL_ID="<same-as-B0>"
export AWS_REGION="us-east-1"

CREDS=$(aws sts assume-role \
  --role-arn "$BEDROCK_ASSUME_ROLE_ARN" \
  --role-session-name "oscal-bedrock-cli-test" \
  --external-id "$EXTERNAL_ID" \
  --query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken]' \
  --output text)

read -r AK SK ST <<< "$CREDS"
export AWS_ACCESS_KEY_ID="$AK" AWS_SECRET_ACCESS_KEY="$SK" AWS_SESSION_TOKEN="$ST"

aws bedrock list-foundation-models --region "$AWS_REGION" \
  --query "modelSummaries[0].modelId" --output text
```

---

## Account A Terraform — files in this repo

Implemented under `terraform/` (symlinked in `terraform/envs/aws4403/`). To add another env:

```bash
cd terraform/envs/aws4403
ln -sf ../../bedrock_cross_account.tf bedrock_cross_account.tf
ln -sf ../../bedrock_vpc_endpoint.tf bedrock_vpc_endpoint.tf
```

### `terraform/bedrock_cross_account.tf` (new)

```hcl
# Cross-account Amazon Bedrock: OSCAL EC2 (Account A) assumes IAM role in Bedrock account (Account B).
# See docs/CROSS_ACCOUNT_BEDROCK_PHASE1.md

locals {
  bedrock_assume_role_arn = var.bedrock_assume_role_arn != "" ? var.bedrock_assume_role_arn : (
    var.bedrock_account_id != "" ? "arn:aws:iam::${var.bedrock_account_id}:role/${var.bedrock_assume_role_name}" : ""
  )
  bedrock_cross_account_ready = var.bedrock_cross_account_enabled && local.bedrock_assume_role_arn != "" && var.bedrock_external_id != ""
}

resource "aws_iam_role_policy" "oscal_bedrock_assume" {
  count = local.bedrock_cross_account_ready ? 1 : 0

  name_prefix = "${var.project_name}-bedrock-assume-"
  role        = aws_iam_role.oscal_instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "AssumeBedrockRoleInOtherAccount"
        Effect   = "Allow"
        Action   = "sts:AssumeRole"
        Resource = local.bedrock_assume_role_arn
      }
    ]
  })
}

locals {
  bedrock_bootstrap_fragment = local.bedrock_cross_account_ready && var.bedrock_inject_systemd_env ? templatefile("${path.module}/templates/oscal-bedrock-bootstrap.sh.tftpl", {
    bedrock_assume_role_arn = local.bedrock_assume_role_arn
    bedrock_external_id     = var.bedrock_external_id
  }) : ""
}
```

### `terraform/bedrock_vpc_endpoint.tf` (new, optional)

```hcl
resource "aws_security_group" "bedrock_runtime_vpce" {
  count = var.bedrock_runtime_vpc_endpoint_enabled ? 1 : 0

  name_prefix            = "${var.project_name}-bedrock-vpce-"
  description            = "Allow HTTPS from OSCAL instances to Bedrock Runtime VPC endpoint"
  vpc_id                 = aws_vpc.main.id
  revoke_rules_on_delete = true

  ingress {
    description     = "HTTPS from OSCAL EC2"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.oscal.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_vpc_endpoint" "bedrock_runtime" {
  count = var.bedrock_runtime_vpc_endpoint_enabled ? 1 : 0

  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.bedrock-runtime"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.public[*].id
  security_group_ids  = [aws_security_group.bedrock_runtime_vpce[0].id]
  private_dns_enabled = true
}
```

### `terraform/templates/oscal-bedrock-bootstrap.sh.tftpl` (new)

```bash
DROPIN_DIR="/etc/systemd/system/oscal-reporter.service.d"
DROPIN="$DROPIN_DIR/51-oscal-bedrock-env.conf"
if [[ ! -f "$DROPIN" ]]; then
  mkdir -p "$DROPIN_DIR"
  cat > "$DROPIN" <<'BEDROCKENVEOF'
[Service]
Environment=BEDROCK_ASSUME_ROLE_ARN=__BEDROCK_ASSUME_ROLE_ARN__
Environment=BEDROCK_EXTERNAL_ID=__BEDROCK_EXTERNAL_ID__
BEDROCKENVEOF
  sed -i "s|__BEDROCK_ASSUME_ROLE_ARN__|${bedrock_assume_role_arn}|g;s|__BEDROCK_EXTERNAL_ID__|${bedrock_external_id}|g" "$DROPIN"
  chmod 644 "$DROPIN"
fi
```

### `terraform/variables.tf` — append before `variable "common_tags"`

```hcl
variable "bedrock_cross_account_enabled" {
  description = "When true, OSCAL EC2 role may sts:AssumeRole into the Bedrock account role."
  type        = bool
  default     = false
}

variable "bedrock_account_id" {
  description = "Account ID where Bedrock is enabled (Account B)."
  type        = string
  default     = ""
}

variable "bedrock_assume_role_name" {
  description = "IAM role name in bedrock_account_id (default OSCAL-BedrockCrossAccount)."
  type        = string
  default     = "OSCAL-BedrockCrossAccount"
}

variable "bedrock_assume_role_arn" {
  description = "Full ARN of Bedrock cross-account role; overrides bedrock_account_id + bedrock_assume_role_name."
  type        = string
  default     = ""
}

variable "bedrock_external_id" {
  description = "ExternalId for AssumeRole (match Account B trust policy)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "bedrock_runtime_vpc_endpoint_enabled" {
  description = "Interface VPC endpoint for bedrock-runtime."
  type        = bool
  default     = false
}

variable "bedrock_inject_systemd_env" {
  description = "Write BEDROCK_* env into systemd when cross-account is configured."
  type        = bool
  default     = true
}
```

### `terraform/oscal_instances.tf` — add local and inject fragment

After `rds_bootstrap_fragment` local block, add:

```hcl
  # bedrock_bootstrap_fragment is defined in bedrock_cross_account.tf
```

In both `oscal_direct_user_data_green` and `oscal_direct_user_data_blue`, after `${local.rds_bootstrap_fragment}` add:

```hcl
${local.bedrock_bootstrap_fragment}
```

### `terraform/outputs.tf` — append

```hcl
output "oscal_ec2_iam_role_arn" {
  description = "ARN of OSCAL EC2 IAM role — Account B trust policy Principal.AWS"
  value       = aws_iam_role.oscal_instance.arn
}

output "bedrock_assume_role_arn" {
  description = "Cross-account Bedrock role ARN when configured"
  value       = local.bedrock_cross_account_ready ? local.bedrock_assume_role_arn : null
}

output "bedrock_cross_account_configured" {
  description = "True when AssumeRole + ExternalId are set for cross-account Bedrock"
  value       = local.bedrock_cross_account_ready
}
```

### `terraform.tfvars` example block

```hcl
# bedrock_cross_account_enabled        = true
# bedrock_account_id                   = "123456789012"
# bedrock_assume_role_name             = "OSCAL-BedrockCrossAccount"
# bedrock_assume_role_arn              = ""
# bedrock_external_id                  = "<from Account B B0>"
# bedrock_runtime_vpc_endpoint_enabled = false
```

---

## Phase 2 (future application)

Settings → AI Integration: **Credential mode**

- **Access keys** (current) — `awsAccessKeyId` / `awsSecretAccessKey`
- **Assume IAM role** — user supplies `bedrockAssumeRoleArn`; EC2 instance profile + `fromTemporaryCredentials`; optional `bedrockExternalId` or `BEDROCK_EXTERNAL_ID` from systemd

No change to existing deployments until users select assume-role mode.

---

## References

- [AWS_OPERATIONS.md — Cross-account Bedrock](AWS_OPERATIONS.md#cross-account-bedrock-terraform-and-account-b-runbook)
- [AI_INTEGRATION.md](AI_INTEGRATION.md)
