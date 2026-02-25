# Internal NLB for Ollama: single stable URL so OSCAL (or any system in VPC) can reach
# Ollama. When ASG scales to 0, no targets; Lambda wake scales up and instances
# auto-register via ASG attachment. Use OLLAMA_URL = http://<ollama_nlb_dns_name>:11434

resource "aws_lb" "ollama" {
  name               = "${var.project_name}-ollama-nlb"
  internal           = true
  load_balancer_type = "network"
  subnets            = aws_subnet.public[*].id

  enable_cross_zone_load_balancing = true
}

resource "aws_lb_target_group" "ollama" {
  name        = "${var.project_name}-ollama-11434"
  port        = 11434
  protocol    = "TCP"
  vpc_id      = aws_vpc.main.id
  target_type = "instance"

  # So traffic to Ollama appears from OSCAL; Ollama SG allows oscal only
  preserve_client_ip = true

  health_check {
    protocol            = "TCP"
    port                = "11434"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 5
  }
}

resource "aws_lb_listener" "ollama" {
  load_balancer_arn = aws_lb.ollama.arn
  port              = "11434"
  protocol          = "TCP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.ollama.arn
  }
}

resource "aws_autoscaling_attachment" "ollama" {
  autoscaling_group_name = aws_autoscaling_group.ollama.id
  lb_target_group_arn    = aws_lb_target_group.ollama.arn
}
