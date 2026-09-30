// Текст еженедельного отчёта по проекту: задания по людям, а не сводка цифр.
//
// Решение владельца 30.09.2026. Прежний отчёт был взглядом наблюдателя —
// сколько просрочено, дельты, пять самых давних, строка «✅3 · 🔄12 · ⚠️5» на
// человека, ИИ-резюме. Всё верно, но не отвечало на вопрос «кому что сделать».
// Образец — сообщение с заданиями, отправленное в «Продажи мечты» 30.09.
//
// Порядок: сначала блок на каждого, у кого что-то горит (с @, чтобы увидел),
// потом ничьи задачи, потом закрытое за неделю по именам, цифры — одной строкой
// внизу. У кого ничего не горит — того в отчёте нет. ИИ-резюме убрано: пересказ
// цифр задания не добавляет.
//
// Чистая функция без базы и сети — проверяется тестом
// (src/test/weeklyGroupReport.test.ts).

import { daysLate } from "./reportFormat.ts";

export interface ReportTask {
  id: string;
  title: string;
  is_completed: boolean;
  deadline: string | null;
  assigned_to: string | null;
  completed_at: string | null;
}

export interface ReportPerson {
  name: string;
  telegram_username?: string | null;
}

export interface WeeklyReportInput {
  projectName: string;
  projectUrl: string;
  tasks: ReportTask[];
  people: Record<string, ReportPerson>;
  /** Начало сегодняшних суток по Москве: граница «просрочено». */
  dayStart: Date;
  /** Срок заданий — пятница следующей недели, конец суток. */
  dueBy: Date;
  /** Начало окна «закрыто за неделю». */
  weekAgo: Date;
  /** Число просроченных в прошлом отчёте, если он был. */
  prevOverdue?: number;
}

const PER_PERSON = 5;
const UNASSIGNED_MAX = 8;
const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** «пт 09.10» — по московскому времени. */
export function shortDay(d: Date): string {
  const m = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
  const dd = String(m.getDate()).padStart(2, "0");
  const mm = String(m.getMonth() + 1).padStart(2, "0");
  return `${WEEKDAYS[m.getDay()]} ${dd}.${mm}`;
}

function who(p: ReportPerson | undefined): string {
  if (!p) return "Без имени";
  const u = p.telegram_username?.trim().replace(/^@/, "");
  return u ? `${escapeHtml(p.name)} @${escapeHtml(u)}` : escapeHtml(p.name);
}

const t0 = (s: string | null) => (s ? new Date(s).getTime() : Number.POSITIVE_INFINITY);

export function buildWeeklyGroupReport(i: WeeklyReportInput): string {
  const open = i.tasks.filter((t) => !t.is_completed);
  const isOverdue = (t: ReportTask) => !!t.deadline && new Date(t.deadline) < i.dayStart;
  const isDueSoon = (t: ReportTask) =>
    !!t.deadline && new Date(t.deadline) >= i.dayStart && new Date(t.deadline) <= i.dueBy;

  // Самые давние сверху: висящее три месяца важнее вчерашнего.
  const overdue = open.filter(isOverdue).sort((a, b) => t0(a.deadline) - t0(b.deadline));
  const dueSoon = open.filter(isDueSoon).sort((a, b) => t0(a.deadline) - t0(b.deadline));
  const ahead = open.filter((t) => t.deadline && new Date(t.deadline) >= i.dayStart).length;

  const due = shortDay(i.dueBy);
  const lines: string[] = [`📋 <b>${escapeHtml(i.projectName)} — задания до ${due}</b>`];

  // ---- по людям ----
  const byPerson = new Map<string, { overdue: ReportTask[]; soon: ReportTask[] }>();
  for (const t of [...overdue, ...dueSoon]) {
    if (!t.assigned_to) continue;
    const e = byPerson.get(t.assigned_to) ?? { overdue: [], soon: [] };
    (isOverdue(t) ? e.overdue : e.soon).push(t);
    byPerson.set(t.assigned_to, e);
  }
  const persons = [...byPerson.entries()].sort(
    ([, a], [, b]) => b.overdue.length - a.overdue.length || b.soon.length - a.soon.length,
  );

  if (persons.length > 0) {
    lines.push(
      "",
      `По каждой задаче в JTD: ✅ закрыть, если сделано · 📅 реальный срок в поле срока · ❌ отменить, если неактуально.`,
    );
  }
  for (const [id, e] of persons) {
    lines.push("", `👤 <b>${who(i.people[id])}</b>`);
    if (e.overdue.length > 0) {
      lines.push(`⚠️ Просрочено ${e.overdue.length}:`);
      for (const t of e.overdue.slice(0, PER_PERSON)) {
        lines.push(`  • ${escapeHtml(t.title)} (${daysLate(t.deadline!, i.dayStart)} дн.)`);
      }
      if (e.overdue.length > PER_PERSON) lines.push(`  … и ещё ${e.overdue.length - PER_PERSON}`);
    }
    if (e.soon.length > 0) {
      lines.push(`📅 До ${due}:`);
      for (const t of e.soon.slice(0, PER_PERSON)) {
        lines.push(`  • ${escapeHtml(t.title)} — ${shortDay(new Date(t.deadline!))}`);
      }
      if (e.soon.length > PER_PERSON) lines.push(`  … и ещё ${e.soon.length - PER_PERSON}`);
    }
  }

  // ---- ничьи ----
  const unassigned = [...overdue, ...dueSoon].filter((t) => !t.assigned_to);
  if (unassigned.length > 0) {
    lines.push("", `👤 <b>Без исполнителя — назначить до ${due}:</b>`);
    for (const t of unassigned.slice(0, UNASSIGNED_MAX)) {
      const tail = isOverdue(t)
        ? `просрочено ${daysLate(t.deadline!, i.dayStart)} дн.`
        : `срок ${shortDay(new Date(t.deadline!))}`;
      lines.push(`  • ${escapeHtml(t.title)} (${tail})`);
    }
    if (unassigned.length > UNASSIGNED_MAX) lines.push(`  … и ещё ${unassigned.length - UNASSIGNED_MAX}`);
  }

  if (persons.length === 0 && unassigned.length === 0) {
    lines.push("", `Просроченного и горящего на неделе нет 👍`);
  }

  // ---- закрыто за неделю, по именам ----
  const doneBy = new Map<string, number>();
  for (const t of i.tasks) {
    if (t.is_completed && t.assigned_to && t.completed_at && new Date(t.completed_at) >= i.weekAgo) {
      doneBy.set(t.assigned_to, (doneBy.get(t.assigned_to) ?? 0) + 1);
    }
  }
  if (doneBy.size > 0) {
    const list = [...doneBy.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => `${escapeHtml(i.people[id]?.name ?? "Без имени")} — ${n}`)
      .join(", ");
    lines.push("", `✅ За неделю закрыли: ${list}`);
  }

  // ---- цифры одной строкой ----
  let d = "";
  if (i.prevOverdue !== undefined && i.prevOverdue !== overdue.length) {
    const diff = overdue.length - i.prevOverdue;
    d = ` (${diff > 0 ? "+" : "−"}${Math.abs(diff)} за неделю)`;
  }
  lines.push(
    "",
    `<i>Открыто ${open.length} · просрочено ${overdue.length}${d} · вперёд расписано ${ahead}</i>`,
    `<a href="${i.projectUrl}">Открыть проект в JTD →</a>`,
  );
  return lines.join("\n");
}
