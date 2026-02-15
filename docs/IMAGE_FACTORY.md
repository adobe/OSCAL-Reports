# Adobe Image Factory – AMI usage for Terraform

EC2 instances created by the OSCAL + Ollama Terraform template **must** use images released by **Adobe Image Factory** when deploying in Adobe/AMS environments. Preference is **AWS RHEL9** images.

## References

- **Wiki:** [Adobe Image Factory](https://wiki.corp.adobe.com/pages/viewpage.action?spaceKey=imagefactory&title=Adobe+Image+Factory) – overview, process, and how to find approved AMIs.
- **UI:** [Adobe Image Factory UI](https://imagefactory.corp.adobe.com/imagefactoryui/ui/) – browse and select released images (filter by AWS, RHEL9).
- **Binary 27205 (RHEL9):** [Image Factory binary 27205](https://imagefactory.corp.adobe.com/imagefactoryui/ui/binary/27205/rec/true) – AMI IDs by region are embedded in `terraform/image_factory_ami.tf`.

## Built-in Image Factory RHEL9 AMIs

The template includes **AMI IDs by region** for Adobe Image Factory RHEL9 (binary 27205). By default (**`use_image_factory_ami = false`**), Terraform uses **Amazon Linux 2023** so deployments work without Image Factory access and avoid `AccessDenied` / "empty result" errors. Set **`use_image_factory_ami = true`** only when your account has launch permission for the Image Factory AMIs; then when `oscal_ami_id` / `ollama_ami_id` are null, Terraform uses the Image Factory AMI for `aws_region` from this map. **Default fallback is Amazon Linux 2023**; when Image Factory is enabled and available, RHEL9 is used.

| Region         | AMI ID                 |
|----------------|------------------------|
| us-east-1      | ami-06e32038c4db99126  |
| us-east-2      | ami-0e6ea72578cf63ab1  |
| ca-central-1   | ami-0b86b3588a2259c18  |
| us-west-1      | ami-0b3303f50bac8b1ec  |
| us-west-2      | ami-08966568ea1741ccf  |
| ap-northeast-1 | ami-0625a18a1d2b82c2b  |
| eu-west-1      | ami-08d9240913054c65c  |
| eu-west-2      | ami-0a1d6a67f9f81d221  |
| eu-west-3      | ami-0913cfb5e6383f339  |
| eu-central-1   | ami-0ed16ba3a0888058e  |
| ap-south-1     | ami-0e9b9bcd954661396  |
| ap-south-2     | ami-0502476911e5ad219  |
| ap-southeast-1 | ami-018cdba9536e45154  |
| ap-southeast-2 | ami-0669b9e25d544a79a  |
| ap-southeast-3 | ami-0c584e95e3fc8cfa7  |
| sa-east-1      | ami-0ed1925ba65d07acf  |

For other regions, set `oscal_ami_id` and `ollama_ami_id` explicitly in `terraform.tfvars`.

## Troubleshooting

### "Not authorized for images: [ami-xxxxxxxx]"

The Image Factory AMI may be in a different AWS account. Your account (e.g. 432417415905) must have **launch permission** for that AMI (owner shares the AMI with your account in EC2 → AMI → Permissions).

**Fix (default behavior):** Set **`use_image_factory_ami = false`** (default) in `terraform.tfvars` so Terraform uses **Amazon Linux 2023**. No Image Factory access is required. After the Image Factory AMI is shared with your account for your region, set `use_image_factory_ami = true` and apply again to use the Image Factory RHEL9 AMI.

## How to use Image Factory RHEL9 in this template

1. **Set variables in `terraform.tfvars`**
   - Set **`use_image_factory_ami = true`** and leave `oscal_ami_id` and `ollama_ami_id` **null** to use Image Factory AMI for `aws_region` when your account has access:
   ```hcl
   aws_region             = "us-east-1"
   use_image_factory_ami   = true   # only if account has Image Factory AMI access
   # oscal_ami_id and ollama_ami_id left null → Image Factory or Amazon Linux 2023
   ```
   - Default **`use_image_factory_ami = false`** uses Amazon Linux 2023 (no Image Factory needed).
   - Or override with a specific AMI:
   ```hcl
   oscal_ami_id  = "ami-xxxxxxxx"   # optional override
   ollama_ami_id = "ami-xxxxxxxx"   # optional override
   ```

2. **Apply**
   - Run `./run-with-aws-pass.sh plan` then `./run-with-aws-pass.sh apply`.
   - User_data uses `dnf` and podman (RHEL9-compatible).

## S3 bucket naming (AMS)

S3 bucket names **must be lowercase**. Use the AMS prefix, e.g. in `terraform.tfvars`:

```hcl
s3_logs_bucket_name = "ams-oscal-432417415905"
```

(Terraform will lowercase the value if you use uppercase.)

## Summary

| Item | Action |
|------|--------|
| AMI source | Adobe Image Factory RHEL9 (when enabled) or Amazon Linux 2023 (default fallback) |
| Where to find AMIs | [Image Factory UI](https://imagefactory.corp.adobe.com/imagefactoryui/ui/) |
| Terraform variables | `use_image_factory_ami` (default false = Amazon Linux 2023); `oscal_ami_id`, `ollama_ami_id` (null = Image Factory if enabled, else Amazon Linux 2023) |
| Bucket naming | `AMS-oscal-logs-<account-id>` |
