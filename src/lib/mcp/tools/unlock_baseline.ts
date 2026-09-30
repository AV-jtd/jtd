import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { db, fail } from "./_shared";

/**
 * Снятие фиксации: проект возвращается к планированию.
 *
 * Повторяет useTasks.unlockBaseline — статус и дата снимаются с проекта и его
 * подпроектов. Базовые даты задач при этом НЕ трогаются, тоже как в приложении:
 * снятие фиксации не переписывает историю, а лишь перестаёт считать дальнейшие
 * правки отклонением. Накопленные отклонения останутся видны, пока сроки не
 * поправят заново.
 *
 * Предпросмотра здесь нет, в отличие от фиксации: ничего не перезаписывается,
 * и обратное действие — тот же lock_baseline. Но у автофиксации есть оговорка,
 * и она в описании: проект снова попадёт под `auto-baseline-lock`, который
 * считает срок от СОЗДАНИЯ проекта. Если проект старше положенных часов,
 * автофиксация вернёт его в утверждённое состояние при ближайшем запуске.
 */

export default defineTool({
  name: "unlock_baseline",
  title: "Снять фиксацию базового плана",
  description:
    "Возвращает проект к планированию: правки сроков перестают записываться как отклонение. Базовые даты задач не меняются — накопленные отклонения остаются видны, пока сроки не поправят заново. Подпроекты открываются вместе с проектом. ВНИМАНИЕ: автофиксация отсчитывает часы от создания проекта, поэтому у проекта старше этого срока план вернётся к утверждённому сам, при ближайшем запуске автофиксации — если это не то, что нужно, увеличьте auto_lock_hours через lock_baseline.",
  inputSchema: {
    project_id: z.string().uuid().describe("UUID проекта (task_groups.id)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async (input: { project_id: string }, ctx: ToolContext) => {
    if (!ctx.isAuthenticated()) return fail("Не аутентифицирован");
    const supabase = db(ctx);

    const { data: project, error } = await supabase
      .from("task_groups")
      .select("id,name,baseline_status,baseline_auto_lock_hours,created_at")
      .eq("id", input.project_id)
      .maybeSingle();
    if (error) return fail(error.message);
    if (!project) return fail("Проект не найден или недоступен");

    const { data: subs } = await supabase.from("task_groups").select("id").eq("parent_id", project.id);
    const groupIds = [project.id, ...(subs ?? []).map((s) => s.id)];

    const { data: updated, error: uErr } = await supabase
      .from("task_groups")
      .update({ baseline_status: "planning", baseline_locked_at: null })
      .in("id", groupIds)
      .select("id");
    if (uErr) return fail(uErr.message);
    if (!updated?.length) return fail("Нет прав на снятие фиксации у этого проекта");

    // Считаем то же, что считает auto-baseline-lock: часы от создания проекта.
    const hours = project.baseline_auto_lock_hours ?? 48;
    const autoLockAt = new Date(new Date(project.created_at).getTime() + hours * 3600000);
    const overdue = autoLockAt.getTime() <= Date.now();

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            written: true,
            project: { id: project.id, name: project.name },
            status: "planning",
            was: project.baseline_status,
            subprojects_opened: updated.length - 1,
            note: "Правки сроков больше не записываются как отклонение. Базовые даты задач не менялись.",
            auto_lock_warning: overdue
              ? `Автофиксация считает ${hours} ч от создания проекта, а он создан раньше — план вернётся к утверждённому при ближайшем запуске автофиксации. Чтобы этого не случилось, увеличьте auto_lock_hours через lock_baseline.`
              : `Автофиксация сработает ${autoLockAt.toISOString()}.`,
          }),
        },
      ],
    };
  },
});
