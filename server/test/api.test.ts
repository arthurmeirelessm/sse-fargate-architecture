import http from "node:http";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type AppConfig } from "../src/app.js";

const testConfig: AppConfig = {
  version: "test",
  sidecarUrl: "http://127.0.0.1:0", // sobrescrito nos testes do sidecar
  corsOrigins: [],
  sseIntervalMs: 10,
  sseEventCount: 3,
};

describe("GET /api/health", () => {
  it("retorna status, timestamp e versão", async () => {
    const res = await request(createApp(testConfig)).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.version).toBe("test");
    expect(new Date(res.body.timestamp).getTime()).not.toBeNaN();
  });
});

describe("GET /api/sync", () => {
  it("retorna mensagem, timestamp e requestId", async () => {
    const res = await request(createApp(testConfig)).get("/api/sync");
    expect(res.status).toBe(200);
    expect(res.body.message).toBeTruthy();
    expect(res.body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(res.body.timestamp).getTime()).not.toBeNaN();
  });
});

describe("GET /api/stream (SSE)", () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = http.createServer(createApp(testConfig));
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (typeof address === "string" || address === null) {
      throw new Error("endereço inesperado");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it("envia headers de SSE, N eventos e um evento done", async () => {
    const res = await fetch(`${baseUrl}/api/stream`);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("cache-control")).toContain("no-cache");

    const raw = await res.text(); // stream encerra sozinha após o done
    const dataLines = raw
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => JSON.parse(line.slice("data: ".length)));

    // 3 eventos numerados + payload do done
    expect(dataLines).toHaveLength(testConfig.sseEventCount + 1);
    expect(dataLines[0].seq).toBe(1);
    expect(dataLines[testConfig.sseEventCount - 1].seq).toBe(
      testConfig.sseEventCount,
    );
    expect(raw).toContain("event: done");
    expect(dataLines.at(-1).total).toBe(testConfig.sseEventCount);
  });

  it("encerra o timer quando o cliente desconecta", async () => {
    const controller = new AbortController();
    const res = await fetch(`${baseUrl}/api/stream`, {
      signal: controller.signal,
    });
    expect(res.status).toBe(200);
    // Aborta antes do primeiro evento; o servidor deve limpar o interval
    // sem lançar erro (se escrever num socket fechado, o processo quebraria).
    controller.abort();
    await new Promise((resolve) =>
      setTimeout(resolve, testConfig.sseIntervalMs * (testConfig.sseEventCount + 2)),
    );
    // Se chegou aqui sem unhandled error, a desconexão foi tratada.
    const health = await fetch(`${baseUrl}/api/health`);
    expect(health.status).toBe(200);
  });
});

describe("GET /api/sidecar-status", () => {
  let stub: http.Server;
  let stubUrl: string;

  beforeAll(async () => {
    const stubApp = express();
    stubApp.get("/health", (_req, res) =>
      res.json({ status: "ok", service: "mcp-stub" }),
    );
    stub = http.createServer(stubApp);
    await new Promise<void>((resolve) => stub.listen(0, resolve));
    const address = stub.address();
    if (typeof address === "string" || address === null) {
      throw new Error("endereço inesperado");
    }
    stubUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      stub.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it("reporta o sidecar acessível", async () => {
    const app = createApp({ ...testConfig, sidecarUrl: stubUrl });
    const res = await request(app).get("/api/sidecar-status");
    expect(res.status).toBe(200);
    expect(res.body.reachable).toBe(true);
    expect(res.body.sidecar.service).toBe("mcp-stub");
  });

  it("responde 502 quando o sidecar está fora", async () => {
    const app = createApp({
      ...testConfig,
      sidecarUrl: "http://127.0.0.1:59999",
    });
    const res = await request(app).get("/api/sidecar-status");
    expect(res.status).toBe(502);
    expect(res.body.reachable).toBe(false);
  });
});
