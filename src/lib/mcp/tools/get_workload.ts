import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { db, fail } from "./_shared";
import { computeWorkload, type WorkloadTask } from "../../workload";

/**
 * «Кого мы перегрузили этим планом».
 *
 * Считается по датам и только по ним: ни оценки трудоёмкости, ни доли занятости
 * в JustTODOit нет. Поэтому ответ — число ОДНОВРЕМЕННЫХ задач, а не часы и не
 * проценты; задача на два часа и задача на месяц весят одинаково. Об этом
 * сказано и в описании инструмента, и в самом ответе: придуманная точность
 * здесь опаснее грубой оценки, потому что по процентам занятости люди
 * принимают решения.
 *
 * Расчёт в src/lib/workload.ts, восемь тестов.
 */

const MAX_TASKS = 1000;

export default defineTool({
  name: "get_workload",
  title: "Загрузка людей по датам",
  description:
    "Показывает, у кого сколько задач идёт одновременно в заданном окне дат: пик, день пика, сколько просрочено, сколько задач без срока. Отвечает на «кого перегрузили планом». ВАЖНО: считается только по датам — оценок трудоёмкости в системе нет, поэтому это число одновременных задач, а не часы и не проценты занятости. project_id — по одному проекту, без него — по всем задачам, которые вам видны в этом окне.",
  inputSchema: {
    from: z.string().describe("Начало окна, ISO datetime."),
    to: z.string().describe("Конец окна, ISO datetime."),
    project_id: z.string().uuid().optional().describe("Ограничить одним проектом."),
    include_subprojects: z.boolean().optional().describe("С подпроектами. По умолчанию да."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (
    input: { from: string; to: string; project_id?: string; include_subprojects?: boolean },
    ctx: ToolContext,
  ) => {
    if (!ctx.isAuthenticated()) return fail("Не аутентифицирован");
    const supabase = db(ctx);

    const from = new Date(input.from);
    const to = new Date(input.to);
    if (Number.isNaN(from.getTime())) return fail(`Не разобрал дату «${input.from}». Нужен ISO datetime.`);
    if (Number.isNaN(to.getTime())) return fail(`Не разобрал дату «${input.to}». Нужен ISO datetime.`);
    if (from > to) return fail("Начало окна позже конца");
    const days = Math.round((to.getTime() - from.getTime()) / 86400000);
    // Год перебирать по дням незачем: плотность за такое окно ничего не говорит,
    // а перебор станет самым дорогим местом инструмента.
    if (days > 370) return fail(`Окно ${days} дней слишком велико — возьмите до года.`);

    let groupIds: string[] | null = null;
    if (input.project_id) {
      const { data: project } = await supabase
        .from("task_groups").select("id,name").eq("id", input.project_id).maybeSingle();
      if (!project) return fail("Проект не найден или недоступен");
      groupIds = [project.id];
      if (input.include_subprojects !== false) {
        const { data: subs } = await supabase.from("task_groups").select("id").eq("parent_id", project.id);
        groupIds = [project.id, ...(subs ?? []).map((s) => s.id)];
      }
    }

    // Окно фильтруем и в запросе: иначе при 5720 задачах в выборку попадёт всё,
    // а лимит молча отрежет случайную тысячу (эта ловушка у нас уже была в
    // ИИ-анализе и в каскаде приложения).
    let q = supabase
      .from("tasks")
      .select("id,title,assigned_to,start_at,deadline,is_completed", { count: "exact" })
      .eq("is_completed", false)
      .not("deadline", "is", null)
      .gte("deadline", from.toISOString())
      .lte("deadline", new Date(to.getTime() + 370 * 86400000).toISOString())
      .limit(MAX_TASKS);
    if (groupIds) q = q.in("group_id", groupIds);

    const { data: tasks, error, count } = await q;
    if (error) return fail(error.message);

    const rows: WorkloadTask[] = (tasks ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      assignee_id: t.assigned_to,
      start: t.start_at,
      end: t.deadline,
      is_completed: t.is_completed,
    }));

    const load = computeWorkload(rows, from.toISOString(), to.toISOString(), new Date());

    // Имена вместо идентификаторов: «пик у Ивана» читается, «пик у 8f3c…» нет.
    const ids = load.people.map((p) => p.assignee_id);
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: profiles } = await supabase
        .from("profiles").select("id,display_name,email").in("id", ids);
      for (const p of profiles ?? []) names.set(p.id, p.display_name ?? p.email ?? p.id);
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            window: { from: load.from, to: load.to },
            scope: input.project_id ? { project_id: input.project_id } : "все видимые задачи",
            measure: "число одновременных задач; оценок трудоёмкости в системе нет, поэтому это не часы и не проценты занятости",
            people: load.people.map((p) => ({
              name: names.get(p.assignee_id) ?? p.assignee_id,
              id: p.assignee_id,
              tasks_in_window: p.tasks_in_window,
              peak_concurrent: p.peak_concurrent,
              peak_day: p.peak_day,
              overdue: p.overdue,
            })),
            unassigned_tasks: load.unassigned,
            truncated: (count ?? 0) > rows.length,
            ...((count ?? 0) > rows.length
              ? { truncated_note: `В окно попадает ${count} задач, посчитано ${rows.length}. Сузьте окно или укажите проект.` }
              : {}),
          }),
        },
      ],
    };
  },
});
