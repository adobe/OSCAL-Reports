#!/usr/bin/env bash
# Fix 504 Gateway Timeout: apply ALB idle_timeout (300s) and restart OSCAL on Green/Blue instances.
# Run from repo root. Uses same SSH key and Terraform dir as deploy-to-ec2.sh.
#
# Usage:
#   ./scripts/debug/fix-504-alb-and-instances.sh
#   SSH_KEY_FILE=/path/to/key.pem ./scripts/debug/fix-504-alb-and-instances.sh

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TERRAFORM_DIR="${TERRAFORM_DIR:-$REPO_ROOT/terraform}"
SSH_USER="${SSH_USER:-ec2-user}"
PASS_ENTRY="${AWS_PASS_SSH_ENTRY:-AWS/OSCAL-AWS4379-SSH}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC}  $1"; }
print_info() { echo -e "${CYAN}ℹ${NC}  $1"; }

resolve_ssh_key() {
  if [ -n "$SSH_KEY_FILE" ] && [ -f "$SSH_KEY_FILE" ]; then
    SSH_KEY="$SSH_KEY_FILE"
    return
  fi
  if command -v pass >/dev/null 2>&1 && pass show "$PASS_ENTRY" >/dev/null 2>&1; then
    SSH_KEY=$(mktemp)
    trap 'rm -f "$SSH_KEY"' EXIT
    pass show "$PASS_ENTRY" > "$SSH_KEY"
    chmod 600 "$SSH_KEY"
    return
  fi
  print_error "Set SSH_KEY_FILE or have Pass entry $PASS_ENTRY"
  exit 1
}

get_terraform_ips() {
  local tfdir="$1"
  [ ! -d "$tfdir" ] || [ ! -f "$tfdir/terraform.tfstate" ] && return 1
  cd "$tfdir"
  local green blue
  green=$(terraform output -raw oscal_green_public_ip 2>/dev/null || terraform output -raw oscal_green_private_ip 2>/dev/null || true)
  blue=$(terraform output -raw oscal_blue_public_ip 2>/dev/null || terraform output -raw oscal_blue_private_ip 2>/dev/null || true)
  cd - >/dev/null
  [ -n "$green" ] && [ -n "$blue" ] && echo "$green $blue" && return 0
  return 1
}

# --- 1. Apply Terraform (ALB idle_timeout = 300) ---
print_info "Step 1: Applying Terraform (ALB idle_timeout 300s)..."
if [ -x "$REPO_ROOT/terraform/run-with-aws-pass.sh" ]; then
  if "$REPO_ROOT/terraform/run-with-aws-pass.sh" apply -auto-approve; then
    print_success "Terraform apply completed; ALB idle_timeout is 300s."
  else
    print_warning "Terraform apply failed. Continue to restart instances anyway (ALB may still have old timeout)."
  fi
else
  print_warning "terraform/run-with-aws-pass.sh not found or not executable. Run: cd terraform && ./run-with-aws-pass.sh apply -auto-approve"
fi

# --- 2. Restart OSCAL on both instances ---
IPS=$(get_terraform_ips "$TERRAFORM_DIR" || true)
if [ -z "$IPS" ]; then
  print_warning "Could not get Green/Blue IPs from Terraform. Restart instances manually: ssh to each and run sudo systemctl restart oscal-reporter.service"
  exit 0
fi

GREEN_IP=$(echo "$IPS" | awk '{print $1}')
BLUE_IP=$(echo "$IPS" | awk '{print $2}')
resolve_ssh_key

print_info "Step 2: Restarting oscal-reporter on Green ($GREEN_IP) and Blue ($BLUE_IP)..."
for role in "green:$GREEN_IP:3019" "blue:$BLUE_IP:3020"; do
  role_name="${role%%:*}"
  rest="${role#*:}"
  ip="${rest%%:*}"
  port="${rest##*:}"
  if ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "${SSH_USER}@${ip}" "sudo systemctl restart oscal-reporter.service" 2>/dev/null; then
    print_success "Restarted $role_name at $ip"
  else
    print_warning "Could not restart $role_name at $ip (SSH failed or service not found)"
  fi
done

# --- 3. Wait and verify /health; on failure run diagnostics ---
print_info "Step 3: Waiting 20s then checking /health on both instances..."
sleep 20
for role in "green:$GREEN_IP:3019" "blue:$BLUE_IP:3020"; do
  role_name="${role%%:*}"
  rest="${role#*:}"
  ip="${rest%%:*}"
  port="${rest##*:}"
  if curl -sf --connect-timeout 5 "http://${ip}:${port}/health" >/dev/null 2>&1; then
    print_success "$role_name /health OK at http://${ip}:${port}/health"
  else
    print_warning "$role_name /health not responding at http://${ip}:${port}/health"
    print_info "Diagnostics for $role_name ($ip):"
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "${SSH_USER}@${ip}" \
      "echo '--- systemctl status ---'; sudo systemctl status oscal-reporter.service --no-pager 2>/dev/null || true; echo ''; echo '--- journalctl last 50 ---'; sudo journalctl -u oscal-reporter.service -n 50 --no-pager 2>/dev/null || true; echo ''; echo '--- port listening? ---'; ss -tlnp 2>/dev/null | grep -E ':3019|:3020' || true" 2>/dev/null || print_warning "Could not SSH to $ip for diagnostics"
  fi
done

print_success "Fix complete."
if curl -sf --connect-timeout 5 "http://${GREEN_IP}:3019/health" >/dev/null 2>&1 && curl -sf --connect-timeout 5 "http://${BLUE_IP}:3020/health" >/dev/null 2>&1; then
  print_info "Wait 1–2 minutes for ALB target health checks, then try the ALB URL again."
else
  print_warning "If diagnostics above show missing server.js or 'code not found', run a full deploy first: ./scripts/deploy-to-ec2.sh"
  print_info "Then wait 1–2 minutes for ALB health checks and retry the ALB URL."
fi
