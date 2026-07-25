import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function db(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_task",
  title: "Задача — детали",
  description: "Возвращает подробную карточку задачи: описание, шаги (подзадачи), комментарии, участники.",
  inputSchema: { task_id: z.string().uuid() },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ task_id }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Не аутентифицирован" }], isError: true };
    const supabase = db(ctx);
    const { data: task, error } = await supabase.from("tasks").select("*").eq("id", task_id).maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!task) return { content: [{ type: "text", text: "Задача не найдена или нет доступа" }], isError: true };

    const [{ data: steps }, { data: comments }, { data: participants }] = await Promise.all([
      supabase.from("subtasks").select("id,title,is_completed,deadline,assigned_to").eq("task_id", task_id).order("position"),
      supabase.from("comments").select("id,content,user_id,created_at").eq("task_id", task_id).order("created_at").limit(50),
      supabase.from("task_participants").select("user_id,role").eq("task_id", task_id),
    ]);

    return {
      content: [{ type: "text", text: `Задача «${task.title}»` }],
      structuredContent: { task, steps: steps ?? [], comments: comments ?? [], participants: participants ?? [] },
    };
  },
});