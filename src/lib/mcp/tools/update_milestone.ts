import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { db, fail } from "./_shared";
import { MILESTONE_STATUSES } from "./create_milestone";

/**
 * Изменение вехи: перенос плановой даты, отметка о достижении, статус.
 *
 * Отдельно от create_milestone намеренно: перенос вехи — это то, ради чего
 * коннектор и нужен («письмо про сдвиг отгрузки → новый план»), и путать его
 * с созданием нельзя. Случайно созданная веха вместо перенесённой засорит
 * расписание молча.
 *
 * Плановая и фактическая даты живут отдельно, как и в приложении: перенос
 * плана — это не то же самое, что «веха достигнута», и склеивать их нельзя.
 * Отсюда и расчёт опоздания в расписании: факт минус план.
 */

const isoOrNull = z.string().nullable().optional();

export default defineTool({
  name: "update_milestone",
  title: "Изменить веху проекта",
  description:
    "Меняет веху: переносит плановую дату, отмечает достижение (actual_date), меняет статус, название или описание. Передавайте только то, что меняете — остальное останется как есть. Чтобы отметить веху достигнутой, задайте actual_date и status=completed. Чтобы снять отметку — actual_date=null.",
  inputSchema: {
    milestone_id: z.string().uuid().describe("UUID вехи (project_milestones.id)."),
    name: z.string().min(1).max(300).optional(),
    planned_date: z.string().optional().describe("Новая плановая дата, ISO datetime."),
    actual_date: isoOrNull.describe("Фактическая дата достижения, ISO datetime; null — снять отметку."),
    status: z.enum(MILESTONE_STATUSES).optional(),
    description: z.string().max(2000).nullable().optional(),
    gate_key: z.string().max(60).nullable().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async (
    input: {
      milestone_id: string;
      name?: string;
      planned_date?: string;
      actual_date?: string | null;
      status?: (typeof MILESTONE_STATUSES)[number];
      description?: string | null;
      gate_key?: string | null;
    },
    ctx: ToolContext,
  ) => {
    if (!ctx.isAuthenticated()) return fail("Не аутентифицирован");
    const supabase = db(ctx);

    const { data: before, error: rErr } = await supabase
      .from("project_milestones")
      .select("id,group_id,name,planned_date,actual_date,status")
      .eq("id", input.milestone_id)
      .maybeSingle();
    if (rErr) return fail(rErr.message);
    if (!before) return fail("Веха не найдена или недоступна");

    // Разбор дат до записи: частично применённое изменение хуже отказа.
    const patch: Record<string, unknown> = {};
    for (const field of ["planned_date", "actual_date"] as const) {
      const raw = input[field];
      if (raw === undefined) continue;
      if (raw === null) {
        patch[field] = null;
        continue;
      }
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return fail(`Не разобрал ${field}: «${raw}». Нужен ISO datetime.`);
      const y = d.getUTCFullYear();
      if (y < 2000 || y > 2100) return fail(`Дата ${raw} вне разумного диапазона (2000–2100).`);
      patch[field] = d.toISOString();
    }
    if (input.name !== undefined) patch.name = input.name;
    if (input.status !== undefined) patch.status = input.status;
    if (input.description !== undefined) patch.description = input.description;
    if (input.gate_key !== undefined) patch.gate_key = input.gate_key;

    if (Object.keys(patch).length === 0) return fail("Нечего менять: не передано ни одного поля");
    patch.updated_at = new Date().toISOString();

    const { data: after, error } = await supabase
      .from("project_milestones")
      .update(patch)
      .eq("id", input.milestone_id)
      .select("id,name,planned_date,actual_date,status,gate_key")
      .single();
    if (error) return fail(error.message);

    // Показываем сдвиг явно: «перенесена на 14 дней» читается лучше, чем две
    // даты, из которых разницу надо считать в уме.
    const shiftDays =
      input.planned_date !== undefined && before.planned_date
        ? Math.round(
            (new Date(after.planned_date).getTime() - new Date(before.planned_date).getTime()) / 86400000,
          )
        : null;

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            updated: true,
            milestone: after,
            was: { planned_date: before.planned_date, actual_date: before.actual_date, status: before.status },
            planned_shift_days: shiftDays,
          }),
        },
      ],
    };
  },
});
