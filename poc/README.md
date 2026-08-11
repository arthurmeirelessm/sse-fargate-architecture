# Aplicação do POC

Esta pasta contém a aplicação que o pipeline publica no ECR:

- `server/`: Express + TypeScript, API e arquivos estáticos do frontend;
- `client/`: React + Vite;
- `sidecar/`: serviço `mcp-stub` interno;
- `Dockerfile.app` e `docker-compose.yml`: execução local.

Em produção, `app` e `mcp-stub` são containers do mesmo Pod EKS Fargate. A API
usa `SIDECAR_URL=http://127.0.0.1:8061`; a porta do sidecar não é publicada pelo
Service nem pelo Ingress.

```bash
make up
# abra http://localhost:8080

make test
make typecheck
```

Os endpoints relevantes são:

- `GET /api/health`
- `GET /api/sync`
- `GET /api/stream`
- `GET /api/sidecar-status`

A infraestrutura, o processo de primeiro deploy EKS, atualização, rollback,
CI/CD e limpeza estão documentados no [README da raiz](../README.md).
