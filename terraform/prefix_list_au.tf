# Australia IP ranges for ALB ingress restriction (when alb_restrict_to_australia = true).
# Fetches aggregated AU CIDRs from IPdeny; splits into prefix lists (max 100 entries each per AWS API limit).

data "http" "au_cidrs" {
  url = "https://www.ipdeny.com/ipblocks/data/aggregated/au-aggregated.zone"

  request_headers = {
    "Accept" = "text/plain"
  }
}

locals {
  # Parse zone file: one CIDR per line, trim empty lines.
  au_cidrs = [
    for s in split("\n", trimspace(try(data.http.au_cidrs.response_body, "")))
    : trimspace(s) if length(trimspace(s)) > 0
  ]
  # AWS API allows max 100 entries per prefix list create/modify; chunk into 100-entry lists.
  au_chunks = chunklist(local.au_cidrs, 100)
}

resource "aws_ec2_managed_prefix_list" "au" {
  for_each = var.alb_restrict_to_australia ? { for i in range(length(local.au_chunks)) : tostring(i) => local.au_chunks[i] } : {}

  name           = "${var.project_name}-au-${each.key}"
  max_entries    = length(each.value)
  address_family = "IPv4"

  dynamic "entry" {
    for_each = each.value
    content {
      cidr        = entry.value
      description = "Australia"
    }
  }
}
