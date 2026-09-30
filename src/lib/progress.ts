/**
 * Готовность задачи и проекта в процентах.
 *
 * Правило берётся из Ганта приложения (GanttView.tsx, `taskProgress` и сводка
 * проекта), а не придумывается заново: есть подзадачи — доля выполненных,
 * нет — ноль или сто по отметке о выполнении. Готовность проекта — среднее по
 * задачам, невзвешенное.
 *
 * Зачем вынесено отдельным модулем. Без готовности вопрос «что едет в проекте»
 * отвечается наполовину: задача может быть просрочена и при этом сделана на
 * девяносто процентов, и разговор о переносе сроков в этих двух случаях разный.
 * Считать это вторым способом нельзя — на расхождении двух реализаций одного
 * правила мы уже потеряли время дважды (дрифт в 19 местах, счётчики дашборда
 * против PMO).
 *
 * ЧЕГО ЗДЕСЬ НЕТ, НАМЕРЕННО. Среднее невзвешенное: задача на день и задача на
 * полгода весят одинаково — как и в приложении. Взвесить по длительности было
 * бы честнее, но тогда число в коннекторе разойдётся с числом на экране, а это
 * хуже, чем грубая мера, одинаковая в обоих местах.
 */

export type ProgressTask = {
  is_completed?: boolean | null;
  subtasks?: Array<{ is_completed?: boolean | null }> | null;
};

/** Готовность одной задачи, 0–100. */
export function taskProgressPct(task: ProgressTask): number {
  const subs = task.subtasks ?? [];
  if (subs.length > 0) {
    const done = subs.filter((s) => s.is_completed).length;
    return Math.round((done / subs.length) * 100);
  }
  return task.is_completed ? 100 : 0;
}

/** Готовность проекта — среднее по задачам. null, если считать не по чему. */
export function projectProgressPct(tasks: ProgressTask[]): number | null {
  if (tasks.length === 0) return null;
  const sum = tasks.reduce((acc, t) => acc + taskProgressPct(t), 0);
  return Math.round(sum / tasks.length);
}
