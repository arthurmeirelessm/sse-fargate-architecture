import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import express from "express";

export interface AppConfig {
  version: string;
  sidecarUrl: string;
  corsOrigins: string[];
  sseIntervalMs: number;
  sseEventCount: number;
  staticDir?: string;
}




export const defaultConfig: AppConfig = {
  version: process.env.APP_VERSION ?? "1.0.0",
  sidecarUrl: process.env.SIDECAR_URL ?? "http://127.0.0.1:8061",
  // Same-origin por padrão: só habilita CORS se CORS_ORIGINS for definida.
  corsOrigins: (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  sseIntervalMs: Number(process.env.SSE_INTERVAL_MS ?? 1000),
  sseEventCount: Number(process.env.SSE_EVENT_COUNT ?? 10),
  staticDir: process.env.STATIC_DIR,
};

export function createApp(config: AppConfig = defaultConfig) {
  const app = express();
  app.disable("x-powered-by");

  if (config.corsOrigins.length > 0) {
    app.use(cors({ origin: config.corsOrigins }));
  }

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: config.version,
    });
  });

  app.get("/api/sync", async (_req, res) => {
    // Simula um processamento curto (~150ms).
    await new Promise((resolve) => setTimeout(resolve, 150));
    res.json({

      message: "Processamento síncrono concluído",
      timestamp: new Date().toISOString(),
      requestId: randomUUID(),
    });
  });

  app.get("/api/stream", (req, res) => {
    res.status(200).set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Desabilita buffering em proxies compatíveis (ex.: nginx).
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    let seq = 0;
    const timer = setInterval(() => {
      seq += 1;
      const payload = {
        seq,
        timestamp: new Date().toISOString(),
        message: `Evento ${seq} de ${config.sseEventCount}`,
      };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);

      if (seq >= config.sseEventCount) {
        clearInterval(timer);
        res.write(
          `event: done\ndata: ${JSON.stringify({ total: seq, timestamp: new Date().toISOString() })}\n\n`,
        );
        res.end();
      }
    }, config.sseIntervalMs);

    req.on("close", () => clearInterval(timer));
  });

  app.get("/api/sidecar-status", async (_req, res) => {
    const checkedAt = new Date().toISOString();
    try {
      const response = await fetch(`${config.sidecarUrl}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      const body = await response.json();
      res.status(response.ok ? 200 : 502).json({
        reachable: response.ok,
        sidecar: body,
        checkedAt,
      });
    } catch (error) {
      res.status(502).json({
        reachable: false,
        error: error instanceof Error ? error.message : String(error),
        checkedAt,
      });
    }
  });

  // Frontend estático (build do Vite) + fallback SPA para rotas não-/api.
  if (config.staticDir && fs.existsSync(config.staticDir)) {
    const indexHtml = path.join(config.staticDir, "index.html");
    app.use(express.static(config.staticDir));
    app.use((req, res, next) => {
      if (req.method === "GET" && !req.path.startsWith("/api")) {
        res.sendFile(indexHtml);
        return;
      }
      next();
    });
  }

  return app;
}
