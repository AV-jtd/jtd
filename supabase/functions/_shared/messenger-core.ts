// ============================================================================
// Messenger-agnostic command core (Stage 2 of the MAX channel stream).
//
// Goal: avoid duplicating the large telegram-webhook command logic for every
// new channel. This module holds the transport-neutral pieces:
//   - pure helpers (deadline/name parsing, fuzzy matching, formatting)
//   - DB helpers (projects, members)
//   - AI bulk parsing + bulk task creation
//   - a MessengerTransport abstraction with Telegram + MAX adapters
//   - handleCoreCommand(): the shared command handler used by any channel
//
// Telegram keeps its own battle-tested webhook for now; MAX routes through
// this core so both channels share a single source of truth going forward.
// ============================================================================

import { sendMaxMessage, type MaxInlineButton } from "./max-api.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BulkParsedTask {
  title: string;
  assigned_to_id?: string;
  participant_ids?: string[];
  assigned_to_name?: string;
  participant_names?: string[];
  deadline_days?: number;
  deadline_date?: string;
  subtasks?: string[];
  priority?: number;
}

export interface BulkTaskResult {
  title: string;
  assignee?: string;
  participants?: string[];
  deadline?: string;
  subtaskCount?: number;
}

export interface Member {
  id: string;
  name: string;
  telegram_username: string | null;
}

// ---------------------------------------------------------------------------
// Transport abstraction
// ---------------------------------------------------------------------------

/** A single inline button: visible `text` + opaque `payload` (max ~64 chars). */
export interface InlineButton {
  text: string;
  payload: string;
}

/** A thin send-only channel. Each messenger provides its own adapter. */
export interface MessengerTransport {
  /** Send a text message. `text` may use light markdown (*bold*). */
  send(text: string): Promise<void>;
  /** Optional: send a message with an inline keyboard (rows of buttons). */
  sendWithButtons?(text: string, buttons: InlineButton[][]): Promise<void>;
}

/** Telegram adapter — sends with Markdown parse mode to a numeric chat id. */
export function makeTelegramTransport(token: string, chatId: number): MessengerTransport {
  return {
    async send(text: string) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
      });
    },
    async sendWithButtons(text: string, buttons: InlineButton[][]) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: buttons.map((row) =>
              row.map((b) => ({ text: b.text, callback_data: b.payload })),
            ),
          },
        }),
      });
    },
  };
}

/** MAX adapter — sends to a MAX user (DM) or chat using the shared helper. */
export function makeMaxTransport(
  token: string,
  target: { userId?: number; chatId?: number },
): MessengerTransport {
  return {
    async send(text: string) {
      await sendMaxMessage(token, target, text, { format: "markdown" });
    },
    async sendWithButtons(text: string, buttons: InlineButton[][]) {
      const keyboard: MaxInlineButton[][] = buttons.map((row) =>
        row.map((b) => ({ text: b.text, payload: b.payload })),
      );
      await sendMaxMessage(token, target, text, { format: "markdown", keyboard });
    },
  };
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function extractBotCommand(text: string): { command: string; args: string } | null {
  const match = text.match(/^\/(\w+)(?:@\S+)?\s*(.*)?$/s);
  if (!match) return null;
  return { command: match[1].toLowerCase(), args: (match[2] || "").trim() };
}

export function escapeMarkdown(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

export function formatDate(date: Date): string {
  const d = date.getDate().toString().padStart(2, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  return `${d}.${m}.${date.getFullYear()}`;
}

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function fuzzyMatch(query: string, candidate: string): boolean {
  const q = query.toLowerCase();
  const c = candidate.toLowerCase();
  if (c === q) return false;
  if (c.includes(q) || q.includes(c)) return true;
  if (q.length <= 12 && c.length <= 20) return levenshtein(q, c) <= 2;
  return q.length >= 3 && c.startsWith(q.substring(0, 3));
}

export function pluralizeRu(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

/** Split a flat list of buttons into rows of `perRow` (compact grid layout). */
export function chunkButtons(items: InlineButton[], perRow: number): InlineButton[][] {
  const rows: InlineButton[][] = [];
  for (let i = 0; i < items.length; i += perRow) {
    rows.push(items.slice(i, i + perRow));
  }
  return rows;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function selectInChunks(
  supabase: any,
  table: string,
  columns: string,
  column: string,
  values: string[],
  chunkSize = 75,
): Promise<any[]> {
  const uniqueValues = [...new Set(values.filter(Boolean))];
  const rows: any[] = [];
  for (const chunk of chunkArray(uniqueValues, chunkSize)) {
    const { data, error } = await supabase.from(table).select(columns).in(column, chunk);
    if (error) {
      console.warn(`[assignee] Не удалось загрузить ${table}.${column} чанком ${chunk.length}: ${error.message}`);
      continue;
    }
    if (data) rows.push(...data);
  }
  return rows;
}

export function detectBulkMessage(text: string): boolean {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return false;
  let listLineCount = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[-•*]\s/.test(trimmed) || /^\d+[\.\)]\s/.test(trimmed)) listLineCount++;
  }
  if (listLineCount >= 2) return true;
  const commaItems = text.split(/[,;]/).filter((s) => s.trim().length > 3);
  return commaItems.length >= 3;
}

// --- Russian name matching ---

const NAME_ALIASES: Record<string, string[]> = {
  "виктория": ["вика", "викуся", "витя"],
  "александр": ["саша", "шура", "саня"],
  "александра": ["саша", "шура", "сашуля"],
  "мария": ["маша", "маня", "мара"],
  "екатерина": ["катя", "катюша"],
  "анастасия": ["настя", "ася"],
  "наталья": ["наташа", "ната"],
  "наталия": ["наташа", "ната"],
  "ольга": ["оля", "оляша"],
  "елена": ["лена", "ленуся"],
  "татьяна": ["таня", "танюша"],
  "ирина": ["ира", "иришка"],
  "светлана": ["света", "светик"],
  "юлия": ["юля", "юляша"],
  "анна": ["аня", "анюта"],
  "людмила": ["люда", "люся"],
  "галина": ["галя", "галюся"],
  "владимир": ["вова", "володя"],
  "дмитрий": ["дима", "митя"],
  "сергей": ["серёжа", "сережа", "серый"],
  "андрей": ["андрюша", "дрюша"],
  "алексей": ["лёша", "леша", "алёша"],
  "михаил": ["миша", "мишаня"],
  "николай": ["коля", "колян"],
  "евгений": ["женя", "жека"],
  "артём": ["тёма", "тема", "артемка"],
  "артем": ["тёма", "тема", "артемка"],
  "альберт": ["алберт", "алик", "аля"],
  "максим": ["макс", "максимка"],
  "иван": ["ваня", "ванюша"],
  "павел": ["паша", "пашка"],
  "константин": ["костя", "костик"],
  "роман": ["рома", "ромка"],
  "пётр": ["петя", "петруша"],
  "петр": ["петя", "петруша"],
  "виктор": ["витя", "витёк"],
  "марк": ["марик"],
};

export function normalizeToken(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]/gi, "").trim();
}

export function nameTokens(fullName: string): string[] {
  return fullName.split(/\s+/).map(normalizeToken).filter((t) => t.length >= 2);
}

export function expandWithAliases(token: string): string[] {
  const t = token.toLowerCase().replace(/ё/g, "е");
  const result = new Set<string>([t]);
  if (NAME_ALIASES[t]) NAME_ALIASES[t].forEach((a) => result.add(a));
  for (const [full, aliases] of Object.entries(NAME_ALIASES)) {
    if (aliases.includes(t)) result.add(full);
  }
  return [...result];
}

/** Detailed outcome of resolving an `@name` / free-text mention to a member. */
export interface MemberMatch {
  member: Member | null;
  /** Which strategy matched (for logging), or null when nothing matched. */
  matchedBy: string | null;
  /** Human-readable reason the resolution failed (for logging). */
  reason?: string;
}

/**
 * Resolve a raw `@name` / free-text hint to a team member, trying a ladder of
 * increasingly fuzzy strategies. Handles: leading `@`, mixed case, extra/inner
 * whitespace, partial (prefix) tokens, multi-word "Имя Фамилия", diminutives,
 * substrings and small typos. Returns *why* it failed so callers can log it.
 */
export function resolveMemberDetailed(needle: string, members: Member[]): MemberMatch {
  if (!needle || !needle.trim()) return { member: null, matchedBy: null, reason: "пустой запрос" };
  if (members.length === 0) return { member: null, matchedBy: null, reason: "список участников пуст" };

  // Strip every leading '@', collapse inner whitespace, trim edges.
  const cleaned = needle.replace(/^@+/, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return { member: null, matchedBy: null, reason: "запрос состоит только из '@'/пробелов" };

  const needleNorm = normalizeToken(cleaned);
  const needleParts = cleaned.split(" ").map(normalizeToken).filter((p) => p.length >= 2);

  // 1. Exact username (case-insensitive).
  const byUsername = members.find(
    (m) => m.telegram_username && m.telegram_username.toLowerCase() === cleaned.toLowerCase(),
  );
  if (byUsername) return { member: byUsername, matchedBy: "username" };

  // 1b. Username prefix — handles a partially typed handle.
  if (needleNorm.length >= 3) {
    const byUsernamePrefix = members.find(
      (m) => m.telegram_username && normalizeToken(m.telegram_username).startsWith(needleNorm),
    );
    if (byUsernamePrefix) return { member: byUsernamePrefix, matchedBy: "username-prefix" };
  }

  // 2. Exact normalized full name.
  const byFullName = members.find((m) => normalizeToken(m.name) === needleNorm);
  if (byFullName) return { member: byFullName, matchedBy: "fullname" };

  // 2b. Multi-word "Имя Фамилия": every part matches a name token (exact or prefix).
  if (needleParts.length >= 2) {
    const byAllParts = members.find((m) => {
      const toks = nameTokens(m.name);
      return needleParts.every((p) =>
        toks.some((t) => t === p || (p.length >= 3 && t.startsWith(p)) || (t.length >= 3 && p.startsWith(t))),
      );
    });
    if (byAllParts) return { member: byAllParts, matchedBy: "multi-token" };
  }

  // 3. Alias / diminutive token matching (Витя=Виктория, Маша=Мария …).
  const needleVariants = new Set(expandWithAliases(needleNorm));
  for (const m of members) {
    for (const tok of nameTokens(m.name)) {
      if (expandWithAliases(tok).some((v) => needleVariants.has(v))) return { member: m, matchedBy: "alias-token" };
    }
  }

  // 4. Partial / prefix token match. Unambiguous only — flag ties so the caller
  //    can explain why nothing was assigned.
  if (needleNorm.length >= 3) {
    const candidates: Member[] = [];
    for (const m of members) {
      if (nameTokens(m.name).some((tok) => tok.startsWith(needleNorm) || needleNorm.startsWith(tok))) {
        candidates.push(m);
      }
    }
    if (candidates.length === 1) return { member: candidates[0], matchedBy: "prefix-token" };
    if (candidates.length > 1) {
      return {
        member: null,
        matchedBy: null,
        reason: `неоднозначно: '${cleaned}' подходит ${candidates.length} участникам (${candidates.map((c) => c.name).join(", ")})`,
      };
    }
  }

  // 5. Substring on the full normalized name.
  for (const m of members) {
    const fullNorm = normalizeToken(m.name);
    if (needleNorm.length >= 4 && (fullNorm.includes(needleNorm) || needleNorm.includes(fullNorm))) {
      return { member: m, matchedBy: "substring" };
    }
  }

  // 6. Fuzzy token (small typos via Levenshtein).
  if (needleNorm.length >= 3) {
    for (const m of members) {
      for (const tok of nameTokens(m.name)) {
        if (fuzzyMatch(needleNorm, tok)) return { member: m, matchedBy: "fuzzy-token" };
      }
    }
  }

  return {
    member: null,
    matchedBy: null,
    reason: `'${cleaned}' не найдено среди участников: ${members.map((m) => m.name).join(", ") || "—"}`,
  };
}

export function findMemberByName(needle: string, members: Member[]): Member | null {
  return resolveMemberDetailed(needle, members).member;
}

function splitBulkSourceItems(text: string): string[] {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const listLines = lines
    .filter((line) => /^[-•*]\s+/.test(line) || /^\d+[\.)]\s+/.test(line))
    .map((line) => line.replace(/^[-•*]\s+/, "").replace(/^\d+[\.)]\s+/, "").trim())
    .filter(Boolean);
  if (listLines.length > 0) return listLines;
  if (lines.length > 1) return lines;
  return [text.trim()].filter(Boolean);
}

/**
 * Strategies considered "confident" enough to assign a member from a bare word
 * (no `@`). Prefix/substring/fuzzy are excluded here to avoid grabbing common
 * Russian words that merely look like a name fragment.
 */
const CONFIDENT_STRATEGIES = new Set([
  "username",
  "username-prefix",
  "fullname",
  "multi-token",
  "alias-token",
]);

/** Common short words that must never be treated as a bare name. */
const NAME_STOPWORDS = new Set([
  "на", "до", "от", "по", "за", "из", "под", "над", "для", "про", "без",
  "и", "а", "но", "или", "что", "как", "это", "все", "там", "тут", "уже",
  "его", "ее", "их", "мне", "нам", "вам", "был", "уже", "надо", "нужно",
]);

/**
 * Smart bare-name detection (без `@`): scan every word and adjacent word-pair
 * of the text against the member list, accepting only confident matches.
 * Returns the first member found, or null.
 */
function scanTextForMember(text: string, members: Member[]): { member: Member; matchedBy: string; token: string } | null {
  const words = text
    .split(/\s+/)
    .map((w) => w.replace(/^[^a-zа-яё0-9@]+|[^a-zа-яё0-9_.-]+$/gi, ""))
    .filter(Boolean);

  // Try "Имя Фамилия" pairs first (more specific), then single words.
  for (let i = 0; i < words.length - 1; i++) {
    const pair = `${words[i]} ${words[i + 1]}`;
    const res = resolveMemberDetailed(pair, members);
    if (res.member && (res.matchedBy === "multi-token" || res.matchedBy === "fullname")) {
      return { member: res.member, matchedBy: res.matchedBy, token: pair };
    }
  }

  for (const word of words) {
    const norm = normalizeToken(word.replace(/^@+/, ""));
    if (norm.length < 3 || NAME_STOPWORDS.has(norm)) continue;
    const res = resolveMemberDetailed(word, members);
    if (res.member && res.matchedBy && CONFIDENT_STRATEGIES.has(res.matchedBy)) {
      return { member: res.member, matchedBy: res.matchedBy, token: word };
    }
  }

  return null;
}

function findAssigneeHint(text: string, members: Member[]): Member | null {
  if (!text || members.length === 0) return null;

  // 1. Explicit @mentions — allow an optional second word ("@имя фамилия"),
  //    and fall back to the first token if the two-word form doesn't resolve.
  const mentionMatches = [...text.matchAll(/@([a-zа-яё0-9_.-]+(?:\s+[a-zа-яё0-9_.-]+)?)/gi)];
  for (const match of mentionMatches) {
    const raw = match[1].replace(/\s+/g, " ").trim();
    let res = resolveMemberDetailed(raw, members);
    if (!res.member && raw.includes(" ")) {
      res = resolveMemberDetailed(raw.split(" ")[0], members);
    }
    if (res.member) {
      console.log(`[assignee] @-упоминание "${raw}" → ${res.member.name} (стратегия: ${res.matchedBy})`);
      return res.member;
    }
    console.warn(`[assignee] @-упоминание "${raw}" не распознано: ${res.reason}`);
  }

  // 2. Keyword-driven assignment ("ответственный ...", "поручить ...").
  const keywordMatch = text.match(/(?:ответственн\w*|исполнитель|назначить|поручить|делает|сделает|на)\s+@?([a-zа-яё0-9_.-]+(?:\s+[a-zа-яё0-9_.-]+)?)/i);
  if (keywordMatch) {
    const raw = keywordMatch[1].replace(/\s+/g, " ").trim();
    const res = resolveMemberDetailed(raw, members);
    if (res.member) {
      console.log(`[assignee] по ключевому слову "${raw}" → ${res.member.name} (стратегия: ${res.matchedBy})`);
      return res.member;
    }
    console.warn(`[assignee] ключевое слово "${raw}" не распознано: ${res.reason}`);
  }

  // 3. Smart bare-name detection (без @): scan the whole text for a member
  //    name mentioned anywhere, accepting only confident matches.
  const scanned = scanTextForMember(text, members);
  if (scanned) {
    console.log(`[assignee] имя без @ "${scanned.token}" → ${scanned.member.name} (стратегия: ${scanned.matchedBy})`);
    return scanned.member;
  }

  return null;
}

function applyAssigneeFallbacks(
  tasks: BulkParsedTask[],
  sourceText: string,
  members: Member[],
  defaultAssigneeId: string,
): BulkParsedTask[] {
  const sourceItems = splitBulkSourceItems(sourceText);
  return tasks.map((task, index) => {
    if (task.assigned_to_id || task.assigned_to_name) return task;
    const hinted = findAssigneeHint(task.title, members) || findAssigneeHint(sourceItems[index] || sourceText, members);
    if (hinted) return { ...task, assigned_to_id: hinted.id, assigned_to_name: hinted.name };
    console.warn(
      `[assignee] Ответственный не определён для задачи "${task.title}" ` +
        `(исходный текст: "${(sourceItems[index] || "").slice(0, 80)}"). ` +
        `Участников доступно: ${members.length}. Назначен автор по умолчанию.`,
    );
    return { ...task, assigned_to_id: defaultAssigneeId };
  });
}

export function parseDeadline(text: string): { date: Date | null; cleaned: string } {
  const now = new Date();
  let cleaned = text;
  let date: Date | null = null;

  const patterns: [RegExp, (m: RegExpMatchArray) => Date][] = [
    [/(?:^|\s)\+(\d{1,3})\s*д(?:н\w*)?(?:\s|$)/i, (m) => {
      const d = new Date(now); d.setDate(d.getDate() + parseInt(m[1])); d.setHours(23, 59, 0, 0); return d;
    }],
    [/(?:^|\s)до\s+(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:\s|$)/i, (m) => {
      let y = parseInt(m[3]); if (y < 100) y += 2000;
      return new Date(y, parseInt(m[2]) - 1, parseInt(m[1]), 23, 59);
    }],
    [/(?:^|\s)до\s+(\d{1,2})[./-](\d{1,2})(?!\.\d)(?:\s|$)/i, (m) => {
      const d = new Date(now.getFullYear(), parseInt(m[2]) - 1, parseInt(m[1]), 23, 59);
      if (d < now) d.setFullYear(d.getFullYear() + 1);
      return d;
    }],
    [/(?:^|\s)сегодня(?:\s|$)/i, () => { const d = new Date(now); d.setHours(23, 59, 0, 0); return d; }],
    [/(?:^|\s)завтра(?:\s|$)/i, () => { const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(23, 59, 0, 0); return d; }],
    [/(?:^|\s)послезавтра(?:\s|$)/i, () => { const d = new Date(now); d.setDate(d.getDate() + 2); d.setHours(23, 59, 0, 0); return d; }],
    [/(?:^|\s)через\s+(\d+)\s+(?:день|дня|дней)(?:\s|$)/i, (m) => {
      const d = new Date(now); d.setDate(d.getDate() + parseInt(m[1])); d.setHours(23, 59, 0, 0); return d;
    }],
    [/(?:^|\s)через\s+неделю(?:\s|$)/i, () => { const d = new Date(now); d.setDate(d.getDate() + 7); d.setHours(23, 59, 0, 0); return d; }],
    [/(?:^|\s)через\s+месяц(?:\s|$)/i, () => { const d = new Date(now); d.setMonth(d.getMonth() + 1); d.setHours(23, 59, 0, 0); return d; }],
    [/(\d{1,2})\.(\d{1,2})\.(\d{4})/, (m) => new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]), 23, 59)],
    [/(\d{1,2})\.(\d{1,2})(?!\.\d)/, (m) => {
      const d = new Date(now.getFullYear(), parseInt(m[2]) - 1, parseInt(m[1]), 23, 59);
      if (d < now) d.setFullYear(d.getFullYear() + 1);
      return d;
    }],
  ];

  for (const [regex, handler] of patterns) {
    const match = cleaned.match(regex);
    if (match) {
      date = handler(match);
      cleaned = cleaned.replace(match[0], " ");
      return { date, cleaned };
    }
  }
  return { date: null, cleaned };
}

// ---------------------------------------------------------------------------
// DB helpers (transport-agnostic)
// ---------------------------------------------------------------------------

export async function getGroupMemberIds(supabase: any, groupId: string, ownerId: string): Promise<string[]> {
  const { data: members } = await supabase.from("group_members").select("user_id").eq("group_id", groupId);
  const ids = new Set<string>([ownerId]);
  if (members) members.forEach((m: any) => ids.add(m.user_id));
  return [...ids];
}

export async function getProjectMembers(supabase: any, groupId: string, ownerId: string): Promise<Member[]> {
  const memberIds = await getGroupMemberIds(supabase, groupId, ownerId);
  if (memberIds.length === 0) return [];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, telegram_username")
    .in("id", memberIds);
  return (profiles || []).map((p: any) => ({
    id: p.id,
    name: p.display_name || "Без имени",
    telegram_username: p.telegram_username,
  }));
}

export async function getUserProjects(supabase: any, userId: string): Promise<{ id: string; name: string; icon: string | null }[]> {
  const { data: owned } = await supabase.from("task_groups").select("id, name, icon").eq("user_id", userId);
  const { data: memberships } = await supabase.from("group_members").select("group_id").eq("user_id", userId);

  const ownedIds = new Set((owned || []).map((g: any) => g.id));
  const memberOnlyIds = (memberships || []).map((m: any) => m.group_id).filter((id: string) => !ownedIds.has(id));

  let memberGroups: any[] = [];
  if (memberOnlyIds.length > 0) {
    const { data } = await supabase.from("task_groups").select("id, name, icon").in("id", memberOnlyIds);
    memberGroups = data || [];
  }
  return [...(owned || []), ...memberGroups];
}

/**
 * Collect every teammate the user can reasonably assign work to — the union of
 * members across all the user's projects (owned + member-of), plus the project
 * owners and the user themselves. Used as a fallback for assignee resolution
 * when a task is created without an explicit project (e.g. Inbox tasks).
 */
export async function getTeamMembers(supabase: any, userId: string): Promise<Member[]> {
  // All groups the user owns or belongs to.
  const { data: owned } = await supabase.from("task_groups").select("id, user_id").eq("user_id", userId);
  const { data: memberships } = await supabase.from("group_members").select("group_id").eq("user_id", userId);

  const groupIds = new Set<string>();
  (owned || []).forEach((g: any) => groupIds.add(g.id));
  (memberships || []).forEach((m: any) => groupIds.add(m.group_id));

  const profileIds = new Set<string>([userId]);
  (owned || []).forEach((g: any) => g.user_id && profileIds.add(g.user_id));

  if (groupIds.size > 0) {
    const ids = [...groupIds];
    const { data: groupOwners } = await supabase.from("task_groups").select("user_id").in("id", ids);
    (groupOwners || []).forEach((g: any) => g.user_id && profileIds.add(g.user_id));
    const { data: groupMembers } = await supabase.from("group_members").select("user_id").in("group_id", ids);
    (groupMembers || []).forEach((m: any) => m.user_id && profileIds.add(m.user_id));
  }

  if (profileIds.size === 0) return [];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, telegram_username")
    .in("id", [...profileIds]);
  return (profiles || []).map((p: any) => ({
    id: p.id,
    name: p.display_name || "Без имени",
    telegram_username: p.telegram_username,
  }));
}

export async function findProject(supabase: any, userId: string, name: string) {
  let { data: group } = await supabase
    .from("task_groups")
    .select("id, name, icon, user_id")
    .eq("user_id", userId)
    .ilike("name", name)
    .maybeSingle();

  if (!group) {
    const { data: membership } = await supabase.from("group_members").select("group_id").eq("user_id", userId);
    if (membership && membership.length > 0) {
      const { data: memberGroup } = await supabase
        .from("task_groups")
        .select("id, name, icon, user_id")
        .in("id", membership.map((m: any) => m.group_id))
        .ilike("name", name)
        .maybeSingle();
      group = memberGroup;
    }
  }
  return group;
}

// ---------------------------------------------------------------------------
// AI bulk parsing + creation
// ---------------------------------------------------------------------------

export async function aiBulkParse(
  text: string,
  users: Member[],
  projectName?: string,
): Promise<BulkParsedTask[] | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return null;

  const userList = users.length > 0
    ? users.map((u) => `- id="${u.id}" name="${u.name}"${u.telegram_username ? ` username="@${u.telegram_username}"` : ""}`).join("\n")
    : "нет участников";
  const today = new Date().toISOString().split("T")[0];

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Ты — парсер задач. Из произвольного текста извлекай список задач.
Распознавай маркированные списки, перечисления через запятую, свободный текст и голосовые транскрипции.
Для каждой задачи определи: title (глагол + объект), assigned_to_id (UUID из списка участников), participant_ids,
assigned_to_name/participant_names (резервно), deadline_days, deadline_date (YYYY-MM-DD), subtasks, priority (1-3).
${projectName ? `Проект: "${projectName}"` : ""}
Доступные участники проекта (используй ИХ id для assigned_to_id):
${userList}
Текущая дата: ${today}
Сопоставляй имена по ЛЮБОМУ токену ФИО и уменьшительным (Витя=Виктория, Маша=Мария), регистр игнорируй.
ВСЕГДА возвращай assigned_to_id, если упомянут человек из списка. Если одна задача — массив из одного элемента.`,
          },
          { role: "user", content: `Извлеки задачи из:\n\n${text}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_tasks",
              description: "Извлечь список задач из текста",
              parameters: {
                type: "object",
                properties: {
                  tasks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        assigned_to_id: { type: "string" },
                        participant_ids: { type: "array", items: { type: "string" } },
                        assigned_to_name: { type: "string" },
                        participant_names: { type: "array", items: { type: "string" } },
                        deadline_days: { type: "number" },
                        deadline_date: { type: "string" },
                        subtasks: { type: "array", items: { type: "string" } },
                        priority: { type: "number" },
                      },
                      required: ["title"],
                    },
                  },
                },
                required: ["tasks"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_tasks" } },
      }),
    });

    if (!response.ok) {
      console.error("AI bulk parse error:", response.status);
      return null;
    }
    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      return parsed.tasks || null;
    }
  } catch (e) {
    console.error("AI bulk parse failed:", e);
  }
  return null;
}

export async function createBulkTasks(
  supabase: any,
  tasks: BulkParsedTask[],
  userId: string,
  groupId: string | null,
  members: Member[],
): Promise<BulkTaskResult[]> {
  const results: BulkTaskResult[] = [];
  const now = new Date();
  const memberById = new Map(members.map((m) => [m.id, m]));

  for (const task of tasks) {
    const taskData: Record<string, any> = {
      title: task.title.substring(0, 500),
      user_id: userId,
      start_at: new Date().toISOString(),
    };
    if (groupId) taskData.group_id = groupId;
    if (task.priority) taskData.priority = task.priority;

    let deadlineStr: string | undefined;
    if (task.deadline_date) {
      taskData.deadline = new Date(task.deadline_date + "T23:59:00").toISOString();
      deadlineStr = task.deadline_date;
    } else if (task.deadline_days && task.deadline_days > 0) {
      const d = new Date(now);
      d.setDate(d.getDate() + task.deadline_days);
      d.setHours(23, 59, 0, 0);
      taskData.deadline = d.toISOString();
      deadlineStr = formatDate(d);
    }

    let assigneeName: string | undefined;
    if (task.assigned_to_id && memberById.has(task.assigned_to_id)) {
      const m = memberById.get(task.assigned_to_id)!;
      taskData.assigned_to = m.id;
      assigneeName = m.name;
    } else if (task.assigned_to_name && members.length > 0) {
      const res = resolveMemberDetailed(task.assigned_to_name, members);
      if (res.member) {
        taskData.assigned_to = res.member.id;
        assigneeName = res.member.name;
        console.log(`[assignee] по имени из AI "${task.assigned_to_name}" → ${res.member.name} (стратегия: ${res.matchedBy})`);
      } else {
        console.warn(`[assignee] имя из AI "${task.assigned_to_name}" не сопоставлено: ${res.reason}`);
      }
    } else if (task.assigned_to_id && !memberById.has(task.assigned_to_id)) {
      console.warn(`[assignee] AI вернул id "${task.assigned_to_id}", которого нет среди участников задачи "${task.title}"`);
    }

    const { data: newTask, error } = await supabase.from("tasks").insert(taskData).select("id").single();
    if (error || !newTask) {
      console.error("Bulk task creation error:", error);
      continue;
    }

    if (taskData.assigned_to && taskData.assigned_to !== userId) {
      await supabase.from("task_participants").insert({ task_id: newTask.id, user_id: taskData.assigned_to, role: "assignee" });
    }

    const resolvedParticipantNames: string[] = [];
    const seenIds = new Set<string>();
    if (taskData.assigned_to) seenIds.add(taskData.assigned_to);
    if (task.participant_ids && task.participant_ids.length > 0) {
      for (const pid of task.participant_ids) {
        if (seenIds.has(pid) || pid === userId) continue;
        const m = memberById.get(pid);
        if (!m) continue;
        await supabase.from("task_participants").insert({ task_id: newTask.id, user_id: m.id, role: "participant" });
        resolvedParticipantNames.push(m.name);
        seenIds.add(m.id);
      }
    }
    if (task.participant_names && task.participant_names.length > 0 && members.length > 0) {
      for (const pName of task.participant_names) {
        const match = findMemberByName(pName, members);
        if (match && !seenIds.has(match.id) && match.id !== userId) {
          await supabase.from("task_participants").insert({ task_id: newTask.id, user_id: match.id, role: "participant" });
          resolvedParticipantNames.push(match.name);
          seenIds.add(match.id);
        }
      }
    }

    let subtaskCount = 0;
    if (task.subtasks && task.subtasks.length > 0) {
      for (let i = 0; i < task.subtasks.length; i++) {
        await supabase.from("subtasks").insert({ task_id: newTask.id, title: task.subtasks[i], position: i });
      }
      subtaskCount = task.subtasks.length;
    }

    results.push({
      title: task.title.substring(0, 60),
      assignee: assigneeName,
      participants: resolvedParticipantNames.length > 0 ? resolvedParticipantNames : undefined,
      deadline: deadlineStr,
      subtaskCount: subtaskCount || undefined,
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Shared command handler
// ---------------------------------------------------------------------------

const HELP_TEXT =
  "📖 *JustTODOit (JTD)*\n\n" +
  "📂 `/projects` — список проектов\n" +
  "👤 `/my` — мои открытые задачи\n" +
  "📋 `/tasks Проект` — задачи проекта\n" +
  "✅ `/done N` — выполнить задачу №N из списка\n" +
  "📦 `/spisok` Проект + список — пакетное создание\n\n" +
  "💡 Можно просто прислать список задач текстом — я разберу их сам.\n" +
  "💡 Под списком задач есть кнопки ✅ — нажмите, чтобы выполнить.\n" +
  "В тексте: `@имя` — ответственный, `завтра`/`15.03`/`3д` — срок.";

/**
 * Mark a task complete. Returns the task title, or null if it was not found
 * or already completed. The caller is responsible for access scoping (ids come
 * from a list that was already shown to the authorized user).
 */
export async function completeTask(supabase: any, taskId: string): Promise<string | null> {
  const { data: task } = await supabase
    .from("tasks")
    .select("id, title, is_completed")
    .eq("id", taskId)
    .maybeSingle();
  if (!task || task.is_completed) return null;
  const { error } = await supabase
    .from("tasks")
    .update({ is_completed: true, completed_at: new Date().toISOString() })
    .eq("id", taskId);
  if (error) return null;
  return task.title as string;
}

/** Assign a task to `userId` and ensure they are a participant. */
export async function assignSelf(supabase: any, taskId: string, userId: string): Promise<boolean> {
  const { data: task } = await supabase.from("tasks").select("id").eq("id", taskId).maybeSingle();
  if (!task) return false;
  const { error } = await supabase.from("tasks").update({ assigned_to: userId }).eq("id", taskId);
  if (error) return false;
  const { data: existing } = await supabase
    .from("task_participants")
    .select("id")
    .eq("task_id", taskId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!existing) {
    await supabase.from("task_participants").insert({ task_id: taskId, user_id: userId, role: "assignee" });
  }
  return true;
}

/**
 * Handle an inline-button payload (e.g. `done:<uuid>`, `assign:<uuid>`).
 * Returns a short notification string for the channel to acknowledge with.
 */
export async function handleCorePayload(opts: {
  supabase: any;
  userId: string;
  payload: string;
}): Promise<string> {
  const { supabase, userId, payload } = opts;
  const sep = payload.indexOf(":");
  const action = sep >= 0 ? payload.slice(0, sep) : payload;
  const id = sep >= 0 ? payload.slice(sep + 1) : "";

  if (action === "done" && id) {
    const title = await completeTask(supabase, id);
    return title ? `✅ ${title.substring(0, 40)}` : "❌ Задача не найдена или уже выполнена";
  }
  if (action === "assign" && id) {
    const ok = await assignSelf(supabase, id, userId);
    return ok ? "👤 Назначено на вас" : "❌ Не удалось назначить";
  }
  return "🤷";
}

/**
 * Handle a transport-neutral command. Returns true if it consumed the input.
 * `userId` is the resolved JTD profile id. `transport` sends replies.
 */
export async function handleCoreCommand(opts: {
  supabase: any;
  transport: MessengerTransport;
  userId: string;
  command: string;
  args: string;
  /** Persist the ordered task ids of the last shown list (for `/done N`). */
  saveList?: (taskIds: string[]) => Promise<void>;
  /** Load the ordered task ids of the last shown list (for `/done N`). */
  loadList?: () => Promise<string[] | null>;
}): Promise<boolean> {
  const { supabase, transport, userId, command, args, saveList, loadList } = opts;

  if (command === "help" || command === "start") {
    await transport.send(HELP_TEXT);
    return true;
  }

  if (command === "projects") {
    const groups = await getUserProjects(supabase, userId);
    if (groups.length === 0) {
      await transport.send("📂 У вас нет проектов.");
    } else {
      let text = "📂 *Доступные проекты:*\n\n";
      groups.forEach((g) => { text += `${g.icon || "📁"} ${g.name}\n`; });
      text += "\nЗадачи проекта: `/tasks Название`";
      await transport.send(text);
    }
    return true;
  }

  if (command === "my") {
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, title, deadline, is_important, group_id")
      .eq("is_completed", false)
      .or(`user_id.eq.${userId},assigned_to.eq.${userId}`)
      .order("deadline", { ascending: true, nullsFirst: false })
      .limit(30);

    if (!tasks || tasks.length === 0) {
      await transport.send("👤 У вас нет открытых задач 🎉");
      return true;
    }
    let text = "👤 *Мои задачи:*\n\n";
    tasks.forEach((t: any, i: number) => {
      const imp = t.is_important ? "⭐ " : "";
      const dl = t.deadline ? ` 📅 ${formatDate(new Date(t.deadline))}` : "";
      text += `${i + 1}. ${imp}${t.title.substring(0, 60)}${dl}\n`;
    });
    text += "\n✅ Выполнить: кнопки ниже или `/done N`";
    if (saveList) await saveList(tasks.map((t: any) => t.id));
    if (transport.sendWithButtons) {
      // Pack the number buttons into a compact grid (5 per row) so a long
      // list does not become a tall wall of one-button rows.
      const flat: InlineButton[] = tasks.map((t: any, i: number) => ({
        text: `✅ ${i + 1}`,
        payload: `done:${t.id}`,
      }));
      await transport.sendWithButtons(text, chunkButtons(flat, 5));
    } else {
      await transport.send(text);
    }
    return true;
  }

  if (command === "done") {
    const nums = args
      .split(/[\s,]+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => !isNaN(n) && n > 0);
    if (nums.length === 0) {
      await transport.send("✅ Формат: `/done 2` (номер задачи из `/my` или `/tasks`). Можно несколько: `/done 1 3`.");
      return true;
    }
    const ids = loadList ? await loadList() : null;
    if (!ids || ids.length === 0) {
      await transport.send("❌ Сначала покажите список: `/my` или `/tasks Проект`, затем `/done N`.");
      return true;
    }
    const done: string[] = [];
    const failed: number[] = [];
    for (const n of nums) {
      const id = ids[n - 1];
      if (!id) { failed.push(n); continue; }
      const title = await completeTask(supabase, id);
      if (title) done.push(title.substring(0, 60)); else failed.push(n);
    }
    let msg = "";
    if (done.length) msg += `✅ Выполнено:\n${done.map((t) => `• ${t}`).join("\n")}`;
    if (failed.length) msg += `${msg ? "\n\n" : ""}❌ Не найдено/уже выполнено: ${failed.join(", ")}`;
    await transport.send(msg || "Нечего выполнять.");
    return true;
  }

  if (command === "tasks") {
    const name = args.trim();
    if (!name) {
      await transport.send("📋 Формат: `/tasks Название проекта`");
      return true;
    }
    const group = await findProject(supabase, userId, name);
    if (!group) {
      await transport.send(`❌ Проект «${name}» не найден. Список: \`/projects\``);
      return true;
    }
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, title, deadline, assigned_to, is_important")
      .eq("group_id", group.id)
      .eq("is_completed", false)
      .order("position")
      .limit(20);

    if (!tasks || tasks.length === 0) {
      await transport.send(`📋 Нет открытых задач в ${group.icon || "📁"} ${group.name}`);
      return true;
    }
    const assigneeIds = [...new Set(tasks.filter((t: any) => t.assigned_to).map((t: any) => t.assigned_to))];
    const nameMap = new Map<string, string>();
    if (assigneeIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, telegram_username")
        .in("id", assigneeIds);
      if (profiles) profiles.forEach((p: any) => nameMap.set(p.id, p.display_name || (p.telegram_username ? `@${p.telegram_username}` : "")));
    }
    let text = `📋 *${group.name}* — задачи:\n\n`;
    tasks.forEach((t: any, i: number) => {
      const imp = t.is_important ? "⭐ " : "";
      const dl = t.deadline ? ` 📅 ${formatDate(new Date(t.deadline))}` : "";
      const who = t.assigned_to && nameMap.get(t.assigned_to) ? ` 👤 ${nameMap.get(t.assigned_to)}` : "";
      text += `${i + 1}. ${imp}${t.title.substring(0, 60)}${dl}${who}\n`;
    });
    text += "\n✅ Выполнить / 👤 взять: кнопки ниже или `/done N`";
    if (saveList) await saveList(tasks.map((t: any) => t.id));
    if (transport.sendWithButtons) {
      const buttons: InlineButton[][] = tasks.map((t: any, i: number) => [
        { text: `✅ ${i + 1}`, payload: `done:${t.id}` },
        { text: `👤 ${i + 1} взять`, payload: `assign:${t.id}` },
      ]);
      await transport.sendWithButtons(text, buttons);
    } else {
      await transport.send(text);
    }
    return true;
  }

  return false;
}

/**
 * Parse free-form text (optionally a `/spisok`/`/s` body) into tasks and
 * create them. Detects a project name on the first line. Used for bulk creation
 * from any channel. Returns true if it produced a reply.
 */
export async function handleBulkText(opts: {
  supabase: any;
  transport: MessengerTransport;
  userId: string;
  text: string;
}): Promise<boolean> {
  const { supabase, transport, userId, text } = opts;
  const raw = text.replace(/^\/(spisok|s|t|p|d)\s*/i, "").trim();
  if (!raw) {
    await transport.send(
      "📦 *Пакетное создание задач*\n\n" +
      "Пришлите список задач. Чтобы привязать к проекту, укажите его название первой строкой:\n\n" +
      "`Маркетинг`\n`- сверстать баннер @Маша завтра`\n`- согласовать бюджет 15.03`",
    );
    return true;
  }

  let groupId: string | null = null;
  let groupName: string | null = null;
  let bulkText = raw;

  const firstLine = raw.split("\n")[0].trim();
  const restText = raw.substring(firstLine.length).trim();
  if (!firstLine.startsWith("-") && !firstLine.startsWith("•") && !firstLine.startsWith("*") && !/^\d+[\.\)]/.test(firstLine)) {
    const group = await findProject(supabase, userId, firstLine);
    if (group) {
      groupId = group.id;
      groupName = group.name;
      bulkText = restText || firstLine; // if only a project name, fall through with original
      if (!restText) {
        await transport.send(`📦 Проект: ${groupName}\n\nТеперь пришлите список задач.`);
        return true;
      }
    }
  }

  // Always make the user's whole team available for assignee matching — a
  // project may have few formal members, yet you still want to assign a
  // teammate who isn't a member of that project (access is handled via
  // assigned_to + task_participants). Project members are merged first so they
  // keep priority during name resolution.
  const teamMembers = await getTeamMembers(supabase, userId);
  let members: Member[] = teamMembers;
  if (groupId) {
    const ownerId =
      (await supabase.from("task_groups").select("user_id").eq("id", groupId).single()).data?.user_id || userId;
    const projectMembers = await getProjectMembers(supabase, groupId, ownerId);
    const seen = new Set<string>();
    members = [];
    for (const m of [...projectMembers, ...teamMembers]) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      members.push(m);
    }
  }
  console.log(`[assignee] Пул участников для разбора: ${members.length} (проект: ${groupName || "Inbox"})`);

  const parsed = await aiBulkParse(bulkText, members, groupName || undefined);
  if (!parsed || parsed.length === 0) {
    await transport.send("❌ Не удалось распознать задачи. Попробуйте переформулировать.");
    return true;
  }

  const parsedWithAssignees = applyAssigneeFallbacks(parsed, bulkText, members, userId);
  const results = await createBulkTasks(supabase, parsedWithAssignees, userId, groupId, members);
  const lines = results.map((r, i) =>
    `${i + 1}. ✅ ${r.title}${r.assignee ? ` 👤 ${r.assignee}` : ""}${r.participants?.length ? ` 👥 ${r.participants.join(", ")}` : ""}${r.deadline ? ` 📅 ${r.deadline}` : ""}${r.subtaskCount ? ` 📋${r.subtaskCount}` : ""}`,
  );
  const projectInfo = groupName ? ` в 📁 ${groupName}` : "";
  await transport.send(`📦 Создано ${results.length} ${pluralizeRu(results.length, ["задача", "задачи", "задач"])}${projectInfo}:\n\n${lines.join("\n")}`);
  return true;
}
