#!/usr/bin/env bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com

# SSM Run Command transport for noninteractive EC2 operations. Source from
# scripts that already loaded AWS credentials into the environment.

ssm_transport_init() {
  SSM_S3_BUCKET="${1:?S3 bucket required for temporary file transfer}"
  SSM_AWS_REGION="${2:-${AWS_DEFAULT_REGION:-us-east-1}}"
  SSM_REMOTE_USER="${3:-ec2-user}"
  SSM_DEPLOY_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
  SSM_STAGE_PREFIX="logs/.ssm-deploy/${SSM_DEPLOY_ID}"
  SSM_TRANSFER_SEQUENCE=0
  SSM_COMMAND_TIMEOUT_SEC="${SSM_COMMAND_TIMEOUT_SEC:-3600}"
  SSM_COMMAND_WAIT_TIMEOUT_SEC="${SSM_COMMAND_WAIT_TIMEOUT_SEC:-3600}"
}

ssm_shell_quote() {
  printf '%q' "${1:-}"
}

ssm_instance_id() {
  local host="${1##*@}"
  local instance_id

  case "$host" in
    i-*)
      printf '%s\n' "$host"
      return 0
      ;;
  esac

  instance_id=$(aws ec2 describe-instances \
    --region "$SSM_AWS_REGION" \
    --filters "Name=ip-address,Values=${host}" "Name=instance-state-name,Values=running" \
    --query 'Reservations[].Instances[].InstanceId' --output text) || return 1
  if [ -z "$instance_id" ] || [ "$instance_id" = "None" ]; then
    instance_id=$(aws ec2 describe-instances \
      --region "$SSM_AWS_REGION" \
      --filters "Name=private-ip-address,Values=${host}" "Name=instance-state-name,Values=running" \
      --query 'Reservations[].Instances[].InstanceId' --output text) || return 1
  fi

  case "$instance_id" in
    i-*) printf '%s\n' "$instance_id" ;;
    *)
      echo "SSM could not resolve a running EC2 instance for ${host}; verify its IP and SSM Agent status." >&2
      return 1
      ;;
  esac
}

ssm_run_command() {
  local target="$1"
  local command="$2"
  local instance_id command_id parameters invocation status details stdout stderr effective_command
  local started_at elapsed

  instance_id=$(ssm_instance_id "$target") || return 1
  if [ -n "$SSM_REMOTE_USER" ] && [ "$SSM_REMOTE_USER" != root ]; then
    effective_command="sudo -u $(ssm_shell_quote "$SSM_REMOTE_USER") -H bash -lc $(ssm_shell_quote "$command")"
  else
    effective_command="$command"
  fi
  parameters=$(printf '%s' "$effective_command" | python3 -c 'import json, sys; print(json.dumps({"commands": [sys.stdin.read()]}))') || return 1
  command_id=$(aws ssm send-command \
    --region "$SSM_AWS_REGION" \
    --instance-ids "$instance_id" \
    --document-name AWS-RunShellScript \
    --comment "OSCAL deployment ${SSM_DEPLOY_ID}" \
    --timeout-seconds "$SSM_COMMAND_TIMEOUT_SEC" \
    --parameters "$parameters" \
    --query 'Command.CommandId' --output text) || return 1
  if [ -z "$command_id" ] || [ "$command_id" = "None" ]; then
    echo "SSM did not return a command ID for ${instance_id}." >&2
    return 1
  fi

  started_at=$SECONDS
  while :; do
    if ! invocation=$(aws ssm get-command-invocation \
      --region "$SSM_AWS_REGION" \
      --command-id "$command_id" --instance-id "$instance_id" --output json 2>&1); then
      case "$invocation" in
        *InvocationDoesNotExist*) invocation="" ;;
        *)
          echo "$invocation" >&2
          return 1
          ;;
      esac
    fi
    if [ -n "$invocation" ]; then
      status=$(printf '%s' "$invocation" | python3 -c 'import json, sys; print(json.load(sys.stdin).get("Status", ""))')
      case "$status" in
        Success|Failed|Cancelled|TimedOut|Undeliverable|Terminated|DeliveryTimedOut|ExecutionTimedOut)
          details=$(printf '%s' "$invocation" | python3 -c 'import json, sys; print(json.load(sys.stdin).get("StatusDetails", ""))')
          stdout=$(printf '%s' "$invocation" | python3 -c 'import json, sys; print(json.load(sys.stdin).get("StandardOutputContent", ""), end="")')
          stderr=$(printf '%s' "$invocation" | python3 -c 'import json, sys; print(json.load(sys.stdin).get("StandardErrorContent", ""), end="")')
          [ -z "$stdout" ] || printf '%s\n' "$stdout"
          [ -z "$stderr" ] || printf '%s\n' "$stderr" >&2
          if [ "$status" = "Success" ]; then
            return 0
          fi
          echo "SSM command ${command_id} on ${instance_id} ended with ${status}${details:+ (${details})}." >&2
          return 1
          ;;
      esac
    fi

    elapsed=$((SECONDS - started_at))
    if [ "$elapsed" -ge "$SSM_COMMAND_WAIT_TIMEOUT_SEC" ]; then
      echo "Timed out waiting for SSM command ${command_id} on ${instance_id}." >&2
      return 1
    fi
    sleep 2
  done
}

ssm_next_stage_uri() {
  SSM_TRANSFER_SEQUENCE=$((SSM_TRANSFER_SEQUENCE + 1))
  printf 's3://%s/%s/%s-%s' "$SSM_S3_BUCKET" "$SSM_STAGE_PREFIX" \
    "$SSM_TRANSFER_SEQUENCE" "${1##*/}"
}

ssm_purge_staged_object() {
  local key="$1" versions rows object_key version_id
  aws s3 rm "s3://${SSM_S3_BUCKET}/${key}" --region "$SSM_AWS_REGION" \
    --only-show-errors >/dev/null 2>&1 || true
  if ! versions=$(aws s3api list-object-versions --bucket "$SSM_S3_BUCKET" \
    --prefix "$key" --region "$SSM_AWS_REGION" --output json); then
    echo "Could not enumerate staged S3 versions for ${key}; grant s3:ListBucketVersions and s3:DeleteObjectVersion." >&2
    return 1
  fi
  rows=$(printf '%s' "$versions" | python3 -c 'import json, sys; key=sys.argv[1]; data=json.load(sys.stdin); objects=data.get("Versions", []) + data.get("DeleteMarkers", []); [print(item["Key"] + "\t" + item["VersionId"]) for item in objects if item.get("Key") == key]' "$key") || return 1
  while IFS="$(printf '\t')" read -r object_key version_id; do
    [ -n "$version_id" ] || continue
    if ! aws s3api delete-object --bucket "$SSM_S3_BUCKET" --key "$object_key" \
      --version-id "$version_id" --region "$SSM_AWS_REGION" >/dev/null; then
      echo "Could not remove staged S3 object version ${object_key}; grant s3:DeleteObjectVersion." >&2
      return 1
    fi
  done <<EOF
$rows
EOF
}

ssm_copy_to_instance() {
  local target="$1" local_path="$2" remote_path="$3" uri command stage_key
  [ -f "$local_path" ] || { echo "SSM transfer source not found: ${local_path}" >&2; return 1; }
  uri=$(ssm_next_stage_uri "$local_path")
  stage_key="${uri#s3://"$SSM_S3_BUCKET"/}"
  if ! aws s3 cp "$local_path" "$uri" --region "$SSM_AWS_REGION" --only-show-errors; then
    ssm_purge_staged_object "$stage_key" || true
    return 1
  fi
  command="aws s3 cp $(ssm_shell_quote "$uri") $(ssm_shell_quote "$remote_path") --region $(ssm_shell_quote "$SSM_AWS_REGION") --only-show-errors"
  if ! ssm_run_command "$target" "$command"; then
    ssm_purge_staged_object "$stage_key" || true
    return 1
  fi
  ssm_purge_staged_object "$stage_key"
}

ssm_copy_from_instance() {
  local target="$1" remote_path="$2" local_path="$3" uri command stage_key
  uri=$(ssm_next_stage_uri "$remote_path")
  stage_key="${uri#s3://"$SSM_S3_BUCKET"/}"
  command="aws s3 cp $(ssm_shell_quote "$remote_path") $(ssm_shell_quote "$uri") --region $(ssm_shell_quote "$SSM_AWS_REGION") --only-show-errors"
  ssm_run_command "$target" "$command" || return 1
  mkdir -p "$(dirname "$local_path")" || return 1
  if ! aws s3 cp "$uri" "$local_path" --region "$SSM_AWS_REGION" --only-show-errors; then
    ssm_purge_staged_object "$stage_key" || true
    return 1
  fi
  ssm_purge_staged_object "$stage_key"
}

ssm_run_file() {
  local target="$1" local_path="$2" remote_path argument command result
  shift 2
  remote_path="/tmp/oscal-ssm-${SSM_DEPLOY_ID}-$(basename "$local_path")"
  ssm_copy_to_instance "$target" "$local_path" "$remote_path" || return 1
  command="bash $(ssm_shell_quote "$remote_path")"
  for argument in "$@"; do
    command+=" $(ssm_shell_quote "$argument")"
  done
  ssm_run_command "$target" "$command"
  result=$?
  ssm_run_command "$target" "rm -f $(ssm_shell_quote "$remote_path")" >/dev/null 2>&1 || true
  return "$result"
}

ssm_run_script() {
  local target="$1" script="$2" local_path result
  shift 2
  local_path=$(mktemp "${TMPDIR:-/tmp}/oscal-ssm-script.XXXXXX") || return 1
  chmod 600 "$local_path"
  printf '%s\n' "$script" > "$local_path"
  ssm_run_file "$target" "$local_path" "$@"
  result=$?
  rm -f "$local_path"
  return "$result"
}

ssm_ssh() {
  local target="" argument remote_command script
  while [ "$#" -gt 0 ]; do
    case "$1" in
      -i|-o|-p|-F|-J|-l)
        shift 2
        ;;
      --)
        shift
        break
        ;;
      -*)
        shift
        ;;
      *)
        target="$1"
        shift
        break
        ;;
    esac
  done
  [ -n "$target" ] || { echo "SSM command target is missing." >&2; return 2; }

  if [ "${1:-}" = "bash" ] && [ "${2:-}" = "-s" ]; then
    shift 2
    script=$(cat)
    ssm_run_script "$target" "$script" "$@"
    return $?
  fi

  remote_command="$*"
  [ -n "$remote_command" ] || { echo "Interactive SSH is not supported; use SSM Run Command." >&2; return 2; }
  ssm_run_command "$target" "$remote_command"
}

ssm_scp() {
  local -a operands=()
  local argument destination remote_spec host path source_count index source remote_path
  while [ "$#" -gt 0 ]; do
    case "$1" in
      -i|-o|-P|-F)
        shift 2
        ;;
      -r|-p|-q|-C|-3)
        shift
        ;;
      --)
        shift
        break
        ;;
      -*)
        shift
        ;;
      *)
        operands+=("$1")
        shift
        ;;
    esac
  done
  while [ "$#" -gt 0 ]; do
    operands+=("$1")
    shift
  done
  [ "${#operands[@]}" -ge 2 ] || { echo "SSM file transfer requires a source and destination." >&2; return 2; }

  destination="${operands[${#operands[@]}-1]}"
  if [[ "$destination" == *@*:* ]]; then
    remote_spec="$destination"
    host="${remote_spec%%:*}"
    host="${host##*@}"
    path="${remote_spec#*:}"
    source_count=$((${#operands[@]} - 1))
    if [ "$source_count" -gt 1 ] && [[ "$path" != */ ]]; then
      echo "SSM transfer destination must be a directory for multiple sources." >&2
      return 2
    fi
    for ((index=0; index<source_count; index++)); do
      source="${operands[$index]}"
      remote_path="$path"
      if [[ "$path" == */ ]] || [ "$source_count" -gt 1 ]; then
        remote_path="${path%/}/$(basename "$source")"
      fi
      ssm_copy_to_instance "$host" "$source" "$remote_path" || return 1
    done
    return 0
  fi

  [ "${#operands[@]}" -eq 2 ] || { echo "SSM supports one remote source per download." >&2; return 2; }
  source="${operands[0]}"
  [[ "$source" == *@*:* ]] || { echo "SSM file transfer must include one instance path." >&2; return 2; }
  remote_spec="$source"
  host="${remote_spec%%:*}"
  host="${host##*@}"
  path="${remote_spec#*:}"
  ssm_copy_from_instance "$host" "$path" "$destination"
}

ssm_transport_cleanup() {
  [ -n "${SSM_S3_BUCKET:-}" ] && [ -n "${SSM_STAGE_PREFIX:-}" ] || return 0
  local versions rows object_key version_id
  aws s3 rm "s3://${SSM_S3_BUCKET}/${SSM_STAGE_PREFIX}/" --recursive \
    --region "$SSM_AWS_REGION" --only-show-errors >/dev/null 2>&1 || true
  if ! versions=$(aws s3api list-object-versions --bucket "$SSM_S3_BUCKET" \
    --prefix "${SSM_STAGE_PREFIX}/" --region "$SSM_AWS_REGION" --output json); then
    echo "Warning: could not enumerate temporary S3 versions under ${SSM_STAGE_PREFIX}; check s3:ListBucketVersions and s3:DeleteObjectVersion." >&2
    return 0
  fi
  rows=$(printf '%s' "$versions" | python3 -c 'import json, sys; prefix=sys.argv[1]; data=json.load(sys.stdin); objects=data.get("Versions", []) + data.get("DeleteMarkers", []); [print(item["Key"] + "\t" + item["VersionId"]) for item in objects if item.get("Key", "").startswith(prefix)]' "${SSM_STAGE_PREFIX}/") || return 0
  while IFS="$(printf '\t')" read -r object_key version_id; do
    [ -n "$version_id" ] || continue
    aws s3api delete-object --bucket "$SSM_S3_BUCKET" --key "$object_key" \
      --version-id "$version_id" --region "$SSM_AWS_REGION" >/dev/null || \
      echo "Warning: could not remove temporary S3 version ${object_key}; check s3:DeleteObjectVersion." >&2
  done <<EOF
$rows
EOF
}
ssh() { ssm_ssh "$@"; }
scp() { ssm_scp "$@"; }