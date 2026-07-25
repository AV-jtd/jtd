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
  name: "list_tasks",
  title: "Список задач",
  description:
    "Возвращает задачи текущего пользователя JustTODOit. Можно фильтровать: overdue (просрочены), today (дедлайн сегодня), this_week (на этой неделе), by project_id, assignee_me (я исполнитель), status. По умолчанию — только открытые задачи.",
  inputSchema: {
    filter: z
      .enum(["overdue", "today", "this_week", "all_open"])
      .optional()
      .describe("Быстрый фильтр по срокам. По умолчанию all_open."),
    project_id: z.string().uuid().optional().describe("UUID проекта (task_groups.id)."),
    assignee_me: z.boolean().optional().describe("Только задачи, где я исполнитель (assigned_to = me)."),
    include_completed: z.boolean().optional().describe("Включать закрытые задачи."),
    limit: z.number().int().min(1).max(200).optional().describe("Максимум задач в ответе. По умолчанию 50."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Не аутентифицирован" }], isError: true };
    }
    const supabase = db(ctx);
    const uid = ctx.getUserId();
    const limit = input.limit ?? 50;

    let q = supabase
      .from("tasks")
      .select(
        "id,title,description,deadline,start_at,is_completed,is_important,priority,status_meta,group_id,client_id,assigned_to,completed_at",
      )
      .order("deadline", { ascending: true, nullsFirst: false })
      .limit(limit);

    if (!input.include_completed) q = q.eq("is_completed", false);
    if (input.assignee_me) q = q.eq("assigned_to", uid);
    if (input.project_id) q = q.eq("group_id", input.project_id);

    const now = new Date();
    const iso = (d: Date) => d.toISOString();
    if (input.filter === "overdue") {
      q = q.lt("deadline", iso(now)).eq("is_completed", false);
    } else if (input.filter === "today") {
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      const end = new Date(now); end.setHours(23, 59, 59, 999);
      q = q.gte("deadline", iso(start)).lte("deadline", iso(end));
    } else if (input.filter === "this_week") {
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      const end = new Date(now); end.setDate(end.getDate() + 7);
      q = q.gte("deadline", iso(start)).lte("deadline", iso(end));
    }

    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const rows = (data ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      deadline: t.deadline,
      is_completed: t.is_completed,
      is_important: t.is_important,
      priority: t.priority,
      project_id: t.group_id,
      client_id: t.client_id,
      assigned_to: t.assigned_to,
    }));

    return {
      content: [{ type: "text", text: `Найдено задач: ${rows.length}` }],
      structuredContent: { tasks: rows },
    };
  },
});