import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { db, fail } from "./_shared";
import { wouldCreateCycle } from "../../dependencyGraph";
import { cascade, entityKind, fetchDependencies } from "./_cascade";

/**
 * Связь «что за чем идёт» между двумя элементами расписания — задачами или
 * вехами, в любом сочетании.
 *
 * Без связей Гант остаётся набором отрезков: перенос отгрузки не двигает
 * подготовку, и ответить «что будет, если сдвинуть» нечем. Связи — второе из
 * трёх, чего коннектору не хватало (первое, вехи, уже есть).
 *
 * Поведение повторяет приложение (useDependencies.tsx): проверка на цикл до
 * записи, тип FS и лаг 0 по умолчанию, после записи — каскадный пересчёт
 * преемников.
 */

export const DEPENDENCY_TYPES = ["FS", "SS", "FF", "SF"] as const;

export default defineTool({
  name: "link_tasks",
  title: "Связать задачи или вехи",
  description:
    "Создаёт связь «предшественник → преемник» между задачами и/или вехами. Тип FS (финиш→старт) по умолчанию, lag_days — задержка в календарных днях (можно отрицательную: преемник начинается раньше конца предшественника). После записи преемники автоматически сдвигаются вперёд, если нарушали связь — как и в приложении; сдвинутое возвращается списком. Связь, создающая цикл, отклоняется. Идентификаторы берите из get_project_schedule.",
  inputSchema: {
    predecessor_id: z.string().uuid().describe("UUID того, что идёт первым (задача или веха)."),
    successor_id: z.string().uuid().describe("UUID того, что идёт следом (задача или веха)."),
    dependency_type: z
      .enum(DEPENDENCY_TYPES)
      .optional()
      .describe("FS — финиш→старт (по умолчанию), SS — старт→старт, FF — финиш→финиш, SF — старт→финиш."),
    lag_days: z.number().int().min(-365).max(365).optional().describe("Задержка в календарных днях. По умолчанию 0."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (
    input: {
      predecessor_id: string;
      successor_id: string;
      dependency_type?: (typeof DEPENDENCY_TYPES)[number];
      lag_days?: number;
    },
    ctx: ToolContext,
  ) => {
    if (!ctx.isAuthenticated()) return fail("Не аутентифицирован");
    const uid = ctx.getUserId()!;
    const supabase = db(ctx);

    if (input.predecessor_id === input.successor_id) return fail("Нельзя связать элемент сам с собой");

    // Тип узла выясняем по факту, а не спрашиваем: Claude видит в расписании
    // идентификатор, и требовать «это веха или задача» — это лишний повод
    // ошибиться в поле, которое можно проверить.
    const predKind = await entityKind(supabase, input.predecessor_id);
    if (!predKind) return fail("Предшественник не найден или недоступен");
    const succKind = await entityKind(supabase, input.successor_id);
    if (!succKind) return fail("Преемник не найден или недоступен");

    const deps = await fetchDependencies(supabase);
    if ("error" in deps) return fail(deps.error);

    if (deps.some((d) => d.predecessor_id === input.predecessor_id && d.successor_id === input.successor_id)) {
      return fail("Такая связь уже есть");
    }
    // Проверка до записи: цикл, записанный и потом снятый, успеет утащить даты
    // каскадом, а откатывать их нечем.
    if (wouldCreateCycle(input.predecessor_id, input.successor_id, deps as never)) {
      return fail("Такая связь замкнёт цепочку в кольцо — отказано");
    }

    const row = {
      predecessor_id: input.predecessor_id,
      successor_id: input.successor_id,
      dependency_type: input.dependency_type ?? "FS",
      lag_days: input.lag_days ?? 0,
      predecessor_entity_type: predKind,
      successor_entity_type: succKind,
      created_by: uid,
    };

    const { data: created, error } = await supabase
      .from("task_dependencies")
      .insert(row)
      .select("id,predecessor_id,successor_id,dependency_type,lag_days")
      .single();
    if (error) return fail(error.message);

    const result = await cascade(
      supabase,
      [...deps, { ...row, id: created.id }],
      [input.predecessor_id, input.successor_id],
    );
    if ("error" in result) {
      // Связь уже записана; молчать про недоделанный каскад нельзя — иначе
      // расписание выглядит согласованным, а даты не сошлись.
      return fail(`Связь создана (${created.id}), но пересчёт сроков не завершён: ${result.error}`);
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            created: true,
            dependency: { ...created, predecessor_kind: predKind, successor_kind: succKind },
            shifted: result.shifted,
            shifted_count: result.shifted.length,
          }),
        },
      ],
    };
  },
});
