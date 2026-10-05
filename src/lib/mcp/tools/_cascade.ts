import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlanningPhase } from "./_shared";
import { resolveAllViolations, type GraphEntity, type ResolveUpdate } from "../../dependencyGraph";
import { computeCascadeUpdates } from "../../cascadeDependencies";

/**
 * Каскадный пересчёт после изменения связей — тем же кодом, что в приложении
 * (src/lib/dependencyGraph.ts, useDependencies.tsx). Правило одно: преемник не
 * начинается раньше, чем кончился предшественник плюс лаг; длительность
 * преемника сохраняется.
 *
 * Отличие от приложения намеренное. Там перед пересчётом выгружаются ВСЕ задачи
 * одним запросом без ограничения — а задач 5720, и PostgREST молча отдаёт
 * первую тысячу: часть графа в расчёт просто не попадает. Здесь берётся связная
 * компонента изменённого ребра и только её участники. Это и дешевле, и полнее.
 */

import {
  applyUpdates, cascade, dependencyComponent, fetchByIds, fetchDependencies, loadScope,
  type CascadeResult, type Dep, type Scope,
} from "../../cascadeScope";

// Ядро пересчёта — в src/lib/cascadeScope.ts (общее с приложением).
export { cascade, dependencyComponent, fetchDependencies, type CascadeResult };

export type MoveResult = {
  moved: { id: string; kind: "task" | "milestone"; name: string; from: string | null; to: string; shift_days: number };
  shifted: CascadeResult["shifted"];
  /** Запишется ли сдвиг как отклонение от утверждённого плана. */
  recorded_as_drift: boolean;
};

/**
 * Перенос задачи или вехи вместе со всем, что за ней стоит.
 *
 * Повторяет то, что делает перетаскивание в Ганте (GanttView.tsx): сначала
 * относительный сдвиг преемников на ту же разницу (`computeCascadeUpdates` —
 * он двигает и вперёд, и назад, и сохраняет зазоры между отрезками), затем
 * второй проход `resolveAllViolations`, который добирает то, что после сдвига
 * всё ещё нарушает связи. Один проход не заменяет другой: первый сохраняет
 * форму плана, второй — его законность.
 *
 * dryRun считает то же самое и ничего не пишет.
 */
export async function moveWithCascade(
  supabase: SupabaseClient,
  id: string,
  newDeadline: Date,
  opts: { dryRun?: boolean } = {},
): Promise<MoveResult | { error: string }> {
  const deps = await fetchDependencies(supabase);
  if ("error" in deps) return deps;

  const scope = await loadScope(supabase, deps, [id]);
  if ("error" in scope) return scope;

  const kind = scope.kind.get(id) ?? (await entityKind(supabase, id));
  if (!kind) return { error: "Задача или веха не найдена, либо нет доступа" };

  // Одиночный узел в компоненту не попадает — дочитываем его отдельно.
  if (!scope.entities.has(id)) {
    const table = kind === "task" ? "tasks" : "project_milestones";
    const columns =
      kind === "task" ? "id,title,start_at,deadline,created_at,group_id" : "id,name,planned_date,created_at";
    const { data, error } = await supabase.from(table).select(columns).eq("id", id).maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { error: "Задача или веха не найдена, либо нет доступа" };
    const row = data as unknown as {
      id: string; title?: string; name?: string;
      start_at?: string | null; deadline?: string | null; planned_date?: string | null; created_at: string;
      group_id?: string | null;
    };
    scope.entities.set(id, {
      id,
      start_at: row.start_at ?? null,
      deadline: kind === "task" ? (row.deadline ?? null) : (row.planned_date ?? null),
    });
    scope.createdAt.set(id, row.created_at);
    scope.groupId.set(id, row.group_id ?? null);
    scope.kind.set(id, kind);
    scope.name.set(id, (row.title ?? row.name)!);
    scope.was.set(id, kind === "task" ? (row.deadline ?? null) : (row.planned_date ?? null));
  }

  const self = scope.entities.get(id)!;
  const oldDeadline = self.deadline;
  if (!oldDeadline) {
    return {
      error:
        "У этой задачи нет срока, и переносить нечего: сдвиг считается от старой даты к новой. " +
        "Поставьте срок через update_task.",
    };
  }
  const shiftDays = Math.round((newDeadline.getTime() - new Date(oldDeadline).getTime()) / 86400000);
  if (shiftDays === 0) {
    return {
      error: "Новая дата совпадает со старой — переносить нечего",
    };
  }

  // Карта для первого прохода. created_at обязателен: по нему caскад решает,
  // существовал ли узел на момент сдвига.
  const dateEntities = new Map<string, { id: string; deadline?: string | null; start_at?: string | null; created_at: string }>();
  scope.entities.forEach((e, eid) => {
    dateEntities.set(eid, {
      id: eid,
      deadline: e.deadline,
      start_at: e.start_at,
      created_at: scope.createdAt.get(eid) ?? new Date(0).toISOString(),
    });
  });

  const first = computeCascadeUpdates(id, newDeadline, new Date(oldDeadline), deps as never, dateEntities);

  // Сам переносимый узел: у задачи начало едет на ту же разницу, чтобы
  // длительность сохранилась (её мы не храним, а считаем — решение владельца).
  const selfUpdate: ResolveUpdate = { deadline: newDeadline.toISOString() };
  if (kind === "task" && self.start_at) {
    selfUpdate.start_at = new Date(new Date(self.start_at).getTime() + shiftDays * 86400000).toISOString();
  }
  const merged = new Map<string, ResolveUpdate>([[id, selfUpdate]]);
  for (const [eid, upd] of first) merged.set(eid, upd);

  const firstPass = await applyUpdates(supabase, scope, merged, opts);
  if ("error" in firstPass) return firstPass;

  // Второй проход — по снимку с уже применёнными сдвигами. В сухом прогоне
  // база не тронута, поэтому снимок правим в памяти, а не перечитываем.
  const after = new Map<string, GraphEntity>();
  scope.entities.forEach((e, eid) => {
    const upd = merged.get(eid);
    after.set(eid, {
      id: eid,
      deadline: upd?.deadline ?? e.deadline,
      start_at: upd?.start_at ?? e.start_at,
    });
  });
  const remaining = resolveAllViolations(deps, after);
  for (const eid of merged.keys()) {
    // Узлы, уже сдвинутые первым проходом, второй раз не двигаем: их новая
    // дата — то, о чём попросили, а не нарушение.
    if (eid === id) remaining.delete(eid);
  }
  const secondPass = await applyUpdates(supabase, scope, remaining, opts);
  if ("error" in secondPass) return secondPass;

  // Узел мог сдвинуться дважды: второй проход — более поздняя правда, её и
  // показываем, но старую дату сохраняем от первого появления.
  const byId = new Map<string, CascadeResult["shifted"][number]>();
  for (const s of [...firstPass.shifted, ...secondPass.shifted]) {
    if (s.id === id) continue;
    const prev = byId.get(s.id);
    byId.set(s.id, prev ? { ...s, from: prev.from } : s);
  }
  const shifted = [...byId.values()];

  // Про это человека надо предупреждать до, а не узнавать из портфеля после.
  const planning = await isPlanningPhase(supabase, scope.groupId.get(id));

  return {
    moved: {
      id,
      kind,
      name: scope.name.get(id)!,
      from: oldDeadline,
      to: newDeadline.toISOString(),
      shift_days: shiftDays,
    },
    shifted,
    recorded_as_drift: kind === "task" && !planning,
  };
}

/** Тип узла по факту: задача, веха или ничего из двух (нет доступа/не существует). */
export async function entityKind(supabase: SupabaseClient, id: string): Promise<"task" | "milestone" | null> {
  const { data: task } = await supabase.from("tasks").select("id").eq("id", id).maybeSingle();
  if (task) return "task";
  const { data: ms } = await supabase.from("project_milestones").select("id").eq("id", id).maybeSingle();
  if (ms) return "milestone";
  return null;
}

/**
 * Поиск кольца в произвольном наборе связей. Нужен плану: там связи ссылаются
 * и на новые элементы, которых в базе ещё нет, поэтому `wouldCreateCycle`
 * (он проверяет одно новое ребро против существующих) не подходит.
 *
 * Возвращает участников кольца или null. Проверять ДО записи обязательно:
 * записанный и потом снятый цикл успеет утащить даты каскадом, а откатывать
 * их нечем.
 */
export function findCycle(edges: Array<{ from: string; to: string }>): string[] | null {
  const next = new Map<string, string[]>();
  for (const e of edges) {
    if (!next.has(e.from)) next.set(e.from, []);
    next.get(e.from)!.push(e.to);
  }
  const state = new Map<string, "visiting" | "done">();

  const walk = (id: string, stack: string[]): string[] | null => {
    if (state.get(id) === "done") return null;
    if (state.get(id) === "visiting") return [...stack.slice(stack.indexOf(id)), id];
    state.set(id, "visiting");
    for (const to of next.get(id) ?? []) {
      const found = walk(to, [...stack, id]);
      if (found) return found;
    }
    state.set(id, "done");
    return null;
  };

  for (const id of next.keys()) {
    const found = walk(id, []);
    if (found) return found;
  }
  return null;
}
