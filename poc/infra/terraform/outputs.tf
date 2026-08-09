output "alb_url" {
  description = "URL direta do ALB. No modo sem domínio, use esta URL para testar o POC."
  value       = "http://${aws_lb.this.dns_name}"
}

output "app_url" {
  description = "URL principal do POC (ALB HTTP ou domínio HTTPS, dependendo de enable_custom_domain)"
  value       = var.enable_custom_domain ? "https://${local.fqdn}" : "http://${aws_lb.this.dns_name}"
}

output "route53_domain" {
  description = "Domínio Route 53 criado quando enable_custom_domain=true"
  value       = var.enable_custom_domain ? local.fqdn : null
}

output "ecr_repository_app" {
  description = "Repositório ECR da imagem do app"
  value       = aws_ecr_repository.app.repository_url
}

output "ecr_repository_sidecar" {
  description = "Repositório ECR da imagem do sidecar"
  value       = aws_ecr_repository.sidecar.repository_url
}

output "ecs_cluster_name" {
  description = "Nome do cluster ECS"
  value       = aws_ecs_cluster.this.name
}

output "ecs_service_name" {
  description = "Nome do service ECS"
  value       = aws_ecs_service.this.name
}
