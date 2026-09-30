import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { db, fail, isPlanningPhase } from "./_shared";

/**
 * Смена срока одной задачи.
 *
 * Самый старый инструмент набора: у него был собственный клиент, не было ни
 * проверки даты, ни базовой даты. То есть ровно тот путь, через который на
 * этапе планирования и появлялся сдвиг, которого не было. Теперь ведёт себя
 * так же, как update_task, — иначе результат зависел бы от того, какой из двух
 * инструментов Claude выберет.
 *
 * Хвост по связям здесь НЕ двигается, как и в update_task; для этого move_task.
 */

export default defineTool({
  name: "update_task_deadline",
  title: "Сдвинуть дедлайн",
  description:
    "Меняет срок одной задачи. Связанные задачи НЕ двигаются — для переноса вместе с хвостом есть move_task (и preview_shift, чтобы сначала посмотреть). Пока базовый план проекта не зафиксирован, базовая дата идёт за сроком, и сдвиг не записывается; после фиксации разница становится отклонением от плана.",
  inputSchema: {
    task_id: z.string().uuid(),
    deadline: z.string().describe("Новый срок, ISO datetime"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ task_id, deadline }: { task_id: string; deadline: string }, ctx: ToolContext) => {
    if (!ctx.isAuthenticated()) return fail("Не аутентифицирован");
    const supabase = db(ctx);

    const d = new Date(deadline);
    if (Number.isNaN(d.getTime())) return fail(`Не разобрал дату «${deadline}». Нужен ISO datetime.`);
    const year = d.getUTCFullYear();
    // Те же границы, что у дрифта: испорченный год уже давал в портфеле сдвиг
    // на 739 251 день.
    if (year < 2000 || year > 2100) return fail(`Дата ${deadline} вне разумного диапазона (2000–2100).`);

    const { data: task, error: rErr } = await supabase
      .from("tasks").select("id,title,start_at,group_id").eq("id", task_id).maybeSingle();
    if (rErr) return fail(rErr.message);
    if (!task) return fail("Задача не найдена или нет прав");
    if (task.start_at && new Date(task.start_at) > d) {
      return fail(`Начало задачи (${task.start_at}) позже нового срока — задача получилась бы отрицательной длины.`);
    }

    const updates: Record<string, unknown> = { deadline: d.toISOString() };
    if (await isPlanningPhase(supabase, task.group_id)) updates.original_deadline = updates.deadline;

    const { data, error } = await supabase
      .from("tasks")
      .update(updates)
      .eq("id", task_id)
      .select("id,title,deadline,original_deadline")
      .maybeSingle();
    if (error) return fail(error.message);
    if (!data) return fail("Нет прав на изменение этой задачи");

    return {
      content: [{ type: "text" as const, text: `Срок обновлён: ${data.title} → ${data.deadline}` }],
      structuredContent: { task: data, baseline_moved_with_deadline: "original_deadline" in updates },
    };
  },
});
