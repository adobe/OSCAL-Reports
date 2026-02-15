# Application Load Balancer: Green (3019) and Blue (3020) target groups
# Default: 50% Green, 50% Blue. Chrome/Firefox User-Agent → Green only (priority 10).
# Host-based rules (green/blue hostnames) use priority 100/101 when set.

resource "aws_lb" "main" {
  name               = "${var.project_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id
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

# HTTP listener: default 50/50 Green/Blue
resource "aws_lb_listener" "http" {
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

# Chrome or Firefox User-Agent → Green only (evaluated first, priority 10)
resource "aws_lb_listener_rule" "browser_green_http" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.green.arn
  }

  condition {
    http_header {
      http_header_name = "User-Agent"
      values           = ["*Chrome*", "*Firefox*"]
    }
  }
}

resource "aws_lb_listener_rule" "green_host_http" {
  count        = var.alb_green_hostname != null ? 1 : 0
  listener_arn = aws_lb_listener.http.arn
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
  count        = var.alb_blue_hostname != null ? 1 : 0
  listener_arn = aws_lb_listener.http.arn
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

# HTTPS listener: default 50/50 Green/Blue
resource "aws_lb_listener" "https" {
  count = var.alb_ssl_certificate_arn != null ? 1 : 0

  load_balancer_arn = aws_lb.main.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.alb_ssl_certificate_arn

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

# Chrome or Firefox User-Agent → Green only (HTTPS, priority 10)
resource "aws_lb_listener_rule" "browser_green_https" {
  count        = var.alb_ssl_certificate_arn != null ? 1 : 0
  listener_arn = aws_lb_listener.https[0].arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.green.arn
  }

  condition {
    http_header {
      http_header_name = "User-Agent"
      values           = ["*Chrome*", "*Firefox*"]
    }
  }
}

resource "aws_lb_listener_rule" "green_host_https" {
  count        = var.alb_ssl_certificate_arn != null && var.alb_green_hostname != null ? 1 : 0
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
  count        = var.alb_ssl_certificate_arn != null && var.alb_blue_hostname != null ? 1 : 0
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
