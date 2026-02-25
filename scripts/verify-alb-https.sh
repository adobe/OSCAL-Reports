#!/usr/bin/env bash
# Verify ALB has HTTPS listener and oscal.amsgovcloud.com.au points to the ALB.
# Run from repo root. Loads AWS credentials from Pass (same as terraform/run-with-aws-pass.sh) if not set.
#
# Usage: ./scripts/verify-alb-https.sh

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TERRAFORM_DIR="${TERRAFORM_DIR:-$REPO_ROOT/terraform}"
DOMAIN="${ALB_DOMAIN:-oscal.amsgovcloud.com.au}"
AWS_PASS_ENTRY="${AWS_PASS_ENTRY:-AWS/AWS4379 Sandbox}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
print_ok() { echo -e "${GREEN}✓${NC} $1"; }
print_fail() { echo -e "${RED}✗${NC} $1"; }
print_warn() { echo -e "${YELLOW}⚠${NC}  $1"; }
print_info() { echo -e "${CYAN}ℹ${NC}  $1"; }

# Load AWS credentials from Pass if not already set (same entry as terraform/run-with-aws-pass.sh)
load_aws_if_needed() {
  if [ -n "$AWS_ACCESS_KEY_ID" ] && [ -n "$AWS_SECRET_ACCESS_KEY" ]; then
    return 0
  fi
  if ! command -v pass >/dev/null 2>&1; then
    print_fail "AWS credentials not set and 'pass' not found. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or run: ./terraform/run-with-aws-pass.sh run $REPO_ROOT/scripts/verify-alb-https.sh"
    exit 1
  fi
  if ! pass show "$AWS_PASS_ENTRY" >/dev/null 2>&1; then
    print_fail "Pass entry '$AWS_PASS_ENTRY' not found. Set AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY or configure Pass."
    exit 1
  fi
  while IFS= read -r line; do
    if [[ $line =~ ^[aA]ws_access_key_id=(.*)$ ]]; then export AWS_ACCESS_KEY_ID="${BASH_REMATCH[1]}"; fi
    if [[ $line =~ ^[aA]ws_secret_access_key=(.*)$ ]]; then export AWS_SECRET_ACCESS_KEY="${BASH_REMATCH[1]}"; fi
    if [[ $line =~ ^[aA]ws_session_token=(.*)$ ]]; then export AWS_SESSION_TOKEN="${BASH_REMATCH[1]}"; fi
  done < <(pass show "$AWS_PASS_ENTRY" 2>/dev/null)
}

[ ! -d "$TERRAFORM_DIR" ] || [ ! -f "$TERRAFORM_DIR/terraform.tfstate" ] && { print_fail "Terraform state not found at $TERRAFORM_DIR"; exit 1; }

load_aws_if_needed
command -v aws >/dev/null 2>&1 || { print_fail "AWS CLI (aws) not found."; exit 1; }

alb_dns=$(cd "$TERRAFORM_DIR" && terraform output -raw alb_dns_name 2>/dev/null) || { print_fail "Could not get alb_dns_name"; exit 1; }
region=$(cd "$TERRAFORM_DIR" && terraform output -raw aws_region 2>/dev/null) || region="us-east-1"

# Get ALB ARN from AWS (by DNS name)
alb_arn=$(aws elbv2 describe-load-balancers --region "$region" --query "LoadBalancers[?DNSName=='$alb_dns'].LoadBalancerArn" --output text 2>/dev/null) || true
if [ -z "$alb_arn" ] || [ "$alb_arn" = "None" ]; then
  print_fail "Could not find ALB with DNS $alb_dns in region $region (check AWS credentials)."
  exit 1
fi

echo ""
print_info "ALB: $alb_dns"
print_info "Domain: $DOMAIN"
echo ""

# 0) ACM certificate status (AWS CLI) - cert for ALB must be Issued for Terraform to create 443 listener
check_acm_cert_status() {
  # ACM certs for ALB are in the same region as the ALB
  local cert_arn
  cert_arn=$(aws acm list-certificates --region "$region" --certificate-statuses PENDING_VALIDATION ISSUED --query "CertificateSummaryList[?DomainName=='$DOMAIN'].CertificateArn" --output text 2>/dev/null) || true
  if [ -z "$cert_arn" ] || [ "$cert_arn" = "None" ]; then
    print_warn "No ACM certificate found for $DOMAIN in region $region."
    return
  fi
  local status
  status=$(aws acm describe-certificate --region "$region" --certificate-arn "$cert_arn" --query "Certificate.Status" --output text 2>/dev/null) || true
  if [ "$status" = "ISSUED" ]; then
    print_ok "ACM certificate for $DOMAIN is Issued (valid). ARN: $cert_arn"
  elif [ "$status" = "PENDING_VALIDATION" ]; then
    print_warn "ACM certificate for $DOMAIN is PENDING_VALIDATION (not yet valid). Add CNAME and wait for Issued."
  else
    print_warn "ACM certificate for $DOMAIN status: $status"
  fi
}
check_acm_cert_status
echo ""

# 1) Listeners
listeners=$(aws elbv2 describe-listeners --region "$region" --load-balancer-arn "$alb_arn" --query 'Listeners[*].[Port,Protocol]' --output text 2>/dev/null) || true
has_80=""; has_443=""
while read -r port proto; do
  [ "$port" = "80" ]  && has_80=1
  [ "$port" = "443" ] && has_443=1
done <<< "$listeners"

if [ -n "$has_443" ]; then
  print_ok "ALB has a listener on port 443 (HTTPS)."
else
  print_fail "ALB has NO listener on port 443 (HTTPS). Connection to https://$DOMAIN will be refused."
  echo ""
  # Check ACM cert status: if PENDING_VALIDATION, Terraform apply fails when creating the 443 listener (UnsupportedCertificate)
  cert_arn=$(aws acm list-certificates --region "$region" --query "CertificateSummaryList[?DomainName=='$DOMAIN'].CertificateArn" --output text 2>/dev/null) || true
  if [ -n "$cert_arn" ] && [ "$cert_arn" != "None" ]; then
    cert_status=$(aws acm describe-certificate --region "$region" --certificate-arn "$cert_arn" --query "Certificate.Status" --output text 2>/dev/null) || true
    if [ "$cert_status" = "PENDING_VALIDATION" ]; then
      print_warn "ACM certificate for $DOMAIN is still PENDING_VALIDATION."
      echo "  Terraform apply will NOT create the 443 listener until the cert is Issued (AWS rejects pending certs on the ALB)."
      echo "  Add the CNAME from: ./terraform/run-with-aws-pass.sh output acm_certificate_validation_records"
      echo "  Wait 5–30 min for ACM to show Issued, then run: ./terraform/run-with-aws-pass.sh apply -auto-approve"
      echo ""
    elif [ "$cert_status" = "ISSUED" ]; then
      print_info "Cert is Issued but 443 listener is missing. Force Terraform to create it:"
      echo "  1. From repo root run: ./terraform/run-with-aws-pass.sh plan"
      echo "     Look for: aws_lb_listener.https[0] will be created"
      echo "  2. If plan shows that, run: ./terraform/run-with-aws-pass.sh apply -auto-approve"
      echo "  3. If plan shows NO changes for the listener, ensure terraform.tfvars (in terraform/) has:"
      echo "     create_alb_certificate = true"
      echo "     alb_domain_name        = \"$DOMAIN\""
      echo "     alb_certificate_ready  = true"
      echo "     Then run apply again from repo root."
      echo ""
    fi
  fi
  print_info "Fix:"
  echo "  1. Ensure ACM cert for $DOMAIN is Issued (see ACM check above)."
  echo "  2. In terraform/terraform.tfvars set: alb_certificate_ready = true"
  echo "  3. Run from repo root: ./terraform/run-with-aws-pass.sh apply -auto-approve"
  echo ""
  exit 1
fi

if [ -n "$has_80" ]; then
  print_ok "ALB has a listener on port 80 (HTTP)."
else
  print_warn "ALB has no listener on port 80 (HTTPS-only is fine if redirect is in place)."
fi

# 2) DNS: domain should resolve to same IPs as ALB (or to ALB CNAME)
alb_ips=$(dig +short "$alb_dns" 2>/dev/null | sort) || alb_ips=""
domain_ips=$(dig +short "$DOMAIN" 2>/dev/null | sort) || domain_ips=""
if [ -z "$domain_ips" ]; then
  print_fail "Domain $DOMAIN does not resolve (DNS missing or wrong)."
  echo ""
  print_info "Raise a ticket: Add an A record (alias) or CNAME for $DOMAIN pointing to: $alb_dns"
  echo ""
  exit 1
fi
if [ -n "$alb_ips" ] && [ -n "$domain_ips" ]; then
  if [ "$alb_ips" = "$domain_ips" ]; then
    print_ok "Domain $DOMAIN resolves to the same IPs as the ALB."
  else
    print_warn "Domain $DOMAIN resolves to different IPs than the ALB. It may point to backend instances instead of the ALB."
    print_info "ALB DNS: $alb_dns -> $alb_ips"
    print_info "$DOMAIN -> $domain_ips"
    echo ""
    print_info "For HTTPS to work, $DOMAIN must point to the ALB (A/alias or CNAME to $alb_dns)."
  fi
else
  print_ok "Domain $DOMAIN resolves to: $domain_ips"
fi

# 3) Quick connectivity
print_info "Testing https://$DOMAIN (5s timeout)..."
if curl -sf --connect-timeout 5 "https://$DOMAIN/health" >/dev/null 2>&1; then
  print_ok "HTTPS reachable: https://$DOMAIN/health"
elif curl -sf --connect-timeout 5 "https://$DOMAIN/" -o /dev/null -w "%{http_code}" 2>/dev/null | grep -q 200; then
  print_ok "HTTPS reachable: https://$DOMAIN/"
else
  print_warn "HTTPS connection failed (connection refused or timeout). Check: ALB listener 443, security group allows 443, DNS points to ALB."
  echo "  Try: curl -v --connect-timeout 5 https://$DOMAIN/"
fi

echo ""
print_ok "Done."
