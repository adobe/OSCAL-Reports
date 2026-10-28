#!/usr/bin/env bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/ec2-common.sh
source "$SCRIPT_DIR/../lib/ec2-common.sh"

wake_log="$(mktemp)"
trap 'rm -f "$wake_log"' EXIT

get_asg_oscal_ip() {
  printf 'lookup:%s\n' "$1" >> "$wake_log"
  if grep -q '^wake$' "$wake_log"; then
    printf '203.0.113.9\n'
    return 0
  fi
  return 1
}

oscal_standby_wake_passive() {
  printf 'wake\n' >> "$wake_log"
}

ip="$(get_or_wake_passive_asg_oscal_ip green '')"
[[ "$ip" == '203.0.113.9' ]]
[[ "$(cat "$wake_log")" == $'wake\nlookup:green' ]]

: > "$wake_log"
ip="$(get_or_wake_passive_asg_oscal_ip blue '198.51.100.42')"
[[ "$ip" == '198.51.100.42' ]]
[[ ! -s "$wake_log" ]]

printf '%s\n' 'Passive ASG wake tests passed.'
