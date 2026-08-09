resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${var.project_name}/app"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "sidecar" {
  name              = "/ecs/${var.project_name}/mcp-stub"
  retention_in_days = var.log_retention_days
}
