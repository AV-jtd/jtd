import type { SupabaseClient } from "@supabase/supabase-js";

// Этап планирования проекта: пока базовый план не зафиксирован, базовая дата
// идёт за сроком. Вынесено из mcp/tools/_shared.ts 06.10.2026, чтобы тем же
// правилом пользовалось и приложение (каскад после связей, cascadeScope.ts):
// _shared.ts тянет node:process и в браузер не собирается.

/**
 * Базовая дата на этапе планирования.
 *
 * Пока базовый план проекта не зафиксирован (`baseline_status = 'planning'`),
 * приложение при смене срока тянет за ним и базовую дату: план ещё
 * составляется, значит это не сдвиг (useTasks.tsx, «Baseline lock»). После
 * фиксации базовая дата остаётся на месте, и разница становится отклонением.
 *
 * Коннектор этого не делал, и любой срок, проставленный через Claude на этапе
 * планирования, показывался в портфеле СДВИГОМ. Тот же класс расхождения, что
 * дрифт в 19 местах и счётчики дашборда против PMO: два пути пишут одно поле
 * по разным правилам.
 *
 * У подпроекта учитывается и статус родителя — тоже как в приложении.
 */
export function shouldKeepBaselineInStep(
  groupStatus: string | null | undefined,
  parentStatus: string | null | undefined,
): boolean {
  return groupStatus === "planning" || parentStatus === "planning";
}

/**
 * Тот же вопрос, но с обращением к базе. Ответы кэшируются на вызов
 * инструмента: при каскадном сдвиге двадцати задач одного проекта это один
 * запрос вместо двадцати.
 */
export async function isPlanningPhase(
  supabase: SupabaseClient,
  groupId: string | null | undefined,
  cache: Map<string, boolean> = new Map(),
): Promise<boolean> {
  if (!groupId) return false; // задача без проекта базового плана не имеет
  const known = cache.get(groupId);
  if (known !== undefined) return known;

  const { data: group } = await supabase
    .from("task_groups").select("baseline_status,parent_id").eq("id", groupId).maybeSingle();
  let parentStatus: string | null = null;
  if (group?.parent_id && group.baseline_status !== "planning") {
    const { data: parent } = await supabase
      .from("task_groups").select("baseline_status").eq("id", group.parent_id).maybeSingle();
    parentStatus = parent?.baseline_status ?? null;
  }
  const answer = shouldKeepBaselineInStep(group?.baseline_status, parentStatus);
  cache.set(groupId, answer);
  return answer;
}
