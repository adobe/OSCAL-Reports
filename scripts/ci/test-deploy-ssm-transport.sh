#!/usr/bin/env bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/ssm-transport.sh
source "$SCRIPT_DIR/../lib/ssm-transport.sh"

test_dir="$(mktemp -d)"
trap 'rm -rf "$test_dir"' EXIT
export SSM_TEST_CALL_LOG="$test_dir/aws-calls.log"
: > "$SSM_TEST_CALL_LOG"

aws() {
  printf '%s\n' "$*" >> "$SSM_TEST_CALL_LOG"
  case "$1 $2" in
    "ec2 describe-instances") printf 'i-0123456789abcdef0\n' ;;
    "ssm send-command")
      case "$*" in
        *'aws s3 cp'*) printf 'command-transfer\n' ;;
        *'rm -f'*) printf 'command-cleanup\n' ;;
        *) printf 'command-run\n' ;;
      esac
      ;;
    "ssm get-command-invocation")
      case "$*" in *command-run*) printf '{"Status":"Success","StatusDetails":"Success","StandardOutputContent":"ssm-ok","StandardErrorContent":""}\n' ;; *) printf '{"Status":"Success","StatusDetails":"Success","StandardOutputContent":"","StandardErrorContent":""}\n' ;; esac
      ;;
    "s3 cp")
      case "$4" in
        s3://*) ;;
        *) printf 'mock deployment log\n' > "$4" ;;
      esac
      ;;
    "s3 rm") ;;
    "s3api list-object-versions")
      prefix=""
      previous=""
      for argument in "$@"; do
        if [ "$previous" = "--prefix" ]; then prefix="$argument"; break; fi
        previous="$argument"
      done
      case "$prefix" in */) key="${prefix}stale-stage-object" ;; *) key="$prefix" ;; esac
      printf '{"Versions":[{"Key":"%s","VersionId":"mock-version"}],"DeleteMarkers":[]}\n' "$key"
      ;;
    "s3api delete-object") ;;
    *) echo "Unexpected AWS command in test: $*" >&2; return 1 ;;
  esac
}

ssm_transport_init test-bucket us-east-1

output="$(ssh -i '' -o StrictHostKeyChecking=no ec2-user@203.0.113.10 'printf direct-command')"
[ "$output" = "ssm-ok" ]

output="$(ssh -i '' -o StrictHostKeyChecking=no ec2-user@203.0.113.10 bash -s 'arg with spaces' <<'REMOTE'
printf 'script-arg=%s\n' "$1"
REMOTE
)"
case "$output" in *ssm-ok) ;; *) echo "Unexpected SSM script output: $output" >&2; exit 1 ;; esac

printf 'sample file\n' > "$test_dir/upload.txt"
scp -i '' -o StrictHostKeyChecking=no "$test_dir/upload.txt" ec2-user@203.0.113.10:/tmp/upload.txt
scp -i '' -o StrictHostKeyChecking=no ec2-user@203.0.113.10:/opt/oscal/app/logs/deployment.log "$test_dir/download.txt"
ssm_transport_cleanup
grep -q 'mock deployment log' "$test_dir/download.txt"
grep -q 'ssm send-command' "$SSM_TEST_CALL_LOG"
grep -q 's3 cp' "$SSM_TEST_CALL_LOG"
grep -q 's3api delete-object' "$SSM_TEST_CALL_LOG"
printf '%s\n' 'SSM transport tests passed.'