const PATCH_FLAG = "__jtdSupabaseFetchGuard";

const BACKEND_HOSTS = new Set([
  "round-morning-5599.avedyaev.workers.dev",
  "nvfioycpwyzwukvokwql.supabase.co",
]);

const MAX_CONCURRENT_BACKEND_REQUESTS = 4;
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

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit) {
  return (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
}

function isBackendRequest(rawUrl: string) {
  try {
    const url = new URL(rawUrl, window.location.origin);
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
    const timeoutMs = method === "GET" || method === "HEAD" || method === "OPTIONS" ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS;

    return enqueue({
      priority: requestPriority(rawUrl, method),
      run: () => fetchWithTimeout(originalFetch, input, init, timeoutMs),
    });
  };
}