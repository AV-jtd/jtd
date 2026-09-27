// Глобального process в edge-runtime (Deno 1.45) нет — только импортом.
import process from "node:process";
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
  name: "get_client",
  title: "Клиент — карточка и активность",
  description: "Возвращает CRM-клиента, привязанные открытые задачи, проекты и протоколы за 90 дней.",
  inputSchema: { client_id: z.string().uuid() },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ client_id }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Не аутентифицирован" }], isError: true };
    const supabase = db(ctx);
    const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const [{ data: client, error }, { data: tasks }, { data: projects }, { data: protocols }] = await Promise.all([
      supabase.from("clients").select("*").eq("id", client_id).maybeSingle(),
      supabase.from("tasks").select("id,title,deadline,is_completed,group_id").eq("client_id", client_id).eq("is_completed", false).limit(100),
      supabase.from("task_groups").select("id,name,project_type").eq("client_id", client_id).neq("project_type", "protocol").limit(50),
      // Дата встречи — protocol_meta.meeting_date, статус — draft_status (колонок protocol_* нет).
      supabase.from("task_groups").select("id,name,status:draft_status,meeting_date:protocol_meta->>meeting_date").eq("client_id", client_id).eq("project_type", "protocol").gte("protocol_meta->>meeting_date", since).order("protocol_meta->>meeting_date", { ascending: false }).limit(50),
    ]);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!client) return { content: [{ type: "text", text: "Клиент не найден" }], isError: true };
    return {
      content: [{ type: "text", text: `${client.name}: откр. задач ${tasks?.length ?? 0}, протоколов за 90 дн ${protocols?.length ?? 0}` }],
      structuredContent: { client, open_tasks: tasks ?? [], projects: projects ?? [], recent_protocols: protocols ?? [] },
    };
  },
});