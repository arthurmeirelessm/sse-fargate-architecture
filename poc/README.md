# POC — ALB → ECS Fargate → Express + sidecar (SSE)

POC isolado e mínimo para validar a arquitetura na AWS: ALB público, task
Fargate com dois containers (app + sidecar interno), REST síncrono e streaming
SSE real. Por padrão, o deploy usa HTTP pelo DNS público automático do ALB,
sem exigir domínio, Route 53 ou ACM. Se você tiver uma hosted zone pública no
Route 53, pode ativar domínio customizado + HTTPS com `enable_custom_domain`.

## Arquitetura

```
                   Internet
                      │
        ┌─────────────▼─────────────┐
        │ DNS público automático    │
        │ do ALB                    │
        │                           │
        │ Opcional: Route 53 + ACM  │
        │ poc.<domain> via HTTPS    │
        └─────────────┬─────────────┘
                      │
   ┌──────────────────▼───────────────────────────────────────────────┐
   │ VPC 10.42.0.0/16 (2 subnets públicas, IGW)                       │
   │                                                                  │
   │   ┌──────────────────────────────┐                               │
   │   │ ALB (SG: 80/443 internet)    │  Default: HTTP :80            │
   │   │  :80 → app                   │  Opcional: :80 → :443 + ACM   │
   │   └───────────────┬──────────────┘                               │
   │                   │ HTTP :8080 (SG da task só aceita do ALB)     │
   │   ┌───────────────▼──────────────────────────────┐               │
   │   │ ECS Fargate task (1 vCPU / 2 GB, awsvpc)     │               │
   │   │                                              │               │
   │   │  ┌─────────────────┐   ┌──────────────────┐  │               │
   │   │  │ app :8080       │──►│ mcp-stub :8061   │  │               │
   │   │  │ Express + React │   │ (só localhost,   │  │               │
   │   │  │ /api/* + /      │   │  não exposto)    │  │               │
   │   │  └─────────────────┘   └──────────────────┘  │               │
   │   └──────────────────────────────────────────────┘               │
   │            │ logs                    │ logs                      │
   │      CloudWatch /ecs/…/app     CloudWatch /ecs/…/mcp-stub        │
   └──────────────────────────────────────────────────────────────────┘
                 Imagens: ECR (sse-poc-app, sse-poc-mcp-stub)
```

> **Nota de segurança (POC):** para evitar o custo de NAT Gateway, a task roda
> em **subnets públicas com `assign_public_ip = true`**. Isso é aceitável
> **somente para teste**: os Security Groups garantem que a task só recebe
> tráfego 8080 vindo do ALB e o sidecar não recebe nada de fora. Em produção,
> use tasks em **subnets privadas com NAT Gateway ou VPC endpoints**
> (ECR, S3, CloudWatch Logs).

## Estrutura

```
poc/
├── server/            # Express + TS (API + serve o build do frontend)
├── sidecar/           # mcp-stub: Node/TS em localhost:8061 (+ Dockerfile)
├── client/            # React + Vite + TS + Tailwind
├── Dockerfile.app     # multi-stage: build Vite + Express servindo client/dist
├── docker-compose.yml # app + sidecar locais em http://localhost:8080
├── Makefile           # fluxo local e de deploy
└── infra/terraform/   # VPC, ALB, ECR, ECS, IAM, Logs (+ ACM/Route53 opcional)
```

## Endpoints

| Endpoint              | Descrição                                                        |
| --------------------- | ---------------------------------------------------------------- |
| `GET /api/health`     | Status, timestamp e versão (usado pelo health check do ALB)      |
| `GET /api/sync`       | REST síncrono: simula processamento e retorna requestId          |
| `GET /api/stream`     | SSE: 1 evento JSON por segundo durante 10s + evento final `done` |
| `GET /api/sidecar-status` | Prova a comunicação interna com o sidecar em `127.0.0.1:8061` |
| `GET /`               | Frontend React (mesma origem, URLs relativas)                    |

## Pré-requisitos

- Docker (com Compose v2)
- Node.js 20+ (desenvolvido com Node 24)
- Terraform 1.5+
- AWS CLI v2 autenticada (`aws sts get-caller-identity` deve funcionar)
- Opcional: uma **hosted zone pública já existente** no Route 53, somente se
  quiser testar domínio customizado + HTTPS via ACM

## Rodando localmente

```bash
cd poc

# Opção A — Docker Compose (igual ao ECS: sidecar no mesmo namespace de rede)
make up            # ou: docker compose up --build
# abra http://localhost:8080

# Opção B — sem Docker (dois terminais)
make install
cd sidecar && npm run dev     # terminal 1: sidecar em :8061
cd server  && npm run dev     # terminal 2: API em :8080
cd client  && npm run dev     # terminal 3 (opcional): Vite em :5173 com proxy /api

# Testes e typecheck
make test
make typecheck
```

### Testando com curl

```bash
curl -s http://localhost:8080/api/health | jq
curl -s http://localhost:8080/api/sync | jq
curl -s http://localhost:8080/api/sidecar-status | jq

# SSE (o -N desabilita o buffering do curl; encerra sozinho após o "done")
curl -N http://localhost:8080/api/stream
```

## Deploy na AWS

> **Custos:** ALB (~US$ 16/mês + LCUs), Fargate 1 vCPU/2 GB (~US$ 36/mês se
> ficar ligado), ECR (storage) e CloudWatch Logs cobram por hora/uso.
> **Destrua o ambiente assim que terminar o teste** (`make destroy`).

### 1. Configurar variáveis

```bash
cd poc/infra/terraform
cp terraform.tfvars.example terraform.tfvars
# para o teste sem domínio, você pode deixar enable_custom_domain = false
```

Configuração mínima para testar sem domínio:

```hcl
aws_region           = "us-east-1"
project_name         = "sse-poc"
enable_custom_domain = false
image_tag            = "latest"
log_retention_days   = 7
```

Nesse modo, o Terraform **não cria Route 53 nem ACM**. Você usa o output
`app_url`, que aponta para o DNS público automático do ALB em HTTP.

Se quiser testar domínio customizado depois, use `enable_custom_domain = true`
e preencha `hosted_zone_id`, `domain_name` e `subdomain`. Use um subdomínio
(ex.: `poc.seudominio.com`), nunca o domínio raiz.

### 2. Sequência segura de deploy

O ECR **precisa existir antes do primeiro push** (a task definition referencia
as imagens). Por isso o fluxo é dividido:

```bash
cd poc

make tf-init      # terraform init
make ecr          # cria SOMENTE os repositórios ECR (apply -target)
make ecr-login    # docker login no ECR
make push         # builda e publica as duas imagens
make apply        # cria todo o restante (VPC, ALB, ECS, DNS/ACM se habilitado...)
```

O `make apply` mostra o plano e pede confirmação. No modo sem domínio, o output
`app_url` já será uma URL `http://...elb.amazonaws.com`. Com domínio customizado,
a validação do certificado ACM + propagação do DNS podem levar alguns minutos.

### 3. Verificar

```bash
cd infra/terraform
APP_URL=$(terraform output -raw app_url)

curl -s "$APP_URL/api/health" | jq
curl -s "$APP_URL/api/sync" | jq
curl -s "$APP_URL/api/sidecar-status" | jq
curl -N "$APP_URL/api/stream"
```

No navegador, abra o valor de `terraform output -raw app_url`:

1. O card **Sidecar** deve mostrar "Acessível via 127.0.0.1:8061".
2. Clique em **Testar REST** e confira o JSON com `requestId`.
3. Clique em **Iniciar SSE**: um evento por segundo deve aparecer em tempo
   real por 10 segundos, terminando com o evento `done`. Você também pode
   acompanhar na aba Network do DevTools (request `stream`, tipo `eventsource`).
4. **Parar SSE** encerra a conexão no meio (o servidor limpa o timer).

### 4. Cleanup (importante!)

```bash
cd poc
make destroy      # remove TUDO: ALB, ECS, ECR (com imagens), VPC e DNS/cert se habilitados
```

Confirme no console que o ALB, o cluster ECS e os log groups sumiram — esses
são os itens que continuam cobrando se ficarem para trás.

## Atualizando a aplicação depois do primeiro deploy

```bash
make ecr-login
make push                                  # nova imagem :latest
aws ecs update-service --cluster sse-poc-cluster \
  --service sse-poc-service --force-new-deployment --region us-east-1
```

(Ou use uma `image_tag` nova e rode `make apply`.)

## CI/CD com GitHub Actions

Este repositório inclui dois workflows:

- `.github/workflows/auto-pr-feature.yml`: a cada push em uma branch
  `feature/**`, abre automaticamente um PR para `main` se ainda não existir.
- `.github/workflows/deploy-main-ecs.yml`: quando o PR for mergeado na `main`,
  roda typecheck/test/build, publica as imagens no ECR e força um novo deploy
  do service ECS.

O merge continua manual: o workflow só abre o PR. O dev revisa e clica em
**Merge pull request** no GitHub.

### Configuração necessária no GitHub

Em `Settings → Secrets and variables → Actions`, configure:

Secret obrigatório:

```text
AWS_ROLE_TO_ASSUME=arn:aws:iam::<account-id>:role/<role-oidc-github-actions>
```

Secret opcional para abrir PR quando o `GITHUB_TOKEN` do repositório estiver
bloqueado pela configuração do GitHub:

```text
GH_PR_TOKEN=<fine-grained-personal-access-token>
```

Esse token precisa ter acesso ao repositório e permissão **Pull requests:
Read and write**. Para token clássico, use o escopo `repo`.

Variables opcionais (os defaults já batem com este POC):

```text
AWS_REGION=us-east-1
PROJECT_NAME=sse-poc
ECS_CLUSTER_NAME=sse-poc-cluster
ECS_SERVICE_NAME=sse-poc-service
```

A role `AWS_ROLE_TO_ASSUME` deve confiar no OIDC do GitHub Actions e ter
permissões para:

- autenticar/publicar imagens no ECR;
- consultar/atualizar o service ECS;
- registrar logs normais do workflow não precisa de permissão AWS extra.

Também garanta em `Settings → Actions → General` que o `GITHUB_TOKEN` tenha
permissão para criar pull requests.

## O que mudar para produção

Este POC otimiza custo e simplicidade. Para produção:

- Tasks em **subnets privadas** com NAT Gateway ou VPC endpoints (sem IP público).
- **Mínimo 2 tasks** em AZs diferentes + **autoscaling** (CPU/memória/requests).
- Segredos no **Secrets Manager**/SSM, injetados na task definition (nada em env).
- **Logs estruturados, métricas e alarmes** (CloudWatch Alarms, Container Insights).
- Remover qualquer worker de intervalos de dentro da API — jobs periódicos
  devem virar processo separado (Scheduled Task/EventBridge), pois `setInterval`
  dentro de uma API não sobrevive a scale-in/deploys e duplica com scale-out.
- Pipeline de CI/CD com tags imutáveis de imagem (nunca `latest`).
- Deletion protection no ALB, retenção de logs adequada e revisão de TLS policy.
