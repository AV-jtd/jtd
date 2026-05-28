const PATCH_FLAG = "__jtdAuthRefreshSingleflight";
const LOCK_KEY = "jtd_auth_refresh_lock_v1";
const RESULT_PREFIX = "jtd_auth_refresh_result_v1:";
const LOCK_TTL_MS = 10_000;
const RESULT_TTL_MS = 15_000;
const WAIT_STEP_MS = 120;
const WAIT_MAX_MS = 9_000;

type LockState = { id: string; tokenHash: string; at: number };
type StoredResult = { at: number; session: unknown };

const w = typeof window !== "undefined" ? (window as typeof window & Record<string, unknown>) : null;

function tokenHash(token: string) {
  let h = 0;
  for (let i = 0; i < token.length; i += 1) h = Math.imul(31, h) + token.charCodeAt(i) | 0;
  return `${token.length}:${(h >>> 0).toString(36)}`;
}

function bodyText(body: BodyInit | null | undefined) {
  if (!body) return "";
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  return "";
}

function parseRefreshToken(raw: string) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.refresh_token === "string") return parsed.refresh_token;
  } catch {}
  try {
    return new URLSearchParams(raw).get("refresh_token");
  } catch {
    return null;
  }
}

function requestInfo(input: RequestInfo | URL, init?: RequestInit) {
  const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
  const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  const rawBody = bodyText(init?.body ?? (input instanceof Request ? null : undefined));
  const parsedUrl = new URL(url, window.location.origin);
  const grantType = parsedUrl.searchParams.get("grant_type") || (() => {
    try { return JSON.parse(rawBody)?.grant_type; } catch { return new URLSearchParams(rawBody).get("grant_type"); }
  })();
  return { url, method, rawBody, isRefresh: method === "POST" && parsedUrl.pathname.endsWith("/auth/v1/token") && grantType === "refresh_token" };
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch { return null; }
}

function acquireLock(id: string, hash: string) {
  const existing = readJson<LockState>(LOCK_KEY);
  if (existing && Date.now() - existing.at < LOCK_TTL_MS) return false;
  try { localStorage.setItem(LOCK_KEY, JSON.stringify({ id, tokenHash: hash, at: Date.now() })); } catch { return true; }
  return readJson<LockState>(LOCK_KEY)?.id === id;
}

function releaseLock(id: string) {
  const existing = readJson<LockState>(LOCK_KEY);
  if (existing?.id === id) localStorage.removeItem(LOCK_KEY);
}

function resultKey(hash: string) { return RESULT_PREFIX + hash; }

function readResult(hash: string) {
  const result = readJson<StoredResult>(resultKey(hash));
  if (!result || Date.now() - result.at > RESULT_TTL_MS) return null;
  return result.session;
}

function writeResult(hash: string, session: unknown) {
  try { localStorage.setItem(resultKey(hash), JSON.stringify({ at: Date.now(), session } satisfies StoredResult)); } catch {}
}

function storedRefreshTokenHash() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (!key || (!key.startsWith("sb-") && !key.includes("supabase.auth"))) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const token = parsed?.refresh_token || parsed?.currentSession?.refresh_token || parsed?.session?.refresh_token;
      if (typeof token === "string") return tokenHash(token);
    }
  } catch {}
  return null;
}

function responseFrom(session: unknown) {
  return new Response(JSON.stringify(session), { status: 200, headers: { "Content-Type": "application/json" } });
}

async function waitForResult(hash: string) {
  const started = Date.now();
  while (Date.now() - started < WAIT_MAX_MS) {
    const result = readResult(hash);
    if (result) return result;
    const lock = readJson<LockState>(LOCK_KEY);
    if (!lock || Date.now() - lock.at > LOCK_TTL_MS) return null;
    await new Promise((r) => setTimeout(r, WAIT_STEP_MS));
  }
  return null;
}

if (w && !w[PATCH_FLAG]) {
  w[PATCH_FLAG] = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const info = requestInfo(input, init);
    if (!info.isRefresh) return originalFetch(input, init);

    const refreshToken = parseRefreshToken(info.rawBody);
    if (!refreshToken) return originalFetch(input, init);

    const hash = tokenHash(refreshToken);
    const cached = readResult(hash);
    if (cached) return responseFrom(cached);

    const lockId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    if (!acquireLock(lockId, hash)) {
      const result = await waitForResult(hash);
      if (result) return responseFrom(result);
      return originalFetch(input, init);
    }

    try {
      const response = await originalFetch(input, init);
      if (response.ok) {
        try { writeResult(hash, await response.clone().json()); } catch {}
      } else if (response.status === 400 || response.status === 401) {
        // Refresh token is invalid/expired. Supabase-js sometimes silently
        // keeps the stale session in localStorage instead of firing SIGNED_OUT,
        // which leaves the app in a broken state where every query returns 401
        // and the user just sees "Не удалось загрузить задачи" with no way out.
        //
        // We proactively clear all Supabase auth keys and trigger a sign-out
        // event so AuthProvider redirects to /auth.
        try {
          const body = await response.clone().json().catch(() => ({}));
          const code = body?.error_code || body?.code;
          if (code === "refresh_token_not_found" || code === "invalid_grant" || response.status === 401) {
            const currentHash = storedRefreshTokenHash();
            if (currentHash && currentHash !== hash) {
              console.warn("[Auth] stale refresh request rejected after session rotation, keeping current session", code);
              return response;
            }
            console.warn("[Auth] refresh token rejected, clearing stale session", code);
            // Clear every supabase auth-related key so a stale token does not
            // get picked up on the next reload.
            for (let i = localStorage.length - 1; i >= 0; i -= 1) {
              const key = localStorage.key(i);
              if (key && (key.startsWith("sb-") || key.includes("supabase.auth"))) {
                localStorage.removeItem(key);
              }
            }
            // Hard reload so React Query, in-memory session, and singleflight
            // cache all reset cleanly. The user lands on /auth.
            setTimeout(() => {
              if (!location.pathname.startsWith("/auth")) location.replace("/auth");
              else location.reload();
            }, 50);
          }
        } catch {}
      }
      return response;
    } finally {
      releaseLock(lockId);
    }
  };
}