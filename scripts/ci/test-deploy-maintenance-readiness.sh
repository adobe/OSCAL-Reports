#!/usr/bin/env bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com

set -euo pipefail
# shellcheck source=scripts/lib/deploy-maintenance.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)/deploy-maintenance.sh"

SSH_ARGS=()
ssh() {
  SSH_ARGS=("$@")
}

# SSM deployment passes no key, but the readiness command must still be issued.
deploy_maintenance_verify_instance_ready 203.0.113.10 "" 3020 ec2-user
[[ "${SSH_ARGS[*]}" == *"ec2-user@203.0.113.10"* ]]
[[ "${SSH_ARGS[*]}" != *"-i"* ]]

# Existing direct-SSH callers retain their optional key behavior.
deploy_maintenance_verify_instance_ready 203.0.113.10 /tmp/test-key.pem 3020 ec2-user
[[ "${SSH_ARGS[*]}" == *"-i /tmp/test-key.pem"* ]]

printf '%s\n' 'SSM maintenance readiness tests passed.'
