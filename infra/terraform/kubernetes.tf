resource "helm_release" "aws_load_balancer_controller" {
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  namespace  = "kube-system"
  version    = "1.14.0"

  set = [
    {
      name  = "clusterName"
      value = aws_eks_cluster.this.name
    },
    {
      name  = "region"
      value = var.aws_region
    },
    {
      name  = "vpcId"
      value = aws_vpc.this.id
    },
    {
      name  = "serviceAccount.create"
      value = "true"
    },
    {
      name  = "serviceAccount.name"
      value = "aws-load-balancer-controller"
    },
    {
      name  = "serviceAccount.annotations.eks\\.amazonaws\\.com/role-arn"
      value = aws_iam_role.load_balancer_controller.arn
    },
  ]

  depends_on = [
    aws_eks_addon.coredns,
    aws_eks_fargate_profile.load_balancer_controller,
    aws_iam_role_policy_attachment.load_balancer_controller,
  ]
}

resource "kubernetes_namespace_v1" "application" {
  metadata {
    name = var.kubernetes_namespace
  }

  depends_on = [aws_eks_fargate_profile.application]
}

resource "kubernetes_namespace_v1" "observability" {
  metadata {
    name = "aws-observability"

    labels = {
      "aws-observability" = "enabled"
    }
  }
}

resource "kubernetes_config_map_v1" "fargate_logging" {
  metadata {
    name      = "aws-logging"
    namespace = kubernetes_namespace_v1.observability.metadata[0].name
  }

  data = {
    "flb_log_cw"   = "false"
    "filters.conf" = <<-EOT
      [FILTER]
          Name parser
          Match *
          Key_name log
          Parser crio
      [FILTER]
          Name kubernetes
          Match kube.*
          Merge_Log On
          Keep_Log Off
          Buffer_Size 0
          Kube_Meta_Cache_TTL 300s
    EOT
    "output.conf"  = <<-EOT
      [OUTPUT]
          Name cloudwatch_logs
          Match kube.*
          region ${var.aws_region}
          log_group_name ${aws_cloudwatch_log_group.fargate.name}
          log_stream_prefix fargate-
          auto_create_group false
    EOT
    "parsers.conf" = <<-EOT
      [PARSER]
          Name crio
          Format Regex
          Regex ^(?<time>[^ ]+) (?<stream>stdout|stderr) (?<logtag>P|F) (?<log>.*)$
          Time_Key time
          Time_Format %Y-%m-%dT%H:%M:%S.%L%z
    EOT
  }

  depends_on = [aws_iam_role_policy.fargate_logging]
}

resource "kubernetes_deployment_v1" "app" {
  metadata {
    name      = "${var.project_name}-app"
    namespace = kubernetes_namespace_v1.application.metadata[0].name
    labels = {
      app = "${var.project_name}-app"
    }
  }

  spec {
    replicas = 1

    selector {
      match_labels = {
        app = "${var.project_name}-app"
      }
    }

    template {
      metadata {
        labels = {
          app = "${var.project_name}-app"
        }
      }

      spec {
        container {
          name  = "app"
          image = "${aws_ecr_repository.app.repository_url}:${var.image_tag}"

          port {
            name           = "http"
            container_port = 8080
          }

          env {
            name  = "PORT"
            value = "8080"
          }

          env {
            name  = "SIDECAR_URL"
            value = "http://127.0.0.1:8061"
          }

          readiness_probe {
            http_get {
              path = "/api/health"
              port = "http"
            }
            initial_delay_seconds = 10
            period_seconds        = 15
            timeout_seconds       = 5
            failure_threshold     = 3
          }

          liveness_probe {
            http_get {
              path = "/api/health"
              port = "http"
            }
            initial_delay_seconds = 20
            period_seconds        = 15
            timeout_seconds       = 5
            failure_threshold     = 3
          }

          resources {
            requests = {
              cpu    = "750m"
              memory = "1400Mi"
            }
            limits = {
              cpu    = "750m"
              memory = "1400Mi"
            }
          }
        }

        container {
          name  = "mcp-stub"
          image = "${aws_ecr_repository.sidecar.repository_url}:${var.image_tag}"

          env {
            name  = "PORT"
            value = "8061"
          }

          readiness_probe {
            http_get {
              path = "/health"
              port = 8061
            }
            initial_delay_seconds = 5
            period_seconds        = 15
            timeout_seconds       = 5
            failure_threshold     = 3
          }

          liveness_probe {
            http_get {
              path = "/health"
              port = 8061
            }
            initial_delay_seconds = 10
            period_seconds        = 15
            timeout_seconds       = 5
            failure_threshold     = 3
          }

          resources {
            requests = {
              cpu    = "250m"
              memory = "384Mi"
            }
            limits = {
              cpu    = "250m"
              memory = "384Mi"
            }
          }
        }
      }
    }
  }

  wait_for_rollout = true

  # As imagens são atualizadas pelo CodeBuild a cada release. A topologia do
  # Deployment continua sob gestão do Terraform, sem reverter a tag implantada.
  lifecycle {
    ignore_changes = [
      spec[0].template[0].spec[0].container[0].image,
      spec[0].template[0].spec[0].container[1].image,
    ]
  }

  depends_on = [
    kubernetes_config_map_v1.fargate_logging,
    helm_release.aws_load_balancer_controller,
  ]
}

resource "kubernetes_service_v1" "app" {
  metadata {
    name      = "${var.project_name}-app"
    namespace = kubernetes_namespace_v1.application.metadata[0].name
  }

  spec {
    selector = {
      app = "${var.project_name}-app"
    }

    port {
      name        = "http"
      port        = 8080
      target_port = "http"
      protocol    = "TCP"
    }

    type = "ClusterIP"
  }
}

resource "kubernetes_ingress_v1" "app" {
  metadata {
    name      = "${var.project_name}-app"
    namespace = kubernetes_namespace_v1.application.metadata[0].name

    annotations = merge(
      {
        "kubernetes.io/ingress.class"                        = "alb"
        "alb.ingress.kubernetes.io/load-balancer-name"       = local.alb_name
        "alb.ingress.kubernetes.io/scheme"                   = "internet-facing"
        "alb.ingress.kubernetes.io/target-type"              = "ip"
        "alb.ingress.kubernetes.io/healthcheck-path"         = "/api/health"
        "alb.ingress.kubernetes.io/success-codes"            = "200"
        "alb.ingress.kubernetes.io/load-balancer-attributes" = "idle_timeout.timeout_seconds=120"
        "alb.ingress.kubernetes.io/listen-ports"             = var.enable_custom_domain ? "[{\"HTTPS\":443},{\"HTTP\":80}]" : "[{\"HTTP\":80}]"
      },
      var.enable_custom_domain ? {
        "alb.ingress.kubernetes.io/certificate-arn" = aws_acm_certificate_validation.this[0].certificate_arn
        "alb.ingress.kubernetes.io/ssl-redirect"    = "443"
      } : {},
    )
  }

  spec {
    ingress_class_name = "alb"

    rule {
      http {
        path {
          path      = "/"
          path_type = "Prefix"

          backend {
            service {
              name = kubernetes_service_v1.app.metadata[0].name

              port {
                name = "http"
              }
            }
          }
        }
      }
    }
  }

  wait_for_load_balancer = true

  depends_on = [
    helm_release.aws_load_balancer_controller,
    kubernetes_deployment_v1.app,
  ]
}
