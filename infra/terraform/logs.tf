resource "aws_cloudwatch_log_group" "fargate" {
  name              = "/eks/${local.cluster_name}/workloads"
  retention_in_days = var.log_retention_days
}
