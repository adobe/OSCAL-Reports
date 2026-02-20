# Application Load Balancer: Green (3019) and Blue (3020) target groups
# Default: 50% Green, 50% Blue. Chrome/Firefox User-Agent → prefer Green (99%), fallback to Blue when Green unhealthy (priority 10).
# Host-based rules (green/blue hostnames) use priority 100/101 when set.
# idle_timeout 300s avoids 504 Gateway Timeout when backend takes >60s (e.g. AI/report generation).
# HTTPS only when cert is ready: use alb_certificate_ready (true after DNS validation CNAMEs added and cert Issued) or existing alb_ssl_certificate_arn.
# Keeps HTTP listener until then so ALB is not broken while cert is Pending validation.

locals {
  alb_use_https = (var.create_alb_certificate && var.alb_domain_name != null && var.alb_certificate_ready) || var.alb_ssl_certificate_arn != null
  alb_cert_arn = var.create_alb_certificate && var.alb_domain_name != null ? aws_acm_certificate.alb[0].arn : var.alb_ssl_certificate_arn
}

resource "aws_lb" "main" {
  name               = "${var.project_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id
  idle_timeout       = 300
}

resource "aws_lb_target_group" "green" {
  name     = "${var.project_name}-green"
  port     = 3019
  protocol = "HTTP"
  vpc_id   = aws_vpc.main.id

  health_check {
    path                = "/health"
    protocol            = "HTTP"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 10
    timeout             = 5
  }
}

resource "aws_lb_target_group" "blue" {
  name     = "${var.project_name}-blue"
  port     = 3020
  protocol = "HTTP"
  vpc_id   = aws_vpc.main.id

  health_check {
    path                = "/health"
    protocol            = "HTTP"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 10
    timeout             = 5
  }
}

# HTTP listener: when no cert, forward 50/50 Green/Blue; when cert set, redirect to HTTPS (see http_redirect below).
resource "aws_lb_listener" "http_forward" {
  count = local.alb_use_https ? 0 : 1

  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "forward"
    forward {
      target_group {
        arn    = aws_lb_target_group.green.arn
        weight = 50
      }
      target_group {
        arn    = aws_lb_target_group.blue.arn
        weight = 50
      }
    }
  }
}

# HTTP listener: when cert set, redirect all HTTP to HTTPS (301); no rules (HTTPS listener handles routing).
resource "aws_lb_listener" "http_redirect" {
  count = local.alb_use_https ? 1 : 0

  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      protocol    = "HTTPS"
      port        = "443"
      status_code = "HTTP_301"
    }
  }
}

# Chrome or Firefox User-Agent → prefer Green; if Green has no healthy targets, traffic goes to Blue (forward to both with weights).
resource "aws_lb_listener_rule" "browser_green_http" {
  count        = local.alb_use_https ? 0 : 1
  listener_arn = aws_lb_listener.http_forward[0].arn
  priority     = 10

  action {
    type = "forward"
    forward {
      target_group {
        arn    = aws_lb_target_group.green.arn
        weight = 99
      }
      target_group {
        arn    = aws_lb_target_group.blue.arn
        weight = 1
      }
    }
  }

  condition {
    http_header {
      http_header_name = "User-Agent"
      values           = ["*Chrome*", "*Firefox*"]
    }
  }
}

resource "aws_lb_listener_rule" "green_host_http" {
  count        = !local.alb_use_https && var.alb_green_hostname != null ? 1 : 0
  listener_arn = aws_lb_listener.http_forward[0].arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.green.arn
  }

  condition {
    host_header {
      values = [var.alb_green_hostname]
    }
  }
}

resource "aws_lb_listener_rule" "blue_host_http" {
  count        = !local.alb_use_https && var.alb_blue_hostname != null ? 1 : 0
  listener_arn = aws_lb_listener.http_forward[0].arn
  priority     = 101

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.blue.arn
  }

  condition {
    host_header {
      values = [var.alb_blue_hostname]
    }
  }
}

# HTTPS listener: default 50/50 Green/Blue; uses latest TLS policy (variable alb_ssl_policy)
resource "aws_lb_listener" "https" {
  count = local.alb_use_https ? 1 : 0

  load_balancer_arn = aws_lb.main.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = var.alb_ssl_policy
  certificate_arn   = local.alb_cert_arn

  default_action {
    type = "forward"
    forward {
      target_group {
        arn    = aws_lb_target_group.green.arn
        weight = 50
      }
      target_group {
        arn    = aws_lb_target_group.blue.arn
        weight = 50
      }
    }
  }
}

# Chrome or Firefox User-Agent → prefer Green; if Green has no healthy targets, traffic goes to Blue (HTTPS, priority 10).
resource "aws_lb_listener_rule" "browser_green_https" {
  count        = local.alb_use_https ? 1 : 0
  listener_arn = aws_lb_listener.https[0].arn
  priority     = 10

  action {
    type = "forward"
    forward {
      target_group {
        arn    = aws_lb_target_group.green.arn
        weight = 99
      }
      target_group {
        arn    = aws_lb_target_group.blue.arn
        weight = 1
      }
    }
  }

  condition {
    http_header {
      http_header_name = "User-Agent"
      values           = ["*Chrome*", "*Firefox*"]
    }
  }
}

resource "aws_lb_listener_rule" "green_host_https" {
  count        = local.alb_use_https && var.alb_green_hostname != null ? 1 : 0
  listener_arn = aws_lb_listener.https[0].arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.green.arn
  }

  condition {
    host_header {
      values = [var.alb_green_hostname]
    }
  }
}

resource "aws_lb_listener_rule" "blue_host_https" {
  count        = local.alb_use_https && var.alb_blue_hostname != null ? 1 : 0
  listener_arn = aws_lb_listener.https[0].arn
  priority     = 101

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.blue.arn
  }

  condition {
    host_header {
      values = [var.alb_blue_hostname]
    }
  }
}
