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
  name: "get_project",
  title: "Проект — карточка и метрики",
  description: "Детали проекта + агрегаты: всего задач, открыто, просрочено, ближайшие вехи.",
  inputSchema: { project_id: z.string().uuid() },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ project_id }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Не аутентифицирован" }], isError: true };
    const supabase = db(ctx);
    const [{ data: project, error }, { data: tasks }, { data: milestones }] = await Promise.all([
      supabase.from("task_groups").select("*").eq("id", project_id).maybeSingle(),
      supabase.from("tasks").select("id,is_completed,deadline").eq("group_id", project_id),
      supabase.from("milestones").select("id,title,due_date,status").eq("group_id", project_id).order("due_date").limit(20),
    ]);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!project) return { content: [{ type: "text", text: "Проект не найден или нет доступа" }], isError: true };
    const now = Date.now();
    const total = tasks?.length ?? 0;
    const open = tasks?.filter((t) => !t.is_completed).length ?? 0;
    const overdue = tasks?.filter((t) => !t.is_completed && t.deadline && new Date(t.deadline).getTime() < now).length ?? 0;
    return {
      content: [{ type: "text", text: `${project.name}: ${open}/${total} открыто, просрочено ${overdue}` }],
      structuredContent: {
        project,
        metrics: { total, open, completed: total - open, overdue },
        milestones: milestones ?? [],
      },
    };
  },
});