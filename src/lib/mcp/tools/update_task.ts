import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { db, fail, isPlanningPhase, notify, resolveUser, setStatus, STATUS_NAMES } from "./_shared";

export default defineTool({
  name: "update_task",
  title: "Изменить задачу",
  description:
    "Меняет задачу: статус, исполнителя, срок, важность, приоритет. Передавай только то, что меняется. " +
    "status — те же статусы, что в приложении: «в работе», «отправлено», «ждём ответ», «получен ответ», «завершено», «отменено»; " +
    "«none» снимает статус. Статус — это пометка хода работы, он НЕ закрывает задачу: для закрытия — complete_task. " +
    "assignee — id, почта или имя; новый исполнитель получит уведомление. deadline: null снимает срок. " +
    "start_at — дата начала: с ней задача становится отрезком на Ганте, а не точкой; длительность нигде не хранится, она считается из начала и срока. " +
    "Внимание: здесь срок меняется БЕЗ пересчёта связанных задач — это правка задачи, как в её карточке. Чтобы перенести задачу вместе со всем, что за ней стоит, есть move_task (и preview_shift, чтобы сначала посмотреть).",
  inputSchema: {
    task_id: z.string().uuid(),
    status: z.enum([...STATUS_NAMES, "none"]).optional(),
    assignee: z.string().optional().describe("Новый исполнитель: id, почта или имя"),
    deadline: z.string().nullable().optional().describe("ISO datetime; null — снять срок"),
    start_at: z.string().nullable().optional().describe("Дата начала, ISO datetime; null — снять начало"),
    is_important: z.boolean().optional(),
    priority: z.number().int().min(1).max(4).nullable().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return fail("Не аутентифицирован");
    const uid = ctx.getUserId()!;
    const supabase = db(ctx);

    const { data: task, error: rErr } = await supabase
      .from("tasks").select("id,title,assigned_to,is_completed,group_id").eq("id", input.task_id).maybeSingle();
    if (rErr) return fail(rErr.message);
    if (!task) return fail("Задача не найдена или нет доступа");

    const updates: Record<string, unknown> = {};
    let newAssignee: { id: string; name: string } | null = null;
    if (input.assignee !== undefined) {
      const r = await resolveUser(supabase, input.assignee);
      if ("error" in r) return fail(r.error);
      newAssignee = r;
      updates.assigned_to = r.id; // отдел и подрядчика снимет триггер enforce_assignee_exclusivity
    }
    // Даты разбираем до записи. Границы те же, что у дрифта: испорченный год
    // в базовой дате уже давал в портфеле сдвиг на 739 251 день.
    for (const field of ["deadline", "start_at"] as const) {
      const raw = input[field];
      if (raw === undefined) continue;
      if (raw === null) {
        updates[field] = null;
        continue;
      }
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return fail(`Не разобрал ${field}: «${raw}». Нужен ISO datetime.`);
      const y = d.getUTCFullYear();
      if (y < 2000 || y > 2100) return fail(`Дата ${raw} вне разумного диапазона (2000–2100).`);
      updates[field] = d.toISOString();
    }

    // Начало позже срока — отрезок отрицательной длины: Гант такое рисует
    // задом наперёд, а каскад считает длительность отрицательной.
    const finalStart = "start_at" in updates ? (updates.start_at as string | null) : undefined;
    const finalDeadline = "deadline" in updates ? (updates.deadline as string | null) : undefined;
    if (finalStart || finalDeadline) {
      const { data: cur } = await supabase
        .from("tasks").select("start_at,deadline").eq("id", input.task_id).maybeSingle();
      const start = finalStart !== undefined ? finalStart : (cur?.start_at ?? null);
      const end = finalDeadline !== undefined ? finalDeadline : (cur?.deadline ?? null);
      if (start && end && new Date(start).getTime() > new Date(end).getTime()) {
        return fail(`Начало (${start}) позже срока (${end}) — так задача получится отрицательной длины.`);
      }
    }
    if (input.is_important !== undefined) updates.is_important = input.is_important;
    if (input.priority !== undefined) updates.priority = input.priority;

    // Пока базовый план проекта не зафиксирован, базовая дата идёт за сроком —
    // как в приложении. Иначе срок, проставленный здесь на этапе планирования,
    // показался бы в портфеле сдвигом, которого не было.
    if (updates.deadline && (await isPlanningPhase(supabase, task.group_id))) {
      updates.original_deadline = updates.deadline;
    }

    const changed: string[] = [];
    if (Object.keys(updates).length) {
      // .select() обязателен: без него UPDATE, отфильтрованный RLS до нуля
      // строк, возвращает error=null — как и в приложении (useTasks.updateTask).
      const { data: upd, error } = await supabase.from("tasks").update(updates).eq("id", task.id).select("id");
      if (error) return fail(error.message);
      if (!upd?.length) return fail("Нет прав на изменение этой задачи");
      if (newAssignee) changed.push(`исполнитель → ${newAssignee.name}`);
      if ("deadline" in updates) changed.push(updates.deadline ? `срок → ${updates.deadline}` : "срок снят");
      if ("start_at" in updates) changed.push(updates.start_at ? `начало → ${updates.start_at}` : "начало снято");
      if ("is_important" in updates) changed.push(updates.is_important ? "важная" : "не важная");
      if ("priority" in updates) changed.push(`приоритет → ${updates.priority ?? "нет"}`);
    }

    if (input.status) {
      const r = await setStatus(supabase, uid, task.id, input.status);
      if ("error" in r) return fail(`${changed.length ? `Изменено: ${changed.join(", ")}. ` : ""}Статус не поставлен: ${r.error}`);
      changed.push(r.name ? `статус → ${r.name}` : "статус снят");
    }
    if (!changed.length) return fail("Нечего менять: не передано ни одного поля");

    // Уведомление о назначении — как в приложении: если исполнитель не я.
    if (newAssignee && newAssignee.id !== uid && newAssignee.id !== task.assigned_to) {
      await notify(supabase, "task_assigned", task.title, [newAssignee.id], task.id);
    }

    return {
      content: [{ type: "text", text: `«${task.title}»: ${changed.join(", ")}` }],
      structuredContent: { task_id: task.id, changed },
    };
  },
});
