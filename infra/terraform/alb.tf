data "aws_lb" "app" {
  count = var.enable_custom_domain ? 1 : 0

  # O controller cria o ALB a partir do Ingress e preserva este nome estável.
  name = local.alb_name

  depends_on = [kubernetes_ingress_v1.app]
}
