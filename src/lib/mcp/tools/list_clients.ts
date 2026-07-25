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
  name: "list_clients",
  title: "Список CRM-клиентов",
  description: "Возвращает CRM-клиентов. Можно искать по имени и фильтровать по территории/рангу/менеджеру.",
  inputSchema: {
    search: z.string().optional().describe("Подстрока в имени клиента"),
    territory: z.string().optional(),
    rank: z.string().optional(),
    manager_id: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(200).optional(),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Не аутентифицирован" }], isError: true };
    const supabase = db(ctx);
    let q = supabase
      .from("clients")
      .select("id,name,territory,rank,manager_id,retail_type,logo_url")
      .order("name")
      .limit(input.limit ?? 100);
    if (input.search) q = q.ilike("name", `%${input.search}%`);
    if (input.territory) q = q.eq("territory", input.territory);
    if (input.rank) q = q.eq("rank", input.rank);
    if (input.manager_id) q = q.eq("manager_id", input.manager_id);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Клиентов: ${data?.length ?? 0}` }],
      structuredContent: { clients: data ?? [] },
    };
  },
});