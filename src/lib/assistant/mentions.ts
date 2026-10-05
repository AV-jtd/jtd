/**
 * Задачи, упомянутые в ответе ассистента (06.10.2026) — для кнопок под ответом.
 *
 * Ответ модели — текст: «горят три задачи: КП Ашан, …». Чтобы по нему можно
 * было что-то сделать (открыть, закрыть), нужны id. Модель их не показывает
 * (правило «не показывай UUID»), зато они есть в результатах инструментов
 * этого же хода. Берём задачи из результатов чтения после последнего сообщения
 * пользователя и оставляем те, чьё название встречается в ответе.
 */

import type { ChatMessage } from "./agent";

export type MentionedTask = { id: string; title: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[«»"“”]/g, "").replace(/\s+/g, " ").trim();

/** Задачи (id + title) из JSON внутри результата инструмента. */
function collect(value: unknown, out: Map<string, MentionedTask>, depth = 0) {
  if (depth > 8 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const v of value) collect(v, out, depth + 1);
    return;
  }
  const o = value as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : typeof o.task_id === "string" ? o.task_id : null;
  // Закрытые не берём: кнопка «Закрыть» под ними бессмысленна.
  if (id && UUID.test(id) && typeof o.title === "string" && o.title.trim() && o.is_completed !== true) {
    if (!out.has(id)) out.set(id, { id, title: o.title.trim() });
  }
  for (const v of Object.values(o)) collect(v, out, depth + 1);
}

function jsonParts(text: string): unknown[] {
  const parts: unknown[] = [];
  const tryParse = (s: string) => {
    try {
      parts.push(JSON.parse(s));
    } catch {
      /* не JSON */
    }
  };
  tryParse(text);
  const i = text.indexOf("Данные:\n");
  if (i >= 0) tryParse(text.slice(i + "Данные:\n".length).replace(/\n… \[обрезано[^\]]*\]$/, ""));
  return parts;
}

export function mentionedTasks(messages: ChatMessage[], reply: string, limit = 5): MentionedTask[] {
  let start = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      start = i;
      break;
    }
  }
  const found = new Map<string, MentionedTask>();
  for (const m of messages.slice(start)) {
    if (m.role !== "tool") continue;
    for (const p of jsonParts(m.content)) collect(p, found);
  }
  const text = norm(reply);
  const out: MentionedTask[] = [];
  for (const t of found.values()) {
    // Модель часто сокращает длинное название — сверяем по началу.
    const key = norm(t.title).slice(0, 30);
    if (key.length >= 4 && text.includes(key)) out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}
