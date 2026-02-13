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
    """Wake existing stopped instance if present, else scale up ASG to launch a new instance."""
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
                DesiredCapacity=OLLAMA_DESIRED_CAPACITY,
            )
            update_activity_timestamp()
            return {
                "statusCode": 200,
                "body": json.dumps({"message": f"Started existing Ollama instance {instance_id}"}),
            }
        if state == "running":
            ensure_instance_attached_and_capacity(instance_id)
            update_activity_timestamp()
            return {
                "statusCode": 200,
                "body": json.dumps({"message": f"Ollama instance {instance_id} already running"}),
            }
        # instance terminated or not found; launch new one
    launch_new_and_save_instance_id()
    update_activity_timestamp()
    return {
        "statusCode": 200,
        "body": json.dumps({"message": f"Ollama ASG set to {OLLAMA_DESIRED_CAPACITY} instance(s)"}),
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
    """Write instance ID to S3."""
    if not S3_BUCKET or not instance_id:
        return
    body = json.dumps({"instance_id": instance_id})
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
    """Ensure instance is in ASG and desired capacity is set."""
    instance_ids = get_asg_instance_ids()
    if instance_id not in instance_ids:
        asg.attach_instances(
            AutoScalingGroupName=OLLAMA_ASG_NAME,
            InstanceIds=[instance_id],
        )
    asg.set_desired_capacity(
        AutoScalingGroupName=OLLAMA_ASG_NAME,
        DesiredCapacity=OLLAMA_DESIRED_CAPACITY,
    )


def launch_new_and_save_instance_id():
    """Set ASG desired capacity to 1, poll for new instance ID, save to S3, wait for running."""
    asg.set_desired_capacity(
        AutoScalingGroupName=OLLAMA_ASG_NAME,
        DesiredCapacity=OLLAMA_DESIRED_CAPACITY,
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
    """Check if Ollama has been idle for IDLE_TIMEOUT_HOURS; if so, stop instance and detach from ASG."""
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
    instances = response["AutoScalingGroups"][0]["Instances"]
    return [i["InstanceId"] for i in instances]
