#!/usr/bin/env bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# Obtain a Let's Encrypt certificate (manual DNS-01 in Route53), import it into AWS ACM,
# and optionally update Terraform tfvars so the ALB uses it for HTTPS.
# Core emergency fallback when corporate PKI / DigiCert is unavailable — see docs/TLS_CERTIFICATE_AND_PKI.md.
#
# Route53 is assumed to be in a DIFFERENT AWS account (credentials not in Pass). This script
# prompts you with exact steps to create/update the DNS TXT record manually; certbot then
# validates and issues the cert. ACM import uses the ALB account (same as Terraform; Pass or env).
#
# Prerequisites:
#   - certbot installed (e.g. brew install certbot)
#   - AWS CLI for ACM import (credentials for ALB account: Pass AWS/AMS_4403-STG or env)
#   - Domain must be oscal.amsgovcloud.com.au (or set DOMAIN)
#
# Usage:
#   ./scripts/letsencrypt-acm-import.sh
#   LETSENCRYPT_EMAIL=you@example.com ./scripts/letsencrypt-acm-import.sh
#   DOMAIN=oscal.amsgovcloud.com.au TFVARS=terraform/envs/aws4403/terraform.tfvars ./scripts/letsencrypt-acm-import.sh
#   SKIP_TFVARS_UPDATE=1 ./scripts/letsencrypt-acm-import.sh   # only print ARN, do not edit tfvars
#
# Environment:
#   DOMAIN                  FQDN for the certificate (default: oscal.amsgovcloud.com.au)
#   LETSENCRYPT_EMAIL       Email for Let's Encrypt (required for --agree-tos)
#   TFVARS                  Path to terraform.tfvars to set alb_ssl_certificate_arn (default: repo/terraform/envs/aws4403/terraform.tfvars)
#   SKIP_TFVARS_UPDATE      If set, do not modify tfvars; only print the new cert ARN
#   AWS_REGION              Region for ACM import (default: us-east-1)
#   TERRAFORM_DIR            Used to default TFVARS to $TERRAFORM_DIR/terraform.tfvars
#   CERTBOT_BASE             Base dir for certbot config/work/logs (default: $HOME/.certbot-oscal). Used so certbot runs without root.
#
# After running: from terraform/ run ./run-with-aws-pass.sh apply to attach the cert to the ALB.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DOMAIN="${DOMAIN:-oscal.amsgovcloud.com.au}"
AWS_REGION="${AWS_REGION:-us-east-1}"
TERRAFORM_DIR="${TERRAFORM_DIR:-$REPO_ROOT/terraform/envs/aws4403}"
TFVARS="${TFVARS:-$TERRAFORM_DIR/terraform.tfvars}"

# Certbot dirs: use user-writable paths so certbot does not require root (avoids Permission denied on /var/log/letsencrypt)
CERTBOT_BASE="${CERTBOT_BASE:-$HOME/.certbot-oscal}"
CERTBOT_CONFIG_DIR="${CERTBOT_CONFIG_DIR:-$CERTBOT_BASE/config}"
CERTBOT_WORK_DIR="${CERTBOT_WORK_DIR:-$CERTBOT_BASE/work}"
CERTBOT_LOGS_DIR="${CERTBOT_LOGS_DIR:-$CERTBOT_BASE/logs}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

print_ok()    { echo -e "${GREEN}✓${NC} $1"; }
print_fail() { echo -e "${RED}✗${NC} $1"; }
print_warn() { echo -e "${YELLOW}⚠${NC}  $1"; }
print_info() { echo -e "${CYAN}ℹ${NC}  $1"; }
print_step() { echo -e "${BOLD}>>>${NC} $1"; }

# ---------- Step 0: Email for Let's Encrypt ----------
if [ -z "${LETSENCRYPT_EMAIL:-}" ]; then
  echo -e "${BOLD}Let's Encrypt requires an email for expiry/important notices.${NC}"
  printf 'Enter email for Let'\''s Encrypt: '
  read -r LETSENCRYPT_EMAIL
  [ -n "$LETSENCRYPT_EMAIL" ] || { print_fail "Email is required."; exit 1; }
fi

# ---------- Step 0b: Ensure certbot is installed ----------
if ! command -v certbot >/dev/null 2>&1; then
  print_info "certbot not found. Attempting to install via Homebrew..."
  if command -v brew >/dev/null 2>&1; then
    brew install certbot
    if ! command -v certbot >/dev/null 2>&1; then
      print_fail "certbot still not in PATH after brew install. Add the Homebrew bin directory to PATH and re-run."
      exit 1
    fi
    print_ok "certbot installed."
  else
    print_fail "certbot not found and Homebrew (brew) is not installed. Install certbot manually (e.g. brew install certbot) and re-run."
    exit 1
  fi
fi

# ---------- Step 1: Manual DNS instructions (Route53 in another account) ----------
echo ""
echo -e "${BOLD}===============================================================================${NC}"
echo -e "${BOLD}  MANUAL STEP: Add a DNS TXT record in Route53 (different AWS account)       ${NC}"
echo -e "${BOLD}===============================================================================${NC}"
echo ""
print_info "Route53 for $DOMAIN is in a different AWS account; credentials are not in Pass."
echo ""
echo "When certbot runs below, it will show:"
echo "  - A record NAME (e.g. _acme-challenge.oscal.amsgovcloud.com.au or _acme-challenge.oscal)"
echo "  - A record VALUE (a long token)"
echo ""
echo "Do the following in the AWS account that hosts the Route53 zone for this domain:"
echo ""
print_step "1. Log into the AWS account that owns the Route53 hosted zone for ${DOMAIN}."
print_step "2. Open Route53 → Hosted zones → select the zone (e.g. amsgovcloud.com.au or oscal.amsgovcloud.com.au)."
print_step "3. Create record:"
echo "     - Record name:  (certbot will show this; often _acme-challenge.oscal for zone amsgovcloud.com.au)"
echo "     - Record type:  TXT"
echo "     - Value:        (the token certbot will show)"
echo "     - TTL:          300 (or default)"
print_step "4. Save the record. Wait 1–2 minutes for DNS propagation if needed."
print_step "5. When certbot prompts you, press Enter only AFTER the TXT record is visible (e.g. dig TXT _acme-challenge.oscal.amsgovcloud.com.au)."
echo ""
echo -e "${BOLD}Press Enter to start certbot (it will show the exact NAME and VALUE to add in Route53)...${NC}"
read -r

# ---------- Step 2: Run certbot (manual DNS-01) ----------
mkdir -p "$CERTBOT_CONFIG_DIR" "$CERTBOT_WORK_DIR" "$CERTBOT_LOGS_DIR"
CERTBOT_OPTS=(
  --config-dir "$CERTBOT_CONFIG_DIR"
  --work-dir "$CERTBOT_WORK_DIR"
  --logs-dir "$CERTBOT_LOGS_DIR"
)
print_info "Running certbot for $DOMAIN (manual DNS-01)..."
if ! certbot certonly --manual -d "$DOMAIN" --preferred-challenges dns \
  --agree-tos --email "$LETSENCRYPT_EMAIL" --no-eff-email \
  "${CERTBOT_OPTS[@]}"; then
  print_fail "Certbot failed. Add the TXT record in Route53 and run this script again."
  exit 1
fi

print_ok "Certificate issued for $DOMAIN."

# ---------- Step 3: Locate cert files ----------
# Certbot stored certs in CERTBOT_CONFIG_DIR/live/DOMAIN (we passed --config-dir above).
LIVE_DIR="$CERTBOT_CONFIG_DIR/live/$DOMAIN"
CERT_LINE=$(certbot certificates -d "$DOMAIN" "${CERTBOT_OPTS[@]}" 2>/dev/null | grep "Certificate Path" | head -1) || true
if [ -n "$CERT_LINE" ]; then
  FULLCHAIN="${CERT_LINE#*:}"
  FULLCHAIN="${FULLCHAIN#"${FULLCHAIN%%[! ]*}"}"
  LIVE_DIR=$(dirname "$FULLCHAIN")
fi
if [ ! -d "$LIVE_DIR" ] || [ ! -f "$LIVE_DIR/cert.pem" ] || [ ! -f "$LIVE_DIR/privkey.pem" ]; then
  # Fallback: try common system paths in case cert was issued elsewhere
  for base in "/etc/letsencrypt/live/$DOMAIN" \
    "/opt/homebrew/etc/letsencrypt/live/$DOMAIN" \
    "$HOME/.config/letsencrypt/live/$DOMAIN"; do
    if [ -f "$base/cert.pem" ] && [ -f "$base/privkey.pem" ]; then
      LIVE_DIR="$base"
      break
    fi
  done
fi

if [ -z "${LIVE_DIR:-}" ] || [ ! -f "$LIVE_DIR/cert.pem" ] || [ ! -f "$LIVE_DIR/privkey.pem" ] || [ ! -f "$LIVE_DIR/chain.pem" ]; then
  print_fail "Could not find cert files for $DOMAIN. Expected cert.pem, chain.pem, privkey.pem in a certbot live dir."
  exit 1
fi

CERT_PEM="$LIVE_DIR/cert.pem"
CHAIN_PEM="$LIVE_DIR/chain.pem"
PRIVKEY_PEM="$LIVE_DIR/privkey.pem"

# ---------- Step 4: Load AWS credentials for ACM (ALB account) ----------
# Same account as Terraform; use Pass or env.
AWS_PASS_ENTRY="${AWS_PASS_ENTRY:-AWS/AMS_4403-STG}"
if [ -z "${AWS_ACCESS_KEY_ID:-}" ] || [ -z "${AWS_SECRET_ACCESS_KEY:-}" ]; then
  if command -v pass >/dev/null 2>&1 && pass show "$AWS_PASS_ENTRY" >/dev/null 2>&1; then
    print_info "Loading AWS credentials from Pass ($AWS_PASS_ENTRY) for ACM import..."
    while IFS= read -r line; do
      if [[ $line =~ ^[aA]ws_access_key_id=(.*)$ ]]; then export AWS_ACCESS_KEY_ID="${BASH_REMATCH[1]}"; fi
      if [[ $line =~ ^[aA]ws_secret_access_key=(.*)$ ]]; then export AWS_SECRET_ACCESS_KEY="${BASH_REMATCH[1]}"; fi
      if [[ $line =~ ^[aA]ws_session_token=(.*)$ ]]; then export AWS_SESSION_TOKEN="${BASH_REMATCH[1]}"; fi
    done < <(pass show "$AWS_PASS_ENTRY" 2>/dev/null)
  fi
fi

if [ -z "${AWS_ACCESS_KEY_ID:-}" ] || [ -z "${AWS_SECRET_ACCESS_KEY:-}" ]; then
  print_fail "AWS credentials not set. Export AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (ALB account), or add Pass entry $AWS_PASS_ENTRY."
  exit 1
fi

command -v aws >/dev/null 2>&1 || { print_fail "AWS CLI (aws) not found."; exit 1; }

# ---------- Step 5: Import certificate into ACM (skip if same serial already in ACM) ----------
# Get serial from the cert we just obtained (normalize: lowercase hex, no colons)
CERT_SERIAL=""
if command -v openssl >/dev/null 2>&1 && [ -f "$CERT_PEM" ]; then
  CERT_SERIAL=$(openssl x509 -in "$CERT_PEM" -noout -serial 2>/dev/null | sed 's/^serial=//;s/^0x//' | tr '[:upper:]' '[:lower:]' | tr -d ':')
fi

ARN=""
if [ -n "$CERT_SERIAL" ]; then
  # List certificates in ACM (issued + imported) and compare serials to avoid duplicate import
  while IFS= read -r existing_arn; do
    [ -z "$existing_arn" ] && continue
    existing_serial=$(aws acm describe-certificate --certificate-arn "$existing_arn" --region "$AWS_REGION" --query "Certificate.Serial" --output text 2>/dev/null || true)
    existing_serial=$(echo "${existing_serial:-}" | sed 's/^0x//' | tr '[:upper:]' '[:lower:]' | tr -d ':')
    if [ -n "$existing_serial" ] && [ "$existing_serial" = "$CERT_SERIAL" ]; then
      ARN="$existing_arn"
      print_ok "Certificate already in ACM (same serial). Using existing ARN: $ARN"
      break
    fi
  done < <(aws acm list-certificates --region "$AWS_REGION" --certificate-statuses ISSUED --query "CertificateSummaryList[*].CertificateArn" --output text 2>/dev/null | tr '\t' '\n')
fi

if [ -z "$ARN" ]; then
  print_info "Importing certificate into ACM (region $AWS_REGION)..."
  ARN=$(aws acm import-certificate \
    --region "$AWS_REGION" \
    --certificate "fileb://$CERT_PEM" \
    --private-key "fileb://$PRIVKEY_PEM" \
    --certificate-chain "fileb://$CHAIN_PEM" \
    --query CertificateArn \
    --output text)

  if [ -z "$ARN" ]; then
    print_fail "ACM import failed."
    exit 1
  fi
  print_ok "Certificate imported. ARN: $ARN"
fi

# ---------- Step 6: Optionally update tfvars ----------
if [ -n "${SKIP_TFVARS_UPDATE:-}" ]; then
  echo ""
  print_info "SKIP_TFVARS_UPDATE is set; not modifying tfvars."
  echo ""
  echo "Add to your terraform.tfvars:"
  echo "  alb_ssl_certificate_arn  = \"$ARN\""
  echo ""
  echo "Then from $TERRAFORM_DIR run: terraform plan && terraform apply"
  exit 0
fi

# Resolve tfvars path: if relative, from repo root
if [ -f "$TFVARS" ]; then
  TFVARS_ABS="$TFVARS"
elif [ -f "$REPO_ROOT/$TFVARS" ]; then
  TFVARS_ABS="$REPO_ROOT/$TFVARS"
else
  TFVARS_ABS="$REPO_ROOT/$TFVARS"
fi

if [ ! -f "$TFVARS_ABS" ]; then
  print_warn "tfvars not found at $TFVARS_ABS; not updating."
  echo "Set alb_ssl_certificate_arn  = \"$ARN\" in your tfvars, then terraform apply."
  exit 0
fi

# Update the line that sets alb_ssl_certificate_arn (preserve variable name and spacing)
if grep -q '^alb_ssl_certificate_arn' "$TFVARS_ABS"; then
  cp "$TFVARS_ABS" "${TFVARS_ABS}.bak"
  if sed "s|^alb_ssl_certificate_arn.*|alb_ssl_certificate_arn  = \"$ARN\"|" "$TFVARS_ABS" > "${TFVARS_ABS}.tmp" && mv "${TFVARS_ABS}.tmp" "$TFVARS_ABS"; then
    print_ok "Updated alb_ssl_certificate_arn in $TFVARS_ABS (backup: ${TFVARS_ABS}.bak)"
  else
    mv "${TFVARS_ABS}.bak" "$TFVARS_ABS" 2>/dev/null || true
    print_warn "Could not update tfvars; set manually: alb_ssl_certificate_arn  = \"$ARN\""
  fi
else
  print_warn "No line 'alb_ssl_certificate_arn' in $TFVARS_ABS; add: alb_ssl_certificate_arn  = \"$ARN\""
fi

echo ""
print_ok "Done. Next: from $TERRAFORM_DIR run terraform plan then terraform apply to attach the cert to the ALB."
echo ""
