# Estágio 1: build do frontend (Vite)
FROM node:24-alpine AS client-build
WORKDIR /client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Estágio 2: dependências de produção do servidor (inclui tsx como runtime)
FROM node:24-alpine AS server-deps
WORKDIR /server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# Estágio final
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=8080 \
    STATIC_DIR=/app/public
WORKDIR /app
COPY --from=server-deps /server/node_modules ./node_modules
COPY server/package.json server/tsconfig.json ./
COPY server/src ./src
COPY --from=client-build /client/dist ./public
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
USER node
CMD ["./node_modules/.bin/tsx", "src/index.ts"]
