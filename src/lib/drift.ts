/**
 * Сдвиг срока задачи относительно базового плана.
 *
 * Зачем отдельный модуль. Раньше дрифт считался прямо в месте отрисовки:
 *
 *     differenceInDays(new Date(t.deadline), new Date(t.original_deadline))
 *
 * Проверка была только на непустоту обеих дат, и этого мало. В портфеле PMO
 * проект показывал дрифт **+739 251 день** — около двух тысяч лет. Такое
 * получается, когда в базовой дате лежит не пустое значение, а испорченное:
 * год 0001 вместо 2026. Непустую, но бессмысленную дату прежняя проверка
 * пропускала, и число уходило в интерфейс с видом настоящего.
 *
 * Правило: если дрифт выходит за пределы разумного, это ошибка данных, а не
 * очень сильный сдвиг. Показывать такое числом нельзя — пользователь примет
 * его за факт. Возвращаем null, интерфейс рисует прочерк.
 */

import { differenceInDays } from "date-fns";

/**
 * Предел разумного сдвига, дни. Десять лет.
 *
 * Всё сверх этого — почти наверняка испорченная дата, а не проект, который
 * действительно уехал на одиннадцать лет. Если однажды появится настоящий
 * долгострой, лучше увидеть прочерк и разобраться, чем тихо поверить числу.
 */
export const MAX_REASONABLE_DRIFT_DAYS = 3650;

/** Годы, вне которых дату считаем испорченной, а не крайней. */
const MIN_PLAUSIBLE_YEAR = 2000;
const MAX_PLAUSIBLE_YEAR = 2100;

function parsed(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  if (y < MIN_PLAUSIBLE_YEAR || y > MAX_PLAUSIBLE_YEAR) return null;
  return d;
}

/**
 * Сдвиг в днях: положительный — срок отодвинули, отрицательный — подтянули.
 *
 * null означает «посчитать нельзя»: нет одной из дат, дата не разбирается,
 * год вне разумного диапазона или величина сдвига превышает предел.
 * Интерфейс на null рисует прочерк, а не ноль: ноль — это «не сдвигали»,
 * и путать эти два случая нельзя.
 */
export function driftDays(
  originalDeadline: string | null | undefined,
  deadline: string | null | undefined,
): number | null {
  const from = parsed(originalDeadline);
  const to = parsed(deadline);
  if (!from || !to) return null;

  const days = differenceInDays(to, from);
  if (Math.abs(days) > MAX_REASONABLE_DRIFT_DAYS) return null;
  return days;
}

/**
 * Считается ли задача сдвинутой. Раньше условием было «обе даты есть и они
 * различаются» — из-за чего в счётчик дрифта попадали и задачи с испорченной
 * базовой датой. Теперь признак и величина следуют одному правилу.
 */
export function hasDrift(
  originalDeadline: string | null | undefined,
  deadline: string | null | undefined,
): boolean {
  const days = driftDays(originalDeadline, deadline);
  return days !== null && days !== 0;
}
