# Adobe Image Factory – AMI usage for Terraform

EC2 instances created by the OSCAL + Ollama Terraform template **must** use images released by **Adobe Image Factory** when deploying in Adobe/AMS environments. Preference is **AWS RHEL9** images.

## References

- **Wiki:** [Adobe Image Factory](https://wiki.corp.adobe.com/pages/viewpage.action?spaceKey=imagefactory&title=Adobe+Image+Factory) – overview, process, and how to find approved AMIs.
- **UI:** [Adobe Image Factory UI](https://imagefactory.corp.adobe.com/imagefactoryui/ui/) – browse and select released images (filter by AWS, RHEL9).
- **Binary 27205 (RHEL9):** [Image Factory binary 27205](https://imagefactory.corp.adobe.com/imagefactoryui/ui/binary/27205/rec/true) – AMI IDs by region are embedded in `terraform/image_factory_ami.tf`.

## Built-in Image Factory RHEL9 AMIs

The template includes **AMI IDs by region** for Adobe Image Factory RHEL9 (binary 27205). When `use_rhel9 = true` and `oscal_ami_id` / `ollama_ami_id` are **null**, Terraform uses the AMI for `aws_region` from this map. **Ubuntu is not looked up** when RHEL9 is selected and the region is in the map, so OSCAL and Ollama instances will launch with the RHEL9 AMI.

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

**Workaround until AMI is shared:** In `terraform.tfvars` set `use_rhel9 = false` and run apply again. Instances will use Ubuntu 22.04. After the Image Factory AMI is shared with your account, set `use_rhel9 = true` and apply to replace instances with RHEL9.

## How to use Image Factory RHEL9 in this template

1. **Set variables in `terraform.tfvars`**
   - Enable RHEL9 and (optional) set region; AMI is chosen from the built-in map. **Use unquoted `true`** (boolean), not `"true"` (string):
   ```hcl
   aws_region = "us-east-1"
   use_rhel9  = true   # boolean: no quotes
   # oscal_ami_id and ollama_ami_id left null → use Image Factory AMI for aws_region
   ```
   - Or override with a specific AMI:
   ```hcl
   use_rhel9     = true
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
| AMI source | Adobe Image Factory (RHEL9 preferred) |
| Where to find AMIs | [Image Factory UI](https://imagefactory.corp.adobe.com/imagefactoryui/ui/) |
| Terraform variables | `oscal_ami_id`, `ollama_ami_id`, `use_rhel9 = true` |
| Bucket naming | `AMS-oscal-logs-<account-id>` |
