import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAllViolations, type GraphEntity } from "../../dependencyGraph";

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

type Dep = {
  id: string;
  predecessor_id: string;
  successor_id: string;
  dependency_type: string;
  lag_days: number;
  predecessor_entity_type: string;
  successor_entity_type: string;
};

// Идентификаторы уезжают в адрес запроса, поэтому порциями: на длинных цепочках
// один .in(...) уже отбивался с «414 Request-URI Too Large».
const CHUNK = 50;

/** Все связи. Таблица маленькая (сотни строк), но лимит задаём явно. */
export async function fetchDependencies(supabase: SupabaseClient): Promise<Dep[] | { error: string }> {
  const { data, error } = await supabase
    .from("task_dependencies")
    .select("id,predecessor_id,successor_id,dependency_type,lag_days,predecessor_entity_type,successor_entity_type")
    .limit(5000);
  if (error) return { error: error.message };
  return (data ?? []) as Dep[];
}

/**
 * Связная компонента: всё, до чего дотягиваются связи от заданных узлов.
 * Обход в обе стороны, а не только вперёд: сдвинуть преемника может и связь,
 * пришедшая к нему со стороны.
 */
export function dependencyComponent(deps: Dep[], seeds: string[]): Set<string> {
  const neighbours = new Map<string, string[]>();
  for (const d of deps) {
    if (!neighbours.has(d.predecessor_id)) neighbours.set(d.predecessor_id, []);
    if (!neighbours.has(d.successor_id)) neighbours.set(d.successor_id, []);
    neighbours.get(d.predecessor_id)!.push(d.successor_id);
    neighbours.get(d.successor_id)!.push(d.predecessor_id);
  }
  const seen = new Set<string>(seeds);
  const stack = [...seeds];
  while (stack.length) {
    const id = stack.pop()!;
    for (const next of neighbours.get(id) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(next);
    }
  }
  return seen;
}

async function fetchByIds(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  ids: string[],
): Promise<Record<string, unknown>[] | { error: string }> {
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .in("id", ids.slice(i, i + CHUNK));
    if (error) return { error: error.message };
    out.push(...(data ?? []));
  }
  return out;
}

export type CascadeResult = {
  shifted: Array<{ id: string; kind: "task" | "milestone"; name: string; from: string | null; to: string }>;
};

/**
 * Пересчитывает и (если dryRun не задан) записывает сдвиги, вызванные связями
 * вокруг узлов seeds. Возвращает список сдвинутого — с названиями, чтобы ответ
 * читался без второго запроса.
 */
export async function cascade(
  supabase: SupabaseClient,
  deps: Dep[],
  seeds: string[],
  opts: { dryRun?: boolean } = {},
): Promise<CascadeResult | { error: string }> {
  const scope = [...dependencyComponent(deps, seeds)];
  if (scope.length === 0) return { shifted: [] };

  const tasks = await fetchByIds(supabase, "tasks", "id,title,start_at,deadline", scope);
  if ("error" in tasks) return tasks;
  const milestones = await fetchByIds(supabase, "project_milestones", "id,name,planned_date", scope);
  if ("error" in milestones) return milestones;

  const entities = new Map<string, GraphEntity>();
  const kind = new Map<string, "task" | "milestone">();
  const name = new Map<string, string>();
  const was = new Map<string, string | null>();
  for (const t of tasks as unknown as Array<{ id: string; title: string; start_at: string | null; deadline: string | null }>) {
    entities.set(t.id, { id: t.id, start_at: t.start_at, deadline: t.deadline });
    kind.set(t.id, "task");
    name.set(t.id, t.title);
    was.set(t.id, t.deadline);
  }
  for (const m of milestones as unknown as Array<{ id: string; name: string; planned_date: string | null }>) {
    entities.set(m.id, { id: m.id, deadline: m.planned_date });
    kind.set(m.id, "milestone");
    name.set(m.id, m.name);
    was.set(m.id, m.planned_date);
  }

  const updates = resolveAllViolations(deps, entities);
  const shifted: CascadeResult["shifted"] = [];

  for (const [id, upd] of updates) {
    const what = kind.get(id);
    if (!what) continue; // узел вне компоненты или недоступен по RLS
    if (what === "task") {
      const payload: Record<string, unknown> = {};
      if (upd.deadline) payload.deadline = upd.deadline;
      if (upd.start_at) payload.start_at = upd.start_at;
      if (Object.keys(payload).length === 0) continue;
      if (!opts.dryRun) {
        const { error } = await supabase.from("tasks").update(payload).eq("id", id);
        if (error) return { error: error.message };
      }
      shifted.push({ id, kind: "task", name: name.get(id)!, from: was.get(id) ?? null, to: upd.deadline! });
    } else if (upd.deadline) {
      if (!opts.dryRun) {
        const { error } = await supabase
          .from("project_milestones")
          .update({ planned_date: upd.deadline })
          .eq("id", id);
        if (error) return { error: error.message };
      }
      shifted.push({ id, kind: "milestone", name: name.get(id)!, from: was.get(id) ?? null, to: upd.deadline });
    }
  }

  return { shifted };
}

/** Тип узла по факту: задача, веха или ничего из двух (нет доступа/не существует). */
export async function entityKind(supabase: SupabaseClient, id: string): Promise<"task" | "milestone" | null> {
  const { data: task } = await supabase.from("tasks").select("id").eq("id", id).maybeSingle();
  if (task) return "task";
  const { data: ms } = await supabase.from("project_milestones").select("id").eq("id", id).maybeSingle();
  if (ms) return "milestone";
  return null;
}
