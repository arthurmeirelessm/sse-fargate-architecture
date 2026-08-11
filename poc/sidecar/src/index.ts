import express from "express";

const port = Number(process.env.PORT ?? 8061);
const startedAt = Date.now();

const app = express();
app.disable("x-powered-by");

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "mcp-stub",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  });
});

// Sem exposição externa: no Pod EKS e no Compose o sidecar compartilha o
// namespace de rede do app, então 127.0.0.1:8061 é suficiente e nenhum
// Service/Ingress publica esta porta.
app.listen(port, () => {
  console.log(`[mcp-stub] escutando em http://127.0.0.1:${port}`);
});
