#!/usr/bin/env bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
#
# Post-deploy smoke checks: SPA root, readiness, optional SSO login-providers.
# Usage: post-deploy-smoke.sh HOST [PORT]
#   HOST may be an IP/hostname or "ssh:IP" to curl via SSH on the instance (localhost).

set -euo pipefail

HOST="${1:?HOST required (ip or ssh:ip)}"
PORT="${2:-3020}"
FAIL=0

curl_local() {
  local path="$1"
  if [[ "$HOST" == ssh:* ]]; then
    local ip="${HOST#ssh:}"
    local key_args=()
    [ -n "${SSH_KEY:-}" ] && key_args=(-i "$SSH_KEY")
    ssh "${key_args[@]}" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "${SSH_USER:-ec2-user}@${ip}" \
      "curl -sf --connect-timeout 5 -w '%{http_code}' -o /dev/null 'http://127.0.0.1:${PORT}${path}'" 2>/dev/null || echo "000"
  else
    curl -sf --connect-timeout 5 -w '%{http_code}' -o /dev/null "http://${HOST}:${PORT}${path}" 2>/dev/null || echo "000"
  fi
}

curl_local_body() {
  local path="$1"
  if [[ "$HOST" == ssh:* ]]; then
    local ip="${HOST#ssh:}"
    local key_args=()
    [ -n "${SSH_KEY:-}" ] && key_args=(-i "$SSH_KEY")
    ssh "${key_args[@]}" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "${SSH_USER:-ec2-user}@${ip}" \
      "curl -sf --connect-timeout 5 'http://127.0.0.1:${PORT}${path}'" 2>/dev/null || echo ""
  else
    curl -sf --connect-timeout 5 "http://${HOST}:${PORT}${path}" 2>/dev/null || echo ""
  fi
}

check_code() {
  local label="$1"
  local path="$2"
  local expect="$3"
  local code
  code=$(curl_local "$path")
  if [ "$code" = "$expect" ]; then
    echo "OK  $label ($path -> $code)"
  else
    echo "FAIL $label ($path -> $code, expected $expect)" >&2
    FAIL=1
  fi
}

check_code "SPA root" "/" "200"

ready_code=$(curl_local "/health/ready")
ready_body=$(curl_local_body "/health/ready")
if [ "$ready_code" = "200" ] && echo "$ready_body" | grep -q '"status"[[:space:]]*:[[:space:]]*"ready"'; then
  echo "OK  Readiness (/health/ready -> 200, status=ready)"
elif [ "$ready_code" = "200" ]; then
  echo "FAIL Readiness (/health/ready -> 200 but body is not JSON status=ready)" >&2
  FAIL=1
else
  echo "FAIL Readiness (/health/ready -> ${ready_code}, expected 200)" >&2
  FAIL=1
fi

check_code "Liveness" "/health" "200"

providers=$(curl_local_body "/api/auth/sso/login-providers")
if [ -n "$providers" ] && command -v jq >/dev/null 2>&1; then
  enabled=$(echo "$providers" | jq -r '[.providers[]? | select(.enabled == true)] | length' 2>/dev/null || echo "0")
  echo "INFO SSO login-providers enabled count: ${enabled:-0}"
fi

exit "$FAIL"
