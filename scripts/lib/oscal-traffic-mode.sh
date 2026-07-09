#!/usr/bin/env bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
#
# ALB traffic modes for active-passive Blue/Green: steady, deploy_green, failover.
# Steady: primary (Blue) 100% / passive (Green) 0%. deploy_green: Edge UA → Green; default stays Blue.

[ -n "${_OSCAL_TRAFFIC_MODE_LOADED:-}" ] && return 0
_OSCAL_TRAFFIC_MODE_LOADED=1

OSCAL_DEPLOY_EDGE_RULE_PRIORITY="${OSCAL_DEPLOY_EDGE_RULE_PRIORITY:-10}"
OSCAL_TRAFFIC_MODE_STATE_DIR="${OSCAL_TRAFFIC_MODE_STATE_DIR:-}"

oscal_traffic_mode__require_tools() {
  command -v aws >/dev/null 2>&1 || { echo "oscal-traffic-mode: aws CLI required" >&2; return 1; }
  command -v jq >/dev/null 2>&1 || { echo "oscal-traffic-mode: jq required" >&2; return 1; }
  if declare -F load_aws_from_pass >/dev/null 2>&1; then
    load_aws_from_pass || {
      [ -n "${AWS_ACCESS_KEY_ID:-}" ] && [ -n "${AWS_SECRET_ACCESS_KEY:-}" ] && return 0
      echo "oscal-traffic-mode: AWS credentials required" >&2
      return 1
    }
  elif [ -z "${AWS_ACCESS_KEY_ID:-}" ]; then
    echo "oscal-traffic-mode: AWS credentials required" >&2
    return 1
  fi
  if [ -z "${AWS_DEFAULT_REGION:-}" ] && [ -z "${AWS_REGION:-}" ]; then
    export AWS_DEFAULT_REGION="us-east-1"
  else
    export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-${AWS_REGION:-us-east-1}}"
  fi
  return 0
}

oscal_traffic_mode__tf_raw() {
  local name="$1"
  if declare -F tf_output >/dev/null 2>&1; then
    tf_output -raw "$name" 2>/dev/null || true
  elif declare -F deploy_maintenance__tf_raw >/dev/null 2>&1; then
    deploy_maintenance__tf_raw "$name" 2>/dev/null || true
  elif [ -n "${TERRAFORM_DIR:-}" ] && [ -d "${TERRAFORM_DIR}/.terraform" ]; then
    (cd "$TERRAFORM_DIR" && terraform output -raw "$name" 2>/dev/null) || true
  else
    return 1
  fi
}

oscal_traffic_mode_is_active_passive() {
  local mode
  mode=$(oscal_traffic_mode__tf_raw oscal_traffic_mode | tr -d '\r\n')
  [ "$mode" = "active_passive" ]
}

oscal_traffic_mode_parameter_name() {
  oscal_traffic_mode__tf_raw oscal_traffic_mode_parameter_name | tr -d '\r\n'
}

oscal_traffic_mode_get() {
  local param val
  param=$(oscal_traffic_mode_parameter_name)
  [ -z "$param" ] || [ "$param" = "null" ] && { echo "steady"; return 0; }
  val=$(aws ssm get-parameter --name "$param" --query 'Parameter.Value' --output text 2>/dev/null | tr -d '\r\n') || true
  [ -n "$val" ] && [ "$val" != "None" ] && echo "$val" || echo "steady"
}

oscal_traffic_mode_set() {
  local mode="${1:?mode required}"
  local param
  param=$(oscal_traffic_mode_parameter_name)
  [ -z "$param" ] || [ "$param" = "null" ] && return 0
  aws ssm put-parameter --name "$param" --value "$mode" --type String --overwrite >/dev/null
}

oscal_traffic_mode__target_group_arn() {
  local role="$1"
  if declare -F deploy_maintenance__target_group_arn >/dev/null 2>&1; then
    deploy_maintenance__target_group_arn "$role"
  else
    oscal_traffic_mode__tf_raw "alb_target_group_${role}_arn" | tr -d '\r\n'
  fi
}

oscal_traffic_mode__listener_arn() {
  if declare -F deploy_maintenance__listener_arn >/dev/null 2>&1; then
    deploy_maintenance__listener_arn
    return $?
  fi
  local alb_arn listener_arn use_https
  alb_arn=$(oscal_traffic_mode__tf_raw alb_arn | tr -d '\r\n')
  [ -z "$alb_arn" ] || [ "$alb_arn" = "null" ] && return 1
  use_https=$(oscal_traffic_mode__tf_raw alb_use_https | tr -d '\r\n')
  if [ "$use_https" = "true" ]; then
    # shellcheck disable=SC2016
    listener_arn=$(aws elbv2 describe-listeners --load-balancer-arn "$alb_arn" \
      --query 'Listeners[?Port==`443`].ListenerArn | [0]' --output text 2>/dev/null | tr -d '\r\n')
  else
    # shellcheck disable=SC2016
    listener_arn=$(aws elbv2 describe-listeners --load-balancer-arn "$alb_arn" \
      --query 'Listeners[?Port==`80`].ListenerArn | [0]' --output text 2>/dev/null | tr -d '\r\n')
  fi
  [ -z "$listener_arn" ] || [ "$listener_arn" = "None" ] && return 1
  printf '%s' "$listener_arn"
}

oscal_traffic_mode__forward_json() {
  local green_w="$1" blue_w="$2"
  local green_arn blue_arn stickiness
  green_arn=$(oscal_traffic_mode__target_group_arn green)
  blue_arn=$(oscal_traffic_mode__target_group_arn blue)
  stickiness="${OSCAL_ALB_STICKINESS_SECONDS:-3600}"
  jq -n \
    --arg green "$green_arn" \
    --arg blue "$blue_arn" \
    --argjson gw "$green_w" \
    --argjson bw "$blue_w" \
    --argjson stick "$stickiness" \
    '[{
      "Type": "forward",
      "ForwardConfig": {
        "TargetGroups": [
          {"TargetGroupArn": $green, "Weight": $gw},
          {"TargetGroupArn": $blue, "Weight": $bw}
        ],
        "TargetGroupStickinessConfig": {"Enabled": true, "DurationSeconds": $stick}
      }
    }]'
}

oscal_traffic_mode__set_default_weights() {
  local green_w="$1" blue_w="$2"
  local listener_arn actions tmp
  listener_arn=$(oscal_traffic_mode__listener_arn) || return 1
  actions=$(oscal_traffic_mode__forward_json "$green_w" "$blue_w") || return 1
  tmp=$(mktemp)
  # shellcheck disable=SC2064
  trap "rm -f '$tmp'" RETURN
  printf '%s' "$actions" >"$tmp"
  aws elbv2 modify-listener --listener-arn "$listener_arn" --default-actions "file://${tmp}" >/dev/null
}

oscal_traffic_mode__deploy_edge_rule_arn() {
  local listener_arn="$1"
  aws elbv2 describe-rules --listener-arn "$listener_arn" --output json 2>/dev/null \
    | jq -r --argjson p "$OSCAL_DEPLOY_EDGE_RULE_PRIORITY" \
      '.Rules[] | select(.Priority == ($p|tostring)) | select(.Conditions[]? | select(.Field == "http-header" and .HttpHeaderConfig.HttpHeaderName == "User-Agent")) | .RuleArn' \
    | head -1
}

oscal_traffic_mode__deploy_edge_rule_create() {
  local listener_arn green_arn blue_arn tmp actions rule_arn
  listener_arn=$(oscal_traffic_mode__listener_arn) || return 1
  green_arn=$(oscal_traffic_mode__target_group_arn green)
  blue_arn=$(oscal_traffic_mode__target_group_arn blue)
  rule_arn=$(oscal_traffic_mode__deploy_edge_rule_arn "$listener_arn")
  if [ -n "$rule_arn" ] && [ "$rule_arn" != "null" ]; then
    actions=$(oscal_traffic_mode__forward_json 100 0) || return 1
    tmp=$(mktemp)
    # shellcheck disable=SC2064
    trap "rm -f '$tmp'" RETURN
    printf '%s' "$actions" >"$tmp"
    aws elbv2 modify-rule --rule-arn "$rule_arn" --actions "file://${tmp}" >/dev/null
    return 0
  fi
  actions=$(oscal_traffic_mode__forward_json 100 0) || return 1
  tmp=$(mktemp)
  # shellcheck disable=SC2064
  trap "rm -f '$tmp'" RETURN
  printf '%s' "$actions" >"$tmp"
  jq -n '[{Field:"http-header",HttpHeaderConfig:{HttpHeaderName:"User-Agent",Values:["*Edg*","*Edge*"]}}]' >"${tmp}.cond"
  aws elbv2 create-rule \
    --listener-arn "$listener_arn" \
    --priority "$OSCAL_DEPLOY_EDGE_RULE_PRIORITY" \
    --conditions "file://${tmp}.cond" \
    --actions "file://${tmp}" >/dev/null
  rm -f "${tmp}.cond"
}

oscal_traffic_mode__deploy_edge_rule_delete() {
  local listener_arn rule_arn
  listener_arn=$(oscal_traffic_mode__listener_arn) || return 0
  rule_arn=$(oscal_traffic_mode__deploy_edge_rule_arn "$listener_arn")
  [ -z "$rule_arn" ] || [ "$rule_arn" = "null" ] && return 0
  aws elbv2 delete-rule --rule-arn "$rule_arn" >/dev/null 2>&1 || true
}

oscal_traffic_mode_enter() {
  local mode="${1:?mode required (steady|deploy_green|failover)}"
  local active_role
  oscal_traffic_mode__require_tools || return 1

  if ! oscal_traffic_mode_is_active_passive; then
    echo "oscal-traffic-mode: active_active — skipping mode $mode" >&2
    return 0
  fi

  active_role=$(oscal_traffic_mode__tf_raw oscal_active_role | tr -d '\r\n')
  active_role="${active_role:-blue}"

  case "$mode" in
    steady)
      if [ "$active_role" = "blue" ]; then
        oscal_traffic_mode__set_default_weights 0 100 || return 1
      else
        oscal_traffic_mode__set_default_weights 100 0 || return 1
      fi
      oscal_traffic_mode__deploy_edge_rule_delete || true
      oscal_traffic_mode_set steady
      ;;
    deploy_green)
      if [ "$active_role" = "blue" ]; then
        oscal_traffic_mode__set_default_weights 0 100 || return 1
      else
        oscal_traffic_mode__set_default_weights 100 0 || return 1
      fi
      if [ "$(oscal_traffic_mode__tf_raw oscal_deploy_edge_canary_enabled | tr -d '\r\n')" != "false" ]; then
        oscal_traffic_mode__deploy_edge_rule_create || echo "oscal-traffic-mode: deploy Edge rule failed (non-fatal)" >&2
      fi
      oscal_traffic_mode_set deploy_green
      ;;
    failover)
      if [ "$active_role" = "blue" ]; then
        oscal_traffic_mode__set_default_weights 100 0 || return 1
      else
        oscal_traffic_mode__set_default_weights 0 100 || return 1
      fi
      oscal_traffic_mode__deploy_edge_rule_delete || true
      oscal_traffic_mode_set failover
      ;;
    *)
      echo "oscal-traffic-mode: unknown mode $mode" >&2
      return 1
      ;;
  esac
  echo "oscal-traffic-mode: entered $mode"
  return 0
}
