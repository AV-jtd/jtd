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
  name: "list_protocols",
  title: "Список протоколов встреч",
  description: "Возвращает протоколы (task_groups с project_type='protocol'). Фильтры: клиент, статус (draft/published), диапазон дат.",
  inputSchema: {
    client_id: z.string().uuid().optional(),
    status: z.enum(["draft", "published"]).optional(),
    date_from: z.string().optional().describe("ISO date, включительно"),
    date_to: z.string().optional().describe("ISO date, включительно"),
    limit: z.number().int().min(1).max(100).optional(),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Не аутентифицирован" }], isError: true };
    const supabase = db(ctx);
    let q = supabase
      .from("task_groups")
      .select("id,name,description,client_id,created_at,protocol_status,protocol_date")
      .eq("project_type", "protocol")
      .order("protocol_date", { ascending: false, nullsFirst: false })
      .limit(input.limit ?? 50);
    if (input.client_id) q = q.eq("client_id", input.client_id);
    if (input.status) q = q.eq("protocol_status", input.status);
    if (input.date_from) q = q.gte("protocol_date", input.date_from);
    if (input.date_to) q = q.lte("protocol_date", input.date_to);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Протоколов: ${data?.length ?? 0}` }],
      structuredContent: { protocols: data ?? [] },
    };
  },
});