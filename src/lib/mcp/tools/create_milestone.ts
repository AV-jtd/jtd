import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { db, fail } from "./_shared";

/**
 * Создание вехи проекта.
 *
 * Веха — отдельная сущность (`project_milestones`), а не флаг на задаче:
 * решение владельца от 30.09. Второй вид вех заставил бы считать каждый
 * счётчик дважды — тем же способом, каким разъехались дрифт и счётчики
 * дашборда.
 *
 * Поведение повторяет useMilestones.tsx приложения: позиция считается как
 * последняя в проекте плюс один, цвет по умолчанию тот же.
 *
 * Отличие одно и намеренное: плановую дату требуем явно. В приложении она
 * подставляется сегодняшним днём, потому что человек видит форму и сразу
 * поправит. Claude формы не видит — молча созданная веха «на сегодня» уедет
 * в расписание как настоящая.
 */

export const MILESTONE_STATUSES = [
  "pending",
  "in_progress",
  "go",
  "no_go",
  "conditional",
  "completed",
  "missed",
] as const;

export default defineTool({
  name: "create_milestone",
  title: "Создать веху проекта",
  description:
    "Создаёт веху (контрольную точку) в проекте. Обязательны название, проект и плановая дата. Вехи видны в расписании проекта (get_project_schedule) и на Ганте. Статусы: pending — ожидает, in_progress — в процессе, go / no_go / conditional — решения гейта, completed — завершена, missed — пропущена.",
  inputSchema: {
    project_id: z.string().uuid().describe("UUID проекта (task_groups.id)."),
    name: z.string().min(1).max(300).describe("Название вехи."),
    planned_date: z.string().describe("Плановая дата, ISO datetime. Например 2026-12-01T00:00:00Z."),
    description: z.string().max(2000).optional(),
    status: z.enum(MILESTONE_STATUSES).optional().describe("По умолчанию pending."),
    gate_key: z.string().max(60).nullable().optional().describe("Ключ гейта НИОКР, если веха привязана к гейту."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (
    input: {
      project_id: string;
      name: string;
      planned_date: string;
      description?: string;
      status?: (typeof MILESTONE_STATUSES)[number];
      gate_key?: string | null;
    },
    ctx: ToolContext,
  ) => {
    if (!ctx.isAuthenticated()) return fail("Не аутентифицирован");
    const uid = ctx.getUserId()!;
    const supabase = db(ctx);

    const planned = new Date(input.planned_date);
    if (Number.isNaN(planned.getTime())) return fail(`Не разобрал дату «${input.planned_date}». Нужен ISO datetime.`);
    const year = planned.getUTCFullYear();
    // Те же границы, что у дрифта: веха в 0002 году сломает расписание так же,
    // как сломала счётчик сдвига в портфеле.
    if (year < 2000 || year > 2100) return fail(`Дата ${input.planned_date} вне разумного диапазона (2000–2100).`);

    // Проверяем проект отдельно, чтобы отказ был понятным, а не отказом политики
    // доступа на вставке.
    const { data: project, error: pErr } = await supabase
      .from("task_groups")
      .select("id,name")
      .eq("id", input.project_id)
      .maybeSingle();
    if (pErr) return fail(pErr.message);
    if (!project) return fail("Проект не найден или недоступен");

    // Позиция — как в приложении: последняя в проекте плюс один.
    const { data: last } = await supabase
      .from("project_milestones")
      .select("position")
      .eq("group_id", input.project_id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: created, error } = await supabase
      .from("project_milestones")
      .insert({
        group_id: input.project_id,
        name: input.name,
        planned_date: planned.toISOString(),
        description: input.description ?? null,
        status: input.status ?? "pending",
        gate_key: input.gate_key ?? null,
        color: "#3b82f6",
        created_by: uid,
        position: (last?.position ?? 0) + 1,
      })
      .select("id,name,planned_date,status")
      .single();
    if (error) return fail(error.message);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            created: true,
            milestone: created,
            project: { id: project.id, name: project.name },
          }),
        },
      ],
    };
  },
});
