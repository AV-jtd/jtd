/**
 * Чистые помощники форматирования недельных отчётов.
 *
 * Вынесены из send-weekly-group-report отдельно от Deno-специфики (env, fetch),
 * чтобы их можно было покрыть тестами обычным vitest — как _shared/time.ts.
 */

/**
 * Подпись изменения к прошлой неделе: " 🟢+3" / " 🔴−2".
 *
 * Пусто при равенстве и при отсутствии прошлого снимка: показывать "+7" там,
 * где неделю назад просто не мерили, значит соврать.
 *
 * good — направление, в котором рост это хорошо (закрыто за неделю: рост
 * хорошо; просрочено: рост плохо). Влияет только на цвет маркера.
 *
 * "neutral" — для метрик без хорошего направления. Создание задач такое:
 * рост может значить и живой проект, и расползание объёма. Красить его
 * в красный значило бы подсказывать вывод, которого из числа не следует.
 */
export function delta(
  cur: number,
  prev: number | null | undefined,
  good: "up" | "down" | "neutral",
): string {
  if (prev === null || prev === undefined) return "";
  const d = cur - prev;
  if (d === 0) return "";
  const sign = `${d > 0 ? "+" : "−"}${Math.abs(d)}`;
  if (good === "neutral") return ` <i>${sign}</i>`;
  const better = good === "up" ? d > 0 : d < 0;
  return ` <i>${better ? "🟢" : "🔴"}${sign}</i>`;
}

/**
 * На сколько дней задача просрочена относительно начала суток (МСК).
 * Отрицательных не бывает: непросроченная задача — это 0.
 */
export function daysLate(deadline: string, dayStart: Date): number {
  return Math.max(
    0,
    Math.round((dayStart.getTime() - new Date(deadline).getTime()) / 86400000),
  );
}

/**
 * Насколько срок уехал от изначального. Положительное — сдвинули вперёд
 * (позже), отрицательное — подтянули.
 */
export function driftDays(originalDeadline: string, deadline: string): number {
  return Math.round(
    (new Date(deadline).getTime() - new Date(originalDeadline).getTime()) / 86400000,
  );
}

/**
 * Сортировка по дедлайну по возрастанию; задачи без срока — в конец.
 *
 * Нужна потому, что раньше списки резались через slice(0, 5) прямо из
 * результата запроса без ORDER BY: в топ-5 попадало что придётся.
 */
export function byDeadline(
  a: { deadline?: string | null },
  b: { deadline?: string | null },
): number {
  if (!a.deadline && !b.deadline) return 0;
  if (!a.deadline) return 1;
  if (!b.deadline) return -1;
  return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
}
