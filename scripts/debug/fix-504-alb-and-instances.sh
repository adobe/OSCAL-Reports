#!/usr/bin/env bash
# Fix 504 Gateway Timeout: apply ALB idle_timeout (300s) and restart OSCAL on Green/Blue instances.
# Run from repo root. Uses same SSH key and Terraform dir as deploy-to-ec2.sh.
#
# Usage:
#   ./scripts/debug/fix-504-alb-and-instances.sh
#   SSH_KEY_FILE=/path/to/key.pem ./scripts/debug/fix-504-alb-and-instances.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/ec2-common.sh"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC}  $1"; }
print_info() { echo -e "${CYAN}ℹ${NC}  $1"; }

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
GREEN_IP=$(get_terraform_oscal_ip green)
BLUE_IP=$(get_terraform_oscal_ip blue)
if [ -z "$GREEN_IP" ] || [ -z "$BLUE_IP" ]; then
  print_warning "Could not get Green/Blue IPs from Terraform. Restart instances manually: ssh to each and run sudo systemctl restart oscal-reporter.service"
  exit 0
fi

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
    print_info "Running diagnostics for $role_name ($ip):"
    "$SCRIPT_DIR/check-oscal-instance.sh" "--${role_name}" "$ip" 2>/dev/null || print_warning "Could not run check-oscal-instance.sh for $ip"
  fi
done

print_success "Fix complete."
if curl -sf --connect-timeout 5 "http://${GREEN_IP}:3019/health" >/dev/null 2>&1 && curl -sf --connect-timeout 5 "http://${BLUE_IP}:3020/health" >/dev/null 2>&1; then
  print_info "Wait 1–2 minutes for ALB target health checks, then try the ALB URL again."
else
  print_warning "If diagnostics above show missing server.js or 'code not found', run a full deploy first: ./scripts/deploy-to-ec2.sh"
  print_info "Then wait 1–2 minutes for ALB health checks and retry the ALB URL."
fi
