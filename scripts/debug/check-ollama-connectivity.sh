#!/usr/bin/env bash
# Check Ollama on instance (install, service, models, local prompt), then NLB from that instance,
# then connectivity from Green/Blue to the Ollama NLB (port 11434).
# Run from repo root after Terraform apply. Uses same SSH key as deploy-to-ec2.sh.
#
# Usage:
#   ./scripts/debug/check-ollama-connectivity.sh
#   ./scripts/debug/check-ollama-connectivity.sh --green-only 1.2.3.4
#   ./scripts/debug/check-ollama-connectivity.sh --blue-only 5.6.7.8
#   OLLAMA_URL=http://my-nlb:11434 ./scripts/debug/check-ollama-connectivity.sh
#   OLLAMA_INSTANCE_IP=1.2.3.4 ./scripts/debug/check-ollama-connectivity.sh   # skip AWS discovery
#
# Environment: SSH_KEY_FILE or Pass entry AWS/OSCAL-AWS4379-SSH; TERRAFORM_DIR (default: terraform);
#   AWS_REGION or AWS_DEFAULT_REGION (for Ollama instance discovery); OLLAMA_URL; OLLAMA_INSTANCE_IP.

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TERRAFORM_DIR="${TERRAFORM_DIR:-$REPO_ROOT/terraform}"
SSH_USER="${SSH_USER:-ec2-user}"
PROMPT_QUESTION="Who is the prime minister of Australia?"

# Resolve SSH key into variable SSH_KEY (must run in main shell so temp key is not removed)
resolve_ssh() {
  if [ -n "$SSH_KEY_FILE" ] && [ -f "$SSH_KEY_FILE" ]; then
    SSH_KEY="$SSH_KEY_FILE"
    return
  fi
  if command -v pass >/dev/null 2>&1 && pass show "${AWS_PASS_SSH_ENTRY:-AWS/OSCAL-AWS4379-SSH}" >/dev/null 2>&1; then
    SSH_KEY=$(mktemp)
    trap 'rm -f "$SSH_KEY"' EXIT
    pass show "${AWS_PASS_SSH_ENTRY:-AWS/OSCAL-AWS4379-SSH}" > "$SSH_KEY"
    chmod 600 "$SSH_KEY"
    return
  fi
  echo "ERROR: Set SSH_KEY_FILE or have Pass entry AWS/OSCAL-AWS4379-SSH" >&2
  return 1
}

# Get Ollama URL from Terraform (http://<nlb_dns>:11434)
get_ollama_url() {
  if [ -n "$OLLAMA_URL" ]; then
    echo "$OLLAMA_URL"
    return
  fi
  if [ -d "$TERRAFORM_DIR" ] && [ -f "$TERRAFORM_DIR/terraform.tfstate" ]; then
    (cd "$TERRAFORM_DIR" && terraform output -raw ollama_url 2>/dev/null) || true
  fi
}

# Get one Ollama instance public IP (from ASG). Requires AWS CLI and credentials; or set OLLAMA_INSTANCE_IP.
get_ollama_instance_ip() {
  if [ -n "$OLLAMA_INSTANCE_IP" ]; then
    echo "$OLLAMA_INSTANCE_IP"
    return
  fi
  if ! command -v aws >/dev/null 2>&1; then
    return 1
  fi
  local asg_name region
  if [ -d "$TERRAFORM_DIR" ] && [ -f "$TERRAFORM_DIR/terraform.tfstate" ]; then
    asg_name=$(cd "$TERRAFORM_DIR" && terraform output -raw ollama_asg_name 2>/dev/null) || true
  fi
  [ -z "$asg_name" ] && return 1
  region="${AWS_REGION:-$AWS_DEFAULT_REGION}"
  if [ -z "$region" ] && [ -d "$TERRAFORM_DIR" ] && [ -f "$TERRAFORM_DIR/terraform.tfstate" ]; then
    region=$(cd "$TERRAFORM_DIR" && terraform output -raw aws_region 2>/dev/null) || true
  fi
  [ -z "$region" ] && return 1
  ip=$(aws ec2 describe-instances \
    --region "$region" \
    --filters \
      "Name=tag:aws:autoscaling:groupName,Values=$asg_name" \
      "Name=instance-state-name,Values=running" \
    --query 'Reservations[*].Instances[*].PublicIpAddress' \
    --output text 2>/dev/null | head -1)
  [ -z "$ip" ] && return 1
  echo "$ip"
}

# Get Green/Blue IPs from Terraform
get_ips() {
  if [ -n "$GREEN_IP" ] && [ -n "$BLUE_IP" ]; then
    echo "$GREEN_IP $BLUE_IP"
    return
  fi
  if [ -d "$TERRAFORM_DIR" ] && [ -f "$TERRAFORM_DIR/terraform.tfstate" ]; then
    cd "$TERRAFORM_DIR"
    green=$(terraform output -raw oscal_green_public_ip 2>/dev/null || terraform output -raw oscal_green_private_ip 2>/dev/null || true)
    blue=$(terraform output -raw oscal_blue_public_ip 2>/dev/null || terraform output -raw oscal_blue_private_ip 2>/dev/null || true)
    cd - >/dev/null
    [ -n "$green" ] && [ -n "$blue" ] && echo "$green $blue"
  fi
}

# Run on Ollama instance: check install, service, models, local prompts, then NLB from same box
run_ollama_checks() {
  local ip="$1"
  local key="$2"
  local url="$3"
  local host_only
  host_only=$(echo "$url" | sed -n 's|.*://\([^:/]*\).*|\1|p')
  echo "========== Ollama instance ($ip) =========="
  ssh -i "$key" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "${SSH_USER}@${ip}" bash -s "$url" "$host_only" "$PROMPT_QUESTION" << 'REMOTE'
    set -e
    url="$1"
    host_only="$2"
    prompt="$3"
    echo "1) Ollama installed:"
    if command -v ollama >/dev/null 2>&1; then
      ollama --version 2>/dev/null || true
    else
      echo "   NOT FOUND (which ollama)"
    fi
    echo ""
    echo "2) Ollama service:"
    if systemctl is-active ollama 2>/dev/null | grep -q active; then
      echo "   systemctl: active"
    elif pgrep -x ollama >/dev/null 2>&1; then
      echo "   process: running (pgrep ollama)"
    else
      echo "   NOT RUNNING"
    fi
    echo ""
    echo "3) Models (ollama list):"
    ollama list 2>/dev/null || echo "   (ollama list failed)"
    echo ""
    echo "4) Gemma 3 - local prompt: \"$prompt\""
    if ollama list 2>/dev/null | grep -qE 'gemma3|gemma'; then
      model=$(ollama list 2>/dev/null | awk '{print $1}' | grep -E '^gemma3' | head -1)
      [ -z "$model" ] && model="gemma3:latest"
      ollama run "$model" "$prompt" 2>/dev/null | head -15
    else
      echo "   (gemma3 not found in ollama list - pull with: ollama pull gemma3:latest)"
    fi
    echo ""
    echo "5) Mistral 7B - local prompt: \"$prompt\""
    if ollama list 2>/dev/null | grep -qE 'mistral'; then
      model=$(ollama list 2>/dev/null | awk '{print $1}' | grep -E 'mistral' | head -1)
      [ -z "$model" ] && model="mistral:7b"
      ollama run "$model" "$prompt" 2>/dev/null | head -15
    else
      echo "   (mistral not found in ollama list - pull with: ollama pull mistral:7b)"
    fi
    echo ""
    echo "6) Same question via NLB from this box (curl to $url):"
    code=$(curl -s -o /tmp/ollama_nlb_tags.json -w "%{http_code}" --connect-timeout 10 "$url/api/tags" 2>/dev/null || echo "000")
    echo "   GET $url/api/tags -> HTTP $code"
    if [ "$code" = "200" ]; then
      echo "   Models via NLB:"
      grep -o '"name":"[^"]*"' /tmp/ollama_nlb_tags.json 2>/dev/null | head -5 || true
      echo ""
      echo "   POST $url/api/generate (gemma3, prompt: \"$prompt\") - first 200 chars:"
      resp=$(curl -s -X POST "$url/api/generate" --connect-timeout 15 -H "Content-Type: application/json" \
        -d "{\"model\":\"gemma3:latest\",\"prompt\":\"$prompt\",\"stream\":false}" 2>/dev/null || echo "")
      echo "$resp" | head -c 200
      echo ""
    else
      echo "   (NLB not reachable from this instance - connection refused or timeout)"
    fi
    rm -f /tmp/ollama_nlb_tags.json
REMOTE
  echo ""
}

# Run on Green/Blue: curl to NLB, firewalld, DNS
run_on() {
  local ip="$1"
  local label="$2"
  local key="$3"
  local url="$4"
  echo "========== $label ($ip) =========="
  ssh -i "$key" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "${SSH_USER}@${ip}" "
    echo '1) Curl to Ollama NLB:'
    curl -s -o /dev/null -w '   HTTP code: %{http_code}, time: %{time_total}s\n' --connect-timeout 10 '$url/api/tags' 2>/dev/null || true
    curl -v --connect-timeout 10 '$url/api/tags' 2>&1 | head -20
    echo ''
    echo '2) Firewalld (if active):'
    sudo firewall-cmd --list-all 2>/dev/null || echo '   (firewalld not active or not installed)'
    echo ''
    echo '3) DNS resolve (NLB hostname):'
    hostname -f
    nslookup \$(echo '$url' | sed -n 's|.*://\([^:/]*\).*|\1|p') 2>/dev/null | head -8 || true
  "
  echo ""
}

# --- main ---
OLLAMA_URL=$(get_ollama_url)
if [ -z "$OLLAMA_URL" ]; then
  echo "Set OLLAMA_URL (e.g. http://ams-oscal-ollama-nlb-xxx.elb.us-east-1.amazonaws.com:11434) or run from repo with terraform applied."
  exit 1
fi

resolve_ssh || exit 1

# Optional: only Green or only Blue
if [ "$1" = "--green-only" ] && [ -n "$2" ]; then
  run_on "$2" "Green" "$SSH_KEY" "$OLLAMA_URL"
  exit 0
fi
if [ "$1" = "--blue-only" ] && [ -n "$2" ]; then
  run_on "$2" "Blue" "$SSH_KEY" "$OLLAMA_URL"
  exit 0
fi

echo "Ollama URL: $OLLAMA_URL"
echo ""

# Phase 1: Ollama instance checks (if we can find one)
OLLAMA_IP=$(get_ollama_instance_ip 2>/dev/null) || true
if [ -n "$OLLAMA_IP" ]; then
  run_ollama_checks "$OLLAMA_IP" "$SSH_KEY" "$OLLAMA_URL" || true
else
  echo "Ollama instance: skipped (no running instance in ASG; set desired capacity to 1 in EC2 -> Auto Scaling Groups, or set OLLAMA_INSTANCE_IP to test a specific instance)."
  echo "  Region for discovery: set AWS_REGION or run 'terraform apply' so 'terraform output aws_region' works."
  echo ""
fi

# Phase 2: Green and Blue connectivity to NLB
IPS=$(get_ips)
if [ -z "$IPS" ]; then
  echo "Could not get Green/Blue IPs. Set GREEN_IP and BLUE_IP or run from repo with terraform applied."
  exit 1
fi

GREEN_IP=$(echo "$IPS" | awk '{print $1}')
BLUE_IP=$(echo "$IPS" | awk '{print $2}')

run_on "$GREEN_IP" "Green" "$SSH_KEY" "$OLLAMA_URL"
run_on "$BLUE_IP" "Blue" "$SSH_KEY" "$OLLAMA_URL"

echo "Next steps:"
echo "  - Timeout from Blue/Green to NLB usually means no healthy targets. In AWS Console: EC2 -> Target Groups -> *-ollama-11434 -> Targets. Ensure at least one target is Healthy."
echo "  - If the ASG is at 0, set desired capacity to 1 (or trigger Lambda wake). Wait for instance to boot and target to become Healthy (2–5 min), then retry."
echo "  - On the Ollama instance: ensure Ollama listens on 0.0.0.0 (run: ./scripts/debug/run-install-ollama-on-instance.sh for full flow, or ./scripts/debug/run-install-ollama-on-instance.sh listener [IP] to fix listener only). Firewalld allows 11434 from VPC only (internal)."
