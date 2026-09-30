// Ассистент в Telegram-боте (решение владельца 01.10.2026: приоритет).
//
// Тот же цикл, что в окне приложения: бот вызывает функцию `assistant-tools`
// (action "chat"), а не дублирует логику. Права — строго пользователя: для
// привязанного к чату человека выпускается короткий токен (10 минут), и
// инструменты работают с его правами и RLS, как в приложении.
//
// Токен подписывается прежним HS256-секретом (JWT_SECRET) — его по-прежнему
// принимают GoTrue, PostgREST и storage (набор ключей с 27.09). Полномочий
// функциям это не добавляет: служебный ключ у них уже есть. Токен без
// session_id и живёт 10 минут; выпускается только для профиля, чей
// telegram_chat_id совпал с чатом, из которого пришло сообщение.
//
// Подтверждение записи — кнопками «Выполнить / Отмена»; нажать может только
// хозяин разговора. Состояние между сообщениями — assistant_tg_sessions.

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function mintUserToken(userId: string, email: string | null): Promise<string> {
  const secret = Deno.env.get("JWT_SECRET");
  if (!secret) throw new Error("JWT_SECRET не задан у функций");
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sub: userId,
    role: "authenticated",
    aud: "authenticated",
    iss: "https://justtodoit.ru/sb/auth/v1",
    email: email ?? undefined,
    iat: now,
    exp: now + 600,
    // Пометка источника — видно в токене, если придётся разбираться.
    app_metadata: { via: "telegram-assistant" },
  };
  const body = `${b64url(enc.encode(JSON.stringify(header)))}.${b64url(enc.encode(JSON.stringify(payload)))}`;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

export type AssistantReply = {
  status?: "done" | "confirm";
  reply?: string;
  steps?: { title: string }[];
  pending?: { id: string; title: string; input: Record<string, unknown>; destructive: boolean; labels?: string[] }[];
  messages?: unknown[];
  error?: string;
};

export async function callAssistant(token: string, body: Record<string, unknown>): Promise<AssistantReply> {
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/assistant-tools`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    },
    body: JSON.stringify({ action: "chat", context: { module: "tasks" }, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: (data as { error?: string })?.error ?? `HTTP ${res.status}` };
  return data as AssistantReply;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Ответ модели (markdown) — в HTML Telegram: жирный, курсив, код, списки. */
export function mdToTelegramHtml(md: string): string {
  return esc(md)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*(?!\s)([^*\n]+?)\*(?!\*)/g, "$1<i>$2</i>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>")
    .replace(/^\s*[-*]\s+/gm, "• ");
}

const ARG_LABELS: Record<string, string> = {
  title: "название", description: "описание", deadline: "срок", new_deadline: "новый срок",
  assignee: "исполнитель", status: "статус", priority: "приоритет", is_important: "важная",
  content: "текст", name: "название", planned_date: "дата", days: "дней",
};
const ISO = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;
function human(v: unknown): string {
  if (typeof v === "boolean") return v ? "да" : "нет";
  if (typeof v === "string" && ISO.test(v)) {
    const d = new Date(v);
    const date = d.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric" });
    return v.includes("T")
      ? `${date}, ${d.toLocaleTimeString("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit" })}`
      : date;
  }
  if (Array.isArray(v)) return `${v.length} шт.`;
  if (v && typeof v === "object") return "…";
  const s = String(v);
  return s.length > 80 ? s.slice(0, 80) + "…" : s;
}

/** Текст карточки подтверждения. */
export function renderPending(r: AssistantReply): string {
  const lines: string[] = [];
  if (r.reply) lines.push(mdToTelegramHtml(r.reply), "");
  lines.push("<b>Нужно ваше подтверждение:</b>");
  for (const p of r.pending ?? []) {
    lines.push(`${p.destructive ? "⚠️" : "✎"} <b>${esc(p.title)}</b>`);
    for (const l of p.labels ?? []) lines.push(`   ${esc(l)}`);
    for (const [k, v] of Object.entries(p.input)) {
      if (v === null || v === undefined || v === "" || k.endsWith("_id") || k === "ids") continue;
      if (typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(v)) continue;
      lines.push(`   ${esc(ARG_LABELS[k] ?? k)}: ${esc(human(v))}`);
    }
  }
  return lines.join("\n");
}

export function renderSteps(r: AssistantReply): string {
  const titles = [...new Set((r.steps ?? []).map((s) => s.title))];
  return titles.length ? `\n\n<i>🔍 ${esc(titles.join(" · "))}</i>` : "";
}

// ---------- Вопрос ассистенту или задача? (решение владельца 01.10.2026) ----------
// В личке бота обычный текст — это задача: «написал — задача создана». Поэтому
// ассистенту уходит только то, что явно похоже на вопрос или просьбу к нему.
// Ошибку в любую сторону человек исправит: под ответом ассистента есть кнопка
// «Создать задачей», а задачу из вопроса всегда можно удалить.
//
// Неопределённая форма глагола («Найти подрядчика», «Проверить счёт») — так
// люди формулируют задачи, это задача. Повелительная, обращённая к помощнику
// («найди», «покажи», «перенеси») — просьба к ассистенту.
// Граница слова — (?![\p{L}\d]) с флагом u: \b в JS видит только латиницу.

const QUESTION_START = /^(что|чем|как|какие|какой|какая|каких|каким|когда|сколько|где|кто|кому|почему|зачем|есть ли|можно ли|у кого|у меня|чья|чьи|чей)(?![\p{L}\d])/iu;
const ASSISTANT_VERB = /^(покажи|расскажи|подскажи|найди|посмотри|проверь|перенеси|передвинь|сдвинь|назначь|переназначь|закрой|отметь|поставь статус|составь|собери|сделай сводку|дай сводку|напомни мне,? что|помоги|объясни|разбери|посчитай)(?![\p{L}\d])/iu;
const ADDRESS = /^(ии|ai|ассистент|помощник|бот)\s*[,:!]/iu;

export function looksLikeAssistantRequest(
  text: string,
  opts: { forwarded?: boolean; voice?: boolean } = {},
): boolean {
  if (opts.forwarded || opts.voice) return false;
  const t = text.trim().replace(/^[«"'(]+/, "");
  if (!t || t.startsWith("/") || t.startsWith("!")) return false;
  if (t.length > 500) return false;
  // Несколько строк — список задач, его разбирает бот.
  if (t.split(/\n/).filter((l) => l.trim()).length > 1) return false;
  if (ADDRESS.test(t)) return true;
  if (t.endsWith("?")) return true;
  const firstWords = t.replace(/^(а|и|ну|слушай|скажи|подскажи-ка)[,\s]+/i, "");
  return QUESTION_START.test(firstWords) || ASSISTANT_VERB.test(firstWords);
}
