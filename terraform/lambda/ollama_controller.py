# Lambda: Ollama wake/sleep controller
# State stored in S3 (same bucket as logs). See docs/AWS_COST_ESTIMATE.md

import boto3
import json
import time
from datetime import datetime, timedelta
import os

ec2 = boto3.client("ec2")
asg = boto3.client("autoscaling")
s3 = boto3.client("s3")

OLLAMA_ASG_NAME = os.environ.get("OLLAMA_ASG_NAME", "ollama-ai-server-asg")
IDLE_TIMEOUT_HOURS = int(os.environ.get("IDLE_TIMEOUT_HOURS", "1"))
OLLAMA_DESIRED_CAPACITY = int(os.environ.get("OLLAMA_DESIRED_CAPACITY", "1"))
OLLAMA_MAX_INSTANCES = int(os.environ.get("OLLAMA_MAX_INSTANCES", "2"))  # Hard cap: never exceed 2
S3_BUCKET = os.environ.get("S3_ACTIVITY_BUCKET", "")
S3_KEY = os.environ.get("S3_ACTIVITY_KEY", "ollama-activity/last.json")
S3_KEY_INSTANCE_ID = "ollama-activity/instance_id.json"


def lambda_handler(event, context):
    """
    Handles Ollama instance lifecycle:
    - Wakes up instance when AI query received
    - Monitors activity and shuts down after idle timeout
    State stored in S3 (same bucket as logs).
    """
    action = event.get("action")

    if action == "wake":
        return wake_ollama_instance()
    elif action == "check_idle":
        return check_and_shutdown_if_idle()
    else:
        return {"statusCode": 400, "body": "Invalid action"}


def wake_ollama_instance():
    """Wake existing stopped instance if present, else scale up ASG to launch a new instance. Never exceed OLLAMA_MAX_INSTANCES."""
    # If we already have at least max instances in ASG, do not add more; trim if over cap
    instance_ids = get_asg_instance_ids()
    if len(instance_ids) >= OLLAMA_MAX_INSTANCES:
        ensure_max_instances()
        update_activity_timestamp()
        return {
            "statusCode": 200,
            "body": json.dumps({"message": f"Already at max ({OLLAMA_MAX_INSTANCES}) Ollama instance(s)"}),
        }

    instance_id = get_saved_instance_id()

    if instance_id:
        state = get_instance_state(instance_id)
        if state == "stopped":
            ec2.start_instances(InstanceIds=[instance_id])
            waiter = ec2.get_waiter("instance_running")
            waiter.wait(InstanceIds=[instance_id])
            asg.attach_instances(
                AutoScalingGroupName=OLLAMA_ASG_NAME,
                InstanceIds=[instance_id],
            )
            asg.set_desired_capacity(
                AutoScalingGroupName=OLLAMA_ASG_NAME,
                DesiredCapacity=min(OLLAMA_DESIRED_CAPACITY, OLLAMA_MAX_INSTANCES),
            )
            ensure_max_instances()
            update_activity_timestamp()
            return {
                "statusCode": 200,
                "body": json.dumps({"message": f"Started existing Ollama instance {instance_id}"}),
            }
        if state == "running":
            ensure_instance_attached_and_capacity(instance_id)
            ensure_max_instances()
            update_activity_timestamp()
            return {
                "statusCode": 200,
                "body": json.dumps({"message": f"Ollama instance {instance_id} already running"}),
            }
        # instance terminated or not found; launch new one
    launch_new_and_save_instance_id()
    ensure_max_instances()
    update_activity_timestamp()
    return {
        "statusCode": 200,
        "body": json.dumps({"message": f"Ollama ASG set to {min(OLLAMA_DESIRED_CAPACITY, OLLAMA_MAX_INSTANCES)} instance(s)"}),
    }


def get_saved_instance_id():
    """Read instance ID from S3 (ollama-activity/instance_id.json)."""
    if not S3_BUCKET:
        return None
    try:
        response = s3.get_object(Bucket=S3_BUCKET, Key=S3_KEY_INSTANCE_ID)
        data = json.loads(response["Body"].read().decode())
        return (data.get("instance_id") or "").strip() or None
    except Exception:
        return None


def save_instance_id(instance_id):
    """Write instance ID to S3. Pass None to clear the saved ID."""
    if not S3_BUCKET:
        return
    body = json.dumps({"instance_id": instance_id} if instance_id else {"instance_id": None})
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=S3_KEY_INSTANCE_ID,
        Body=body,
        ContentType="application/json",
    )


def get_instance_state(instance_id):
    """Return instance state (running, stopped, terminated) or None if not found."""
    try:
        response = ec2.describe_instances(InstanceIds=[instance_id])
        for r in response.get("Reservations", []):
            for i in r.get("Instances", []):
                return (i.get("State", {}).get("Name") or "").lower()
    except Exception:
        pass
    return None


def ensure_instance_attached_and_capacity(instance_id):
    """Ensure instance is in ASG and desired capacity is set (capped at OLLAMA_MAX_INSTANCES)."""
    instance_ids = get_asg_instance_ids()
    if instance_id not in instance_ids:
        asg.attach_instances(
            AutoScalingGroupName=OLLAMA_ASG_NAME,
            InstanceIds=[instance_id],
        )
    asg.set_desired_capacity(
        AutoScalingGroupName=OLLAMA_ASG_NAME,
        DesiredCapacity=min(OLLAMA_DESIRED_CAPACITY, OLLAMA_MAX_INSTANCES),
    )


def launch_new_and_save_instance_id():
    """Set ASG desired capacity (capped at OLLAMA_MAX_INSTANCES), poll for new instance ID, save to S3, wait for running."""
    asg.set_desired_capacity(
        AutoScalingGroupName=OLLAMA_ASG_NAME,
        DesiredCapacity=min(OLLAMA_DESIRED_CAPACITY, OLLAMA_MAX_INSTANCES),
    )
    for _ in range(20):
        instance_ids = get_asg_instance_ids()
        if len(instance_ids) >= OLLAMA_DESIRED_CAPACITY:
            break
        time.sleep(15)
    instance_ids = get_asg_instance_ids()
    if instance_ids:
        save_instance_id(instance_ids[0])
        waiter = ec2.get_waiter("instance_running")
        waiter.wait(InstanceIds=instance_ids)


def check_and_shutdown_if_idle():
    """Check if Ollama has been idle for IDLE_TIMEOUT_HOURS; if so, STOP instance (never terminate) and detach from ASG.
    The instance ID is saved to S3 so the next wake can start this same instance instead of launching a new one.
    Always enforces max instance count: if over cap, terminate oldest immediately."""
    ensure_max_instances()
    if not S3_BUCKET or not S3_KEY:
        return {"statusCode": 200, "body": "No activity config"}

    try:
        response = s3.get_object(Bucket=S3_BUCKET, Key=S3_KEY)
        data = json.loads(response["Body"].read().decode())
        last_str = data.get("last_activity") or ""
        if not last_str:
            return {"statusCode": 200, "body": "No activity data"}
        last_activity = datetime.fromisoformat(last_str.replace("Z", "+00:00"))
    except Exception:
        return {"statusCode": 200, "body": "No activity data"}

    now = datetime.utcnow()
    if last_activity.tzinfo:
        now = datetime.now(last_activity.tzinfo)
    idle_duration = now - last_activity

    if idle_duration <= timedelta(hours=IDLE_TIMEOUT_HOURS):
        remaining = timedelta(hours=IDLE_TIMEOUT_HOURS) - idle_duration
        return {
            "statusCode": 200,
            "body": json.dumps({"message": f"Active, {remaining} remaining"}),
        }

    instance_ids = get_asg_instance_ids()
    if not instance_ids:
        return {
            "statusCode": 200,
            "body": json.dumps({"message": "Ollama already idle (no instances in ASG)"}),
        }

    # STOP only (never terminate) so wake can start this same instance
    ec2.stop_instances(InstanceIds=instance_ids)
    asg.detach_instances(
        AutoScalingGroupName=OLLAMA_ASG_NAME,
        InstanceIds=instance_ids,
        ShouldDecrementDesiredCapacity=True,
    )
    save_instance_id(instance_ids[0])
    return {
        "statusCode": 200,
        "body": json.dumps({"message": "Ollama instance stopped and detached due to inactivity"}),
    }


def update_activity_timestamp():
    """Update last activity timestamp in S3."""
    if not S3_BUCKET or not S3_KEY:
        return
    body = json.dumps({"last_activity": datetime.utcnow().isoformat() + "Z"})
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=S3_KEY,
        Body=body,
        ContentType="application/json",
    )


def get_asg_instance_id():
    """Get first instance ID from Auto Scaling Group (legacy)."""
    ids = get_asg_instance_ids()
    return ids[0] if ids else None


def get_asg_instance_ids():
    """Get all instance IDs from Auto Scaling Group."""
    response = asg.describe_auto_scaling_groups(
        AutoScalingGroupNames=[OLLAMA_ASG_NAME]
    )
    groups = response.get("AutoScalingGroups") or []
    if not groups:
        return []
    instances = groups[0].get("Instances") or []
    return [i["InstanceId"] for i in instances]


def get_asg_instances_with_launch_time():
    """Get (instance_id, launch_time) for all instances in ASG, sorted by launch_time ascending (oldest first)."""
    instance_ids = get_asg_instance_ids()
    if not instance_ids:
        return []
    try:
        response = ec2.describe_instances(InstanceIds=instance_ids)
        result = []
        for r in response.get("Reservations", []):
            for i in r.get("Instances", []):
                inst_id = i.get("InstanceId")
                launch = i.get("LaunchTime")
                if inst_id and launch:
                    result.append((inst_id, launch))
        result.sort(key=lambda x: x[1])
        return result
    except Exception:
        return [(i, None) for i in instance_ids]


def ensure_max_instances():
    """If ASG has more than OLLAMA_MAX_INSTANCES, detach and terminate the oldest instance(s) immediately."""
    instances_with_time = get_asg_instances_with_launch_time()
    if len(instances_with_time) <= OLLAMA_MAX_INSTANCES:
        return
    to_remove = len(instances_with_time) - OLLAMA_MAX_INSTANCES
    oldest_ids = [inst_id for inst_id, _ in instances_with_time[:to_remove]]
    saved_id = get_saved_instance_id()
    for inst_id in oldest_ids:
        try:
            asg.detach_instances(
                AutoScalingGroupName=OLLAMA_ASG_NAME,
                InstanceIds=[inst_id],
                ShouldDecrementDesiredCapacity=True,
            )
            ec2.terminate_instances(InstanceIds=[inst_id])
            if saved_id == inst_id:
                save_instance_id(None)  # Clear saved ID so next wake launches/uses another
        except Exception:
            pass
