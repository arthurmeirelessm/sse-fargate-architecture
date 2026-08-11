output "alb_url" {
  description = "URL HTTP direta do ALB criado pelo AWS Load Balancer Controller."
  value       = "http://${kubernetes_ingress_v1.app.status[0].load_balancer[0].ingress[0].hostname}"
}

output "app_url" {
  description = "URL principal do POC (ALB HTTP ou domínio HTTPS, dependendo de enable_custom_domain)."
  value       = var.enable_custom_domain ? "https://${local.fqdn}" : "http://${kubernetes_ingress_v1.app.status[0].load_balancer[0].ingress[0].hostname}"
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

output "eks_cluster_name" {
  description = "Nome do cluster EKS"
  value       = aws_eks_cluster.this.name
}

output "eks_cluster_endpoint" {
  description = "Endpoint da API do cluster EKS"
  value       = aws_eks_cluster.this.endpoint
}

output "kubernetes_namespace" {
  description = "Namespace do Deployment da aplicação"
  value       = kubernetes_namespace_v1.application.metadata[0].name
}

output "cloudwatch_log_group" {
  description = "Log group de workloads EKS Fargate"
  value       = aws_cloudwatch_log_group.fargate.name
}
