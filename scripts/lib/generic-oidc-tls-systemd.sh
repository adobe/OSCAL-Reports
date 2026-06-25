#!/usr/bin/env bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
#
# Optional systemd drop-in for Generic OIDC TLS (Authentik / incomplete chain on Node).
# Set DEPLOY_GENERIC_OIDC_TLS_RELAXED=0 to skip on strict production EC2 (Okta-only).

[ -n "${_GENERIC_OIDC_TLS_SYSTEMD_LOADED:-}" ] && return 0
_GENERIC_OIDC_TLS_SYSTEMD_LOADED=1

# ensure_generic_oidc_tls_relaxed_systemd IP SSH_KEY SSH_USER
ensure_generic_oidc_tls_relaxed_systemd() {
  local ip="$1"
  local key="$2"
  local ssh_user="${3:-ec2-user}"
  local enabled="${DEPLOY_GENERIC_OIDC_TLS_RELAXED:-1}"

  [ -z "$ip" ] || [ -z "$key" ] && return 0
  case "$enabled" in
    0|false|FALSE|no|NO) return 0 ;;
  esac

  ssh -i "$key" -o StrictHostKeyChecking=no -o ConnectTimeout=120 \
    -o ServerAliveInterval=15 -o ServerAliveCountMax=20 \
    "${ssh_user}@${ip}" bash <<'REMOTE'
set -euo pipefail
DROPIN_DIR="/etc/systemd/system/oscal-reporter.service.d"
DROPIN="${DROPIN_DIR}/53-oscal-generic-oidc-tls.conf"
sudo mkdir -p "$DROPIN_DIR"
tmp="$(mktemp)"
{
  printf '%s\n' '[Service]'
  printf 'Environment=OSCAL_GENERIC_OIDC_TLS_RELAXED=1\n'
} >"$tmp"
sudo install -m 0644 "$tmp" "$DROPIN"
rm -f "$tmp"
sudo systemctl daemon-reload
echo "Generic OIDC TLS relaxed env updated at $DROPIN"
REMOTE
}
