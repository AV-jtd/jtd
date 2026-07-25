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
  name: "complete_task",
  title: "Закрыть задачу",
  description: "Помечает задачу как выполненную (is_completed = true, completed_at = now).",
  inputSchema: { task_id: z.string().uuid() },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ task_id }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Не аутентифицирован" }], isError: true };
    const supabase = db(ctx);
    const { data, error } = await supabase
      .from("tasks")
      .update({ is_completed: true, completed_at: new Date().toISOString() })
      .eq("id", task_id)
      .select("id,title")
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: "Задача не найдена или нет прав" }], isError: true };
    return { content: [{ type: "text", text: `Закрыта: ${data.title}` }], structuredContent: { task: data } };
  },
});