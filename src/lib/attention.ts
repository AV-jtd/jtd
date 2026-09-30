import { differenceInCalendarDays, parseISO, startOfDay } from "date-fns";

/**
 * Раскладка «что горит» по срочности.
 *
 * Зачем отдельный модуль. Почти все инструменты коннектора требуют назвать
 * проект, а человеческий вопрос звучит иначе: «что горит на этой неделе» — без
 * уточнений и сразу по всему. Раскладка простая, но её легко сделать
 * неправильно двумя способами, и оба тихие.
 *
 * Первый: считать просрочку по времени, а не по дню. Задача со сроком «сегодня
 * в 10:00» в 18:00 формально просрочена, но человек справедливо считает её
 * сегодняшней, а не сорванной. Сравниваем календарные дни — как весь остальной
 * счёт в проекте (решение владельца про календарные дни).
 *
 * Второй: молча сваливать «нет срока» в «не горит». Задача без срока не
 * срочная, но и не спокойная: чаще всего это забытая задача. Поэтому она
 * попадает в отдельную корзину, а не исчезает.
 */

export type AttentionTask = {
  id: string;
  title: string;
  deadline: string | null;
  project_name?: string | null;
  assignee_name?: string | null;
};

export type Bucketed = {
  /** Срок прошёл: дней просрочки, самые давние первыми. */
  overdue: Array<AttentionTask & { days: number }>;
  /** Срок сегодня. */
  today: AttentionTask[];
  /** Срок в пределах горизонта. */
  soon: Array<AttentionTask & { days: number }>;
  /** Позже горизонта — в ответ не идут, только числом. */
  later: number;
  /** Без срока: не срочные, но и не спокойные. */
  undated: AttentionTask[];
};

export function bucketByUrgency(tasks: AttentionTask[], horizonDays: number, now: Date = new Date()): Bucketed {
  const today = startOfDay(now);
  const out: Bucketed = { overdue: [], today: [], soon: [], later: 0, undated: [] };

  for (const t of tasks) {
    if (!t.deadline) {
      out.undated.push(t);
      continue;
    }
    const due = startOfDay(parseISO(t.deadline));
    const days = differenceInCalendarDays(due, today);
    if (days < 0) out.overdue.push({ ...t, days: -days });
    else if (days === 0) out.today.push(t);
    else if (days <= horizonDays) out.soon.push({ ...t, days });
    else out.later++;
  }

  out.overdue.sort((a, b) => b.days - a.days);
  out.soon.sort((a, b) => a.days - b.days);
  return out;
}

export type AttentionMilestone = {
  id: string;
  name: string;
  planned_date: string | null;
  actual_date: string | null;
  project_name?: string | null;
};

/**
 * Вехи, требующие внимания: план прошёл, а отметки о достижении нет, либо план
 * наступает в пределах горизонта. Достигнутые не возвращаются вовсе — они уже
 * не про будущее.
 */
export function milestonesAtRisk(
  milestones: AttentionMilestone[],
  horizonDays: number,
  now: Date = new Date(),
): Array<AttentionMilestone & { days: number; missed: boolean }> {
  const today = startOfDay(now);
  const out: Array<AttentionMilestone & { days: number; missed: boolean }> = [];
  for (const m of milestones) {
    if (m.actual_date || !m.planned_date) continue;
    const days = differenceInCalendarDays(startOfDay(parseISO(m.planned_date)), today);
    if (days < 0) out.push({ ...m, days: -days, missed: true });
    else if (days <= horizonDays) out.push({ ...m, days, missed: false });
  }
  // Пропущенные важнее приближающихся, среди пропущенных — самые давние.
  out.sort((a, b) => Number(b.missed) - Number(a.missed) || b.days - a.days);
  return out;
}
