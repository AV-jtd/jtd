import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { db, fail } from "./_shared";

/**
 * Снятие связи.
 *
 * В отличие от удаления вехи, здесь удаление выставлено намеренно: связь —
 * это два идентификатора и тип, её восстанавливает тот же link_tasks одной
 * репликой. Терять нечего.
 *
 * Даты при снятии связи НЕ откатываются — ровно как в приложении. Сдвинутые
 * сроки к этому моменту уже могли согласовать с людьми, и тихо возвращать их
 * назад нельзя. Если нужно вернуть — это отдельное решение и отдельный вызов.
 */

export default defineTool({
  name: "unlink_tasks",
  title: "Снять связь между задачами или вехами",
  description:
    "Удаляет связь «предшественник → преемник». Укажите либо dependency_id, либо пару predecessor_id/successor_id. Сроки, ранее сдвинутые этой связью, остаются как есть — снятие связи их не откатывает.",
  inputSchema: {
    dependency_id: z.string().uuid().optional().describe("UUID связи (task_dependencies.id)."),
    predecessor_id: z.string().uuid().optional().describe("UUID предшественника — вместо dependency_id."),
    successor_id: z.string().uuid().optional().describe("UUID преемника — вместо dependency_id."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (
    input: { dependency_id?: string; predecessor_id?: string; successor_id?: string },
    ctx: ToolContext,
  ) => {
    if (!ctx.isAuthenticated()) return fail("Не аутентифицирован");
    const supabase = db(ctx);

    const byPair = !!(input.predecessor_id && input.successor_id);
    if (!input.dependency_id && !byPair) {
      return fail("Нужен либо dependency_id, либо оба: predecessor_id и successor_id");
    }

    let q = supabase
      .from("task_dependencies")
      .select("id,predecessor_id,successor_id,dependency_type,lag_days");
    q = input.dependency_id
      ? q.eq("id", input.dependency_id)
      : q.eq("predecessor_id", input.predecessor_id!).eq("successor_id", input.successor_id!);

    const { data: found, error: rErr } = await q;
    if (rErr) return fail(rErr.message);
    if (!found || found.length === 0) return fail("Связь не найдена или недоступна");
    // Пара идентификаторов теоретически может совпасть у двух строк; удалять
    // «какую-нибудь» из них нельзя.
    if (found.length > 1) {
      return fail(
        `Под условие подходит ${found.length} связей: ${found.map((d) => d.id).join(", ")}. Укажите dependency_id.`,
      );
    }

    const dep = found[0];
    const { error } = await supabase.from("task_dependencies").delete().eq("id", dep.id);
    if (error) return fail(error.message);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ deleted: true, dependency: dep, note: "Сроки не откатывались" }),
        },
      ],
    };
  },
});
