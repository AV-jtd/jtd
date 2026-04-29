/**
 * Cloudflare Worker — Supabase reverse proxy.
 *
 * Все запросы к этому воркеру (REST, Auth, Storage, Realtime WebSocket)
 * прозрачно перенаправляются на Supabase. Это позволяет обходить
 * гео-блокировки на уровне CDN (Cloudflare глобально).
 *
 * Деплой:
 *   1. npm install -g wrangler
 *   2. wrangler login
 *   3. cd cf-worker && wrangler deploy
 *   4. Скопируй URL воркера в VITE_SUPABASE_PROXY_URL (в настройках Lovable / .env)
 */

const SUPABASE_ORIGIN = "https://nvfioycpwyzwukvokwql.supabase.co";
const SUPABASE_HOST = "nvfioycpwyzwukvokwql.supabase.co";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Перестраиваем URL на Supabase-бэкенд
    const targetUrl = new URL(url.pathname + url.search, SUPABASE_ORIGIN);

    // WebSocket (Supabase Realtime) — pass-through
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader?.toLowerCase() === "websocket") {
      const wsTarget = targetUrl.toString().replace(/^http/, "ws");
      return fetch(wsTarget, request);
    }

    // Копируем заголовки, заменяя host — иначе Supabase отклоняет запрос
    const headers = new Headers(request.headers);
    headers.set("host", SUPABASE_HOST);
    // Убираем origin/referer браузера — они могут вызвать CORS-конфликты на стороне Supabase
    headers.delete("origin");
    headers.delete("referer");

    const proxyReq = new Request(targetUrl.toString(), {
      method: request.method,
      headers,
      body: request.body,
      redirect: "follow",
    });

    const response = await fetch(proxyReq);

    // Добавляем CORS-заголовки, чтобы браузер принял ответ от воркерного домена
    const respHeaders = new Headers(response.headers);
    respHeaders.set("Access-Control-Allow-Origin", "*");
    respHeaders.set("Access-Control-Allow-Headers", "*");
    respHeaders.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    respHeaders.set("Access-Control-Expose-Headers", "*");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: respHeaders,
    });
  },
};
