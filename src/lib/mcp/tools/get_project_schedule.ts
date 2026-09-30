import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { db, fail } from "./_shared";
import { resolveNames } from "./_names";
import { driftDays } from "../../drift";

/**
 * Расписание проекта одним вызовом: вехи, задачи с началом и концом,
 * связи между ними, отклонение от базового плана.
 *
 * Зачем отдельный инструмент. Гант — это отрезки и зависимости, а через
 * коннектор до сих пор не было доступно ни одного из трёх: вехи
 * (project_milestones) не выставлены вовсе, связи (task_dependencies) тоже, а
 * start_at не участвовал в ответах. Собрать расписание из list_tasks нельзя
 * никак — не из чего.
 *
 * Дрифт считается тем же помощником, что и в приложении (src/lib/drift.ts):
 * испорченная базовая дата не превращается в сдвиг на две тысячи лет.
 */

const MAX_TASKS = 300;

export default defineTool({
  name: "get_project_schedule",
  title: "Расписание проекта",
  description:
    "Расписание проекта для разговора о сроках: вехи с плановой и фактической датой, задачи с началом и концом, связи между ними (что за чем идёт) и отклонение от базового плана в днях. Нужен, чтобы ответить «что едет в проекте» и «что будет, если сдвинуть». Задач возвращается не больше 300 — при has_more сузьте через only_open.",
  inputSchema: {
    project_id: z.string().uuid().describe("UUID проекта (task_groups.id)."),
    include_subprojects: z
      .boolean()
      .optional()
      .describe("Включать задачи подпроектов. По умолчанию да — в Ганте они видны вместе."),
    only_open: z.boolean().optional().describe("Только незакрытые задачи. По умолчанию нет."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (
    input: { project_id: string; include_subprojects?: boolean; only_open?: boolean },
    ctx: ToolContext,
  ) => {
    if (!ctx.isAuthenticated()) return fail("Не аутентифицирован");
    const supabase = db(ctx);
    const withSubs = input.include_subprojects !== false;

    const { data: project, error: pErr } = await supabase
      .from("task_groups")
      .select("id,name,closed_at,parent_id")
      .eq("id", input.project_id)
      .maybeSingle();
    if (pErr) return fail(pErr.message);
    if (!project) return fail("Проект не найден или недоступен");

    // Подпроекты — один уровень вниз, как и везде в приложении.
    let groupIds = [project.id];
    if (withSubs) {
      const { data: subs } = await supabase.from("task_groups").select("id,name").eq("parent_id", project.id);
      groupIds = [project.id, ...(subs ?? []).map((s) => s.id)];
    }

    // ── Вехи ──────────────────────────────────────────────────────────────
    const { data: milestones, error: mErr } = await supabase
      .from("project_milestones")
      .select("id,group_id,name,planned_date,actual_date,status,gate_key")
      .in("group_id", groupIds)
      .order("planned_date", { ascending: true });
    if (mErr) return fail(mErr.message);

    // ── Задачи ────────────────────────────────────────────────────────────
    let tq = supabase
      .from("tasks")
      .select("id,title,start_at,deadline,original_deadline,is_completed,completed_at,group_id,assigned_to", {
        count: "exact",
      })
      .in("group_id", groupIds)
      .or("task_type.is.null,and(task_type.neq.stm_stage,task_type.neq.km_stage)")
      .order("deadline", { ascending: true, nullsFirst: false })
      .limit(MAX_TASKS);
    if (input.only_open) tq = tq.eq("is_completed", false);

    const { data: tasks, error: tErr, count } = await tq;
    if (tErr) return fail(tErr.message);
    const rows = tasks ?? [];

    const names = await resolveNames(supabase, rows);

    // ── Связи ─────────────────────────────────────────────────────────────
    // Связывать можно и задачи, и вехи — отсюда entity_type с обеих сторон.
    // Берём только те связи, где ОБА конца внутри проекта: связь наружу без
    // второго конца нельзя ни показать, ни посчитать по ней каскад.
    const inScope = new Set<string>([...rows.map((t) => t.id), ...(milestones ?? []).map((m) => m.id)]);
    const ids = [...inScope];

    // Порциями и двумя запросами вместо одного or(...). Причина не в красоте:
    // PostgREST получает список идентификаторов в адресе запроса, а or(...)
    // вставляет его ДВАЖДЫ — при 300 задачах это около 22 КБ, и запрос
    // отбивается с «414 Request-URI Too Large» (на проде уже ловили).
    const CHUNK = 50;
    const seen = new Set<string>();
    const deps: Array<{
      predecessor_id: string; successor_id: string; dependency_type: string;
      lag_days: number; predecessor_entity_type: string; successor_entity_type: string;
    }> = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      for (const column of ["predecessor_id", "successor_id"] as const) {
        const { data, error } = await supabase
          .from("task_dependencies")
          .select("predecessor_id,successor_id,dependency_type,lag_days,predecessor_entity_type,successor_entity_type")
          .in(column, chunk);
        if (error) return fail(error.message);
        for (const d of data ?? []) {
          const key = `${d.predecessor_id}>${d.successor_id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          deps.push(d);
        }
      }
    }

    const label = new Map<string, string>();
    rows.forEach((t) => label.set(t.id, t.title));
    (milestones ?? []).forEach((m) => label.set(m.id, m.name));

    const links = deps
      .filter((d) => inScope.has(d.predecessor_id) && inScope.has(d.successor_id))
      .map((d) => ({
        from: d.predecessor_id,
        from_name: label.get(d.predecessor_id) ?? null,
        from_kind: d.predecessor_entity_type,
        to: d.successor_id,
        to_name: label.get(d.successor_id) ?? null,
        to_kind: d.successor_entity_type,
        type: d.dependency_type,
        lag_days: d.lag_days,
      }));

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            project: { id: project.id, name: project.name, closed: !!project.closed_at },
            milestones: (milestones ?? []).map((m) => ({
              id: m.id,
              name: m.name,
              planned_date: m.planned_date,
              actual_date: m.actual_date,
              status: m.status,
              gate_key: m.gate_key,
              // Веха «уехала», если факт позже плана либо план уже прошёл.
              late_days: m.actual_date ? driftDays(m.planned_date, m.actual_date) : null,
            })),
            tasks: rows.map((t) => ({
              id: t.id,
              title: t.title,
              start_at: t.start_at,
              deadline: t.deadline,
              is_completed: t.is_completed,
              assigned_to_name: t.assigned_to ? (names.person.get(t.assigned_to) ?? null) : null,
              project_name: t.group_id ? (names.project.get(t.group_id) ?? null) : null,
              // Отклонение от базового плана. null — либо не двигали, либо
              // базовая дата испорчена и числу верить нельзя.
              drift_days: driftDays(t.original_deadline, t.deadline),
            })),
            dependencies: links,
            counts: {
              milestones: (milestones ?? []).length,
              tasks_returned: rows.length,
              tasks_total: count ?? rows.length,
              has_more: (count ?? rows.length) > rows.length,
              dependencies: links.length,
            },
          }),
        },
      ],
    };
  },
});
