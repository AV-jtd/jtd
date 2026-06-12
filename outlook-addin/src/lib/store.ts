import type { EmailItem } from "./types";

const STORE_KEY = "jtd_mail_store";
const MAX_EMAILS = 500;

function load(): EmailItem[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as EmailItem[]) : [];
  } catch {
    return [];
  }
}

function save(emails: EmailItem[]): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(emails));
}

export function getAll(): EmailItem[] {
  return load();
}

export function upsert(email: EmailItem): { isNew: boolean } {
  const all = load();
  const idx = all.findIndex((e) => e.id === email.id);
  if (idx >= 0) {
    all[idx] = email;
    save(all);
    return { isNew: false };
  }
  // Keep newest at front, cap at MAX_EMAILS
  const updated = [email, ...all].slice(0, MAX_EMAILS);
  save(updated);
  return { isNew: true };
}

export function getToday(): EmailItem[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return load().filter((e) => new Date(e.dateReceived) >= start);
}

export function getLast(days: number): EmailItem[] {
  const start = new Date();
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return load().filter((e) => new Date(e.dateReceived) >= start);
}

export function clear(): void {
  localStorage.removeItem(STORE_KEY);
}

export function stats(): { total: number; today: number; oldestDate: string | null } {
  const all = load();
  const today = getToday();
  const oldest = all.length
    ? all.reduce((min, e) =>
        new Date(e.dateReceived) < new Date(min) ? e.dateReceived : min,
        all[0].dateReceived
      )
    : null;
  return { total: all.length, today: today.length, oldestDate: oldest };
}
