import { useEffect, useRef, useState } from "react";

type SseStatus = "idle" | "connecting" | "open" | "done" | "error";

interface SseEvent {
  seq?: number;
  timestamp?: string;
  message?: string;
  total?: number;
  kind: "message" | "done";
}

const statusLabel: Record<SseStatus, string> = {
  idle: "Desconectado",
  connecting: "Conectando…",
  open: "Conectado",
  done: "Finalizado (done)",
  error: "Erro na conexão",
};

const statusColor: Record<SseStatus, string> = {
  idle: "bg-slate-400",
  connecting: "bg-amber-400",
  open: "bg-emerald-500",
  done: "bg-sky-500",
  error: "bg-rose-500",
};

export default function App() {
  const [restResult, setRestResult] = useState<string | null>(null);
  const [restLoading, setRestLoading] = useState(false);
  const [restError, setRestError] = useState<string | null>(null);

  const [sseStatus, setSseStatus] = useState<SseStatus>("idle");
  const [sseEvents, setSseEvents] = useState<SseEvent[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  const [sidecar, setSidecar] = useState<{
    reachable: boolean;
    detail: string;
  } | null>(null);

  async function checkSidecar() {
    try {
      const res = await fetch("/api/sidecar-status");
      const body = await res.json();
      setSidecar({
        reachable: Boolean(body.reachable),
        detail: JSON.stringify(body, null, 2),
      });
    } catch (err) {
      setSidecar({ reachable: false, detail: String(err) });
    }
  }

  useEffect(() => {
    checkSidecar();
    return () => eventSourceRef.current?.close();
  }, []);

  async function testRest() {
    setRestLoading(true);
    setRestError(null);
    try {
      const res = await fetch("/api/sync");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRestResult(JSON.stringify(await res.json(), null, 2));
    } catch (err) {
      setRestError(String(err));
      setRestResult(null);
    } finally {
      setRestLoading(false);
    }
  }

  function startSse() {
    stopSse();
    setSseEvents([]);
    setSseStatus("connecting");

    const source = new EventSource("/api/stream");
    eventSourceRef.current = source;

    source.onopen = () => setSseStatus("open");

    source.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setSseEvents((prev) => [...prev, { ...data, kind: "message" }]);
    };

    source.addEventListener("done", (event) => {
      const data = JSON.parse((event as MessageEvent).data);
      setSseEvents((prev) => [...prev, { ...data, kind: "done" }]);
      setSseStatus("done");
      source.close();
      eventSourceRef.current = null;
    });

    source.onerror = () => {
      // EventSource reconecta sozinho; para o POC, tratamos como erro e fechamos.
      setSseStatus("error");
      source.close();
      eventSourceRef.current = null;
    };
  }

  function stopSse() {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setSseStatus("idle");
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 text-slate-800">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold">POC — ALB + ECS Fargate + SSE</h1>
          <p className="mt-1 text-sm text-slate-500">
            Route 53 → ALB → Fargate → Express (frontend + API) + sidecar
            interno
          </p>
        </header>

        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Sidecar (mcp-stub)</h2>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                sidecar == null
                  ? "bg-slate-400"
                  : sidecar.reachable
                    ? "bg-emerald-500"
                    : "bg-rose-500"
              }`}
            />
            <span>
              {sidecar == null
                ? "Verificando…"
                : sidecar.reachable
                  ? "Acessível via 127.0.0.1:8061"
                  : "Inacessível"}
            </span>
            <button
              onClick={checkSidecar}
              className="ml-auto rounded-md bg-slate-200 px-3 py-1 text-xs font-medium hover:bg-slate-300"
            >
              Atualizar
            </button>
          </div>
          {sidecar && (
            <pre className="mt-3 overflow-x-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
              {sidecar.detail}
            </pre>
          )}
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="font-semibold">REST síncrono — /api/sync</h2>
          <button
            onClick={testRest}
            disabled={restLoading}
            className="mt-3 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {restLoading ? "Chamando…" : "Testar REST"}
          </button>
          {restError && (
            <p className="mt-3 text-sm text-rose-600">{restError}</p>
          )}
          {restResult && (
            <pre className="mt-3 overflow-x-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
              {restResult}
            </pre>
          )}
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">SSE — /api/stream</h2>
            <span
              className={`ml-auto inline-block h-2.5 w-2.5 rounded-full ${statusColor[sseStatus]}`}
            />
            <span className="text-sm text-slate-500">
              {statusLabel[sseStatus]}
            </span>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={startSse}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Iniciar SSE
            </button>
            <button
              onClick={stopSse}
              className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
            >
              Parar SSE
            </button>
          </div>
          <ul className="mt-4 max-h-72 space-y-1 overflow-y-auto text-sm">
            {sseEvents.map((event, index) => (
              <li
                key={index}
                className={`rounded-md px-3 py-1.5 font-mono text-xs ${
                  event.kind === "done"
                    ? "bg-sky-100 text-sky-800"
                    : "bg-slate-100"
                }`}
              >
                {event.kind === "done"
                  ? `done — total: ${event.total} (${event.timestamp})`
                  : `#${event.seq} ${event.message} (${event.timestamp})`}
              </li>
            ))}
            {sseEvents.length === 0 && (
              <li className="text-xs text-slate-400">
                Nenhum evento recebido ainda.
              </li>
            )}
          </ul>
        </section>
      </div>
    </main>
  );
}
