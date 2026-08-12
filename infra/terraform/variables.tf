variable "aws_region" {
  description = "Região AWS onde o POC será criado"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Prefixo usado no nome de todos os recursos"
  type        = string
  default     = "sse-poc"
}

variable "kubernetes_version" {
  description = "Versão Kubernetes do cluster EKS"
  type        = string
  default     = "1.33"
}

variable "kubernetes_namespace" {
  description = "Namespace Kubernetes onde a aplicação será executada"
  type        = string
  default     = "sse-poc"
}

variable "github_repository" {
  description = "Repositório GitHub conectado ao CodePipeline no formato owner/repository"
  type        = string
}

variable "github_branch" {
  description = "Branch GitHub monitorada pelo CodePipeline"
  type        = string
  default     = "main"
}

variable "codeconnections_connection_arn" {
  description = "ARN da conexão GitHub autorizada no AWS CodeConnections"
  type        = string

  validation {
    condition     = can(regex("^arn:[^:]+:codeconnections:[^:]+:[0-9]{12}:connection/.+$", var.codeconnections_connection_arn))
    error_message = "codeconnections_connection_arn deve ser um ARN válido de AWS CodeConnections."
  }
}

variable "enable_custom_domain" {
  description = "Quando true, cria ACM + Route 53 + HTTPS para subdomain.domain_name. Quando false, usa apenas HTTP pelo DNS público do ALB."
  type        = bool
  default     = false
}

variable "hosted_zone_id" {
  description = "ID de uma hosted zone pública já existente no Route 53 (obrigatório apenas com enable_custom_domain=true)"
  type        = string
  default     = null

  validation {
    condition     = !var.enable_custom_domain || var.hosted_zone_id != null
    error_message = "hosted_zone_id é obrigatório quando enable_custom_domain=true."
  }
}

variable "domain_name" {
  description = "Domínio raiz da hosted zone (ex.: seudominio.com). Obrigatório apenas com enable_custom_domain=true."
  type        = string
  default     = null

  validation {
    condition     = !var.enable_custom_domain || var.domain_name != null
    error_message = "domain_name é obrigatório quando enable_custom_domain=true."
  }
}

variable "subdomain" {
  description = "Subdomínio do POC (ex.: poc → poc.seudominio.com)"
  type        = string
  default     = "poc"
}

variable "image_tag" {
  description = "Tag das imagens no ECR usadas pelo Deployment Kubernetes"
  type        = string
  default     = "latest"
}

variable "log_retention_days" {
  description = "Retenção (em dias) dos log groups do CloudWatch"
  type        = number
  default     = 7
}

variable "vpc_cidr" {
  description = "CIDR da VPC do ambiente"
  type        = string
  default     = "10.42.0.0/16"
}

locals {
  fqdn = var.enable_custom_domain ? "${var.subdomain}.${var.domain_name}" : null
}
