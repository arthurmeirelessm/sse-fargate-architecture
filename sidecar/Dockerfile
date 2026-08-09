# Estágio 1: dependências de produção (inclui tsx como runtime)
FROM node:24-alpine AS deps
WORKDIR /sidecar
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Estágio final
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=8061
WORKDIR /app
COPY --from=deps /sidecar/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
EXPOSE 8061
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8061/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
USER node
CMD ["./node_modules/.bin/tsx", "src/index.ts"]
