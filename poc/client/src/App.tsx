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

const cardClass =
  "rounded-3xl border border-white/70 bg-white/85 p-6 shadow-xl shadow-slate-950/5 backdrop-blur";

const primaryButtonClass =
  "rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50";

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

  const sidecarStatusText =
    sidecar == null
      ? "Verificando..."
      : sidecar.reachable
        ? "Sidecar online"
        : "Sidecar inacessível";

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#bbf7d0,transparent_32rem),linear-gradient(135deg,#f0fdf4_0%,#dcfce7_45%,#d1fae5_100%)] px-4 py-8 text-slate-900 sm:py-12">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-slate-950 px-6 py-8 text-white shadow-2xl shadow-slate-950/20 sm:px-10">
          <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="absolute bottom-0 left-1/2 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <span className="inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100">
                AWS Architecture POC
              </span>
              <h1 className="mt-5 max-w-3xl text-4xl font-black tracking-tight sm:text-5xl">
                ALB + EKS Fargate com REST, SSE e sidecar interno
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                Frontend React servido pelo Express, API em <code>/api/*</code>{" "}
                e sidecar <code>mcp-stub</code> acessado apenas via loopback no
                Pod.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Frontend
                </p>
                <p className="mt-1 font-semibold">React + Vite</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Backend
                </p>
                <p className="mt-1 font-semibold">Express + TS</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Streaming
                </p>
                <p className="mt-1 font-semibold">SSE real</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Sidecar
                </p>
                <p className="mt-1 font-semibold">127.0.0.1:8061</p>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className={cardClass}>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Sidecar
            </p>
            <div className="mt-3 flex items-center gap-3">
              <span
                className={`h-3 w-3 rounded-full shadow-lg ${
                  sidecar == null
                    ? "bg-slate-400 shadow-slate-400/30"
                    : sidecar.reachable
                      ? "bg-emerald-500 shadow-emerald-500/40"
                      : "bg-rose-500 shadow-rose-500/40"
                }`}
              />
              <p className="text-lg font-bold">{sidecarStatusText}</p>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              Prova a chamada interna do app para o sidecar.
            </p>
          </div>

          <div className={cardClass}>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              REST
            </p>
            <p className="mt-3 text-lg font-bold">/api/sync</p>
            <p className="mt-2 text-sm text-slate-500">
              Request síncrono curto com resposta JSON e requestId.
            </p>
          </div>

          <div className={cardClass}>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              SSE
            </p>
            <div className="mt-3 flex items-center gap-3">
              <span
                className={`h-3 w-3 rounded-full shadow-lg ${statusColor[sseStatus]}`}
              />
              <p className="text-lg font-bold">{statusLabel[sseStatus]}</p>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              {sseEvents.length} evento(s) recebido(s) nesta sessão.
            </p>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-6">
            <section className={cardClass}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-500">
                    Interno
                  </p>
                  <h2 className="mt-2 text-xl font-bold">Sidecar mcp-stub</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    O endpoint público chama <code>/health</code> no sidecar
                    via <code>127.0.0.1:8061</code>.
                  </p>
                </div>
                <button
                  onClick={checkSidecar}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:text-indigo-700"
                >
                  Atualizar
                </button>
              </div>

              {sidecar && (
                <pre className="mt-5 max-h-56 overflow-auto rounded-2xl border border-slate-800 bg-slate-950 p-4 text-xs leading-5 text-cyan-100 shadow-inner">
                  {sidecar.detail}
                </pre>
              )}
            </section>

            <section className={cardClass}>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-500">
                API REST
              </p>
              <h2 className="mt-2 text-xl font-bold">Teste síncrono</h2>
              <p className="mt-1 text-sm text-slate-500">
                Chama <code>/api/sync</code> e exibe o payload retornado pelo
                Express.
              </p>

              <button
                onClick={testRest}
                disabled={restLoading}
                className={`${primaryButtonClass} mt-5 bg-indigo-600 hover:bg-indigo-700`}
              >
                {restLoading ? "Chamando..." : "Testar REST"}
              </button>

              {restError && (
                <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                  {restError}
                </p>
              )}
              {restResult && (
                <pre className="mt-5 max-h-56 overflow-auto rounded-2xl border border-slate-800 bg-slate-950 p-4 text-xs leading-5 text-emerald-100 shadow-inner">
                  {restResult}
                </pre>
              )}
            </section>
          </div>

          <section className={cardClass}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500">
                  EventSource
                </p>
                <h2 className="mt-2 text-xl font-bold">Streaming SSE</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Recebe um evento por segundo por 10 segundos e fecha no evento
                  final <code>done</code>.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600">
                <span className={`h-2.5 w-2.5 rounded-full ${statusColor[sseStatus]}`} />
                {statusLabel[sseStatus]}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={startSse}
                className={`${primaryButtonClass} bg-emerald-600 hover:bg-emerald-700`}
              >
                Iniciar SSE
              </button>
              <button
                onClick={stopSse}
                className={`${primaryButtonClass} bg-rose-600 hover:bg-rose-700`}
              >
                Parar SSE
              </button>
            </div>

            <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-bold text-slate-700">
                  Eventos recebidos
                </p>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm">
                  {sseEvents.length} total
                </span>
              </div>

              <ul className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                {sseEvents.map((event, index) => (
                  <li
                    key={index}
                    className={`relative rounded-2xl border px-4 py-3 text-sm shadow-sm ${
                      event.kind === "done"
                        ? "border-sky-200 bg-sky-50 text-sky-900"
                        : "border-white bg-white text-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-xs font-bold">
                        {event.kind === "done" ? "done" : `#${event.seq}`}
                      </span>
                      <span className="truncate font-mono text-[11px] text-slate-400">
                        {event.timestamp}
                      </span>
                    </div>
                    <p className="mt-2 text-sm">
                      {event.kind === "done"
                        ? `Stream finalizado com ${event.total} eventos.`
                        : event.message}
                    </p>
                  </li>
                ))}
                {sseEvents.length === 0 && (
                  <li className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-4 py-8 text-center text-sm text-slate-400">
                    Nenhum evento recebido ainda. Clique em "Iniciar SSE" para
                    acompanhar o stream em tempo real.
                  </li>
                )}
              </ul>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
