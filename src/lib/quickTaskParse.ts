/**
 * Универсальный парсер строки быстрого создания задачи.
 * Поддерживаемые маркеры:
 *  - @имя              — ответственный (по display_name / telegram_username / email-prefix)
 *  - до DD.MM[.YYYY]   — дедлайн (если без года, берётся ближайшая будущая дата)
 *  - до DD/MM, до DD-MM — те же варианты разделителей
 *  - +Nд / через N дн  — дедлайн через N дней от today
 *  - !                 — важная задача (только если в начале или конце слова)
 *  - #тег              — placeholder, возвращает массив строк (применение тегов — на стороне вызывающего)
 *
 * Возвращает очищенный заголовок + найденные атрибуты + список «токенов» для UI-чипов.
 */

import { addDays } from "date-fns";

export interface QuickParseProfile {
  id: string;
  display_name: string | null;
  email: string | null;
  telegram_username: string | null;
}

export interface QuickParseToken {
  kind: "assignee" | "deadline" | "important" | "tag";
  raw: string;          // исходный матч в строке
  label: string;        // что показать в чипе
}

export interface QuickParseResult {
  cleanTitle: string;
  assigneeId: string | null;
  assigneeLabel: string | null;
  deadline: Date | null;
  isImportant: boolean;
  tags: string[];
  tokens: QuickParseToken[];
}

/** Найти пользователя по введённому после @ ключу. Регистр игнорируется. */
function matchUser(key: string, users: QuickParseProfile[]): QuickParseProfile | null {
  const k = key.toLowerCase().trim();
  if (!k) return null;
  // 1) точное совпадение telegram_username
  let m = users.find(u => u.telegram_username?.toLowerCase() === k);
  if (m) return m;
  // 2) точное совпадение по первому слову display_name (типа "Марк")
  m = users.find(u => (u.display_name || "").toLowerCase().split(/\s+/)[0] === k);
  if (m) return m;
  // 3) email-prefix
  m = users.find(u => (u.email || "").toLowerCase().startsWith(k + "@"));
  if (m) return m;
  // 4) substring по display_name (для "Мар" → Марк)
  m = users.find(u => (u.display_name || "").toLowerCase().includes(k));
  return m || null;
}

function parseDateDDMM(raw: string): Date | null {
  // raw в формате DD.MM или DD.MM.YYYY (любые разделители . / -)
  const parts = raw.split(/[./-]/).map(p => parseInt(p, 10));
  if (parts.some(isNaN)) return null;
  const [d, m, y] = parts;
  if (!d || !m || d > 31 || m > 12) return null;
  const today = new Date();
  let year = y ?? today.getFullYear();
  if (year < 100) year += 2000;
  let date = new Date(year, m - 1, d, 23, 59, 59, 0);
  // если без года и дата уже прошла — берём след. год
  if (y === undefined && date.getTime() < today.getTime() - 86400000) {
    date = new Date(year + 1, m - 1, d, 23, 59, 59, 0);
  }
  return date;
}

export function parseQuickTask(input: string, users: QuickParseProfile[] = []): QuickParseResult {
  const tokens: QuickParseToken[] = [];
  let work = " " + input + " ";
  let assigneeId: string | null = null;
  let assigneeLabel: string | null = null;
  let deadline: Date | null = null;
  let isImportant = false;
  const tags: string[] = [];

  // 1) @mention — берём ПЕРВЫЙ как ответственный, остальные игнорируем (как Telegram-логика)
  const mentionRe = /(^|\s)@([A-Za-zА-Яа-яЁё0-9_]+)/g;
  let mMatch: RegExpExecArray | null;
  let firstMention = true;
  const mentionsToStrip: string[] = [];
  while ((mMatch = mentionRe.exec(work)) !== null) {
    const key = mMatch[2];
    mentionsToStrip.push(mMatch[0]);
    if (firstMention) {
      const u = matchUser(key, users);
      if (u) {
        assigneeId = u.id;
        assigneeLabel = u.display_name || u.email || key;
        tokens.push({ kind: "assignee", raw: "@" + key, label: assigneeLabel });
      } else {
        tokens.push({ kind: "assignee", raw: "@" + key, label: `@${key} (не найден)` });
      }
      firstMention = false;
    }
  }
  for (const m of mentionsToStrip) {
    work = work.replace(m, " ");
  }

  // 2) #тег
  const tagRe = /(^|\s)#([A-Za-zА-Яа-яЁё0-9_-]+)/g;
  let tMatch: RegExpExecArray | null;
  const tagsToStrip: string[] = [];
  while ((tMatch = tagRe.exec(work)) !== null) {
    tags.push(tMatch[2]);
    tagsToStrip.push(tMatch[0]);
    tokens.push({ kind: "tag", raw: "#" + tMatch[2], label: "#" + tMatch[2] });
  }
  for (const t of tagsToStrip) work = work.replace(t, " ");

  // 3) "до DD.MM[.YYYY]" / "до DD/MM" / "до DD-MM"
  const dateRe = /(^|\s)до\s+(\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?)\b/i;
  const dm = work.match(dateRe);
  if (dm) {
    const parsed = parseDateDDMM(dm[2]);
    if (parsed) {
      deadline = parsed;
      tokens.push({
        kind: "deadline",
        raw: dm[0].trim(),
        label: `до ${parsed.getDate().toString().padStart(2, "0")}.${(parsed.getMonth() + 1).toString().padStart(2, "0")}`,
      });
      work = work.replace(dm[0], " ");
    }
  }

  // 4) "+Nд" или "через N дн[ей|я]"
  if (!deadline) {
    const plusRe = /(^|\s)\+(\d{1,3})\s*д(?:н\w*)?\b/i;
    const pm = work.match(plusRe);
    if (pm) {
      const n = parseInt(pm[2], 10);
      deadline = addDays(new Date(), n);
      deadline.setHours(23, 59, 59, 0);
      tokens.push({ kind: "deadline", raw: pm[0].trim(), label: `+${n}д` });
      work = work.replace(pm[0], " ");
    } else {
      const cherezRe = /(^|\s)через\s+(\d{1,3})\s*д(?:н\w*)?\b/i;
      const cm = work.match(cherezRe);
      if (cm) {
        const n = parseInt(cm[2], 10);
        deadline = addDays(new Date(), n);
        deadline.setHours(23, 59, 59, 0);
        tokens.push({ kind: "deadline", raw: cm[0].trim(), label: `через ${n}д` });
        work = work.replace(cm[0], " ");
      }
    }
  }

  // 5) "!" в начале или конце строки → важная
  const trimmed = work.trim();
  if (trimmed.startsWith("!")) {
    isImportant = true;
    work = work.replace(/^\s*!\s*/, " ");
    tokens.push({ kind: "important", raw: "!", label: "Важная" });
  } else if (trimmed.endsWith("!") && !trimmed.endsWith("!!")) {
    // одиночный "!" в конце как маркер; "!!" оставляем как пунктуацию
    // только если перед ним пробел или начало (чтобы "Привет!" не считался)
    const tailRe = /\s!\s*$/;
    if (tailRe.test(work)) {
      isImportant = true;
      work = work.replace(tailRe, " ");
      tokens.push({ kind: "important", raw: "!", label: "Важная" });
    }
  }

  const cleanTitle = work.replace(/\s+/g, " ").trim();

  return {
    cleanTitle,
    assigneeId,
    assigneeLabel,
    deadline,
    isImportant,
    tags,
    tokens,
  };
}
