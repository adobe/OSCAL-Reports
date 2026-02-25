# Lambda: Ollama wake/sleep controller + EventBridge rule (every 30 min)
# Idle = STOP instance + detach (never terminate). Wake = start saved instance or set ASG desired_capacity to launch new.
# terraform apply does NOT invoke the Lambda; it only updates infra. To wake after idle: invoke Lambda (action=wake) e.g. ./scripts/debug/run-install-ollama-on-instance.sh wake or from Blue/Green app. With desired_capacity=1, apply will set ASG to 1 and can start an instance if ASG is at 0.

data "archive_file" "ollama_controller" {
  type        = "zip"
  source_file = "${path.module}/lambda/ollama_controller.py"
  output_path = "${path.module}/lambda/ollama_controller.zip"
}

resource "aws_lambda_function" "ollama_controller" {
  filename         = data.archive_file.ollama_controller.output_path
  function_name    = "${var.project_name}-ollama-controller"
  role             = aws_iam_role.lambda_ollama_controller.arn
  handler          = "ollama_controller.lambda_handler"
  source_code_hash = data.archive_file.ollama_controller.output_base64sha256
  runtime          = "python3.11"
  timeout          = 300
  memory_size      = 256

  environment {
    variables = {
      S3_ACTIVITY_BUCKET       = aws_s3_bucket.logs.id
      S3_ACTIVITY_KEY          = "ollama-activity/last.json"
      OLLAMA_ASG_NAME          = aws_autoscaling_group.ollama.name
      IDLE_TIMEOUT_HOURS       = tostring(var.ollama_idle_timeout_hours)
      OLLAMA_DESIRED_CAPACITY  = tostring(var.ollama_desired_capacity)
      OLLAMA_MAX_INSTANCES     = tostring(var.ollama_max_size)
    }
  }
}

resource "aws_cloudwatch_log_group" "ollama_controller" {
  name              = "/aws/lambda/${aws_lambda_function.ollama_controller.function_name}"
  retention_in_days  = 14
}

resource "aws_cloudwatch_event_rule" "ollama_idle_check" {
  name                = "${var.project_name}-ollama-idle-check"
  description         = "Check if Ollama instance should be shut down (every 30 min)"
  schedule_expression = "rate(30 minutes)"
}

resource "aws_cloudwatch_event_target" "ollama_idle_check" {
  rule      = aws_cloudwatch_event_rule.ollama_idle_check.name
  target_id = "OllamaControllerLambda"
  arn       = aws_lambda_function.ollama_controller.arn
  input     = "{\"action\": \"check_idle\"}"
}

resource "aws_lambda_permission" "events" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ollama_controller.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.ollama_idle_check.arn
}
