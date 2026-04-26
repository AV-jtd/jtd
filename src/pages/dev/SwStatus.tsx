import { useEffect, useState } from "react";
import { Loader2, RefreshCcw } from "lucide-react";

interface RegistrationInfo {
  scope: string;
  scriptURL: string;
  state: string;
  isController: boolean;
}

interface SwStatusData {
  supported: boolean;
  controller: { scriptURL: string; state: string } | null;
  registrations: RegistrationInfo[];
  swSourceFirstLines: string | null;
  swKind: "killer" | "workbox-pwa" | "unknown" | "missing";
  swHash: string | null;
  serverVersion: string | null;
  buildVersion: string | undefined;
  cacheNames: string[];
  context: {
    inIframe: boolean;
    host: string;
    standalone: boolean;
    userAgent: string;
  };
  fetchedAt: string;
}

async function sha256(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

function classifySw(source: string): SwStatusData["swKind"] {
  if (!source) return "missing";
  if (source.includes("__sw_kill") && source.includes("registration.unregister")) return "killer";
  if (source.includes("workbox") || source.includes("precacheAndRoute")) return "workbox-pwa";
  return "unknown";
}

async function collect(): Promise<SwStatusData> {
  const supported = "serviceWorker" in navigator;
  const inIframe = (() => {
    try { return window.self !== window.top; } catch { return true; }
  })();

  let registrations: RegistrationInfo[] = [];
  let controller: SwStatusData["controller"] = null;

  if (supported) {
    const regs = await navigator.serviceWorker.getRegistrations();
    registrations = regs.map((r) => {
      const w = r.active ?? r.waiting ?? r.installing;
      return {
        scope: r.scope,
        scriptURL: w?.scriptURL ?? "(no worker)",
        state: w?.state ?? "none",
        isController: navigator.serviceWorker.controller?.scriptURL === w?.scriptURL,
      };
    });
    if (navigator.serviceWorker.controller) {
      controller = {
        scriptURL: navigator.serviceWorker.controller.scriptURL,
        state: navigator.serviceWorker.controller.state,
      };
    }
  }

  let swSourceFirstLines: string | null = null;
  let swKind: SwStatusData["swKind"] = "missing";
  let swHash: string | null = null;
  try {
    const res = await fetch("/sw.js?diag=" + Date.now(), { cache: "no-store" });
    if (res.ok) {
      const text = await res.text();
      swKind = classifySw(text);
      swHash = await sha256(text);
      swSourceFirstLines = text.split("\n").slice(0, 30).join("\n");
    }
  } catch { /* ignore */ }

  let serverVersion: string | null = null;
  try {
    const res = await fetch("/version.json?diag=" + Date.now(), { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      serverVersion = json?.version ?? null;
    }
  } catch { /* ignore */ }

  let cacheNames: string[] = [];
  try {
    if ("caches" in window) cacheNames = await caches.keys();
  } catch { /* ignore */ }

  return {
    supported,
    controller,
    registrations,
    swSourceFirstLines,
    swKind,
    swHash,
    serverVersion,
    buildVersion: import.meta.env.VITE_BUILD_VERSION as string | undefined,
    cacheNames,
    context: {
      inIframe,
      host: window.location.host,
      standalone: window.matchMedia?.("(display-mode: standalone)").matches ?? false,
      userAgent: navigator.userAgent,
    },
    fetchedAt: new Date().toISOString(),
  };
}

function StatusBadge({ kind }: { kind: SwStatusData["swKind"] }) {
  const map: Record<SwStatusData["swKind"], { label: string; cls: string }> = {
    killer: { label: "Kill-switch (новый)", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
    "workbox-pwa": { label: "Старый Workbox PWA", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" },
    unknown: { label: "Неизвестный SW", cls: "bg-muted text-foreground border-border" },
    missing: { label: "/sw.js недоступен", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  };
  const item = map[kind];
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-md border ${item.cls}`}>
      {item.label}
    </span>
  );
}

export default function SwStatusPage() {
  const [data, setData] = useState<SwStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try { setData(await collect()); } finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  const unregisterAll = async () => {
    setBusy("unregister");
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      await refresh();
    } finally { setBusy(null); }
  };

  const clearCaches = async () => {
    setBusy("caches");
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await refresh();
    } finally { setBusy(null); }
  };

  const hardReload = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("__sw_kill", Date.now().toString(36));
    window.location.replace(url.toString());
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Service Worker · Диагностика</h1>
            <p className="text-sm text-muted-foreground">
              Показывает, какой SW обслуживает этот браузер прямо сейчас.
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-border bg-card hover:bg-muted transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
            Обновить
          </button>
        </header>

        {!data ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <section className="rounded-xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-semibold text-foreground">Тип активного /sw.js</h2>
                <StatusBadge kind={data.swKind} />
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <Field label="SHA-256 (16)" value={data.swHash ?? "—"} mono />
                <Field label="Версия сборки HTML" value={data.buildVersion ?? "—"} mono />
                <Field label="Версия сервера (/version.json)" value={data.serverVersion ?? "—"} mono />
                <Field
                  label="HTML ↔ сервер"
                  value={
                    data.serverVersion && data.buildVersion
                      ? data.serverVersion === data.buildVersion ? "совпадает" : "РАЗНЫЕ — старый кэш"
                      : "—"
                  }
                />
              </dl>
            </section>

            <section className="rounded-xl border border-border bg-card p-5 space-y-3">
              <h2 className="text-sm font-semibold">Активный controller</h2>
              {data.controller ? (
                <dl className="grid grid-cols-1 gap-2 text-sm">
                  <Field label="scriptURL" value={data.controller.scriptURL} mono />
                  <Field label="state" value={data.controller.state} />
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">Нет активного SW-controller.</p>
              )}
            </section>

            <section className="rounded-xl border border-border bg-card p-5 space-y-3">
              <h2 className="text-sm font-semibold">
                Регистрации SW <span className="text-muted-foreground font-normal">({data.registrations.length})</span>
              </h2>
              {data.registrations.length === 0 ? (
                <p className="text-sm text-muted-foreground">Регистраций нет.</p>
              ) : (
                <ul className="space-y-3">
                  {data.registrations.map((r, i) => (
                    <li key={i} className="rounded-lg border border-border bg-background p-3 text-xs space-y-1">
                      <div><span className="text-muted-foreground">scope:</span> <code>{r.scope}</code></div>
                      <div><span className="text-muted-foreground">scriptURL:</span> <code>{r.scriptURL}</code></div>
                      <div>
                        <span className="text-muted-foreground">state:</span> <code>{r.state}</code>
                        {r.isController && <span className="ml-2 text-emerald-600 dark:text-emerald-400">· controller</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-border bg-card p-5 space-y-3">
              <h2 className="text-sm font-semibold">
                Кэши <span className="text-muted-foreground font-normal">({data.cacheNames.length})</span>
              </h2>
              {data.cacheNames.length === 0 ? (
                <p className="text-sm text-muted-foreground">Пусто.</p>
              ) : (
                <ul className="text-xs font-mono space-y-1 max-h-40 overflow-auto">
                  {data.cacheNames.map((n) => <li key={n}>{n}</li>)}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-border bg-card p-5 space-y-3">
              <h2 className="text-sm font-semibold">/sw.js — первые строки</h2>
              <pre className="text-[11px] font-mono bg-background border border-border rounded-lg p-3 overflow-auto max-h-72 whitespace-pre-wrap">
{data.swSourceFirstLines ?? "(не удалось загрузить)"}
              </pre>
            </section>

            <section className="rounded-xl border border-border bg-card p-5 space-y-3">
              <h2 className="text-sm font-semibold">Контекст</h2>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <Field label="host" value={data.context.host} mono />
                <Field label="iframe" value={data.context.inIframe ? "да" : "нет"} />
                <Field label="standalone (PWA)" value={data.context.standalone ? "да" : "нет"} />
                <Field label="собрано" value={new Date(data.fetchedAt).toLocaleString()} />
              </dl>
              <p className="text-xs text-muted-foreground break-all">{data.context.userAgent}</p>
            </section>

            <section className="rounded-xl border border-border bg-card p-5 space-y-3">
              <h2 className="text-sm font-semibold">Действия</h2>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={unregisterAll}
                  disabled={busy !== null || data.registrations.length === 0}
                  className="text-sm px-3 py-1.5 rounded-md border border-border bg-card hover:bg-muted transition-colors disabled:opacity-50"
                >
                  {busy === "unregister" ? "Снимаю…" : "Снять все SW"}
                </button>
                <button
                  onClick={clearCaches}
                  disabled={busy !== null || data.cacheNames.length === 0}
                  className="text-sm px-3 py-1.5 rounded-md border border-border bg-card hover:bg-muted transition-colors disabled:opacity-50"
                >
                  {busy === "caches" ? "Чищу…" : "Очистить кэши"}
                </button>
                <button
                  onClick={hardReload}
                  className="text-sm px-3 py-1.5 rounded-md border border-primary/40 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Hard reload
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Эти кнопки работают только в этой вкладке. Не путать с тем, что произойдёт у других пользователей.
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`text-sm break-all ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}