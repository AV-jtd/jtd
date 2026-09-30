// Глобального process в edge-runtime (Deno 1.45) нет — только импортом.
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { runTool, toolCatalog, TOOL_INSTRUCTIONS } from "./toolLayer";
import { runAgent, type ChatMessage } from "./agent";
import { callOpenRouter, DEFAULT_MODEL, ModelError } from "./openrouter";

/**
 * Функция `assistant-tools` — вход для ассистента ВНУТРИ приложения.
 *
 * Отдаёт два действия:
 *   { action: "catalog" }                  → каталог инструментов и правила работы
 *   { action: "call", tool, input }        → выполнить инструмент
 *
 * Инструменты те же, что у коннектора (33), и берутся из общего реестра. Модель
 * здесь не вызывается вовсе: это слой доступа, а выбор модели и цикл вызовов
 * будут отдельно. Так эту часть можно выкатить и проверить раньше, чем появится
 * ключ Anthropic, и она ничего не стоит в деньгах.
 *
 * Права — токеном самого пользователя, как в коннекторе: инструменты создают
 * клиента базы с его токеном, RLS применяется. Служебный ключ здесь не
 * используется НИГДЕ, и это не перестраховка: ассистент, которому видно больше,
 * чем человеку, однажды покажет ему чужое.
 */

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Deno.serve в типах браузерного проекта нет — функция собирается для
// edge-runtime, а проверяется тем же tsc, что и фронтенд.
const serve = (globalThis as unknown as { Deno?: { serve?: (h: (r: Request) => Promise<Response>) => void } }).Deno
  ?.serve;

serve?.(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Только POST" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Нет токена" }, 401);

  // Кто пришёл — спрашиваем у GoTrue его же токеном. Разбирать JWT самим здесь
  // незачем: проверка подписи и срока — работа сервера авторизации.
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: userData, error: authError } = await supabase.auth.getUser(token);
  const userId = userData?.user?.id;
  if (authError || !userId) return json({ error: "Токен не принят" }, 401);

  let body: {
    action?: string;
    tool?: string;
    input?: unknown;
    messages?: ChatMessage[];
    context?: { module?: string; project_id?: string; project_name?: string; task_id?: string };
    decision?: { approve?: boolean };
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Тело запроса — не JSON" }, 400);
  }

  if (body.action === "catalog") {
    const tools = toolCatalog();
    return json({
      instructions: TOOL_INSTRUCTIONS,
      tools,
      counts: {
        total: tools.length,
        read_only: tools.filter((t) => t.read_only).length,
        destructive: tools.filter((t) => t.destructive).length,
      },
    });
  }

  if (body.action === "call") {
    if (!body.tool) return json({ error: "Не указан инструмент" }, 400);
    const result = await runTool(body.tool, body.input, {
      token,
      userId,
      clientId: "in-app-assistant",
    });
    // Отказ инструмента — это ответ, а не сбой запроса: 200 с ok:false, чтобы
    // вызывающая сторона отличала «инструмент сказал нет» от «функция упала».
    return json(result);
  }

  if (body.action === "chat") {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return json({ error: "OPENROUTER_API_KEY не задан" }, 500);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    // Предохранитель от раздувания: история приходит от окна.
    if (messages.length === 0 || messages.length > 80 || JSON.stringify(messages).length > 400_000) {
      return json({ error: "Пустая или слишком длинная переписка" }, 400);
    }

    const catalog = toolCatalog();
    const ctx = { token, userId, clientId: "in-app-assistant" };
    const { data: me } = await supabase
      .from("profiles").select("display_name")
      .eq("id", userId).maybeSingle()
      .then((r) => r, () => ({ data: null }));
    const dynamicSystem = describeSituation(body.context, (me as { display_name?: string } | null)?.display_name);

    try {
      const result = await runAgent({
        messages,
        decision: typeof body.decision?.approve === "boolean" ? { approve: body.decision.approve } : undefined,
        deps: {
          catalog,
          runTool: (name, input) => runTool(name, input, ctx),
          callModel: (msgs) =>
            callOpenRouter({
              apiKey,
              model: process.env.ASSISTANT_MODEL || DEFAULT_MODEL,
              staticSystem: STATIC_SYSTEM,
              dynamicSystem,
              tools: catalog,
              messages: msgs,
            }),
        },
      });
      // Карточке нужны названия, а не идентификаторы: модель не всегда поясняет
      // действие текстом (проверка 30.09: «перенос» пришёл без слов — человек не
      // понял бы, какую задачу двигают). Подписи берутся токеном пользователя.
      if (result.status === "confirm") {
        const labelled = await labelPending(token, result.pending);
        return json({ ...result, pending: labelled });
      }
      return json(result);
    } catch (e) {
      if (e instanceof ModelError) {
        console.error("assistant chat model error:", e.status, e.message);
        const code = e.status === 402 ? "payment_required" : e.status === 429 ? "rate_limited" : "model_error";
        return json({ error: code }, e.status === 402 || e.status === 429 ? e.status : 502);
      }
      console.error("assistant chat failed:", (e as Error)?.stack ?? e);
      return json({ error: "Сбой ассистента" }, 500);
    }
  }

  return json({ error: `Неизвестное действие «${body.action ?? ""}». Есть catalog, call и chat.` }, 400);
});

// Неизменная часть системного промпта — кэшируется вместе с каталогом.
const STATIC_SYSTEM = `Ты — ассистент внутри JustTODOit: задачи, проекты, протоколы встреч, CRM.
Работаешь от имени пользователя и видишь ровно то, что видит он.

Как работать:
- Сначала собери факты инструментами, потом отвечай. Не выдумывай задачи, людей, сроки и цифры.
- Ищи людей и проекты по имени сам, не проси у пользователя идентификаторы.
- Инструменты чтения вызывай свободно. Любое изменение (создать, изменить, перенести, закрыть, удалить, назначить)
  пользователь подтверждает кнопкой в интерфейсе: перед таким вызовом одной-двумя фразами скажи, что именно сделаешь.
  Если действие отклонили — не повторяй его без новой просьбы.
- Отвечай по-русски, коротко и по делу. Списки — маркированные. Не показывай UUID: называй задачи, проекты и людей по именам.
- Если данных много — сузь запрос (фильтры, limit), а не пересказывай всё.
- Даты и время называй по Москве (МСК) и по-человечески («5 октября, 18:00»), никогда не в UTC.
- Задачи ты не удаляешь: инструмента удаления задачи нет, а delete_plan_items — только для вех и связей
  внутри проекта. Если просят удалить задачу — предложи закрыть её или поставить статус «отменено»
  (update_task). Никогда не подставляй выдуманные идентификаторы, например нулевой UUID.
- Перед назначением человека найди его (list_members, get_workload, данные задач). Если по имени
  подходит несколько людей или ни одного — не вызывай запись, а переспроси, назвав кандидатов.

${TOOL_INSTRUCTIONS}`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Меняющаяся часть: дата, кто спрашивает и что у него сейчас на экране. */
function describeSituation(
  ctx: { module?: string; project_id?: string; project_name?: string; task_id?: string } | undefined,
  userName: string | undefined,
): string {
  const now = new Date();
  const date = now.toLocaleDateString("ru-RU", {
    timeZone: "Europe/Moscow", weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const time = now.toLocaleTimeString("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit" });
  const lines = [`Сейчас: ${date}, ${time} МСК.`];
  if (userName) lines.push(`Пользователь: ${userName}.`);
  const where: string[] = [];
  const modules: Record<string, string> = { tasks: "задачи", pmo: "портфель проектов (PMO)", npd: "НИОКР", crm: "CRM" };
  if (ctx?.module && modules[ctx.module]) where.push(`раздел «${modules[ctx.module]}»`);
  if (ctx?.project_id && UUID_RE.test(ctx.project_id)) {
    where.push(`проект «${(ctx.project_name ?? "").slice(0, 200)}» (project_id ${ctx.project_id})`);
  }
  if (ctx?.task_id && UUID_RE.test(ctx.task_id)) where.push(`задача task_id ${ctx.task_id}`);
  if (where.length) {
    lines.push(`Сейчас на экране: ${where.join(", ")}. «Этот проект», «эта задача», «здесь» — про них.`);
  }
  return lines.join("\n");
}

type LabelKey = "task" | "project" | "person";
const ID_KIND: Record<string, LabelKey> = {
  task_id: "task", predecessor_id: "task", successor_id: "task", from_task_id: "task", to_task_id: "task",
  project_id: "project", group_id: "project", parent_id: "project",
  assigned_to: "person", assignee_id: "person", user_id: "person",
};

/** Подписать идентификаторы в действиях, ждущих подтверждения. */
async function labelPending(
  token: string,
  pending: { id: string; name: string; title: string; input: Record<string, unknown>; destructive: boolean }[],
) {
  const ids: Record<LabelKey, Set<string>> = { task: new Set(), project: new Set(), person: new Set() };
  for (const p of pending) {
    for (const [k, v] of Object.entries(p.input)) {
      const kind = ID_KIND[k];
      if (kind && typeof v === "string" && UUID_RE.test(v)) ids[kind].add(v);
      // Списки id (например ids у delete_plan_items) — подписываем как задачи.
      if (k === "ids" && Array.isArray(v)) for (const x of v) if (typeof x === "string" && UUID_RE.test(x)) ids.task.add(x);
    }
  }
  const names = new Map<string, string>();
  const auth = { global: { headers: { Authorization: `Bearer ${token}` } } };
  const db = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY!,
    { ...auth, auth: { persistSession: false, autoRefreshToken: false } },
  );
  const load = async (table: string, col: string, set: Set<string>) => {
    if (!set.size) return;
    const { data } = await db.from(table).select(`id, ${col}`).in("id", [...set]);
    for (const r of (data ?? []) as unknown as Record<string, string>[]) names.set(r.id, r[col]);
  };
  await Promise.all([
    load("tasks", "title", ids.task),
    load("task_groups", "name", ids.project),
    load("profiles", "display_name", ids.person),
  ]);
  const KIND_LABEL: Record<LabelKey, string> = { task: "задача", project: "проект", person: "человек" };
  return pending.map((p) => {
    const labels: string[] = [];
    for (const [k, v] of Object.entries(p.input)) {
      const kind = ID_KIND[k];
      if (kind && typeof v === "string" && names.has(v)) labels.push(`${KIND_LABEL[kind]}: «${names.get(v)}»`);
      if (k === "ids" && Array.isArray(v)) {
        for (const x of v) if (typeof x === "string" && names.has(x)) labels.push(`задача: «${names.get(x)}»`);
      }
    }
    return { ...p, labels };
  });
}
