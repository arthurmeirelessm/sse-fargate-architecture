# Os repositórios precisam existir antes do primeiro push. Sequência segura:
#   terraform apply -target=aws_ecr_repository.app -target=aws_ecr_repository.sidecar
# (ou `make ecr`), depois build/push das imagens e só então o apply completo.

resource "aws_ecr_repository" "app" {
  name         = "${var.project_name}-app"
  force_delete = true # POC: permite terraform destroy mesmo com imagens

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_repository" "sidecar" {
  name         = "${var.project_name}-mcp-stub"
  force_delete = true

  image_scanning_configuration {
    scan_on_push = true
  }
}
