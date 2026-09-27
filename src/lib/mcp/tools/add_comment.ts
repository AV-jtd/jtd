import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { db, fail, notify } from "./_shared";

export default defineTool({
  name: "add_comment",
  title: "Написать в чат задачи",
  description:
    "Добавляет сообщение в чат задачи от имени пользователя, с пометкой, что его написал Claude. " +
    "Подходит, чтобы зафиксировать в задаче суть письма или ответа. reply_to — id сообщения, на которое это ответ; " +
    "автор того сообщения получит уведомление, как в приложении.",
  inputSchema: {
    task_id: z.string().uuid(),
    content: z.string().min(1).max(4000),
    reply_to: z.string().uuid().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return fail("Не аутентифицирован");
    const uid = ctx.getUserId()!;
    const supabase = db(ctx);

    const { data: task } = await supabase.from("tasks").select("id,title").eq("id", input.task_id).maybeSingle();
    if (!task) return fail("Задача не найдена или нет доступа");

    let parentAuthor: string | null = null;
    if (input.reply_to) {
      const { data: parent } = await supabase
        .from("task_comments").select("user_id").eq("id", input.reply_to).eq("task_id", task.id).maybeSingle();
      if (!parent) return fail("Сообщение reply_to не найдено в этой задаче");
      parentAuthor = parent.user_id;
    }

    const { data, error } = await supabase
      .from("task_comments")
      .insert({
        task_id: task.id,
        user_id: uid,
        content: input.content,
        reply_to: input.reply_to ?? null,
        // kind по умолчанию 'message' — обычное сообщение чата.
        // meta.via — пометка «написал Claude», как created_by у задач.
        meta: { via: "claude" },
      })
      .select("id,created_at")
      .single();
    if (error) return fail(error.message);

    if (parentAuthor && parentAuthor !== uid) {
      await notify(supabase, "user_mentioned", `${task.title}: ${input.content.slice(0, 80)}`, [parentAuthor], task.id);
    }

    return {
      content: [{ type: "text", text: `Сообщение добавлено в чат задачи «${task.title}»` }],
      structuredContent: { comment: data, task_id: task.id },
    };
  },
});
