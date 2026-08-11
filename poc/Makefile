# POC — Route 53 → ALB → EKS Fargate → Express + sidecar
#
# Nenhum target executa mudanças na AWS sem você rodá-lo explicitamente.
# Sequência para o primeiro deploy (o ECR precisa existir antes do push):
#   make tf-init && make ecr && make ecr-login && make push && make apply

AWS_REGION ?= us-east-1
PROJECT    ?= sse-poc
IMAGE_TAG  ?= latest
TF_DIR     := ../infra/terraform
EKS_CLUSTER_NAME ?= $(PROJECT)-eks
KUBERNETES_NAMESPACE ?= $(PROJECT)
KUBERNETES_DEPLOYMENT ?= $(PROJECT)-app

ACCOUNT_ID  = $(shell aws sts get-caller-identity --query Account --output text)
ECR_REGISTRY = $(ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com

.PHONY: install dev up down logs test typecheck build \
        tf-init tf-plan ecr ecr-login push apply destroy \
        kubeconfig deploy k8s-status k8s-logs

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
	terraform -chdir=$(TF_DIR) plan -var="image_tag=$(IMAGE_TAG)"

ecr: ## Cria SOMENTE os repositórios ECR (necessário antes do primeiro push)
	terraform -chdir=$(TF_DIR) apply \
	  -target=aws_ecr_repository.app \
	  -target=aws_ecr_repository.sidecar

ecr-login: ## Autentica o Docker no ECR
	aws ecr get-login-password --region $(AWS_REGION) | \
	  docker login --username AWS --password-stdin $(ECR_REGISTRY)

push: ## Builda e publica as duas imagens no ECR com a tag IMAGE_TAG
	docker build -f Dockerfile.app -t $(ECR_REGISTRY)/$(PROJECT)-app:$(IMAGE_TAG) .
	docker build -t $(ECR_REGISTRY)/$(PROJECT)-mcp-stub:$(IMAGE_TAG) ./sidecar
	docker push $(ECR_REGISTRY)/$(PROJECT)-app:$(IMAGE_TAG)
	docker push $(ECR_REGISTRY)/$(PROJECT)-mcp-stub:$(IMAGE_TAG)

apply: ## Aplica EKS, controller ALB e Deployment Kubernetes (pede confirmação)
	terraform -chdir=$(TF_DIR) apply -var="image_tag=$(IMAGE_TAG)"

kubeconfig: ## Configura kubectl para o cluster EKS
	aws eks update-kubeconfig --name $(EKS_CLUSTER_NAME) --region $(AWS_REGION)

deploy: kubeconfig ## Faz rollout das imagens IMAGE_TAG já publicadas no EKS
	kubectl --namespace $(KUBERNETES_NAMESPACE) set image deployment/$(KUBERNETES_DEPLOYMENT) \
	  app=$(ECR_REGISTRY)/$(PROJECT)-app:$(IMAGE_TAG) \
	  mcp-stub=$(ECR_REGISTRY)/$(PROJECT)-mcp-stub:$(IMAGE_TAG)
	kubectl --namespace $(KUBERNETES_NAMESPACE) rollout status deployment/$(KUBERNETES_DEPLOYMENT) --timeout=5m

k8s-status: kubeconfig ## Exibe pods, service e ingress do POC
	kubectl --namespace $(KUBERNETES_NAMESPACE) get deployment,pods,service,ingress

k8s-logs: kubeconfig ## Acompanha logs do container app no Kubernetes
	kubectl --namespace $(KUBERNETES_NAMESPACE) logs deployment/$(KUBERNETES_DEPLOYMENT) -c app -f

destroy: ## Destroi TUDO que o Terraform criou, incluindo EKS e NAT
	terraform -chdir=$(TF_DIR) destroy
