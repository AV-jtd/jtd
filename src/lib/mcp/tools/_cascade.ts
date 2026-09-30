import type { SupabaseClient } from "@supabase/supabase-js";
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
  const scope = await loadScope(supabase, deps, seeds);
  if ("error" in scope) return scope;
  if (scope.entities.size === 0) return { shifted: [] };

  const updates = resolveAllViolations(deps, scope.entities);
  return applyUpdates(supabase, scope, updates, opts);
}

type Scope = {
  entities: Map<string, GraphEntity>;
  createdAt: Map<string, string>;
  kind: Map<string, "task" | "milestone">;
  name: Map<string, string>;
  was: Map<string, string | null>;
};

/** Участники связной компоненты с текущими датами — задачи и вехи вместе. */
async function loadScope(
  supabase: SupabaseClient,
  deps: Dep[],
  seeds: string[],
): Promise<Scope | { error: string }> {
  const ids = [...dependencyComponent(deps, seeds)];
  const s: Scope = {
    entities: new Map(),
    createdAt: new Map(),
    kind: new Map(),
    name: new Map(),
    was: new Map(),
  };
  if (ids.length === 0) return s;

  const tasks = await fetchByIds(supabase, "tasks", "id,title,start_at,deadline,created_at", ids);
  if ("error" in tasks) return tasks;
  const milestones = await fetchByIds(supabase, "project_milestones", "id,name,planned_date,created_at", ids);
  if ("error" in milestones) return milestones;

  for (const t of tasks as unknown as Array<{
    id: string; title: string; start_at: string | null; deadline: string | null; created_at: string;
  }>) {
    s.entities.set(t.id, { id: t.id, start_at: t.start_at, deadline: t.deadline });
    s.createdAt.set(t.id, t.created_at);
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
async function applyUpdates(
  supabase: SupabaseClient,
  scope: Scope,
  updates: Map<string, ResolveUpdate>,
  opts: { dryRun?: boolean },
): Promise<CascadeResult | { error: string }> {
  const shifted: CascadeResult["shifted"] = [];
  for (const [id, upd] of updates) {
    const what = scope.kind.get(id);
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

export type MoveResult = {
  moved: { id: string; kind: "task" | "milestone"; name: string; from: string | null; to: string; shift_days: number };
  shifted: CascadeResult["shifted"];
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
    const columns = kind === "task" ? "id,title,start_at,deadline,created_at" : "id,name,planned_date,created_at";
    const { data, error } = await supabase.from(table).select(columns).eq("id", id).maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { error: "Задача или веха не найдена, либо нет доступа" };
    const row = data as unknown as {
      id: string; title?: string; name?: string;
      start_at?: string | null; deadline?: string | null; planned_date?: string | null; created_at: string;
    };
    scope.entities.set(id, {
      id,
      start_at: row.start_at ?? null,
      deadline: kind === "task" ? (row.deadline ?? null) : (row.planned_date ?? null),
    });
    scope.createdAt.set(id, row.created_at);
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
