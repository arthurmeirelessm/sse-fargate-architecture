resource "aws_eks_cluster" "this" {
  name     = local.cluster_name
  role_arn = aws_iam_role.eks_cluster.arn
  version  = var.kubernetes_version

  access_config {
    authentication_mode                         = "API_AND_CONFIG_MAP"
    bootstrap_cluster_creator_admin_permissions = true
  }

  vpc_config {
    subnet_ids              = aws_subnet.private[*].id
    endpoint_private_access = true
    endpoint_public_access  = true
  }

  enabled_cluster_log_types = ["api", "audit", "authenticator"]

  depends_on = [
    aws_iam_role_policy_attachment.eks_cluster,
  ]
}

# O CoreDNS padrão é marcado para EC2. Esta configuração o torna elegível para
# o profile Fargate abaixo em um cluster sem node groups EC2.
resource "aws_eks_addon" "coredns" {
  cluster_name                = aws_eks_cluster.this.name
  addon_name                  = "coredns"
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "PRESERVE"

  configuration_values = jsonencode({
    computeType = "fargate"
  })

  depends_on = [aws_eks_fargate_profile.coredns]
}

resource "aws_eks_fargate_profile" "application" {
  cluster_name           = aws_eks_cluster.this.name
  fargate_profile_name   = "${var.project_name}-application"
  pod_execution_role_arn = aws_iam_role.fargate_pod_execution.arn
  subnet_ids             = aws_subnet.private[*].id

  selector {
    namespace = var.kubernetes_namespace
  }

  depends_on = [aws_iam_role_policy_attachment.fargate_pod_execution]
}

resource "aws_eks_fargate_profile" "coredns" {
  cluster_name           = aws_eks_cluster.this.name
  fargate_profile_name   = "${var.project_name}-coredns"
  pod_execution_role_arn = aws_iam_role.fargate_pod_execution.arn
  subnet_ids             = aws_subnet.private[*].id

  selector {
    namespace = "kube-system"
    labels = {
      "k8s-app" = "kube-dns"
    }
  }

  depends_on = [aws_iam_role_policy_attachment.fargate_pod_execution]
}

resource "aws_eks_fargate_profile" "load_balancer_controller" {
  cluster_name           = aws_eks_cluster.this.name
  fargate_profile_name   = "${var.project_name}-load-balancer-controller"
  pod_execution_role_arn = aws_iam_role.fargate_pod_execution.arn
  subnet_ids             = aws_subnet.private[*].id

  selector {
    namespace = "kube-system"
    labels = {
      "app.kubernetes.io/name" = "aws-load-balancer-controller"
    }
  }

  depends_on = [aws_iam_role_policy_attachment.fargate_pod_execution]
}

resource "aws_eks_access_entry" "github_actions" {
  count = var.github_actions_role_arn == null ? 0 : 1

  cluster_name  = aws_eks_cluster.this.name
  principal_arn = var.github_actions_role_arn
  type          = "STANDARD"
}

resource "aws_eks_access_policy_association" "github_actions" {
  count = var.github_actions_role_arn == null ? 0 : 1

  cluster_name  = aws_eks_cluster.this.name
  principal_arn = aws_eks_access_entry.github_actions[0].principal_arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  access_scope {
    type = "cluster"
  }
}
