#!/usr/bin/env bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
#
# Deploy maintenance mode: drain ALB traffic from the color being deployed, suspend ASG
# replacement processes, and protect the in-service instance from scale-in.
# Restores ALB weights and ASG processes after a successful deploy (or on trap exit).

# Source after ec2-common.sh (load_aws_from_pass, tf_output via caller).
# Prevent double sourcing
[ -n "${_DEPLOY_MAINTENANCE_LOADED:-}" ] && return 0
_DEPLOY_MAINTENANCE_LOADED=1

# ASG processes suspended during deploy (prevents ELB-driven recycle and launch/terminate).
DEPLOY_ASG_SUSPEND_PROCESSES=(
  Launch
  Terminate
  HealthCheck
  ReplaceUnhealthy
  AZRebalance
  AlarmNotification
  ScheduledActions
  AddToLoadBalancer
  InstanceRefresh
)

DEPLOY_MAINTENANCE_STATE_DIR="${DEPLOY_MAINTENANCE_STATE_DIR:-}"
# Space-separated roles currently in maintenance (green|blue).
DEPLOY_MAINTENANCE_ACTIVE_ROLES="${DEPLOY_MAINTENANCE_ACTIVE_ROLES:-}"

deploy_maintenance__require_tools() {
  command -v aws >/dev/null 2>&1 || { echo "deploy-maintenance: aws CLI required" >&2; return 1; }
  command -v jq >/dev/null 2>&1 || { echo "deploy-maintenance: jq required" >&2; return 1; }
  load_aws_from_pass || {
    [ -n "${AWS_ACCESS_KEY_ID:-}" ] && [ -n "${AWS_SECRET_ACCESS_KEY:-}" ] && return 0
    echo "deploy-maintenance: AWS credentials required" >&2
    return 1
  }
  if [ -z "${AWS_DEFAULT_REGION:-}" ] && [ -z "${AWS_REGION:-}" ]; then
    export AWS_DEFAULT_REGION="us-east-1"
  else
    export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-${AWS_REGION:-us-east-1}}"
  fi
  return 0
}

deploy_maintenance__tf_raw() {
  local name="$1"
  if declare -F tf_output >/dev/null 2>&1; then
    tf_output -raw "$name" 2>/dev/null || true
  elif [ -n "${RUN_WITH_AWS_PASS:-}" ] && [ -x "$RUN_WITH_AWS_PASS" ]; then
    TERRAFORM_DIR="${TERRAFORM_DIR:-}" "$RUN_WITH_AWS_PASS" output -raw "$name" 2>/dev/null || true
  else
    return 1
  fi
}

deploy_maintenance__asg_name() {
  local role="$1"
  deploy_maintenance__tf_raw "oscal_${role}_autoscaling_group_name" | tr -d '\r\n'
}

deploy_maintenance__target_group_arn() {
  local role="$1"
  deploy_maintenance__tf_raw "alb_target_group_${role}_arn" | tr -d '\r\n'
}

deploy_maintenance__asg_in_service_instance() {
  local asg_name="$1"
  aws autoscaling describe-auto-scaling-groups \
    --auto-scaling-group-names "$asg_name" \
    --query 'AutoScalingGroups[0].Instances[?LifecycleState==`InService`].InstanceId | [0]' \
    --output text 2>/dev/null | tr -d '\r\n'
}

deploy_maintenance__listener_arn() {
  local alb_arn listener_arn use_https
  alb_arn=$(deploy_maintenance__tf_raw alb_arn | tr -d '\r\n')
  [ -z "$alb_arn" ] || [ "$alb_arn" = "null" ] && return 1
  use_https=$(deploy_maintenance__tf_raw alb_use_https | tr -d '\r\n')
  if [ "$use_https" = "true" ]; then
    listener_arn=$(aws elbv2 describe-listeners --load-balancer-arn "$alb_arn" \
      --query 'Listeners[?Port==`443`].ListenerArn | [0]' --output text 2>/dev/null | tr -d '\r\n')
  else
    listener_arn=$(aws elbv2 describe-listeners --load-balancer-arn "$alb_arn" \
      --query 'Listeners[?Port==`80`].ListenerArn | [0]' --output text 2>/dev/null | tr -d '\r\n')
  fi
  [ -z "$listener_arn" ] || [ "$listener_arn" = "None" ] && return 1
  printf '%s' "$listener_arn"
}

# Build forward actions JSON: drain_role gets weight 0; peer gets 100.
deploy_maintenance__forward_actions_json() {
  local drain_role="$1"
  local green_arn="$2"
  local blue_arn="$3"
  local green_w=100 blue_w=100
  if [ "$drain_role" = "green" ]; then
    green_w=0
    blue_w=100
  elif [ "$drain_role" = "blue" ]; then
    green_w=100
    blue_w=0
  else
    return 1
  fi
  jq -n \
    --arg green "$green_arn" \
    --arg blue "$blue_arn" \
    --argjson gw "$green_w" \
    --argjson bw "$blue_w" \
    '[{
      "Type": "forward",
      "ForwardConfig": {
        "TargetGroups": [
          {"TargetGroupArn": $green, "Weight": $gw},
          {"TargetGroupArn": $blue, "Weight": $bw}
        ],
        "TargetGroupStickinessConfig": {"Enabled": true, "DurationSeconds": 86400}
      }
    }]'
}

deploy_maintenance__save_alb_state() {
  local role="$1"
  local listener_arn="$2"
  local state_dir="$DEPLOY_MAINTENANCE_STATE_DIR/${role}"
  mkdir -p "$state_dir"
  aws elbv2 describe-listeners --listener-arns "$listener_arn" --output json >"${state_dir}/listener.json"
  aws elbv2 describe-rules --listener-arn "$listener_arn" --output json >"${state_dir}/rules.json"
}

deploy_maintenance__drain_alb_traffic() {
  local drain_role="$1"
  local listener_arn green_arn blue_arn actions tmp
  listener_arn=$(deploy_maintenance__listener_arn) || return 1
  green_arn=$(deploy_maintenance__target_group_arn green)
  blue_arn=$(deploy_maintenance__target_group_arn blue)
  [ -z "$green_arn" ] || [ -z "$blue_arn" ] && return 1

  deploy_maintenance__save_alb_state "$drain_role" "$listener_arn" || return 1

  actions=$(deploy_maintenance__forward_actions_json "$drain_role" "$green_arn" "$blue_arn") || return 1
  tmp=$(mktemp)
  # shellcheck disable=SC2064
  trap "rm -f '$tmp'" RETURN
  printf '%s' "$actions" >"$tmp"
  aws elbv2 modify-listener --listener-arn "$listener_arn" --default-actions "file://${tmp}" >/dev/null

  local rule_arn rule_actions
  while IFS= read -r rule_arn; do
    [ -z "$rule_arn" ] || [ "$rule_arn" = "null" ] && continue
    rule_actions=$(deploy_maintenance__forward_actions_json "$drain_role" "$green_arn" "$blue_arn") || continue
    printf '%s' "$rule_actions" >"$tmp"
    aws elbv2 modify-rule --rule-arn "$rule_arn" --actions "file://${tmp}" >/dev/null 2>&1 || true
  done < <(jq -r '.Rules[] | select(.IsDefault == false) | select(.Actions[0].Type == "forward") | .RuleArn' \
    "${DEPLOY_MAINTENANCE_STATE_DIR}/${drain_role}/rules.json" 2>/dev/null)

  printf '%s' "$listener_arn" >"${DEPLOY_MAINTENANCE_STATE_DIR}/${drain_role}/listener_arn.txt"
  return 0
}

deploy_maintenance__restore_alb_traffic() {
  local role="$1"
  local state_dir="$DEPLOY_MAINTENANCE_STATE_DIR/${role}"
  local listener_arn tmp
  [ -d "$state_dir" ] || return 0
  listener_arn=$(cat "${state_dir}/listener_arn.txt" 2>/dev/null | tr -d '\r\n')
  [ -z "$listener_arn" ] && return 0

  tmp=$(mktemp)
  # shellcheck disable=SC2064
  trap "rm -f '$tmp'" RETURN

  jq '.Listeners[0].DefaultActions' "${state_dir}/listener.json" >"$tmp"
  aws elbv2 modify-listener --listener-arn "$listener_arn" --default-actions "file://${tmp}" >/dev/null 2>&1 || true

  local rule_arn
  while IFS= read -r rule_arn; do
    [ -z "$rule_arn" ] || [ "$rule_arn" = "null" ] && continue
    jq --arg rn "$rule_arn" '.Rules[] | select(.RuleArn == $rn) | .Actions' "${state_dir}/rules.json" >"$tmp"
    aws elbv2 modify-rule --rule-arn "$rule_arn" --actions "file://${tmp}" >/dev/null 2>&1 || true
  done < <(jq -r '.Rules[] | select(.IsDefault == false) | select(.Actions[0].Type == "forward") | .RuleArn' "${state_dir}/rules.json" 2>/dev/null)

  return 0
}

deploy_maintenance__suspend_asg() {
  local role="$1"
  local asg_name proc_args=()
  asg_name=$(deploy_maintenance__asg_name "$role")
  [ -z "$asg_name" ] && return 1
  local p
  for p in "${DEPLOY_ASG_SUSPEND_PROCESSES[@]}"; do
    proc_args+=(--scaling-processes "$p")
  done
  aws autoscaling suspend-processes --auto-scaling-group-name "$asg_name" "${proc_args[@]}" >/dev/null
  printf '%s' "$asg_name" >"${DEPLOY_MAINTENANCE_STATE_DIR}/${role}/asg_name.txt"
  return 0
}

deploy_maintenance__resume_asg() {
  local role="$1"
  local asg_name proc_args=()
  asg_name=$(cat "${DEPLOY_MAINTENANCE_STATE_DIR}/${role}/asg_name.txt" 2>/dev/null | tr -d '\r\n')
  [ -z "$asg_name" ] && asg_name=$(deploy_maintenance__asg_name "$role")
  [ -z "$asg_name" ] && return 0
  local p
  for p in "${DEPLOY_ASG_SUSPEND_PROCESSES[@]}"; do
    proc_args+=(--scaling-processes "$p")
  done
  aws autoscaling resume-processes --auto-scaling-group-name "$asg_name" "${proc_args[@]}" >/dev/null 2>&1 || true
  return 0
}

deploy_maintenance__protect_instance() {
  local role="$1"
  local asg_name instance_id
  asg_name=$(deploy_maintenance__asg_name "$role")
  instance_id=$(deploy_maintenance__asg_in_service_instance "$asg_name")
  [ -z "$instance_id" ] || [ "$instance_id" = "None" ] && return 1
  aws autoscaling set-instance-protection \
    --auto-scaling-group-name "$asg_name" \
    --instance-ids "$instance_id" \
    --protected-from-scale-in >/dev/null
  printf '%s' "$instance_id" >"${DEPLOY_MAINTENANCE_STATE_DIR}/${role}/instance_id.txt"
  return 0
}

deploy_maintenance__unprotect_instance() {
  local role="$1"
  local asg_name instance_id
  asg_name=$(cat "${DEPLOY_MAINTENANCE_STATE_DIR}/${role}/asg_name.txt" 2>/dev/null | tr -d '\r\n')
  [ -z "$asg_name" ] && asg_name=$(deploy_maintenance__asg_name "$role")
  instance_id=$(cat "${DEPLOY_MAINTENANCE_STATE_DIR}/${role}/instance_id.txt" 2>/dev/null | tr -d '\r\n')
  [ -z "$instance_id" ] || [ -z "$asg_name" ] && return 0
  aws autoscaling set-instance-protection \
    --auto-scaling-group-name "$asg_name" \
    --instance-ids "$instance_id" \
    --no-protected-from-scale-in >/dev/null 2>&1 || true
  return 0
}

# Enter maintenance for role being deployed (green or blue).
# ALB sends 100% traffic to the peer color; ASG suspend + scale-in protection on deploy target.
deploy_maintenance_enter() {
  local role="${1:?role required (green|blue)}"
  case "$role" in
    green|blue) ;;
    *) echo "deploy-maintenance: invalid role $role" >&2; return 1 ;;
  esac

  deploy_maintenance__require_tools || return 1
  [ -n "$DEPLOY_MAINTENANCE_STATE_DIR" ] || DEPLOY_MAINTENANCE_STATE_DIR=$(mktemp -d)

  if deploy_maintenance__drain_alb_traffic "$role"; then
    : # saved + drained
  else
    echo "deploy-maintenance: ALB drain failed for $role (continuing with ASG protection only)" >&2
  fi

  deploy_maintenance__suspend_asg "$role" || {
    echo "deploy-maintenance: ASG suspend failed for $role" >&2
    return 1
  }
  deploy_maintenance__protect_instance "$role" || {
    echo "deploy-maintenance: instance protection failed for $role" >&2
    deploy_maintenance__resume_asg "$role" || true
    return 1
  }

  DEPLOY_MAINTENANCE_ACTIVE_ROLES="${DEPLOY_MAINTENANCE_ACTIVE_ROLES} ${role}"
  return 0
}

deploy_maintenance_wait_target_healthy() {
  local role="$1"
  local max_attempts="${2:-30}"
  local sleep_secs="${3:-10}"
  local tg_arn instance_id port state attempt
  tg_arn=$(deploy_maintenance__target_group_arn "$role")
  instance_id=$(cat "${DEPLOY_MAINTENANCE_STATE_DIR}/${role}/instance_id.txt" 2>/dev/null | tr -d '\r\n')
  [ -z "$instance_id" ] && {
    local asg_name
    asg_name=$(deploy_maintenance__asg_name "$role")
    instance_id=$(deploy_maintenance__asg_in_service_instance "$asg_name")
  }
  port="${OSCAL_APP_PORT:-3020}"
  [ -z "$tg_arn" ] || [ -z "$instance_id" ] || [ "$instance_id" = "None" ] && return 1

  attempt=1
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

# Restore ALB weights and ASG processes for role.
deploy_maintenance_exit() {
  local role="${1:?role required}"
  deploy_maintenance__restore_alb_traffic "$role" || true
  deploy_maintenance__unprotect_instance "$role" || true
  deploy_maintenance__resume_asg "$role" || true
  DEPLOY_MAINTENANCE_ACTIVE_ROLES=$(printf '%s' "$DEPLOY_MAINTENANCE_ACTIVE_ROLES" | tr ' ' '\n' | grep -vx "$role" | tr '\n' ' ')
  return 0
}

# Trap handler: restore any roles still in maintenance.
deploy_maintenance_trap_cleanup() {
  local role
  for role in $DEPLOY_MAINTENANCE_ACTIVE_ROLES; do
    [ -z "$role" ] && continue
    deploy_maintenance_exit "$role" 2>/dev/null || true
  done
  DEPLOY_MAINTENANCE_ACTIVE_ROLES=""
}
