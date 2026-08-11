# POC — ALB → EKS Fargate → Express + sidecar (SSE)

POC para executar uma API Express + React e o sidecar `mcp-stub` no Amazon EKS
usando Fargate. O ALB recebe HTTP/HTTPS e encaminha para um `Service`
Kubernetes; a aplicação e o sidecar são containers do mesmo Pod, portanto o
sidecar continua privado e acessível em `127.0.0.1:8061`.

## Arquitetura

```mermaid
flowchart LR
  Internet --> alb[ALB]
  alb --> ingress[Ingress]
  ingress --> service[ClusterIP Service]
  service --> pod["EKS Fargate Pod"]
  pod --> app["app :8080"]
  app --> sidecar["mcp-stub :8061"]
  ecr[ECR] --> pod
  pod --> logs[CloudWatch Logs]
```

- `infra/terraform` é a fonte de infraestrutura: VPC, subnets privadas, NAT
  Gateway, EKS, Fargate profiles, IAM/IRSA, controller ALB, deployment,
  service, ingress, logs, ACM e Route 53 opcionais.
- O AWS Load Balancer Controller cria e mantém o ALB a partir do Ingress. O
  target type é `ip`, necessário para Pods EKS Fargate.
- Os Pods Fargate ficam em duas subnets privadas. O NAT Gateway permite pull
  do ECR, comunicação com APIs AWS e envio de logs.
- O controller e CoreDNS também possuem Fargate profiles dedicados. Não há
  node group EC2.

## Pré-requisitos

- Docker com Compose v2
- Node.js 20+ (o POC usa Node 24 no CI)
- Terraform 1.5+, AWS CLI v2 e `kubectl`
- Credenciais AWS com permissão para provisionar os recursos
- Opcionalmente, uma hosted zone pública Route 53 para domínio + HTTPS

> Custo: EKS cobra pelo control plane, Fargate pelos Pods provisionados, além
> de ALB, NAT Gateway, ECR e CloudWatch Logs. O NAT é obrigatório nesta
> topologia porque Fargate não atribui IP público aos Pods. Destrua o POC ao
> terminar.

## Rodar localmente

```bash
make up
# http://localhost:8080

make test
make typecheck
```

## Primeiro deploy no EKS

1. Configure a infraestrutura:

```bash
cp infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars
```

Mantenha `enable_custom_domain = false` para testar pelo DNS HTTP do ALB. Para
HTTPS, preencha `hosted_zone_id`, `domain_name` e `subdomain`.

2. Crie o ECR, publique imagens com tag imutável e aplique o Terraform:

```bash
IMAGE_TAG="$(git rev-parse --short HEAD)"

make tf-init
make ecr
make ecr-login
make push IMAGE_TAG="$IMAGE_TAG"
make apply IMAGE_TAG="$IMAGE_TAG"
```

O `apply` instala o AWS Load Balancer Controller, cria o Deployment de dois
containers, espera o rollout e aguarda o ALB do Ingress. A máquina que executa
o Terraform precisa do AWS CLI, pois os providers Helm/Kubernetes obtêm o token
de autenticação do cluster por `aws eks get-token`.

3. Valide o ambiente:

```bash
make k8s-status
APP_URL="$(terraform -chdir=infra/terraform output -raw app_url)"

curl -s "$APP_URL/api/health" | jq
curl -s "$APP_URL/api/sync" | jq
curl -s "$APP_URL/api/sidecar-status" | jq
curl -N "$APP_URL/api/stream"
```

O último comando deve receber um evento SSE por segundo e terminar com `done`.

## Atualização e rollback

Para atualizar localmente, publique uma nova tag e altere as imagens do
Deployment:

```bash
IMAGE_TAG="$(git rev-parse --short HEAD)"
make push IMAGE_TAG="$IMAGE_TAG"
make deploy IMAGE_TAG="$IMAGE_TAG"
```

Para rollback, informe uma tag ECR conhecida:

```bash
make deploy IMAGE_TAG="<tag-anterior>"
```

Use `make k8s-logs` para acompanhar o container `app`. Os logs de ambos os
containers também vão para o log group retornado por
`terraform output -raw cloudwatch_log_group`.

## CI/CD

O workflow `.github/workflows/deploy-main-eks.yml` testa o conteúdo de `poc/`,
publica as imagens `latest` e `${github.sha}`, e faz rollout apenas das tags
SHA no EKS.

Configure no GitHub:

- secret `AWS_ROLE_TO_ASSUME` com a role OIDC do GitHub Actions;
- variável Terraform `github_actions_role_arn` com esse mesmo ARN antes do
  primeiro `apply`;
- variáveis opcionais `AWS_REGION`, `PROJECT_NAME`, `EKS_CLUSTER_NAME`,
  `KUBERNETES_NAMESPACE` e `KUBERNETES_DEPLOYMENT`.

A role do workflow precisa publicar no ECR e executar `eks:DescribeCluster`. O
Terraform cria o EKS access entry que dá a ela autorização Kubernetes para o
rollout.

## Migração de um ambiente ECS existente

A migração não preserva os recursos de execução: task definition, service,
roles de task, ALB e target group ECS deixam de existir. ECR, ACM e a hosted
zone são reaproveitados quando presentes.

Antes de aplicar esta versão em um state que ainda controla ECS:

```bash
terraform -chdir=infra/terraform state pull > terraform-state-before-eks.json
make tf-plan IMAGE_TAG="<tag-ja-publicada>"
```

Revise o plano cuidadosamente. Ele terá destruição dos recursos ECS/ALB
legados e criação do EKS, NAT e ALB gerenciado pelo controller; haverá janela
de indisponibilidade. Faça a publicação das imagens antes do `apply`, valide
os endpoints acima e só então remova qualquer DNS/integração externa residual.

## Limpeza

```bash
make destroy
```

Confirme a remoção do EKS, Fargate profiles, ALB do controller, NAT Gateway,
ECR e log groups para evitar cobranças residuais.
