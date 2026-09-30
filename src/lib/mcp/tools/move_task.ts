import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { db, fail } from "./_shared";
import { moveWithCascade } from "./_cascade";
import { parseTargetDate } from "./_dates";

/**
 * Перенос задачи или вехи вместе со всем, что за ней стоит по связям, — то
 * же, что перетаскивание отрезка в Ганте.
 *
 * Чем отличается от update_task с новым сроком: там меняется одна задача, как
 * в её карточке. Здесь — весь хвост, и это ровно то, ради чего коннектор
 * заводили: «отгрузка уехала на две недели» одной репликой превращается в
 * новый план, а не в двадцать правок руками.
 *
 * Дни календарные — решение владельца от 30.09. Тот же счёт, что у
 * computeCascadeUpdates в приложении; считай коннектор по рабочим дням,
 * расхождение набегало бы на каждом переносе через праздники.
 */

export default defineTool({
  name: "move_task",
  title: "Перенести задачу с пересчётом связанных",
  description:
    "Переносит задачу или веху и сдвигает всё, что стоит за ней по связям — как перетаскивание в Ганте. Укажите новую дату (new_deadline) либо сдвиг в календарных днях (shift_days, отрицательный — назад). У задачи начало едет вместе со сроком, длительность сохраняется. Затрагивает чужие сроки, поэтому сначала покажите человеку preview_shift, а move_task вызывайте после его согласия. Если нужно поправить срок ОДНОЙ задачи, ничего за ней не двигая, — это update_task.",
  inputSchema: {
    id: z.string().uuid().describe("UUID задачи или вехи."),
    new_deadline: z.string().optional().describe("Новый срок, ISO datetime."),
    shift_days: z.number().int().min(-3650).max(3650).optional().describe("Сдвиг в календарных днях вместо новой даты."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input: { id: string; new_deadline?: string; shift_days?: number }, ctx: ToolContext) => {
    if (!ctx.isAuthenticated()) return fail("Не аутентифицирован");
    const supabase = db(ctx);

    const target = await parseTargetDate(supabase, input);
    if ("error" in target) return fail(target.error);

    const result = await moveWithCascade(supabase, input.id, target.date);
    if ("error" in result) return fail(result.error);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            written: true,
            move: result.moved,
            shifted: result.shifted,
            shifted_count: result.shifted.length,
            recorded_as_drift: result.recorded_as_drift,
            baseline_note: result.recorded_as_drift
              ? "Базовый план зафиксирован — перенос записан как отклонение от плана."
              : "Проект на этапе планирования — сдвиг не записан.",
            note:
              result.shifted.length > 0
                ? "Сдвинулись чужие сроки — о них стоит сказать людям."
                : "Связанных сдвигов не потребовалось.",
          }),
        },
      ],
    };
  },
});
