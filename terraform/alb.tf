# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# Application Load Balancer: Green and Blue target groups (same app port on both instances).
# Health check: /health on var.oscal_app_port (default 3020).
# Traffic by User-Agent: Chrome/Firefox → 60% green, 40% blue (priority 10). Edge/Safari → 60% blue, 40% green (priority 11).
# Default (including curl probe): 50% green, 50% blue. Host-based rules (green/blue hostnames) use priority 100/101 when set.
# idle_timeout 300s avoids 504 Gateway Timeout when backend takes >60s (e.g. AI/report generation).
# PCL custom-elb-restricted-ports-check: ALB security group allows only 443 (no port 80). Enable HTTPS (create_alb_certificate + alb_certificate_ready or alb_ssl_certificate_arn) so the ALB is reachable.
# When cert is not ready: HTTP listener on 80 exists for redirect but SG does not open 80; use HTTPS listener (443) once cert is Issued.

locals {
  alb_use_https = (var.create_alb_certificate && var.alb_domain_name != null && var.alb_certificate_ready) || var.alb_ssl_certificate_arn != null
  alb_cert_arn  = var.create_alb_certificate && var.alb_domain_name != null ? aws_acm_certificate.alb[0].arn : var.alb_ssl_certificate_arn
  # ELB target group name_prefix max 6 chars (AWS); suffix is added by Terraform/AWS.
  alb_tg_prefix_green = "aogrn-"
  alb_tg_prefix_blue  = "aoblu-"
}

# AMS PCL: ALB with port exposure must be tagged Adobe:PublicPorts (space-separated ports) and Adobe:PortJustification.
# If tooling cannot use colon in tag key, use Adobe-PublicPorts or Adobe.PublicPorts.
resource "aws_lb" "main" {
  name               = "${var.project_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id
  idle_timeout       = 300

  tags = {
    "Adobe:PublicPorts"       = local.alb_use_https ? "80 443" : "80"
    "Adobe:PortJustification" = var.alb_port_justification
  }
}

# Green target group: ALB health check = http://<green-instance-ip>:<oscal_app_port>/health
# name_prefix + create_before_destroy: port changes replace the TG; listeners must keep using the old ARN until the new TG exists.
resource "aws_lb_target_group" "green" {
  name_prefix = local.alb_tg_prefix_green
  port        = var.oscal_app_port
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id

  lifecycle {
    create_before_destroy = true
  }

  health_check {
    path                = "/health"
    port                = tostring(var.oscal_app_port)
    protocol            = "HTTP"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 10
    timeout             = 5
    matcher             = "200"
  }

  stickiness {
    type            = "lb_cookie"
    cookie_duration = 86400
    enabled         = false
  }
}

# Blue target group: ALB health check = http://<blue-instance-ip>:<oscal_app_port>/health
resource "aws_lb_target_group" "blue" {
  name_prefix = local.alb_tg_prefix_blue
  port        = var.oscal_app_port
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id

  lifecycle {
    create_before_destroy = true
  }

  health_check {
    path                = "/health"
    port                = tostring(var.oscal_app_port)
    protocol            = "HTTP"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 10
    timeout             = 5
    matcher             = "200"
  }

  stickiness {
    type            = "lb_cookie"
    cookie_duration = 86400
    enabled         = false
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
      stickiness {
        enabled  = true
        duration = 86400
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

# Chrome or Firefox User-Agent → 60% Green, 40% Blue (priority 10; evaluated before Edge/Safari so Chrome does not match Safari).
resource "aws_lb_listener_rule" "browser_green_http" {
  count        = local.alb_use_https ? 0 : 1
  listener_arn = aws_lb_listener.http_forward[0].arn
  priority     = 10

  action {
    type = "forward"
    forward {
      target_group {
        arn    = aws_lb_target_group.green.arn
        weight = 60
      }
      target_group {
        arn    = aws_lb_target_group.blue.arn
        weight = 40
      }
      stickiness {
        enabled  = true
        duration = 86400
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

# Edge or Safari User-Agent → 60% Blue, 40% Green (priority 11).
resource "aws_lb_listener_rule" "browser_edge_safari_http" {
  count        = local.alb_use_https ? 0 : 1
  listener_arn = aws_lb_listener.http_forward[0].arn
  priority     = 11

  action {
    type = "forward"
    forward {
      target_group {
        arn    = aws_lb_target_group.green.arn
        weight = 40
      }
      target_group {
        arn    = aws_lb_target_group.blue.arn
        weight = 60
      }
      stickiness {
        enabled  = true
        duration = 86400
      }
    }
  }

  condition {
    http_header {
      http_header_name = "User-Agent"
      values           = ["*Edg*", "*Edge*", "*Safari*"]
    }
  }
}

# Green hostname: prefer Green (99%), fallback to Blue when Green has no healthy targets (avoids 503).
resource "aws_lb_listener_rule" "green_host_http" {
  count        = !local.alb_use_https && var.alb_green_hostname != null ? 1 : 0
  listener_arn = aws_lb_listener.http_forward[0].arn
  priority     = 100

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
      stickiness {
        enabled  = true
        duration = 86400
      }
    }
  }

  condition {
    host_header {
      values = [var.alb_green_hostname]
    }
  }
}

# Blue hostname: prefer Blue (99%), fallback to Green when Blue has no healthy targets (avoids 503).
resource "aws_lb_listener_rule" "blue_host_http" {
  count        = !local.alb_use_https && var.alb_blue_hostname != null ? 1 : 0
  listener_arn = aws_lb_listener.http_forward[0].arn
  priority     = 101

  action {
    type = "forward"
    forward {
      target_group {
        arn    = aws_lb_target_group.green.arn
        weight = 1
      }
      target_group {
        arn    = aws_lb_target_group.blue.arn
        weight = 99
      }
      stickiness {
        enabled  = true
        duration = 86400
      }
    }
  }

  condition {
    host_header {
      values = [var.alb_blue_hostname]
    }
  }
}

# HTTPS listener (443): Secure listener settings aligned with AWS Console.
# - Security policy: Post-quantum TLS — ELBSecurityPolicy-TLS13-1-2-Res-PQ-2025-09 (variable alb_ssl_policy).
# - Default SSL/TLS server certificate: From ACM (local.alb_cert_arn — e.g. oscal.amsgovcloud.com.au).
# - Client certificate handling: Mutual authentication (mTLS) disabled.
# Group stickiness required when target groups have stickiness enabled (satisfies AWS CreateListener validation).
resource "aws_lb_listener" "https" {
  count = local.alb_use_https ? 1 : 0

  load_balancer_arn = aws_lb.main.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = var.alb_ssl_policy
  certificate_arn   = local.alb_cert_arn

  mutual_authentication {
    mode = "off"
  }

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
      stickiness {
        enabled  = true
        duration = 86400
      }
    }
  }
}

# Chrome or Firefox User-Agent → 60% Green, 40% Blue (HTTPS, priority 10).
resource "aws_lb_listener_rule" "browser_green_https" {
  count        = local.alb_use_https ? 1 : 0
  listener_arn = aws_lb_listener.https[0].arn
  priority     = 10

  action {
    type = "forward"
    forward {
      target_group {
        arn    = aws_lb_target_group.green.arn
        weight = 60
      }
      target_group {
        arn    = aws_lb_target_group.blue.arn
        weight = 40
      }
      stickiness {
        enabled  = true
        duration = 86400
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

# Edge or Safari User-Agent → 60% Blue, 40% Green (HTTPS, priority 11).
resource "aws_lb_listener_rule" "browser_edge_safari_https" {
  count        = local.alb_use_https ? 1 : 0
  listener_arn = aws_lb_listener.https[0].arn
  priority     = 11

  action {
    type = "forward"
    forward {
      target_group {
        arn    = aws_lb_target_group.green.arn
        weight = 40
      }
      target_group {
        arn    = aws_lb_target_group.blue.arn
        weight = 60
      }
      stickiness {
        enabled  = true
        duration = 86400
      }
    }
  }

  condition {
    http_header {
      http_header_name = "User-Agent"
      values           = ["*Edg*", "*Edge*", "*Safari*"]
    }
  }
}

# Green hostname (HTTPS): prefer Green (99%), fallback to Blue when Green has no healthy targets (avoids 503).
resource "aws_lb_listener_rule" "green_host_https" {
  count        = local.alb_use_https && var.alb_green_hostname != null ? 1 : 0
  listener_arn = aws_lb_listener.https[0].arn
  priority     = 100

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
      stickiness {
        enabled  = true
        duration = 86400
      }
    }
  }

  condition {
    host_header {
      values = [var.alb_green_hostname]
    }
  }
}

# Blue hostname (HTTPS): prefer Blue (99%), fallback to Green when Blue has no healthy targets (avoids 503).
resource "aws_lb_listener_rule" "blue_host_https" {
  count        = local.alb_use_https && var.alb_blue_hostname != null ? 1 : 0
  listener_arn = aws_lb_listener.https[0].arn
  priority     = 101

  action {
    type = "forward"
    forward {
      target_group {
        arn    = aws_lb_target_group.green.arn
        weight = 1
      }
      target_group {
        arn    = aws_lb_target_group.blue.arn
        weight = 99
      }
      stickiness {
        enabled  = true
        duration = 86400
      }
    }
  }

  condition {
    host_header {
      values = [var.alb_blue_hostname]
    }
  }
}
