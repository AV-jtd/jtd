const PATCH_FLAG = "__jtdSupabaseFetchGuard";

// Hosts treated as "backend" for throttling. Always include the direct Supabase
// host, plus the configured proxy (Cloudflare Worker / nginx /sb).
// We derive the proxy host from VITE_SUPABASE_PROXY_URL so future redeploys to
// a new worker URL keep working without touching code.
const BACKEND_HOSTS = new Set<string>(["nvfioycpwyzwukvokwql.supabase.co"]);
const DIRECT_BACKEND_ORIGIN = "https://nvfioycpwyzwukvokwql.supabase.co";
try {
  const proxyUrl = (import.meta as any).env?.VITE_SUPABASE_PROXY_URL;
  if (proxyUrl) BACKEND_HOSTS.add(new URL(proxyUrl).host);
} catch {}
if (typeof window !== "undefined") {
  // Same-origin /sb fallback (Docker/nginx self-host).
  BACKEND_HOSTS.add(window.location.host);
}

// Cloudflare Worker spravlyaetsya s bolshim parallelizmom; 4 — sliskom malo dlya
// stranits s desyatkami batched-zaprosov (tasks + comments + participants + subtasks).
// Browser sam ogranichivaet ~6 connections per host, no через HTTP/2 (CF) можно больше.
const MAX_CONCURRENT_BACKEND_REQUESTS = 12;
const READ_TIMEOUT_MS = 22_000;
const WRITE_TIMEOUT_MS = 45_000;

type QueuedRequest = {
  priority: number;
  run: () => Promise<Response>;
  resolve: (value: Response) => void;
  reject: (reason?: unknown) => void;
};

const w = typeof window !== "undefined" ? (window as typeof window & Record<string, unknown>) : null;

let active = 0;
const queue: QueuedRequest[] = [];

function getRequestUrl(input: RequestInfo | URL) {
  return typeof input === "string" || input instanceof URL ? String(input) : input.url;
}

function rewriteProxyUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl, window.location.origin);
    if (url.pathname.startsWith("/sb/")) {
      const direct = new URL(url.pathname.slice(3) + url.search, DIRECT_BACKEND_ORIGIN);
      return direct.toString();
    }
  } catch {}
  return rawUrl;
}

function rewriteRequestInput(input: RequestInfo | URL, rewrittenUrl: string) {
  if (typeof input === "string" || input instanceof URL) return rewrittenUrl;
  if (input.url === rewrittenUrl) return input;
  return new Request(rewrittenUrl, input);
}

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit) {
  return (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
}

function isBackendRequest(rawUrl: string) {
  try {
    const url = new URL(rewriteProxyUrl(rawUrl), window.location.origin);
    return BACKEND_HOSTS.has(url.host) && (
      url.pathname.startsWith("/rest/v1/") ||
      url.pathname.startsWith("/auth/v1/") ||
      url.pathname.startsWith("/functions/v1/") ||
      url.pathname.startsWith("/storage/v1/")
    );
  } catch {
    return false;
  }
}

function requestPriority(rawUrl: string, method: string) {
  try {
    const { pathname } = new URL(rawUrl, window.location.origin);
    if (pathname.startsWith("/auth/v1/")) return 0;
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") return 1;
    if (pathname.startsWith("/rest/v1/tasks")) return 1;
    if (/\/rest\/v1\/(task_groups|tags|tag_categories|project_folders|project_folder_items)/.test(pathname)) return 2;
    if (/\/rest\/v1\/(profiles|departments|contractors)/.test(pathname)) return 4;
  } catch {}
  return 3;
}

function pumpQueue() {
  while (active < MAX_CONCURRENT_BACKEND_REQUESTS && queue.length > 0) {
    const job = queue.shift()!;
    active += 1;
    job.run()
      .then(job.resolve, job.reject)
      .finally(() => {
        active -= 1;
        pumpQueue();
      });
  }
}

function enqueue(job: Omit<QueuedRequest, "resolve" | "reject">) {
  return new Promise<Response>((resolve, reject) => {
    queue.push({ ...job, resolve, reject });
    queue.sort((a, b) => a.priority - b.priority);
    pumpQueue();
  });
}

function fetchWithTimeout(originalFetch: typeof window.fetch, input: RequestInfo | URL, init: RequestInit | undefined, timeoutMs: number) {
  const upstreamSignal = init?.signal || (input instanceof Request ? input.signal : undefined);
  if (upstreamSignal?.aborted) return Promise.reject(upstreamSignal.reason);

  const controller = new AbortController();
  const onAbort = () => controller.abort(upstreamSignal?.reason);
  upstreamSignal?.addEventListener("abort", onAbort, { once: true });

  const timeoutId = window.setTimeout(() => {
    controller.abort(new DOMException(`Backend request timed out after ${timeoutMs}ms`, "TimeoutError"));
  }, timeoutMs);

  return originalFetch(input, { ...init, signal: controller.signal })
    .finally(() => {
      window.clearTimeout(timeoutId);
      upstreamSignal?.removeEventListener("abort", onAbort);
    });
}

if (w && !w[PATCH_FLAG]) {
  w[PATCH_FLAG] = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl = getRequestUrl(input);
    if (!isBackendRequest(rawUrl)) return originalFetch(input, init);

    const method = getRequestMethod(input, init);
    const rewrittenUrl = rewriteProxyUrl(rawUrl);
    const requestInput = rewrittenUrl === rawUrl ? input : rewriteRequestInput(input, rewrittenUrl);
    const timeoutMs = method === "GET" || method === "HEAD" || method === "OPTIONS" ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS;

    return enqueue({
      priority: requestPriority(rewrittenUrl, method),
      run: () => fetchWithTimeout(originalFetch, requestInput, init, timeoutMs),
    });
  };
}