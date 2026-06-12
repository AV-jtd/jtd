import type { AiAnalysis, DaySummary, EmailItem, Thread } from "./types";

const PROXY_BASE = import.meta.env.VITE_PROXY_URL || "http://localhost:3001";

async function callAi(payload: object): Promise<unknown> {
  const res = await fetch(`${PROXY_BASE}/api/ai/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`AI API error: ${res.status}`);
  return res.json();
}

export async function analyzeEmail(email: EmailItem): Promise<AiAnalysis> {
  return callAi({
    type: "email",
    data: {
      subject: email.subject,
      from: email.fromName || email.from,
      body: email.body,
      date: email.dateReceived,
    },
  }) as Promise<AiAnalysis>;
}

export async function analyzeThread(thread: Thread): Promise<AiAnalysis> {
  return callAi({
    type: "thread",
    data: {
      subject: thread.subject,
      participants: thread.participants,
      emails: thread.emails.map((e) => ({
        from: e.fromName || e.from,
        date: e.dateReceived,
        body: e.body.substring(0, 500),
      })),
    },
  }) as Promise<AiAnalysis>;
}

export async function buildDaySummary(emails: EmailItem[]): Promise<DaySummary> {
  // Group by conversation for threads count
  const threadMap = new Map<string, EmailItem[]>();
  for (const e of emails) {
    const arr = threadMap.get(e.conversationId) || [];
    arr.push(e);
    threadMap.set(e.conversationId, arr);
  }

  const topThreadsRaw = [...threadMap.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10)
    .map(([, items]) => ({
      subject: items[0].subject,
      count: items.length,
      emails: items.map((e) => ({
        from: e.fromName || e.from,
        body: e.body.substring(0, 200),
      })),
    }));

  const peopleMap = new Map<string, { name: string; count: number }>();
  for (const e of emails) {
    const key = e.from.toLowerCase();
    const existing = peopleMap.get(key) || { name: e.fromName || e.from, count: 0 };
    peopleMap.set(key, { ...existing, count: existing.count + 1 });
  }
  const topPeopleRaw = [...peopleMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([email, { name, count }]) => ({ email, name, count }));

  return callAi({
    type: "day_summary",
    data: {
      totalEmails: emails.length,
      unreadCount: emails.filter((e) => !e.isRead).length,
      topThreads: topThreadsRaw,
      topPeople: topPeopleRaw,
      sampleBodies: emails
        .filter((e) => !e.isRead)
        .slice(0, 20)
        .map((e) => ({ subject: e.subject, from: e.fromName, body: e.body.substring(0, 300) })),
    },
  }) as Promise<DaySummary>;
}
