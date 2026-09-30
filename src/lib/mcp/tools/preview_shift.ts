import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { db, fail } from "./_shared";
import { moveWithCascade } from "./_cascade";
import { parseTargetDate } from "./_dates";

/**
 * «Что будет, если сдвинуть» — без записи.
 *
 * Отдельный инструмент, а не флаг у move_task: перенос тянет за собой чужие
 * задачи с чужими сроками, о которых люди уже договорились. Флаг со значением
 * по умолчанию рано или поздно окажется не тем, а показ последствий должен быть
 * тем, что делается само, без напоминания.
 */

export default defineTool({
  name: "preview_shift",
  title: "Показать последствия переноса",
  description:
    "Считает, что произойдёт при переносе задачи или вехи: на сколько дней сдвинется она сама и что потянется за ней по связям. НИЧЕГО не записывает. Укажите новую дату (new_deadline) либо сдвиг в календарных днях (shift_days, можно отрицательный — перенос назад). Показывайте результат человеку до записи: сдвиг задевает сроки, о которых уже могли договориться. Применяет перенос move_task.",
  inputSchema: {
    id: z.string().uuid().describe("UUID задачи или вехи."),
    new_deadline: z.string().optional().describe("Новый срок, ISO datetime."),
    shift_days: z.number().int().min(-3650).max(3650).optional().describe("Сдвиг в календарных днях вместо новой даты."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (input: { id: string; new_deadline?: string; shift_days?: number }, ctx: ToolContext) => {
    if (!ctx.isAuthenticated()) return fail("Не аутентифицирован");
    const supabase = db(ctx);

    const target = await parseTargetDate(supabase, input);
    if ("error" in target) return fail(target.error);

    const result = await moveWithCascade(supabase, input.id, target.date, { dryRun: true });
    if ("error" in result) return fail(result.error);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            written: false,
            move: result.moved,
            would_shift: result.shifted,
            would_shift_count: result.shifted.length,
            recorded_as_drift: result.recorded_as_drift,
            baseline_note: result.recorded_as_drift
              ? "Базовый план проекта зафиксирован: перенос запишется как отклонение и попадёт в портфель. Скажите об этом человеку."
              : "Проект ещё на этапе планирования: перенос сдвигом не запишется.",
            apply_with: "move_task",
          }),
        },
      ],
    };
  },
});
