# Adobe Image Factory RHEL9 AMI IDs by region
# Source: https://imagefactory.corp.adobe.com/imagefactoryui/ui/binary/27205/rec/true

locals {
  image_factory_ami_by_region = {
    us-east-1      = "ami-06e32038c4db99126"
    us-east-2      = "ami-0e6ea72578cf63ab1"
    ca-central-1   = "ami-0b86b3588a2259c18"
    us-west-1      = "ami-0b3303f50bac8b1ec"
    ap-northeast-1 = "ami-0625a18a1d2b82c2b"
    eu-west-1      = "ami-08d9240913054c65c"
    ap-south-1     = "ami-0e9b9bcd954661396"
    ap-southeast-1 = "ami-018cdba9536e45154"
    ap-southeast-2 = "ami-0669b9e25d544a79a"
    eu-central-1   = "ami-0ed16ba3a0888058e"
    sa-east-1      = "ami-0ed1925ba65d07acf"
    eu-west-3      = "ami-0913cfb5e6383f339"
    ap-southeast-3 = "ami-0c584e95e3fc8cfa7"
    ap-south-2     = "ami-0502476911e5ad219"
    eu-west-2      = "ami-0a1d6a67f9f81d221"
    us-west-2      = "ami-08966568ea1741ccf"
  }
  image_factory_ami_id = lookup(local.image_factory_ami_by_region, var.aws_region, null)
}
