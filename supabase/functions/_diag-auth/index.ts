/**
 * Диагностика: почему createUser из edge-функции падает с AuthRetryableFetchError.
 *
 * Замеры с хоста показали, что админский эндпоинт отвечает 200, а тот же вызов
 * изнутри edge-runtime не проходит. Эта функция выполняет цепочку запросов
 * ИЗ ТОГО ЖЕ окружения и возвращает результат каждого шага — так видно, где
 * рвётся: в сети, в Kong или в самом GoTrue.
 *
 * Только чтение: ни одного пользователя не создаёт.
 *
 * Вызов (с сервера, ключ — SERVICE_ROLE_KEY из .env.supabase):
 *   curl -s -H "x-diag-key: $KEY" http://localhost:8000/functions/v1/_diag-auth
 *
 * Функция временная — удалить, когда причина найдена.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

type Step = {
  шаг: string;
  что: string;
  результат: string;
  мс: number;
};

/** Любая ошибка в читаемый вид: тип, сообщение и вложенная причина. */
function describe(e: unknown): string {
  if (e instanceof Error) {
    const cause = (e as { cause?: unknown }).cause;
    const causeText = cause
      ? ` | cause: ${cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)}`
      : "";
    return `${e.name}: ${e.message || "(пустое сообщение)"}${causeText}`;
  }
  return `не-Error: ${JSON.stringify(e)}`;
}

async function step(шаг: string, что: string, fn: () => Promise<string>): Promise<Step> {
  const t0 = Date.now();
  try {
    return { шаг, что, результат: await fn(), мс: Date.now() - t0 };
  } catch (e) {
    return { шаг, что, результат: `ОШИБКА ${describe(e)}`, мс: Date.now() - t0 };
  }
}

/** fetch с таймаутом: зависший запрос должен отличаться от отказа соединения. */
async function fetchStatus(url: string, headers: Record<string, string> = {}): Promise<string> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 10_000);
  try {
    const r = await fetch(url, { headers, signal: ac.signal });
    const body = (await r.text()).slice(0, 200);
    return `HTTP ${r.status} | ${body || "(пустое тело)"}`;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  // Ключ не для безопасности данных (функция ничего не отдаёт), а чтобы
  // диагностический эндпоинт не дёргали снаружи по случайности.
  if (req.headers.get("x-diag-key") !== SERVICE_KEY || !SERVICE_KEY) {
    return new Response("нужен заголовок x-diag-key со значением SERVICE_ROLE_KEY", { status: 403 });
  }

  const steps: Step[] = [];

  steps.push({
    шаг: "0", что: "окружение",
    результат: `SUPABASE_URL=${SUPABASE_URL} | service_key=${SERVICE_KEY ? "задан" : "ПУСТ"} | anon_key=${ANON_KEY ? "задан" : "ПУСТ"} | deno=${Deno.version.deno}`,
    мс: 0,
  });

  // Имя kong вообще резолвится? Если нет — дальше всё бессмысленно.
  steps.push(await step("1", "DNS: резолв имени kong", async () => {
    const a = await Deno.resolveDns("kong", "A").catch(() => null);
    return a ? `kong → ${a.join(", ")}` : "не резолвится через resolveDns (может быть нормой: Deno не читает /etc/hosts)";
  }));

  // Kong: сначала то, что заведомо работает с хоста.
  steps.push(await step("2", "Kong → /auth/v1/health", () =>
    fetchStatus(`${SUPABASE_URL}/auth/v1/health`, { apikey: ANON_KEY })));

  steps.push(await step("3", "Kong → /rest/v1/ (для сравнения — этот путь работает)", () =>
    fetchStatus(`${SUPABASE_URL}/rest/v1/`, { apikey: ANON_KEY })));

  // Тот самый админский эндпоинт, но GET — ничего не создаёт.
  steps.push(await step("4", "Kong → /auth/v1/admin/users (GET, только чтение)", () =>
    fetchStatus(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1`, {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
    })));

  // В обход Kong, напрямую в контейнер авторизации. Разделяет две версии:
  // «Kong не пускает» против «до auth не достучаться по сети».
  steps.push(await step("5", "напрямую в auth:9999/health (в обход Kong)", () =>
    fetchStatus("http://auth:9999/health")));

  // И, наконец, тот же путь, что в боте: через supabase-js.
  steps.push(await step("6", "supabase-js: admin.listUsers() — как в /register", async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) return `ОШИБКА ${error.name}: ${error.message || "(пустое сообщение)"} | status=${(error as { status?: number }).status ?? "?"}`;
    return `ок, получено пользователей: ${data.users.length}`;
  }));

  return new Response(JSON.stringify({ время: new Date().toISOString(), шаги: steps }, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
});
