/**
 * Общие функции времени для отчётов.
 *
 * Зачем отдельный модуль: логика «что считать просроченным» раньше была
 * продублирована в трёх edge-функциях отчётов и в UI — и разъехалась.
 * UI считал по началу суток (задача на сегодня — не просрочена), а отчёты
 * сравнивали с моментом запуска крона (пятница 08:08 МСК), из-за чего задача
 * со сроком «сегодня» попадала в просрочку. Теперь правило одно и здесь.
 *
 * Москва — UTC+3 круглый год (переход на летнее время отменён в 2014).
 */

const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Начало текущих суток по Москве как абсолютный момент времени.
 * Не зависит от таймзоны сервера, на котором крутится функция.
 */
export function startOfTodayMoscow(): Date {
  const moscowNow = new Date(Date.now() + MOSCOW_OFFSET_MS);
  const y = moscowNow.getUTCFullYear();
  const m = moscowNow.getUTCMonth();
  const d = moscowNow.getUTCDate();
  // Полночь по Москве = 00:00 МСК = 21:00 UTC предыдущих суток
  return new Date(Date.UTC(y, m, d, 0, 0, 0, 0) - MOSCOW_OFFSET_MS);
}

/**
 * Просрочено ли к текущему моменту.
 *
 * Задача считается просроченной, только если её срок наступил РАНЬШЕ начала
 * сегодняшнего дня. Задача со сроком «сегодня» — не просрочена, сколько бы
 * времени ни было на часах. Это совпадает с тем, что видит пользователь
 * в интерфейсе (TaskList: isBefore(deadline, startOfDay(now))).
 *
 * @param deadline срок из БД (timestamptz) или null
 * @param dayStart начало суток; передавайте один раз посчитанное значение,
 *                 чтобы весь отчёт считался на одну и ту же границу
 */
export function isOverdue(
  deadline: string | null | undefined,
  dayStart: Date = startOfTodayMoscow(),
): boolean {
  if (!deadline) return false;
  return new Date(deadline) < dayStart;
}
