# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
#
# Active-passive standby: SSM traffic-mode state, idle shutdown, and primary-unhealthy failover.

locals {
  oscal_standby_enabled = var.oscal_traffic_mode == "active_passive" && var.oscal_standby_automation_enabled
  oscal_traffic_mode_param_name = "/${var.project_name}/oscal/traffic-mode"
  oscal_passive_asg_name = var.oscal_passive_role == "green" ? aws_autoscaling_group.oscal_green.name : aws_autoscaling_group.oscal_blue.name
  oscal_active_tg_arn    = var.oscal_active_role == "blue" ? aws_lb_target_group.blue.arn : aws_lb_target_group.green.arn
  oscal_passive_tg_arn   = var.oscal_passive_role == "blue" ? aws_lb_target_group.blue.arn : aws_lb_target_group.green.arn
  oscal_idle_periods     = max(1, var.oscal_passive_idle_shutdown_hours * 4)
}

resource "aws_ssm_parameter" "oscal_traffic_mode" {
  count = local.oscal_standby_enabled ? 1 : 0

  name  = local.oscal_traffic_mode_param_name
  type  = "String"
  value = "steady"

  tags = {
    Stack = var.project_name
  }
}

data "archive_file" "oscal_standby_lambda" {
  count = local.oscal_standby_enabled ? 1 : 0

  type        = "zip"
  source_file = "${path.module}/../../lambda/oscal_standby_handler.py"
  output_path = "${path.module}/../../lambda/oscal_standby_handler.zip"
}

resource "aws_iam_role" "oscal_standby_lambda" {
  count = local.oscal_standby_enabled ? 1 : 0

  name_prefix = "${var.project_name}-standby-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "oscal_standby_lambda" {
  count = local.oscal_standby_enabled ? 1 : 0

  name_prefix = "${var.project_name}-standby-"
  role        = aws_iam_role.oscal_standby_lambda[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:*"
      },
      {
        Effect = "Allow"
        Action = [
          "autoscaling:SetDesiredCapacity",
          "autoscaling:DescribeAutoScalingGroups"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "elasticloadbalancing:DescribeTargetHealth",
          "elasticloadbalancing:ModifyListener",
          "elasticloadbalancing:DescribeRules",
          "elasticloadbalancing:ModifyRule",
          "elasticloadbalancing:CreateRule",
          "elasticloadbalancing:DeleteRule"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:PutParameter"
        ]
        Resource = "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/${var.project_name}/oscal/*"
      }
    ]
  })
}

resource "aws_lambda_function" "oscal_standby" {
  count = local.oscal_standby_enabled ? 1 : 0

  function_name = "${var.project_name}-oscal-standby"
  role          = aws_iam_role.oscal_standby_lambda[0].arn
  handler       = "oscal_standby_handler.handler"
  runtime       = "python3.12"
  timeout       = 120
  filename      = data.archive_file.oscal_standby_lambda[0].output_path
  source_code_hash = data.archive_file.oscal_standby_lambda[0].output_base64sha256

  environment {
    variables = {
      TRAFFIC_MODE_PARAM  = local.oscal_traffic_mode_param_name
      PASSIVE_ASG_NAME    = local.oscal_passive_asg_name
      ACTIVE_TG_ARN       = local.oscal_active_tg_arn
      PASSIVE_TG_ARN      = local.oscal_passive_tg_arn
      GREEN_TG_ARN        = aws_lb_target_group.green.arn
      BLUE_TG_ARN         = aws_lb_target_group.blue.arn
      ACTIVE_ROLE         = var.oscal_active_role
      STICKINESS_SECONDS  = tostring(local.alb_stickiness_duration)
      LISTENER_ARN        = local.alb_use_https ? aws_lb_listener.https[0].arn : aws_lb_listener.http_forward[0].arn
    }
  }

  depends_on = [aws_iam_role_policy.oscal_standby_lambda]
}

resource "aws_cloudwatch_log_group" "oscal_standby_lambda" {
  count = local.oscal_standby_enabled ? 1 : 0

  name              = "/aws/lambda/${aws_lambda_function.oscal_standby[0].function_name}"
  retention_in_days = 14
}

resource "aws_cloudwatch_metric_alarm" "oscal_passive_idle" {
  count = local.oscal_standby_enabled ? 1 : 0

  alarm_name          = "${var.project_name}-oscal-passive-idle"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = local.oscal_idle_periods
  metric_name         = "RequestCountPerTarget"
  namespace           = "AWS/ApplicationELB"
  period              = 900
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_description   = "Passive target group idle; scale passive ASG to 0 when traffic-mode is steady."

  dimensions = {
    TargetGroup = element(split(":", local.oscal_passive_tg_arn), 5)
  }

  alarm_actions = [aws_lambda_function.oscal_standby[0].arn]

  depends_on = [aws_lambda_function.oscal_standby]
}

resource "aws_cloudwatch_metric_alarm" "oscal_active_unhealthy" {
  count = local.oscal_standby_enabled ? 1 : 0

  alarm_name          = "${var.project_name}-oscal-active-unhealthy-failover-wake"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 5
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Maximum"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_description   = "Primary target group unhealthy; wake passive and enter failover routing."

  dimensions = {
    TargetGroup = element(split(":", local.oscal_active_tg_arn), 5)
  }

  alarm_actions = [aws_lambda_function.oscal_standby[0].arn]

  depends_on = [aws_lambda_function.oscal_standby]
}

resource "aws_cloudwatch_metric_alarm" "oscal_active_healthy_restore" {
  count = local.oscal_standby_enabled ? 1 : 0

  alarm_name          = "${var.project_name}-oscal-active-healthy-failover-restore"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 3
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Maximum"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_description   = "Primary target group healthy again; restore steady Blue-primary routing."

  dimensions = {
    TargetGroup = element(split(":", local.oscal_active_tg_arn), 5)
  }

  alarm_actions = [aws_lambda_function.oscal_standby[0].arn]

  depends_on = [aws_lambda_function.oscal_standby]
}

resource "aws_lambda_permission" "oscal_standby_idle" {
  count = local.oscal_standby_enabled ? 1 : 0

  statement_id  = "AllowExecutionFromCloudWatchIdle"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.oscal_standby[0].function_name
  principal     = "lambda.alarms.cloudwatch.amazonaws.com"
  source_arn    = aws_cloudwatch_metric_alarm.oscal_passive_idle[0].arn
}

resource "aws_lambda_permission" "oscal_standby_unhealthy" {
  count = local.oscal_standby_enabled ? 1 : 0

  statement_id  = "AllowExecutionFromCloudWatchUnhealthy"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.oscal_standby[0].function_name
  principal     = "lambda.alarms.cloudwatch.amazonaws.com"
  source_arn    = aws_cloudwatch_metric_alarm.oscal_active_unhealthy[0].arn
}

resource "aws_lambda_permission" "oscal_standby_restore" {
  count = local.oscal_standby_enabled ? 1 : 0

  statement_id  = "AllowExecutionFromCloudWatchRestore"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.oscal_standby[0].function_name
  principal     = "lambda.alarms.cloudwatch.amazonaws.com"
  source_arn    = aws_cloudwatch_metric_alarm.oscal_active_healthy_restore[0].arn
}
