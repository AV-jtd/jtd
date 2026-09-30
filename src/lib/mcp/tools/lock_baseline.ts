import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { db, fail, notify, resolveUser } from "./_shared";
import { driftDays } from "../../drift";

/**
 * Фиксация базового плана.
 *
 * Повторяет useTasks.lockBaseline: статус и дата фиксации ставятся проекту и
 * его подпроектам, базовые даты всех задач со сроком приравниваются к текущим
 * срокам, утверждающему уходит уведомление.
 *
 * ПО УМОЛЧАНИЮ НЕ ПИШЕТ. Фиксация ПЕРЕЗАПИСЫВАЕТ базовые даты, а значит
 * стирает уже накопленные отклонения: проект, где двенадцать задач съехали на
 * месяц, после повторной фиксации выглядит идущим по плану. Восстановить эти
 * числа нечем — в базе хранится одна базовая дата, без истории. Поэтому сперва
 * показываем, сколько отклонений исчезнет, и только по явному apply=true
 * записываем.
 *
 * Приложение спрашивает подтверждение диалогом, здесь роль диалога играет
 * предпросмотр.
 */

export default defineTool({
  name: "lock_baseline",
  title: "Зафиксировать базовый план",
  description:
    "Фиксирует базовый план проекта: с этого момента каждая правка срока записывается как отклонение и попадает в портфель. Базовые даты всех задач со сроком приравниваются к текущим срокам — накопленные до этого отклонения ОБНУЛЯЮТСЯ и восстановлению не подлежат. Подпроекты фиксируются вместе с проектом, утверждающий получает уведомление. ПО УМОЛЧАНИЮ НИЧЕГО НЕ ПИШЕТ: возвращает, что будет затронуто; запись только при apply=true, после согласия человека.",
  inputSchema: {
    project_id: z.string().uuid().describe("UUID проекта (task_groups.id)."),
    approver: z.string().optional().describe("Утверждающий: id, почта или имя. Задаётся заодно с фиксацией."),
    auto_lock_hours: z
      .number().int().min(1).max(8760).optional()
      .describe("Через сколько часов после создания проекта срабатывает автофиксация (по умолчанию в системе 48)."),
    apply: z.boolean().optional().describe("true — зафиксировать. По умолчанию false: только показать последствия."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  handler: async (
    input: { project_id: string; approver?: string; auto_lock_hours?: number; apply?: boolean },
    ctx: ToolContext,
  ) => {
    if (!ctx.isAuthenticated()) return fail("Не аутентифицирован");
    const uid = ctx.getUserId()!;
    const supabase = db(ctx);

    const { data: project, error } = await supabase
      .from("task_groups")
      .select("id,name,baseline_status,baseline_approver_id,baseline_locked_at")
      .eq("id", input.project_id)
      .maybeSingle();
    if (error) return fail(error.message);
    if (!project) return fail("Проект не найден или недоступен");

    let approver: { id: string; name: string } | null = null;
    if (input.approver) {
      const r = await resolveUser(supabase, input.approver);
      if ("error" in r) return fail(r.error);
      approver = r;
    }

    const { data: subs } = await supabase.from("task_groups").select("id,name").eq("parent_id", project.id);
    const groupIds = [project.id, ...(subs ?? []).map((s) => s.id)];

    const { data: tasks, error: tErr } = await supabase
      .from("tasks")
      .select("id,title,deadline,original_deadline")
      .in("group_id", groupIds)
      .not("deadline", "is", null)
      .limit(2000);
    if (tErr) return fail(tErr.message);
    const rows = tasks ?? [];

    // Что исчезнет: отклонения, накопленные до фиксации.
    const erased = rows
      .map((t) => ({ title: t.title, drift: t.original_deadline ? driftDays(t.original_deadline, t.deadline) : null }))
      .filter((r) => r.drift !== null && r.drift !== 0)
      .sort((a, b) => Math.abs(b.drift!) - Math.abs(a.drift!));

    const summary = {
      project: { id: project.id, name: project.name, status: project.baseline_status },
      already_locked: project.baseline_status === "locked",
      subprojects: (subs ?? []).map((s) => s.name),
      tasks_to_rebaseline: rows.length,
      drift_to_be_erased: {
        tasks: erased.length,
        // Показываем самые крупные: список из 200 строк человек не прочтёт, а
        // «стирается отклонение 45 дней у такой-то задачи» — прочтёт.
        biggest: erased.slice(0, 5).map((r) => ({ title: r.title, drift_days: r.drift })),
      },
      approver: approver?.name ?? null,
      auto_lock_hours: input.auto_lock_hours ?? null,
    };

    if (!input.apply) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              written: false,
              will_do: summary,
              warning:
                erased.length > 0
                  ? `После фиксации ${erased.length} отклонений станут нулевыми, и вернуть эти числа будет нечем. Покажите это человеку до записи.`
                  : "Накопленных отклонений нет — фиксация ничего не сотрёт.",
              apply_with: "тот же вызов с apply=true",
            }),
          },
        ],
      };
    }

    const now = new Date().toISOString();
    const warnings: string[] = [];

    if (approver || input.auto_lock_hours !== undefined) {
      const settings: Record<string, unknown> = {};
      if (approver) settings.baseline_approver_id = approver.id;
      if (input.auto_lock_hours !== undefined) settings.baseline_auto_lock_hours = input.auto_lock_hours;
      const { error: sErr } = await supabase.from("task_groups").update(settings).eq("id", project.id);
      if (sErr) return fail(`Настройки базового плана не сохранены: ${sErr.message}`);
      // Как в приложении: назначенный утверждающий узнаёт об этом.
      if (approver && approver.id !== project.baseline_approver_id) {
        await notify(supabase, "baseline_approver_assigned", project.name, [approver.id], null);
      }
    }

    const { data: locked, error: lErr } = await supabase
      .from("task_groups")
      .update({ baseline_status: "locked", baseline_locked_at: now })
      .in("id", groupIds)
      .select("id");
    if (lErr) return fail(lErr.message);
    if (!locked?.length) return fail("Нет прав на фиксацию базового плана этого проекта");
    if (locked.length < groupIds.length) {
      warnings.push(`подпроектов зафиксировано ${locked.length - 1} из ${groupIds.length - 1} — на остальные нет прав`);
    }

    // Базовые даты по одной: значение у каждой задачи своё, одним UPDATE не
    // выразить.
    let rebaselined = 0;
    for (const t of rows) {
      const { error: uErr } = await supabase
        .from("tasks").update({ original_deadline: t.deadline }).eq("id", t.id);
      if (uErr) {
        warnings.push(`базовая дата не обновлена у «${t.title}»: ${uErr.message}`);
        continue;
      }
      rebaselined++;
    }

    const approverId = approver?.id ?? project.baseline_approver_id;
    if (approverId && approverId !== uid) {
      await notify(supabase, "baseline_locked", project.name, [approverId], null);
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            written: true,
            project: { id: project.id, name: project.name },
            status: "locked",
            locked_at: now,
            rebaselined_tasks: rebaselined,
            drift_erased: erased.length,
            approver: approver?.name ?? null,
            note: "С этого момента правки сроков записываются как отклонение от плана.",
            ...(warnings.length ? { warnings } : {}),
          }),
        },
      ],
    };
  },
});
