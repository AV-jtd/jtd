import type { SupabaseClient } from "@supabase/supabase-js";
import { entityKind } from "./_cascade";

/**
 * Целевая дата переноса: либо явная, либо «на N дней от текущей».
 *
 * Сдвиг в днях считается от даты, которая лежит в базе, а не от той, что
 * Claude помнит из прошлого вызова расписания. Между вызовами кто-то мог
 * перенести задачу в приложении, и «сдвинь на неделю» от устаревшей даты
 * вернуло бы её назад.
 */
export async function parseTargetDate(
  supabase: SupabaseClient,
  input: { id: string; new_deadline?: string; shift_days?: number },
): Promise<{ date: Date } | { error: string }> {
  const hasDate = input.new_deadline !== undefined;
  const hasShift = input.shift_days !== undefined;
  if (hasDate === hasShift) {
    return { error: "Нужно указать ровно одно: new_deadline или shift_days" };
  }

  if (hasDate) {
    const d = new Date(input.new_deadline!);
    if (Number.isNaN(d.getTime())) return { error: `Не разобрал дату «${input.new_deadline}». Нужен ISO datetime.` };
    const y = d.getUTCFullYear();
    if (y < 2000 || y > 2100) return { error: `Дата ${input.new_deadline} вне разумного диапазона (2000–2100).` };
    return { date: d };
  }

  if (input.shift_days === 0) return { error: "Сдвиг на ноль дней ничего не меняет" };

  const kind = await entityKind(supabase, input.id);
  if (!kind) return { error: "Задача или веха не найдена, либо нет доступа" };
  const table = kind === "task" ? "tasks" : "project_milestones";
  const column = kind === "task" ? "deadline" : "planned_date";
  const { data, error } = await supabase.from(table).select(column).eq("id", input.id).maybeSingle();
  if (error) return { error: error.message };
  const current = (data as Record<string, string | null> | null)?.[column] ?? null;
  if (!current) {
    return {
      error:
        kind === "task"
          ? "У задачи нет срока, сдвигать нечего. Поставьте срок через update_task или укажите new_deadline."
          : "У вехи нет плановой даты. Укажите new_deadline.",
    };
  }
  return { date: new Date(new Date(current).getTime() + input.shift_days! * 86400000) };
}
