#!/usr/bin/env bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
#
# Wake/shutdown passive ASG and wait for health (active-passive Blue/Green).

[ -n "${_OSCAL_STANDBY_LOADED:-}" ] && return 0
_OSCAL_STANDBY_LOADED=1

OSCAL_STANDBY_MAX_WAIT_SECONDS="${OSCAL_STANDBY_MAX_WAIT_SECONDS:-900}"
OSCAL_STANDBY_POLL_SECONDS="${OSCAL_STANDBY_POLL_SECONDS:-15}"

oscal_standby__require_tools() {
  command -v aws >/dev/null 2>&1 || { echo "oscal-standby: aws CLI required" >&2; return 1; }
  if declare -F oscal_traffic_mode__require_tools >/dev/null 2>&1; then
    oscal_traffic_mode__require_tools || return 1
  elif declare -F load_aws_from_pass >/dev/null 2>&1; then
    load_aws_from_pass || {
      [ -n "${AWS_ACCESS_KEY_ID:-}" ] && return 0
      return 1
    }
  fi
  return 0
}

oscal_standby__tf_raw() {
  local name="$1"
  if declare -F oscal_traffic_mode__tf_raw >/dev/null 2>&1; then
    oscal_traffic_mode__tf_raw "$name"
  elif declare -F deploy_maintenance__tf_raw >/dev/null 2>&1; then
    deploy_maintenance__tf_raw "$name"
  elif [ -n "${TERRAFORM_DIR:-}" ]; then
    (cd "$TERRAFORM_DIR" && terraform output -raw "$name" 2>/dev/null) || true
  fi
}

oscal_standby_passive_role() {
  oscal_standby__tf_raw oscal_passive_role | tr -d '\r\n'
}

oscal_standby_passive_asg_name() {
  oscal_standby__tf_raw oscal_passive_autoscaling_group_name | tr -d '\r\n'
}

oscal_standby_active_asg_name() {
  oscal_standby__tf_raw oscal_active_autoscaling_group_name | tr -d '\r\n'
}

oscal_standby_asg_desired() {
  local asg_name="$1"
  aws autoscaling describe-auto-scaling-groups \
    --auto-scaling-group-names "$asg_name" \
    --query 'AutoScalingGroups[0].DesiredCapacity' \
    --output text 2>/dev/null | tr -d '\r\n'
}

oscal_standby_asg_in_service_instance() {
  local asg_name="$1"
  # shellcheck disable=SC2016
  aws autoscaling describe-auto-scaling-groups \
    --auto-scaling-group-names "$asg_name" \
    --query 'AutoScalingGroups[0].Instances[?LifecycleState==`InService`].InstanceId | [0]' \
    --output text 2>/dev/null | tr -d '\r\n'
}

oscal_standby_wait_asg_in_service() {
  local asg_name="$1"
  local max_wait="${2:-$OSCAL_STANDBY_MAX_WAIT_SECONDS}"
  local poll="${3:-$OSCAL_STANDBY_POLL_SECONDS}"
  local elapsed=0 instance_id
  while [ "$elapsed" -lt "$max_wait" ]; do
    instance_id=$(oscal_standby_asg_in_service_instance "$asg_name")
    if [ -n "$instance_id" ] && [ "$instance_id" != "None" ]; then
      printf '%s' "$instance_id"
      return 0
    fi
    sleep "$poll"
    elapsed=$((elapsed + poll))
  done
  return 1
}

oscal_standby_wait_target_healthy() {
  local role="$1"
  local instance_id="$2"
  local port="${OSCAL_APP_PORT:-3020}"
  local max_attempts="${3:-40}"
  local sleep_secs="${4:-15}"
  local tg_arn state attempt=1
  if declare -F deploy_maintenance__target_group_arn >/dev/null 2>&1; then
    tg_arn=$(deploy_maintenance__target_group_arn "$role")
  else
    tg_arn=$(oscal_standby__tf_raw "alb_target_group_${role}_arn" | tr -d '\r\n')
  fi
  [ -z "$tg_arn" ] || [ -z "$instance_id" ] && return 1
  while [ "$attempt" -le "$max_attempts" ]; do
    state=$(aws elbv2 describe-target-health \
      --target-group-arn "$tg_arn" \
      --targets "Id=${instance_id},Port=${port}" \
      --query 'TargetHealthDescriptions[0].TargetHealth.State' \
      --output text 2>/dev/null | tr -d '\r\n')
    if [ "$state" = "healthy" ]; then
      return 0
    fi
    sleep "$sleep_secs"
    attempt=$((attempt + 1))
  done
  return 1
}

oscal_standby_wake_passive() {
  local asg_name role instance_id
  oscal_standby__require_tools || return 1

  if declare -F oscal_traffic_mode_is_active_passive >/dev/null 2>&1; then
    if ! oscal_traffic_mode_is_active_passive; then
      echo "oscal-standby: not active_passive — skip wake" >&2
      return 0
    fi
  fi

  asg_name=$(oscal_standby_passive_asg_name)
  role=$(oscal_standby_passive_role)
  [ -z "$asg_name" ] || [ "$asg_name" = "null" ] && return 1

  if [ "$(oscal_standby_asg_desired "$asg_name")" = "1" ]; then
    instance_id=$(oscal_standby_asg_in_service_instance "$asg_name")
    if [ -n "$instance_id" ] && [ "$instance_id" != "None" ]; then
      echo "oscal-standby: passive $role already running ($instance_id)"
      return 0
    fi
  fi

  echo "oscal-standby: waking passive $role ASG $asg_name..."
  aws autoscaling set-desired-capacity \
    --auto-scaling-group-name "$asg_name" \
    --desired-capacity 1 \
    --honor-cooldown >/dev/null

  instance_id=$(oscal_standby_wait_asg_in_service "$asg_name") || {
    echo "oscal-standby: timeout waiting for passive instance InService" >&2
    return 1
  }
  echo "oscal-standby: passive instance $instance_id launched; waiting for ALB healthy..."

  if oscal_standby_wait_target_healthy "$role" "$instance_id"; then
    echo "oscal-standby: passive $role healthy"
    return 0
  fi
  echo "oscal-standby: passive instance up but ALB health pending (continuing)" >&2
  return 0
}

oscal_standby_shutdown_passive() {
  local asg_name mode
  oscal_standby__require_tools || return 1

  asg_name=$(oscal_standby_passive_asg_name)
  [ -z "$asg_name" ] || [ "$asg_name" = "null" ] && return 0

  if declare -F oscal_traffic_mode_get >/dev/null 2>&1; then
    mode=$(oscal_traffic_mode_get)
    case "$mode" in
      deploy_green|failover)
        echo "oscal-standby: skip shutdown — traffic mode is $mode" >&2
        return 0
        ;;
    esac
  fi

  echo "oscal-standby: scaling passive ASG $asg_name to 0"
  aws autoscaling set-desired-capacity \
    --auto-scaling-group-name "$asg_name" \
    --desired-capacity 0 \
    --honor-cooldown >/dev/null
  return 0
}

oscal_standby_wake_passive_if_needed() {
  local asg_name
  if declare -F oscal_traffic_mode_is_active_passive >/dev/null 2>&1; then
    oscal_traffic_mode_is_active_passive || return 0
  else
    return 0
  fi
  asg_name=$(oscal_standby_passive_asg_name)
  [ -z "$asg_name" ] && return 0
  if [ "$(oscal_standby_asg_desired "$asg_name")" = "0" ]; then
    oscal_standby_wake_passive
  fi
}
