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
  name: "get_protocol",
  title: "Протокол — содержимое и связанные задачи",
  description: "Возвращает протокол, задачи повестки и задачи, порождённые из встречи (source_protocol_id).",
  inputSchema: { protocol_id: z.string().uuid() },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ protocol_id }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Не аутентифицирован" }], isError: true };
    const supabase = db(ctx);
    const [{ data: protocol, error }, { data: agenda }, { data: followups }] = await Promise.all([
      supabase.from("task_groups").select("*").eq("id", protocol_id).eq("project_type", "protocol").maybeSingle(),
      supabase.from("tasks").select("id,title,description,is_completed,deadline,assigned_to").eq("group_id", protocol_id).order("position"),
      supabase.from("tasks").select("id,title,is_completed,deadline,group_id,assigned_to").eq("source_protocol_id", protocol_id).limit(200),
    ]);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!protocol) return { content: [{ type: "text", text: "Протокол не найден" }], isError: true };
    return {
      content: [{ type: "text", text: `Протокол «${protocol.name}»` }],
      structuredContent: { protocol, agenda: agenda ?? [], followup_tasks: followups ?? [] },
    };
  },
});