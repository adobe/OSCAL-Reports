# Adobe Image Factory – AMI usage for Terraform

EC2 instances use **Adobe Image Factory Amazon Linux 2023** when AMI IDs are provided; otherwise **native Amazon Linux 2023** is used.

## References

- **Wiki:** [Adobe Image Factory](https://wiki.corp.adobe.com/pages/viewpage.action?spaceKey=imagefactory&title=Adobe+Image+Factory) – overview, process, and how to find approved AMIs.
- **UI:** [Adobe Image Factory UI](https://imagefactory.corp.adobe.com/imagefactoryui/ui/) – browse and select released images (filter by AWS, **Amazon Linux 2023**).

## AMI selection: Image Factory Amazon Linux 2023, then native Amazon Linux 2023

The template **prefers Adobe Image Factory Amazon Linux 2023** when AMI IDs are added in `image_factory_amazon_linux_by_region`. **When the map is empty or has no entry for your region, native Amazon Linux 2023 is used.**

**OSCAL (Green/Blue) and Ollama use the same AMI chain:** 1) optional override (`oscal_ami_id` / `ollama_ami_id`), 2) Image Factory Amazon Linux 2023 when in map, 3) native Amazon Linux 2023. There is no separate RHEL9 path for Ollama in the current template.

- **Default (`use_image_factory_ami = true`)**: Use **Image Factory Amazon Linux 2023** if an AMI ID exists in `image_factory_ami.tf` for your region; otherwise use **native Amazon Linux 2023**.
- **`use_image_factory_ami = false`**: Use **only native Amazon Linux 2023** (e.g. sandbox without Image Factory access).

## First choice: Adobe Image Factory Amazon Linux 2023

Add **Image Factory Amazon Linux 2023** AMI IDs by region in `terraform/image_factory_ami.tf` in the map `image_factory_amazon_linux_by_region`. Get AMI IDs from [Image Factory UI](https://imagefactory.corp.adobe.com/imagefactoryui/ui/) (filter by AWS, Amazon Linux 2023). When an entry exists for your `aws_region`, that AMI is used. When the map is empty or has no entry for your region, **native Amazon Linux 2023** is used (maintained by Amazon).

For other regions, set `oscal_ami_id` and `ollama_ami_id` explicitly in `terraform.tfvars`.

## Troubleshooting

### "Not authorized for images: [ami-xxxxxxxx]"

The Image Factory AMI may be in a different AWS account. Your account (e.g. 432417415905) must have **launch permission** for that AMI (owner shares the AMI with your account in EC2 → AMI → Permissions).

**Fix:** Set **`use_image_factory_ami = false`** in `terraform.tfvars` to **skip Image Factory** and use **only native Amazon Linux 2023**. No Image Factory access is required. After the Image Factory AMI is shared with your account for your region, set `use_image_factory_ami = true` (default) again and apply; the template will prefer Image Factory and fall back to native Amazon Linux only if needed.

### "AMIs are shared with me but my project is not picking up Image Factory images"

**Cause:** Terraform only uses the Image Factory AMI map when **`use_image_factory_ami = true`**. If this variable is missing or set to `false`, the template uses Amazon Linux 2023 and never tries the Image Factory AMIs.

**Fix:** In `terraform.tfvars` set:
```hcl
use_image_factory_ami = true
```
Leave `oscal_ami_id` and `ollama_ami_id` as **null**. Then run `terraform plan` / `terraform apply`. The template will use the built-in region map (or optional dynamic lookup; see below).

## How to use Image Factory in this template

1. **Set variables in `terraform.tfvars`**
   - **Default (`use_image_factory_ami = true`)**: **First choice** = Image Factory Amazon Linux 2023 (add AMI IDs in `image_factory_ami.tf` when available), **else** native Amazon Linux 2023. Leave `oscal_ami_id` and `ollama_ami_id` **null**:
   ```hcl
   aws_region             = "us-east-1"
   use_image_factory_ami   = true   # Image Factory Amazon Linux 2023 when in map; else native Amazon Linux 2023
   # oscal_ami_id and ollama_ami_id left null → Image Factory AL2023 or native AL2023
   ```
   - **`use_image_factory_ami = false`**: Use **only native Amazon Linux 2023** (vanilla Amazon-maintained); no Image Factory.
   - Or override with a specific AMI:
   ```hcl
   oscal_ami_id  = "ami-xxxxxxxx"   # optional override
   ollama_ami_id = "ami-xxxxxxxx"   # optional override
   ```

2. **Apply**
   - Run `./run-with-aws-pass.sh plan` then `./run-with-aws-pass.sh apply`.
   - User_data uses `dnf` (Amazon Linux 2023–compatible).

### Optional: dynamic lookup (automation_framework style)

If you prefer to resolve the **latest** Image Factory AMI by owner and name (e.g. to align with [automation_framework](https://git.corp.adobe.com/spartans/automation_framework/tree/master/terraform/templates)), set in `terraform.tfvars`:

```hcl
use_image_factory_ami          = true
image_factory_owner_id         = "<AWS_ACCOUNT_ID_OWNING_AMIS>"   # e.g. Image Factory account
image_factory_ami_name_pattern = "<NAME_PATTERN>"                # e.g. "Adobe*Amazon*Linux*"
```

Terraform will use `data "aws_ami"` with `most_recent = true` and the given owner + name filter instead of the static map. Use an **Amazon Linux 2023** name pattern. Leave both **null** to use the built-in static map (Image Factory Amazon Linux 2023 when in map; else native Amazon Linux 2023).

## S3 bucket naming (AMS)

S3 bucket names **must be lowercase**. Use the AMS prefix, e.g. in `terraform.tfvars`:

```hcl
s3_logs_bucket_name = "ams-oscal-432417415905"
```

(Terraform will lowercase the value if you use uppercase.)

## If the running Ollama instance is still RHEL9

The Terraform template uses the **same** AMI resolution for Ollama as for Green/Blue (Image Factory Amazon Linux 2023 when in map, else native Amazon Linux 2023). A running Ollama instance can still be RHEL9 if:

- It was launched from an **older** apply (e.g. before the template was aligned, or when `ollama_ami_id` was set to a RHEL9 AMI).
- The ASG does not replace existing instances when only the launch template AMI changes; the **next new** instance (after scale 0→1) will use the current template.

**To align Ollama with Green/Blue on Image Factory Amazon Linux 2023:**

1. In `terraform.tfvars`, set **`image_factory_amazon_linux_ami_us_east_1 = "ami-xxxxxxxx"`** with the Adobe Image Factory Amazon Linux 2023 AMI ID for us-east-1 (from [Image Factory UI](https://imagefactory.corp.adobe.com/imagefactoryui/ui/)). Leave `oscal_ami_id` and `ollama_ami_id` **null** so Green, Blue, and Ollama all use this AMI.
2. Run **`terraform apply`** (e.g. `cd terraform && ./run-with-aws-pass.sh apply -auto-approve`) so the launch templates are updated.
3. Replace the Ollama instance so the new one uses the new AMI: run **`./scripts/replace-ollama-instance-ami.sh`** from the repo root. This scales the Ollama ASG to 0, runs terraform apply, scales to 1, and runs the Ollama install + fix on the new instance. Alternatively: set ASG desired capacity to 0, wait for termination, set to 1, then run `./scripts/scale-up-ollama-and-fix.sh`.

## Summary

| Item | Action |
|------|--------|
| AMI preference | **First choice:** Adobe Image Factory **Amazon Linux 2023** (when in map). **Fallback:** native Amazon Linux 2023. **Ollama and OSCAL use the same chain.** |
| Where to find AMIs | [Image Factory UI](https://imagefactory.corp.adobe.com/imagefactoryui/ui/) (filter by AWS, Amazon Linux 2023) |
| Terraform variables | `use_image_factory_ami` (default **true** = Image Factory Amazon Linux 2023 when in map, else native AL2023); `oscal_ami_id`, `ollama_ami_id` (null = use preference order) |
| Add Image Factory Amazon Linux | In `terraform.tfvars` set `image_factory_amazon_linux_ami_us_east_1 = "ami-xxxxxxxx"` (from Image Factory UI), or add entries in `terraform/image_factory_ami.tf` in `image_factory_amazon_linux_by_region`. Both Green/Blue and Ollama use it. |
| Replace Ollama instance for new AMI | Run `./scripts/replace-ollama-instance-ami.sh` (scale 0 → apply → scale 1 → install Ollama on new instance). |
| Bucket naming | Lowercase; AMS prefix `ams-oscal-<account-id>` (e.g. `ams-oscal-432417415905`). Terraform lowercases the value. |
