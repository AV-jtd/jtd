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
  name: "list_projects",
  title: "Список проектов",
  description: "Проекты (task_groups), доступные пользователю. Можно отфильтровать по типу и статусу архива. В ответе есть total и has_more: если has_more=true, показаны не все записи — не судите о количестве по длине списка.",
  inputSchema: {
    project_type: z.enum(["standard", "npd", "crm", "protocol"]).optional(),
    include_archived: z.boolean().optional(),
    limit: z.number().int().min(1).max(200).optional(),
    offset: z.number().int().min(0).optional().describe("Сколько записей пропустить. Для постраничного обхода, когда has_more=true."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Не аутентифицирован" }], isError: true };
    const supabase = db(ctx);
    const limit = input.limit ?? 100;
    const offset = input.offset ?? 0;
    let q = supabase
      .from("task_groups")
      .select("id,name,project_type,client_id,parent_id,closed_at,description", { count: "exact" })
      .order("name")
      .range(offset, offset + limit - 1);
    if (input.project_type) q = q.eq("project_type", input.project_type);
    if (!input.include_archived) q = q.is("closed_at", null);
    const { data, error, count } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = data ?? [];
    const total = count ?? rows.length;
    const hasMore = offset + rows.length < total;
    return {
      content: [{ type: "text", text: hasMore
        ? `Показано ${rows.length} проектов из ${total} (пропущено ${offset}). Это НЕ все: повторите с offset=${offset + rows.length} или сузьте фильтр.`
        : `Показано ${rows.length} проектов из ${total} — это все, что подходят под фильтр.` }],
      structuredContent: { projects: rows, total, returned: rows.length, offset, has_more: hasMore },
    };
  },
});