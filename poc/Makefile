# POC — Route 53 → ALB → ECS Fargate → Express + sidecar
#
# Nenhum target executa mudanças na AWS sem você rodá-lo explicitamente.
# Sequência para o primeiro deploy (o ECR precisa existir antes do push):
#   make tf-init && make ecr && make ecr-login && make push && make apply

AWS_REGION ?= us-east-1
PROJECT    ?= sse-poc
IMAGE_TAG  ?= latest
TF_DIR     := infra/terraform

ACCOUNT_ID  = $(shell aws sts get-caller-identity --query Account --output text)
ECR_REGISTRY = $(ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com

.PHONY: install dev up down logs test typecheck build \
        tf-init tf-plan ecr ecr-login push apply destroy

## ---------- Local ----------

install: ## Instala as dependências dos três pacotes
	cd server && npm install
	cd sidecar && npm install
	cd client && npm install

dev: up ## Alias para `up`

up: ## Sobe app + sidecar via Docker Compose em http://localhost:8080
	docker compose up --build

down: ## Derruba o Compose
	docker compose down

logs: ## Logs do Compose
	docker compose logs -f

typecheck: ## Typecheck dos três pacotes
	cd server && npx tsc --noEmit
	cd sidecar && npx tsc --noEmit
	cd client && npx tsc --noEmit

test: ## Testes do backend (vitest + supertest)
	cd server && npm test

build: ## Build de produção do frontend
	cd client && npm run build

## ---------- AWS ----------

tf-init: ## terraform init
	terraform -chdir=$(TF_DIR) init

tf-plan: ## terraform plan (não altera nada)
	terraform -chdir=$(TF_DIR) plan

ecr: ## Cria SOMENTE os repositórios ECR (necessário antes do primeiro push)
	terraform -chdir=$(TF_DIR) apply \
	  -target=aws_ecr_repository.app \
	  -target=aws_ecr_repository.sidecar

ecr-login: ## Autentica o Docker no ECR
	aws ecr get-login-password --region $(AWS_REGION) | \
	  docker login --username AWS --password-stdin $(ECR_REGISTRY)

push: ## Builda e publica as duas imagens no ECR
	docker build -f Dockerfile.app -t $(ECR_REGISTRY)/$(PROJECT)-app:$(IMAGE_TAG) .
	docker build -t $(ECR_REGISTRY)/$(PROJECT)-mcp-stub:$(IMAGE_TAG) ./sidecar
	docker push $(ECR_REGISTRY)/$(PROJECT)-app:$(IMAGE_TAG)
	docker push $(ECR_REGISTRY)/$(PROJECT)-mcp-stub:$(IMAGE_TAG)

apply: ## Aplica toda a infraestrutura (pede confirmação do Terraform)
	terraform -chdir=$(TF_DIR) apply

destroy: ## Destroi TUDO que o Terraform criou
	terraform -chdir=$(TF_DIR) destroy
