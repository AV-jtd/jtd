import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { db, fail, notify, nextRecurrence } from "./_shared";

export default defineTool({
  name: "complete_task",
  title: "Закрыть задачу",
  description:
    "Закрывает задачу — так же, как кнопка в приложении. Если задача требует утверждения, она не закрывается, " +
    "а уходит на утверждение постановщику: тогда обязателен result — что сделано. " +
    "У повторяющейся задачи создаётся следующая. Участники получают уведомление.",
  inputSchema: {
    task_id: z.string().uuid(),
    result: z.string().max(4000).optional().describe("Итог работы. Обязателен для задач, требующих утверждения"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ task_id, result }, ctx) => {
    if (!ctx.isAuthenticated()) return fail("Не аутентифицирован");
    const supabase = db(ctx);

    const { data: task, error: rErr } = await supabase.from("tasks").select("*").eq("id", task_id).maybeSingle();
    if (rErr) return fail(rErr.message);
    if (!task) return fail("Задача не найдена или нет доступа");
    if (task.is_completed) return { content: [{ type: "text", text: `Уже закрыта: ${task.title}` }], structuredContent: { task_id, already: true } };

    // Утверждение — как в приложении (TaskItem → submitForApproval). База это
    // не проверяет, поэтому прямое закрытие обходило бы постановщика.
    if (task.requires_approval && task.approval_status !== "approved") {
      if (task.approval_status === "pending") return fail(`«${task.title}» уже ждёт утверждения`);
      if (!result?.trim()) return fail(`«${task.title}» требует утверждения: передайте result — что сделано. Задача уйдёт постановщику на утверждение, а не закроется.`);
      const { data: upd, error } = await supabase
        .from("tasks")
        .update({ approval_status: "pending", closure_result: result, closure_attachments: [] })
        .eq("id", task.id)
        .select("id");
      if (error) return fail(error.message);
      if (!upd?.length) return fail("Нет прав на изменение этой задачи");
      await notify(supabase, "task_completed", `⏳ Задача «${task.title}» ожидает утверждения`, [task.user_id], task.id);
      return {
        content: [{ type: "text", text: `«${task.title}» отправлена на утверждение постановщику` }],
        structuredContent: { task_id, approval_status: "pending" },
      };
    }

    const { data: upd, error } = await supabase
      .from("tasks")
      .update({ is_completed: true, completed_at: new Date().toISOString(), ...(result ? { closure_result: result } : {}) })
      .eq("id", task.id)
      .select("id");
    if (error) return fail(error.message);
    if (!upd?.length) return fail("Нет прав на изменение этой задачи");

    // Следующая повторяющаяся — как в useTasks.toggleTask.
    let next: { id: string; deadline: string | null } | null = null;
    const warnings: string[] = [];
    if (task.recurrence && task.recurrence !== "none") {
      const nextDeadline = nextRecurrence(task.deadline ? new Date(task.deadline) : new Date(), task.recurrence);
      if (!task.recurrence_end_date || nextDeadline <= new Date(task.recurrence_end_date)) {
        const { data: n, error: nErr } = await supabase
          .from("tasks")
          .insert({
            title: task.title,
            description: task.description,
            group_id: task.group_id,
            user_id: task.user_id,
            is_important: task.is_important,
            deadline: nextDeadline.toISOString(),
            assigned_to: task.assigned_to,
            recurrence: task.recurrence,
            recurrence_end_date: task.recurrence_end_date,
            parent_recurring_id: task.parent_recurring_id || task.id,
            start_at: new Date().toISOString(),
          })
          .select("id,deadline")
          .single();
        if (nErr) warnings.push(`следующая повторяющаяся не создана: ${nErr.message}`);
        else next = n;
      }
    }

    const { data: participants } = await supabase.from("task_participants").select("user_id").eq("task_id", task.id);
    await notify(supabase, "task_completed", task.title, (participants ?? []).map((p) => p.user_id), task.id);

    return {
      content: [{
        type: "text",
        text: `Закрыта: ${task.title}` + (next ? `. Следующая повторяющаяся — на ${next.deadline?.slice(0, 10)}` : "") + (warnings.length ? `. ${warnings.join("; ")}` : ""),
      }],
      structuredContent: { task_id, ...(next ? { next_task: next } : {}), ...(warnings.length ? { warnings } : {}) },
    };
  },
});
