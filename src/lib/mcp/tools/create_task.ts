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
  name: "create_task",
  title: "Создать задачу",
  description:
    "Создаёт новую задачу в JustTODOit. Обязательно title. Опционально: deadline (ISO datetime), project_id (task_groups.id), client_id, assigned_to (user_id — по умолчанию я).",
  inputSchema: {
    title: z.string().min(1).max(500),
    description: z.string().optional(),
    deadline: z.string().optional().describe("ISO datetime, например 2026-08-15T18:00:00Z"),
    project_id: z.string().uuid().optional(),
    client_id: z.string().uuid().optional(),
    assigned_to: z.string().uuid().optional(),
    is_important: z.boolean().optional(),
    priority: z.number().int().min(1).max(4).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Не аутентифицирован" }], isError: true };
    const uid = ctx.getUserId();
    const supabase = db(ctx);
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        user_id: uid,
        title: input.title,
        description: input.description ?? null,
        deadline: input.deadline ?? null,
        group_id: input.project_id ?? null,
        client_id: input.client_id ?? null,
        assigned_to: input.assigned_to ?? uid,
        is_important: input.is_important ?? false,
        priority: input.priority ?? null,
      })
      .select("id,title,deadline,group_id")
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Создана задача: ${data.title}` }],
      structuredContent: { task: data },
    };
  },
});