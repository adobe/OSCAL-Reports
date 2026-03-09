#!/usr/bin/env bash
# SSH wrapper to connect to OSCAL EC2 instances (Green, Blue).
# Uses: Pass for SSH key (AWS/OSCAL-AWS4379-SSH); Terraform run-with-aws-pass.sh for IPs.
#
# Usage from your laptop (run from repo root):
#   ./scripts/debug/ssh-ec2.sh green     # SSH to OSCAL Green (port 3019)
#   ./scripts/debug/ssh-ec2.sh blue       # SSH to OSCAL Blue (port 3020)
#   ./scripts/debug/ssh-ec2.sh list       # Show IPs and example ssh commands (no connect)
#   ./scripts/debug/ssh-ec2.sh            # Show usage and list
#
# Env: SSH_USER=ec2-user (default), AWS_PASS_SSH_ENTRY=AWS/OSCAL-AWS4379-SSH, TERRAFORM_DIR

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/ec2-common.sh disable=SC1091
source "$SCRIPT_DIR/lib/ec2-common.sh"

resolve_ssh_key
[ ! -x "$TERRAFORM_DIR/run-with-aws-pass.sh" ] && { echo "Error: $TERRAFORM_DIR/run-with-aws-pass.sh not executable. Run Terraform apply first." >&2; exit 1; }

do_list() {
  local green blue
  green=$(get_terraform_oscal_ip green)
  blue=$(get_terraform_oscal_ip blue)
  echo "EC2 instances (from Terraform):"
  echo "  Green (OSCAL, port 3019): ${green:-<not set>}"
  echo "  Blue  (OSCAL, port 3020): ${blue:-<not set>}"
  echo ""
  echo "SSH from this wrapper:"
  echo "  $0 green"
  echo "  $0 blue"
  echo ""
  echo "Raw ssh (with key from Pass):"
  [ -n "$green" ] && echo "  ssh -i \$(pass show $PASS_ENTRY | cat) -o StrictHostKeyChecking=accept-new ${SSH_USER}@${green}"
  [ -n "$blue"  ] && echo "  ssh -i \$(pass show $PASS_ENTRY | cat) -o StrictHostKeyChecking=accept-new ${SSH_USER}@${blue}"
}

do_ssh() {
  local name=$1
  local ip=$2
  if [ -z "$ip" ]; then
    echo "Error: No IP for $name. Run: $0 list" >&2
    exit 1
  fi
  echo "Connecting to $name at $ip (user: $SSH_USER)..."
  exec ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 "${SSH_USER}@${ip}" "${@:3}"
}

case "${1:-}" in
  green)
    do_ssh "Green (OSCAL)" "$(get_terraform_oscal_ip green)" "${@:2}"
    ;;
  blue)
    do_ssh "Blue (OSCAL)" "$(get_terraform_oscal_ip blue)" "${@:2}"
    ;;
  list)
    do_list
    ;;
  -h|--help|"")
    echo "Usage: $0 <green|blue> [ssh-args...]"
    echo "       $0 list   # show IPs and ssh commands"
    echo ""
    echo "SSH to the OSCAL EC2 hosts (Green, Blue). AI is via AWS Bedrock."
    echo "Requires: pass ($PASS_ENTRY), terraform/run-with-aws-pass.sh (for IPs)."
    echo ""
    do_list
    ;;
  *)
    echo "Error: Unknown target '${1}'. Use: green, blue, or list" >&2
    exit 1
    ;;
esac
