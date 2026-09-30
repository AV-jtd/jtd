import { differenceInCalendarDays, parseISO } from "date-fns";

/**
 * Загрузка людей по датам плана.
 *
 * Отвечает на «кого мы перегрузили этим планом»: сколько задач у человека
 * попадает в окно, сколько из них идёт одновременно в самый плотный день и
 * сколько уже просрочено.
 *
 * ЧЕГО ЗДЕСЬ НЕТ, И ЭТО ГЛАВНОЕ. В JustTODOit не хранится ни оценка
 * трудоёмкости, ни доля занятости — только даты. Значит «загрузка» здесь может
 * означать лишь ЧИСЛО ОДНОВРЕМЕННЫХ ЗАДАЧ, а не часы и не проценты. Задача «на
 * два часа» и задача «на месяц» считаются одинаково. Выдавать по такому входу
 * проценты занятости — значит придумать точность, которой нет; отсюда и
 * название `concurrent_tasks`, а не «загрузка, %».
 *
 * Дни календарные — как везде в расчётах Ганта (решение владельца 30.09).
 */

export type WorkloadTask = {
  id: string;
  title: string;
  assignee_id: string | null;
  start: string | null;
  end: string | null;
  is_completed?: boolean | null;
};

export type PersonLoad = {
  assignee_id: string;
  tasks_in_window: number;
  /** Самое большое число задач, идущих одновременно, и когда именно. */
  peak_concurrent: number;
  peak_day: string | null;
  overdue: number;
  /** Задачи без срока: в расчёт плотности не входят, но человек про них помнит. */
  undated: number;
};

export type WorkloadResult = {
  from: string;
  to: string;
  people: PersonLoad[];
  /** Задачи, у которых нет исполнителя: чья это загрузка — неизвестно. */
  unassigned: number;
  skipped_no_dates: number;
};

const DAY = 86400000;

export function computeWorkload(
  tasks: WorkloadTask[],
  windowFrom: string,
  windowTo: string,
  now: Date = new Date(),
): WorkloadResult {
  const from = parseISO(windowFrom).getTime();
  const to = parseISO(windowTo).getTime();

  const byPerson = new Map<string, WorkloadTask[]>();
  let unassigned = 0;
  let skipped = 0;

  for (const t of tasks) {
    if (t.is_completed) continue; // выполненная задача ничью неделю не занимает
    if (!t.assignee_id) {
      unassigned++;
      continue;
    }
    // Отрезок задачи: начало есть — от него, нет — задача считается точкой в
    // день срока. Без срока места на шкале нет.
    if (!t.end) {
      skipped++;
      if (!byPerson.has(t.assignee_id)) byPerson.set(t.assignee_id, []);
      byPerson.get(t.assignee_id)!.push(t);
      continue;
    }
    const start = t.start ? parseISO(t.start).getTime() : parseISO(t.end).getTime();
    const end = parseISO(t.end).getTime();
    if (end < from || start > to) continue; // вне окна
    if (!byPerson.has(t.assignee_id)) byPerson.set(t.assignee_id, []);
    byPerson.get(t.assignee_id)!.push(t);
  }

  const people: PersonLoad[] = [];
  for (const [assignee_id, list] of byPerson) {
    const dated = list.filter((t) => t.end);
    const undated = list.length - dated.length;

    // Плотность по дням окна. Окно ограничено вызывающим, поэтому перебор
    // дешёвый; считать «пик» по границам отрезков было бы быстрее, но менее
    // понятно при чтении.
    let peak = 0;
    let peakDay: string | null = null;
    const days = Math.max(0, differenceInCalendarDays(new Date(to), new Date(from)));
    for (let i = 0; i <= days; i++) {
      const day = from + i * DAY;
      let count = 0;
      for (const t of dated) {
        const s = t.start ? parseISO(t.start).getTime() : parseISO(t.end!).getTime();
        const e = parseISO(t.end!).getTime();
        if (s <= day + DAY - 1 && e >= day) count++;
      }
      if (count > peak) {
        peak = count;
        peakDay = new Date(day).toISOString();
      }
    }

    const overdue = dated.filter((t) => parseISO(t.end!).getTime() < now.getTime()).length;

    people.push({
      assignee_id,
      tasks_in_window: dated.length,
      peak_concurrent: peak,
      peak_day: peakDay,
      overdue,
      undated,
    });
  }

  // Самые загруженные сверху: обычно спрашивают именно про них.
  people.sort((a, b) => b.peak_concurrent - a.peak_concurrent || b.tasks_in_window - a.tasks_in_window);

  return {
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    people,
    unassigned,
    skipped_no_dates: skipped,
  };
}
