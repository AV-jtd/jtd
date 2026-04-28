/**
 * Cloudflare Worker — прокси к Supabase для обхода сетевых проблем
 * (например, блокировок/замедлений *.supabase.co у некоторых провайдеров).
 *
 * Проксирует HTTP (REST/Auth/Storage/Functions) и WebSocket (Realtime).
 *
 * Деплой:
 *   cd cf-worker && wrangler deploy
 * После деплоя получите URL вида https://jtd-proxy.<account>.workers.dev
 * и пропишите его в src/lib/supabaseProxy.ts (PROXY_HOST).
 */

const TARGET_HOST = "nvfioycpwyzwukvokwql.supabase.co";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, accept, accept-profile, content-profile, prefer, range, x-supabase-api-version",
  "Access-Control-Expose-Headers": "content-range, content-length, x-total-count",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const upstream = new URL(url.pathname + url.search, `https://${TARGET_HOST}`);

    // WebSocket → /realtime/v1/websocket
    const upgrade = request.headers.get("Upgrade");
    if (upgrade && upgrade.toLowerCase() === "websocket") {
      // Cloudflare Workers proxy WebSocket transparently when fetch() is called
      // with the original Upgrade headers preserved.
      return fetch(upstream.toString(), request);
    }

    // Forward HTTP request 1:1, only swapping the host.
    const init: RequestInit = {
      method: request.method,
      headers: request.headers,
      body:
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : request.body,
      redirect: "manual",
    };

    const upstreamResp = await fetch(upstream.toString(), init);

    // Clone headers so we can add CORS without mutating the original.
    const headers = new Headers(upstreamResp.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);

    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      statusText: upstreamResp.statusText,
      headers,
    });
  },
};