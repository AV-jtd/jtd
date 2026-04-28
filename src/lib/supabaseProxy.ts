/**
 * Supabase Proxy Shim.
 *
 * Перенаправляет ВСЕ запросы (fetch + WebSocket) к
 * `nvfioycpwyzwukvokwql.supabase.co` на Cloudflare Worker, который служит
 * прокси. Нужно для пользователей, у которых провайдер блокирует/замедляет
 * прямой доступ к домену Supabase.
 *
 * Включается автоматически при загрузке приложения, если PROXY_HOST задан.
 * НЕ трогает сам файл src/integrations/supabase/client.ts (он auto-generated)
 * — вся магия в monkey-patch здесь.
 *
 * Чтобы выключить — просто очистите PROXY_HOST.
 */

// ВАЖНО: вписать сюда хост Worker'а ПОСЛЕ деплоя cf-worker.
// Формат: "jtd-proxy.<account>.workers.dev"  (БЕЗ https://, БЕЗ слэша в конце)
// Пустая строка = прокси отключен, клиент работает напрямую.
const PROXY_HOST = "";

const SUPABASE_HOST = "nvfioycpwyzwukvokwql.supabase.co";

function rewriteUrl(input: string): string {
  if (!PROXY_HOST) return input;
  if (input.includes(SUPABASE_HOST)) {
    return input.replace(SUPABASE_HOST, PROXY_HOST);
  }
  return input;
}

export function installSupabaseProxy() {
  if (!PROXY_HOST) return;
  if (typeof window === "undefined") return;

  // ---- fetch ----
  const origFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    try {
      if (typeof input === "string") {
        return origFetch(rewriteUrl(input), init);
      }
      if (input instanceof URL) {
        return origFetch(rewriteUrl(input.toString()), init);
      }
      // Request object — clone with rewritten URL
      const req = input as Request;
      const newUrl = rewriteUrl(req.url);
      if (newUrl === req.url) return origFetch(req, init);
      return origFetch(new Request(newUrl, req), init);
    } catch (err) {
      console.warn("[supabaseProxy] fetch rewrite failed", err);
      return origFetch(input as RequestInfo, init);
    }
  }) as typeof window.fetch;

  // ---- WebSocket (Realtime) ----
  const OrigWS = window.WebSocket;
  function PatchedWS(url: string | URL, protocols?: string | string[]) {
    const u = typeof url === "string" ? url : url.toString();
    const rewritten = u.includes(SUPABASE_HOST)
      ? u.replace(SUPABASE_HOST, PROXY_HOST)
      : u;
    return new OrigWS(rewritten, protocols);
  }
  PatchedWS.prototype = OrigWS.prototype;
  PatchedWS.CONNECTING = OrigWS.CONNECTING;
  PatchedWS.OPEN = OrigWS.OPEN;
  PatchedWS.CLOSING = OrigWS.CLOSING;
  PatchedWS.CLOSED = OrigWS.CLOSED;
  (window as unknown as { WebSocket: typeof WebSocket }).WebSocket =
    PatchedWS as unknown as typeof WebSocket;

  console.info(`[supabaseProxy] enabled → ${PROXY_HOST}`);
}