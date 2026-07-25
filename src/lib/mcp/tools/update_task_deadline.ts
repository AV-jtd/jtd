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
  name: "update_task_deadline",
  title: "Сдвинуть дедлайн",
  description: "Меняет дедлайн задачи. Если у задачи был baseline lock — сдвиг зафиксируется как drift.",
  inputSchema: {
    task_id: z.string().uuid(),
    deadline: z.string().describe("Новый дедлайн, ISO datetime"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ task_id, deadline }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Не аутентифицирован" }], isError: true };
    const supabase = db(ctx);
    const { data, error } = await supabase
      .from("tasks")
      .update({ deadline })
      .eq("id", task_id)
      .select("id,title,deadline,original_deadline")
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: "Задача не найдена или нет прав" }], isError: true };
    return { content: [{ type: "text", text: `Дедлайн обновлён: ${data.title}` }], structuredContent: { task: data } };
  },
});