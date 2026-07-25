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
  name: "list_projects",
  title: "Список проектов",
  description: "Проекты (task_groups), доступные пользователю. Можно отфильтровать по типу и статусу архива.",
  inputSchema: {
    project_type: z.enum(["standard", "npd", "crm", "protocol"]).optional(),
    include_archived: z.boolean().optional(),
    limit: z.number().int().min(1).max(200).optional(),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Не аутентифицирован" }], isError: true };
    const supabase = db(ctx);
    let q = supabase
      .from("task_groups")
      .select("id,name,project_type,client_id,parent_id,closed_at,description")
      .order("name")
      .limit(input.limit ?? 100);
    if (input.project_type) q = q.eq("project_type", input.project_type);
    if (!input.include_archived) q = q.is("closed_at", null);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Проектов: ${data?.length ?? 0}` }],
      structuredContent: { projects: data ?? [] },
    };
  },
});