import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlanningPhase } from "./baselinePhase";
import { resolveAllViolations, type GraphEntity, type ResolveUpdate } from "./dependencyGraph";

/**
 * Каскадный пересчёт по связной компоненте изменённых связей — общий для
 * коннектора (mcp/tools/_cascade.ts) и приложения (hooks/useDependencies.tsx).
 *
 * Вынесено 06.10.2026. До этого приложение после создания или правки связи
 * выгружало ВСЕ задачи одним запросом без ограничения — задач 5720, PostgREST
 * молча отдаёт первую тысячу, и сдвиг доезжал не до всех преемников; заодно
 * правились нарушения по всему графу компании, а не вокруг изменённой связи.
 * Здесь — только компонента изменённого ребра, порциями.
 */

export type Dep = {
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

export async function fetchByIds(
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
  const scope = await loadScope(supabase, deps, seeds);
  if ("error" in scope) return scope;
  if (scope.entities.size === 0) return { shifted: [] };

  const updates = resolveAllViolations(deps, scope.entities);
  return applyUpdates(supabase, scope, updates, opts);
}

export type Scope = {
  entities: Map<string, GraphEntity>;
  createdAt: Map<string, string>;
  /** Проект задачи: по нему решается, идёт ли базовая дата за сроком. */
  groupId: Map<string, string | null>;
  kind: Map<string, "task" | "milestone">;
  name: Map<string, string>;
  was: Map<string, string | null>;
};

/** Участники связной компоненты с текущими датами — задачи и вехи вместе. */
export async function loadScope(
  supabase: SupabaseClient,
  deps: Dep[],
  seeds: string[],
): Promise<Scope | { error: string }> {
  const ids = [...dependencyComponent(deps, seeds)];
  const s: Scope = {
    entities: new Map(),
    createdAt: new Map(),
    groupId: new Map(),
    kind: new Map(),
    name: new Map(),
    was: new Map(),
  };
  if (ids.length === 0) return s;

  const tasks = await fetchByIds(supabase, "tasks", "id,title,start_at,deadline,created_at,group_id", ids);
  if ("error" in tasks) return tasks;
  const milestones = await fetchByIds(supabase, "project_milestones", "id,name,planned_date,created_at", ids);
  if ("error" in milestones) return milestones;

  for (const t of tasks as unknown as Array<{
    id: string; title: string; start_at: string | null; deadline: string | null; created_at: string;
    group_id: string | null;
  }>) {
    s.entities.set(t.id, { id: t.id, start_at: t.start_at, deadline: t.deadline });
    s.createdAt.set(t.id, t.created_at);
    s.groupId.set(t.id, t.group_id);
    s.kind.set(t.id, "task");
    s.name.set(t.id, t.title);
    s.was.set(t.id, t.deadline);
  }
  for (const m of milestones as unknown as Array<{
    id: string; name: string; planned_date: string | null; created_at: string;
  }>) {
    s.entities.set(m.id, { id: m.id, deadline: m.planned_date });
    s.createdAt.set(m.id, m.created_at);
    s.kind.set(m.id, "milestone");
    s.name.set(m.id, m.name);
    s.was.set(m.id, m.planned_date);
  }
  return s;
}

/** Запись рассчитанных сдвигов. У вехи двигается только плановая дата. */
export async function applyUpdates(
  supabase: SupabaseClient,
  scope: Scope,
  updates: Map<string, ResolveUpdate>,
  opts: { dryRun?: boolean },
): Promise<CascadeResult | { error: string }> {
  const shifted: CascadeResult["shifted"] = [];
  // Кэш на весь вызов: при сдвиге двадцати задач одного проекта это один
  // запрос статуса базового плана вместо двадцати.
  const planningCache = new Map<string, boolean>();
  for (const [id, upd] of updates) {
    const what = scope.kind.get(id);
    if (!what) continue; // узел вне компоненты или недоступен по RLS
    if (what === "task") {
      const payload: Record<string, unknown> = {};
      if (upd.deadline) payload.deadline = upd.deadline;
      if (upd.start_at) payload.start_at = upd.start_at;
      if (Object.keys(payload).length === 0) continue;
      // Базовая дата идёт за сроком, пока план не зафиксирован — как в
      // приложении. Иначе каскад на этапе планирования наплодил бы сдвигов,
      // которых не было.
      if (upd.deadline && (await isPlanningPhase(supabase, scope.groupId.get(id), planningCache))) {
        payload.original_deadline = upd.deadline;
      }
      if (!opts.dryRun) {
        const { error } = await supabase.from("tasks").update(payload).eq("id", id);
        if (error) return { error: error.message };
      }
      shifted.push({
        id, kind: "task", name: scope.name.get(id)!,
        from: scope.was.get(id) ?? null, to: upd.deadline ?? upd.start_at!,
      });
    } else if (upd.deadline) {
      if (!opts.dryRun) {
        const { error } = await supabase
          .from("project_milestones")
          .update({ planned_date: upd.deadline })
          .eq("id", id);
        if (error) return { error: error.message };
      }
      shifted.push({
        id, kind: "milestone", name: scope.name.get(id)!,
        from: scope.was.get(id) ?? null, to: upd.deadline,
      });
    }
  }
  return { shifted };
}

