data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "pipeline_artifacts" {
  bucket        = "${var.project_name}-pipeline-artifacts-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
}

resource "aws_s3_bucket_ownership_controls" "pipeline_artifacts" {
  bucket = aws_s3_bucket.pipeline_artifacts.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "pipeline_artifacts" {
  bucket = aws_s3_bucket.pipeline_artifacts.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "pipeline_artifacts" {
  bucket = aws_s3_bucket.pipeline_artifacts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "pipeline_artifacts" {
  bucket = aws_s3_bucket.pipeline_artifacts.id

  rule {
    id     = "expire-artifacts"
    status = "Enabled"

    filter {}

    expiration {
      days = 30
    }

    noncurrent_version_expiration {
      noncurrent_days = 7
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

data "aws_iam_policy_document" "pipeline_artifacts_tls" {
  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions = ["s3:*"]

    resources = [
      aws_s3_bucket.pipeline_artifacts.arn,
      "${aws_s3_bucket.pipeline_artifacts.arn}/*",
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "pipeline_artifacts" {
  bucket = aws_s3_bucket.pipeline_artifacts.id
  policy = data.aws_iam_policy_document.pipeline_artifacts_tls.json
}

resource "aws_cloudwatch_log_group" "codebuild" {
  name              = "/aws/codebuild/${var.project_name}-deploy"
  retention_in_days = var.log_retention_days
}

resource "aws_codebuild_project" "deploy" {
  name          = "${var.project_name}-deploy"
  description   = "Testa, publica imagens ECR e faz rollout da aplicação no EKS"
  service_role  = aws_iam_role.codebuild.arn
  build_timeout = 30

  artifacts {
    type = "CODEPIPELINE"
  }

  environment {
    compute_type                = "BUILD_GENERAL1_SMALL"
    image                       = "aws/codebuild/standard:7.0"
    type                        = "LINUX_CONTAINER"
    image_pull_credentials_type = "CODEBUILD"
    privileged_mode             = true

    environment_variable {
      name  = "PROJECT_NAME"
      value = var.project_name
    }

    environment_variable {
      name  = "EKS_CLUSTER_NAME"
      value = aws_eks_cluster.this.name
    }

    environment_variable {
      name  = "KUBERNETES_NAMESPACE"
      value = var.kubernetes_namespace
    }

    environment_variable {
      name  = "KUBERNETES_DEPLOYMENT"
      value = kubernetes_deployment_v1.app.metadata[0].name
    }
  }

  logs_config {
    cloudwatch_logs {
      group_name  = aws_cloudwatch_log_group.codebuild.name
      stream_name = "deploy"
    }
  }

  source {
    type      = "CODEPIPELINE"
    buildspec = "poc/buildspec.yml"
  }

  depends_on = [aws_iam_role_policy.codebuild]
}

resource "aws_codepipeline" "deploy" {
  name          = "${var.project_name}-deploy"
  role_arn      = aws_iam_role.codepipeline.arn
  pipeline_type = "V2"

  artifact_store {
    location = aws_s3_bucket.pipeline_artifacts.bucket
    type     = "S3"
  }

  stage {
    name = "Source"

    action {
      name             = "GitHub"
      category         = "Source"
      owner            = "AWS"
      provider         = "CodeStarSourceConnection"
      version          = "1"
      output_artifacts = ["source_output"]
      namespace        = "SourceVariables"

      configuration = {
        BranchName           = var.github_branch
        ConnectionArn        = var.codeconnections_connection_arn
        DetectChanges        = "true"
        FullRepositoryId     = var.github_repository
        OutputArtifactFormat = "CODE_ZIP"
      }
    }
  }

  stage {
    name = "BuildAndDeploy"

    action {
      name            = "CodeBuild"
      category        = "Build"
      owner           = "AWS"
      provider        = "CodeBuild"
      version         = "1"
      input_artifacts = ["source_output"]

      configuration = {
        ProjectName = aws_codebuild_project.deploy.name
        EnvironmentVariables = jsonencode([
          {
            name  = "IMAGE_TAG"
            value = "#{SourceVariables.CommitId}"
            type  = "PLAINTEXT"
          },
        ])
      }
    }
  }

  depends_on = [
    aws_iam_role_policy.codepipeline,
    aws_s3_bucket_policy.pipeline_artifacts,
  ]
}
