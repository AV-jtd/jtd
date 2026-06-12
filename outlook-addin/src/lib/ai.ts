import type {
  AiAnalysis,
  Category,
  DaySummary,
  EmailItem,
  PersonDossier,
  PromisesReport,
  Thread,
} from "./types";
import { putEmails } from "./db";

const PROXY_BASE = import.meta.env.VITE_PROXY_URL || "http://localhost:3000";

async function callAi<T>(payload: object): Promise<T> {
  const res = await fetch(`${PROXY_BASE}/api/ai/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI API ${res.status}: ${text.substring(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ── Категоризация ────────────────────────────────────────────────────────────

const CATEGORISE_BATCH = 50;

interface CategoriseResult {
  categories: { id: string; category: Category; priority: "low" | "medium" | "high"; gist: string }[];
}

export type CategoriseProgress = (done: number, total: number) => void;

/**
 * Категоризирует письма батчами по 50 (дешёвой моделью),
 * результат сразу пишется в IndexedDB.
 */
export async function categoriseEmails(
  emails: EmailItem[],
  onProgress: CategoriseProgress
): Promise<void> {
  // Используем короткие индексы вместо длинных EWS-id — экономим токены
  for (let i = 0; i < emails.length; i += CATEGORISE_BATCH) {
    const batch = emails.slice(i, i + CATEGORISE_BATCH);
    const cards = batch.map((e, idx) => ({
      id: String(idx),
      subject: e.subject.substring(0, 100),
      from: e.fromName || e.from,
      date: e.dateReceived.substring(0, 10),
      gist: e.body.substring(0, 100).replace(/\s+/g, " "),
    }));

    const result = await callAi<CategoriseResult>({ type: "categorise", data: cards });

    const updated: EmailItem[] = [];
    for (const c of result.categories || []) {
      const email = batch[Number(c.id)];
      if (!email) continue;
      updated.push({ ...email, category: c.category, aiPriority: c.priority, gist: c.gist });
    }
    if (updated.length) await putEmails(updated);
    onProgress(Math.min(i + CATEGORISE_BATCH, emails.length), emails.length);
  }
}

// ── Точечные анализы ─────────────────────────────────────────────────────────

export async function analyzeEmail(email: EmailItem): Promise<AiAnalysis> {
  return callAi<AiAnalysis>({
    type: "email",
    data: {
      subject: email.subject,
      from: email.fromName || email.from,
      body: email.body,
      date: email.dateReceived,
    },
  });
}

export async function analyzeThread(thread: Thread): Promise<AiAnalysis> {
  return callAi<AiAnalysis>({
    type: "thread",
    data: {
      subject: thread.subject,
      participants: thread.participants,
      emails: thread.emails.map((e) => ({
        from: e.fromName || e.from,
        date: e.dateReceived,
        body: e.body.substring(0, 400),
      })),
    },
  });
}

export async function buildDaySummary(emails: EmailItem[]): Promise<DaySummary> {
  const threadMap = new Map<string, EmailItem[]>();
  for (const e of emails) {
    const arr = threadMap.get(e.conversationId) || [];
    arr.push(e);
    threadMap.set(e.conversationId, arr);
  }

  const topThreads = [...threadMap.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10)
    .map(([, items]) => ({
      subject: items[0].subject,
      count: items.length,
      emails: items.map((e) => ({
        from: e.fromName || e.from,
        gist: e.gist || e.body.substring(0, 150),
      })),
    }));

  const peopleMap = new Map<string, { name: string; count: number }>();
  for (const e of emails) {
    const key = e.from.toLowerCase();
    const ex = peopleMap.get(key) || { name: e.fromName || e.from, count: 0 };
    peopleMap.set(key, { ...ex, count: ex.count + 1 });
  }
  const topPeople = [...peopleMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([email, { name, count }]) => ({ email, name, count }));

  return callAi<DaySummary>({
    type: "day_summary",
    data: {
      totalEmails: emails.length,
      unreadCount: emails.filter((e) => !e.isRead).length,
      topThreads,
      topPeople,
      sampleBodies: emails
        .filter((e) => !e.isRead)
        .slice(0, 20)
        .map((e) => ({
          subject: e.subject,
          from: e.fromName,
          gist: e.gist || e.body.substring(0, 200),
        })),
    },
  });
}

// ── Обещания и зависшие вопросы ──────────────────────────────────────────────

export async function findPromises(threads: Thread[]): Promise<PromisesReport> {
  const payload = threads.slice(0, 15).map((t) => ({
    subject: t.subject,
    participants: t.participants,
    emails: t.emails.slice(0, 10).map((e) => ({
      from: e.fromName || e.from,
      date: e.dateReceived.substring(0, 10),
      body: e.body.substring(0, 300),
    })),
  }));
  return callAi<PromisesReport>({ type: "promises", data: payload });
}

// ── Досье по человеку ────────────────────────────────────────────────────────

export async function buildPersonDossier(
  name: string,
  email: string,
  emails: EmailItem[]
): Promise<PersonDossier> {
  return callAi<PersonDossier>({
    type: "person_dossier",
    data: {
      name,
      email,
      emails: emails.slice(0, 30).map((e) => ({
        subject: e.subject,
        from: e.fromName || e.from,
        date: e.dateReceived.substring(0, 10),
        body: e.body.substring(0, 300),
      })),
    },
  });
}
