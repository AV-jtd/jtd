import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { db, fail, insertTask, resolveUser } from "./_shared";

export default defineTool({
  name: "create_task",
  title: "Создать задачу",
  description:
    "Создаёт задачу в JustTODOit от имени пользователя. Обязательно title. Если задача родилась из письма — передай source (тема, отправитель, дата): " +
    "задача получит пометку «создано Claude» и ссылку на письмо, по ним потом сверяются письма с задачами. " +
    "assignee — кто исполнитель: id, почта или имя (по умолчанию — сам пользователь). " +
    "Исполнитель и участники проекта получат уведомление, как при создании в приложении.",
  inputSchema: {
    title: z.string().min(1).max(500),
    description: z.string().optional(),
    deadline: z.string().optional().describe("ISO datetime, например 2026-08-15T18:00:00Z"),
    project_id: z.string().uuid().optional(),
    client_id: z.string().uuid().optional(),
    assignee: z.string().optional().describe("Исполнитель: id, почта или имя"),
    assigned_to: z.string().uuid().optional().describe("Устаревшее: то же, что assignee с id"),
    is_important: z.boolean().optional(),
    priority: z.number().int().min(1).max(4).optional(),
    source: z
      .object({
        kind: z.enum(["email", "meeting", "chat", "other"]).default("email"),
        subject: z.string().max(500).optional(),
        from: z.string().max(300).optional().describe("Отправитель письма"),
        date: z.string().optional().describe("Дата письма, ISO"),
        message_id: z.string().max(500).optional().describe("Message-ID письма, если известен"),
      })
      .optional()
      .describe("Откуда задача. Для задач из почты — обязательно."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return fail("Не аутентифицирован");
    const uid = ctx.getUserId()!;
    const supabase = db(ctx);

    let assignee = { id: uid, name: "я" };
    const who = input.assignee ?? input.assigned_to;
    if (who) {
      const r = await resolveUser(supabase, who);
      if ("error" in r) return fail(r.error);
      assignee = r;
    }

    // Пометка «создано Claude» — в status_meta, отдельной сущности писем нет
    // (решение владельца 27.09). Поиск «по письму» — текстом по source.subject.
    const status_meta: Record<string, unknown> = {
      created_by: "claude",
      created_via: "mcp",
      ...(input.source ? { source: { ...input.source, kind: input.source.kind ?? "email" } } : {}),
    };

    const created = await insertTask(supabase, uid, {
      title: input.title,
      description: input.description ?? null,
      deadline: input.deadline ?? null,
      group_id: input.project_id ?? null,
      client_id: input.client_id ?? null,
      assigned_to: assignee.id,
      is_important: input.is_important ?? false,
      priority: input.priority ?? null,
      status_meta,
    });
    if ("error" in created) return fail(created.error);
    const { task: data, warnings } = created;

    return {
      content: [{
        type: "text",
        text: `Создана задача: ${data.title}${assignee.id !== uid ? ` → ${assignee.name}` : ""}` + (warnings.length ? `. Предупреждения: ${warnings.join("; ")}` : ""),
      }],
      structuredContent: { task: data, assignee, ...(warnings.length ? { warnings } : {}) },
    };
  },
});
