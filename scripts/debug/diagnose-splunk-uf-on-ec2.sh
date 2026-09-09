#!/usr/bin/env bash
# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com

# Diagnose Splunk Universal Forwarder / Security Splunk SCC delivery on Blue and Green EC2
# instances through AWS SSM Run Command (SSAAU-212).
#
# Usage: ./scripts/debug/diagnose-splunk-uf-on-ec2.sh
#        ./scripts/debug/diagnose-splunk-uf-on-ec2.sh --green-only
#        ./scripts/debug/diagnose-splunk-uf-on-ec2.sh --blue-only

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/ec2-ssm-common.sh disable=SC1091
source "$SCRIPT_DIR/../lib/ec2-ssm-common.sh"

GREEN_INSTANCE_ID=""
BLUE_INSTANCE_ID=""
case "${1:-}" in
  --green-only) GREEN_INSTANCE_ID=$(get_asg_oscal_instance_id green) ;;
  --blue-only)  BLUE_INSTANCE_ID=$(get_asg_oscal_instance_id blue) ;;
  *)
    GREEN_INSTANCE_ID=$(get_asg_oscal_instance_id green)
    BLUE_INSTANCE_ID=$(get_asg_oscal_instance_id blue)
    ;;
esac

if [ -z "$GREEN_INSTANCE_ID" ] && [ -z "$BLUE_INSTANCE_ID" ]; then
  echo "Error: Could not resolve a live Green or Blue ASG instance." >&2
  exit 1
fi

run_remote() {
  local instance_id=$1
  local name=$2
  local remote_script
  remote_script=$(cat <<'REMOTE'
INSTANCE_NAME=$1
SPLUNK_HOME="/opt/splunkforwarder"
SPLUNK_BIN="$SPLUNK_HOME/bin/splunk"

echo "========== $INSTANCE_NAME =========="

if [ ! -x "$SPLUNK_BIN" ]; then
  echo "  Splunk UF: NOT installed/executable at $SPLUNK_BIN"
  exit 0
fi
echo "  Splunk UF: $($SPLUNK_BIN version 2>/dev/null | head -1)"

# Authoritative "what config is actually active" — settles precedence between our system/local
# override and any app (e.g. Image Factory's xif-deployment_client_app).
echo "  --- effective deploymentclient.conf (splunk btool --debug) ---"
sudo "$SPLUNK_BIN" btool deploymentclient list --debug 2>/dev/null | grep -E 'targetUri|clientName|deploymentclient.conf' || echo "    (btool produced no deployment-client output)"

echo "  --- deploymentclient.conf sources on disk ---"
for conf in \
  "$SPLUNK_HOME/etc/system/local/deploymentclient.conf" \
  "$SPLUNK_HOME/etc/apps/DC-seclogs/local/deploymentclient.conf" \
  "$SPLUNK_HOME/etc/apps/xif-deployment_client_app/local/deploymentclient.conf"; do
  if [ -f "$conf" ]; then
    echo "  [$conf]"
    grep -E 'targetUri|clientName|disabled' "$conf" 2>/dev/null | sed 's/^/    /'
  else
    echo "  [$conf]: not present"
  fi
done

echo "  --- deployment-server handshake ---"
if [ -f "$SPLUNK_HOME/var/log/splunk/splunkd.log" ]; then
  if grep -q 'DC:HandshakeReplyHandler - Handshake done' "$SPLUNK_HOME/var/log/splunk/splunkd.log" 2>/dev/null; then
    echo "    Handshake OK"
  else
    echo "    WARNING: handshake not seen yet (allow up to 30 min after bootstrap)"
  fi
else
  echo "    splunkd.log not found"
fi

echo "  --- basic TCP/anonymous-TLS reachability (NOT proof of success) ---"
echo "    NOTE: this does not exercise Splunk's mutual-TLS client-cert output path, which is"
echo "    where SSAAU-212 actually fails — a 'reachable' result here can still mask an Emissary"
echo "    allowlist problem. The errno 104 count below is the real signal."
for host_port in ds2.splunk.adobe.net:443 hf3.splunk.adobe.net:443; do
  host="${host_port%%:*}"
  if timeout 5 bash -c "echo | openssl s_client -connect $host_port" >/dev/null 2>&1; then
    echo "    $host_port: reachable (basic TCP/TLS)"
  else
    echo "    $host_port: NOT reachable (check egress SG + Adobe Emissary allowlist)"
  fi
done

echo "  --- actual mTLS output failures (the real SSAAU-212 signal) ---"
errno104=$(grep -c 'sock_error = 104' "$SPLUNK_HOME/var/log/splunk/splunkd.log" 2>/dev/null || echo 0)
if [ "$errno104" -gt 0 ]; then
  echo "    WARNING: $errno104 connection-reset (errno 104) events to the indexer tier."
  echo "    This is the Adobe Emissary allowlist symptom, not a config problem — verify the VPC/"
  echo "    subnet carries tag emissary=trusted (terraform/vpc.tf; see docs/CHANGELOG.md Appendix A)."
else
  echo "    No errno 104 resets found."
fi

echo "  --- journald logging requirement (wiki: Missing Device Logs) ---"
sudo "$SPLUNK_BIN" btool inputs list --debug 2>/dev/null | grep -A4 'journald://messages\|journald://audit' | sed 's/^/    /' || echo "    (no journald stanzas found via btool)"

echo "  --- meta fields (00-secops_meta_app) ---"
meta_conf="$SPLUNK_HOME/etc/apps/00-secops_meta_app/local/inputs.conf"
if [ -s "$meta_conf" ]; then
  if grep -q 'meta_application_uai' "$meta_conf" 2>/dev/null; then
    echo "    Image-Factory-populated (has meta_application_uai) — do not overwrite"
  else
    echo "    Looks like our [default] fallback (Image Factory had not pre-populated this)"
  fi
else
  echo "    Not present or empty"
fi

echo "  --- ObsPack / OpenTelemetry Collector (if in use alongside UF) ---"
if [ -x /etc/observabilitypack/generate_otel_diag.sh ]; then
  echo "    ObsPack present — run 'sudo /etc/observabilitypack/generate_otel_diag.sh' for a LOGREQ bundle."
else
  echo "    ObsPack not found (Splunk UF only)"
fi

echo "  --- LOGREQ triage bundle ---"
echo "    If unresolved, run 'sudo $SPLUNK_BIN diag' and attach the bundle to a LOGREQ ticket."
echo ""
REMOTE
)
  ssm_run_shell "$instance_id" "$remote_script" 300 "$name"
}

if [ -n "$GREEN_INSTANCE_ID" ]; then
  echo "Green instance: $GREEN_INSTANCE_ID"
  run_remote "$GREEN_INSTANCE_ID" "GREEN"
fi
if [ -n "$BLUE_INSTANCE_ID" ]; then
  echo "Blue instance: $BLUE_INSTANCE_ID"
  run_remote "$BLUE_INSTANCE_ID" "BLUE"
fi

echo "Done."
echo "  • Expect effective targetUri = ds2.splunk.adobe.net:443. Image Factory's own"
echo "    xif-deployment_client_app already targets the correct SCC endpoint on this fleet — a"
echo "    config-precedence mismatch is NOT the current live blocker; do not assume it is."
echo "  • If the errno 104 count above is > 0: that is the live SSAAU-212 blocker. Confirm the VPC"
echo "    and public subnets carry tag emissary=trusted (terraform/vpc.tf), and allow up to 20 min"
echo "    after tagging for Adobe's Emissary allowlist to propagate. If still failing after that,"
echo "    open a LOGREQ — it is an Adobe network-perimeter issue, not fixable in this repo."
echo "  • journald and meta-field checks should both come back clean on Image Factory AMIs."
