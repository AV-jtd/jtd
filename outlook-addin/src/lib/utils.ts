import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function formatDateFull(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function groupByConversation(emails: import("./types").EmailItem[]): import("./types").Thread[] {
  const map = new Map<string, import("./types").EmailItem[]>();
  for (const e of emails) {
    const arr = map.get(e.conversationId) || [];
    arr.push(e);
    map.set(e.conversationId, arr);
  }

  return [...map.entries()].map(([conversationId, items]) => {
    const sorted = items.sort(
      (a, b) => new Date(b.dateReceived).getTime() - new Date(a.dateReceived).getTime()
    );
    const participants = [...new Set(items.map((e) => e.fromName || e.from))];
    return {
      conversationId,
      subject: sorted[0].subject,
      participants,
      emails: sorted,
      latestDate: sorted[0].dateReceived,
      unreadCount: items.filter((e) => !e.isRead).length,
    };
  }).sort((a, b) => new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime());
}
