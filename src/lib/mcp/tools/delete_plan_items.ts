import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { db, fail } from "./_shared";
import { entityKind } from "./_cascade";

/**
 * Удаление задач и вех — для «переразложи план заново».
 *
 * Долго не выставлял намеренно: удалить репликой в чате слишком легко, а
 * восстановить нечем — в приложении удаление настоящее, корзины нет
 * (`useTasks.deleteTask`, `useMilestones`). Но без удаления «переразложи план»
 * упирается в чистку руками, и это оказалось хуже: люди начинают вести план
 * рядом, в переписке.
 *
 * Отсюда три ограничения, которых нет у остальных инструментов записи.
 *
 * 1. Без `apply=true` не удаляется ничего: сначала перечисляется, что исчезнет,
 *    с названиями, числом подзадач и комментариев.
 * 2. Всё в одном проекте. Список идентификаторов из разных проектов — обычно
 *    признак того, что Claude собрал его неверно.
 * 3. Выполненные задачи по умолчанию не удаляются: это уже история работы, а не
 *    план. Нужно — `include_completed=true`.
 *
 * Связи удалятся сами (внешние ключи), но мы их показываем: исчезнет не только
 * задача, но и знание о том, что за ней шло.
 */

const MAX = 50;

export default defineTool({
  name: "delete_plan_items",
  title: "Удалить задачи или вехи",
  description:
    "Удаляет задачи и вехи — например, чтобы переразложить план заново. Удаление НАСТОЯЩЕЕ: в JustTODOit нет корзины, восстановить нечем. ПО УМОЛЧАНИЮ НИЧЕГО НЕ УДАЛЯЕТ: перечисляет, что исчезнет (названия, подзадачи, комментарии, связи); удаление только при apply=true, после явного согласия человека. Все элементы должны быть из одного проекта. Выполненные задачи не удаляются без include_completed=true — это история работы, а не план.",
  inputSchema: {
    project_id: z.string().uuid().describe("UUID проекта, из которого удаляем — проверяется у каждого элемента."),
    ids: z.array(z.string().uuid()).min(1).max(MAX).describe("UUID задач и/или вех."),
    include_completed: z.boolean().optional().describe("Разрешить удаление выполненных задач."),
    apply: z.boolean().optional().describe("true — удалить. По умолчанию false: только показать."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (
    input: { project_id: string; ids: string[]; include_completed?: boolean; apply?: boolean },
    ctx: ToolContext,
  ) => {
    if (!ctx.isAuthenticated()) return fail("Не аутентифицирован");
    const supabase = db(ctx);

    const ids = [...new Set(input.ids)];

    const { data: project } = await supabase
      .from("task_groups").select("id,name").eq("id", input.project_id).maybeSingle();
    if (!project) return fail("Проект не найден или недоступен");

    const { data: tasks, error: tErr } = await supabase
      .from("tasks")
      .select("id,title,group_id,is_completed,subtasks(id),task_comments(id)")
      .in("id", ids);
    if (tErr) return fail(tErr.message);

    const { data: milestones, error: mErr } = await supabase
      .from("project_milestones")
      .select("id,name,group_id,actual_date")
      .in("id", ids);
    if (mErr) return fail(mErr.message);

    const problems: string[] = [];
    const found = new Set<string>([...(tasks ?? []).map((t) => t.id), ...(milestones ?? []).map((m) => m.id)]);
    for (const id of ids) {
      if (!found.has(id)) problems.push(`${id}: не найден или нет доступа`);
    }
    for (const t of tasks ?? []) {
      if (t.group_id !== input.project_id) problems.push(`«${t.title}»: из другого проекта`);
      if (t.is_completed && !input.include_completed) {
        problems.push(`«${t.title}»: выполнена — это история работы. Нужно удалить всё равно — include_completed=true`);
      }
    }
    for (const m of milestones ?? []) {
      if (m.group_id !== input.project_id) problems.push(`«${m.name}»: из другого проекта`);
      // Достигнутая веха — тоже факт, а не план.
      if (m.actual_date && !input.include_completed) {
        problems.push(`«${m.name}»: веха уже достигнута ${m.actual_date}. Удалить всё равно — include_completed=true`);
      }
    }
    if (problems.length) {
      return fail(`Ничего не удалено, ${problems.length === 1 ? "мешает" : "мешают"}:\n— ${problems.join("\n— ")}`);
    }

    // Связи: показываем, что вместе с элементом исчезнет и порядок работ.
    let linkCount = 0;
    for (const column of ["predecessor_id", "successor_id"] as const) {
      const { count } = await supabase
        .from("task_dependencies")
        .select("id", { count: "exact", head: true })
        .in(column, ids);
      linkCount += count ?? 0;
    }

    const willDelete = {
      project: { id: project.id, name: project.name },
      tasks: (tasks ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        completed: t.is_completed,
        subtasks: (t.subtasks ?? []).length,
        comments: (t.task_comments ?? []).length,
      })),
      milestones: (milestones ?? []).map((m) => ({ id: m.id, name: m.name, achieved: !!m.actual_date })),
      links_that_disappear: linkCount,
    };

    if (!input.apply) {
      const lost = willDelete.tasks.reduce((n, t) => n + t.subtasks + t.comments, 0);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              deleted: false,
              will_delete: willDelete,
              warning:
                `Восстановить нечем: корзины в JustTODOit нет.` +
                (lost > 0 ? ` Вместе с задачами исчезнут ${lost} подзадач и комментариев.` : "") +
                (linkCount > 0 ? ` И ${linkCount} связей — порядок работ придётся задавать заново.` : ""),
              apply_with: "тот же вызов с apply=true, после явного согласия человека",
            }),
          },
        ],
      };
    }

    const deleted: string[] = [];
    const warnings: string[] = [];
    for (const t of tasks ?? []) {
      const { data, error } = await supabase.from("tasks").delete().eq("id", t.id).select("id");
      if (error) {
        warnings.push(`«${t.title}» не удалена: ${error.message}`);
        continue;
      }
      if (!data?.length) {
        warnings.push(`«${t.title}»: нет прав на удаление`);
        continue;
      }
      deleted.push(t.title);
    }
    for (const m of milestones ?? []) {
      const { data, error } = await supabase.from("project_milestones").delete().eq("id", m.id).select("id");
      if (error) {
        warnings.push(`«${m.name}» не удалена: ${error.message}`);
        continue;
      }
      if (!data?.length) {
        warnings.push(`«${m.name}»: нет прав на удаление`);
        continue;
      }
      deleted.push(m.name);
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            deleted: true,
            count: deleted.length,
            names: deleted,
            links_gone: linkCount,
            ...(warnings.length ? { warnings } : {}),
          }),
        },
      ],
    };
  },
});
