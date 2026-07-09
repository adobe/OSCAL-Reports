"""
Concept: Mukesh Kesharwani
Contact: mukesh.kesharwani@adobe.com

Lambda: passive idle shutdown and primary-unhealthy failover for active-passive Blue/Green.
"""
import json
import os

import boto3

elbv2 = boto3.client("elbv2")
autoscaling = boto3.client("autoscaling")
ssm = boto3.client("ssm")
cloudwatch = boto3.client("cloudwatch")


def _env(name, default=""):
    return os.environ.get(name, default)


def _traffic_mode():
    param = _env("TRAFFIC_MODE_PARAM")
    if not param:
        return "steady"
    try:
        resp = ssm.get_parameter(Name=param)
        return resp["Parameter"]["Value"].strip()
    except Exception:
        return "steady"


def _set_traffic_mode(mode):
    param = _env("TRAFFIC_MODE_PARAM")
    if param:
        ssm.put_parameter(Name=param, Value=mode, Type="String", Overwrite=True)


def _healthy_target_count(tg_arn):
    if not tg_arn:
        return 0
    resp = elbv2.describe_target_health(TargetGroupArn=tg_arn)
    return sum(
        1
        for d in resp.get("TargetHealthDescriptions", [])
        if d.get("TargetHealth", {}).get("State") == "healthy"
    )


def _set_forward_weights(green_w, blue_w):
    listener_arn = _env("LISTENER_ARN")
    green_arn = _env("GREEN_TG_ARN")
    blue_arn = _env("BLUE_TG_ARN")
    if not listener_arn or not green_arn or not blue_arn:
        return
    stickiness = int(_env("STICKINESS_SECONDS", "3600"))
    actions = [
        {
            "Type": "forward",
            "ForwardConfig": {
                "TargetGroups": [
                    {"TargetGroupArn": green_arn, "Weight": green_w},
                    {"TargetGroupArn": blue_arn, "Weight": blue_w},
                ],
                "TargetGroupStickinessConfig": {
                    "Enabled": True,
                    "DurationSeconds": stickiness,
                },
            },
        }
    ]
    elbv2.modify_listener(ListenerArn=listener_arn, DefaultActions=actions)


def _set_asg_desired(asg_name, capacity):
    if not asg_name:
        return
    autoscaling.set_desired_capacity(
        AutoScalingGroupName=asg_name,
        DesiredCapacity=capacity,
        HonorCooldown=False,
    )


def _handle_idle_shutdown():
    mode = _traffic_mode()
    if mode != "steady":
        print(f"skip idle shutdown: traffic mode is {mode}")
        return {"status": "skipped", "reason": f"mode={mode}"}

    active_tg = _env("ACTIVE_TG_ARN")
    if _healthy_target_count(active_tg) < 1:
        print("skip idle shutdown: active target group has no healthy targets")
        return {"status": "skipped", "reason": "active_unhealthy"}

    passive_asg = _env("PASSIVE_ASG_NAME")
    _set_asg_desired(passive_asg, 0)
    print(f"idle shutdown: set {passive_asg} desired=0")
    return {"status": "shutdown", "asg": passive_asg}


def _handle_failover_wake():
    passive_asg = _env("PASSIVE_ASG_NAME")
    _set_traffic_mode("failover")
    _set_asg_desired(passive_asg, 1)
    _set_forward_weights(100, 0)
    print(f"failover: wake {passive_asg}, route 100% to passive")
    return {"status": "failover", "asg": passive_asg}


def _handle_failover_restore():
    mode = _traffic_mode()
    if mode != "failover":
        return {"status": "skipped", "reason": f"mode={mode}"}

    active_tg = _env("ACTIVE_TG_ARN")
    if _healthy_target_count(active_tg) < 1:
        return {"status": "skipped", "reason": "active_still_unhealthy"}

    _set_traffic_mode("steady")
    active_role = _env("ACTIVE_ROLE", "blue")
    if active_role == "blue":
        _set_forward_weights(0, 100)
    else:
        _set_forward_weights(100, 0)
    print("failover restore: steady routing restored (passive ASG left running until idle alarm)")
    return {"status": "steady_restored"}


def handler(event, context):
    print(json.dumps(event))
    action = _env("ACTION")
    if action == "idle_shutdown":
        return _handle_idle_shutdown()
    if action == "failover_wake":
        return _handle_failover_wake()
    if action == "failover_restore":
        return _handle_failover_restore()

    alarm_name = ""
    if isinstance(event, dict):
        alarm_name = (
            event.get("alarmData", {}).get("alarmName")
            or event.get("AlarmName")
            or ""
        )
    name = alarm_name.lower()
    if "failover-restore" in name:
        return _handle_failover_restore()
    if "unhealthy" in name or "failover-wake" in name:
        return _handle_failover_wake()
    if "idle" in name:
        return _handle_idle_shutdown()
    return {"status": "unknown_event", "alarm": alarm_name}
