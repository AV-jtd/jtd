// Глобального process в edge-runtime (Deno 1.45) нет — только импортом.
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { resolveNames, shapeTask } from "./_names";

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
    "Возвращает задачи текущего пользователя JustTODOit. Можно фильтровать: overdue (просрочены), today (дедлайн сегодня), this_week (на этой неделе), by project_id, assignee_me (я исполнитель), status. По умолчанию — только открытые задачи. В ответе есть total (сколько всего подходит под фильтр) и has_more: если has_more=true, показаны не все задачи, используйте offset или сузьте фильтр. НЕ делайте выводов о количестве по длине списка — сверяйтесь с total.",
  inputSchema: {
    filter: z
      .enum(["overdue", "today", "this_week", "all_open"])
      .optional()
      .describe("Быстрый фильтр по срокам. По умолчанию all_open."),
    project_id: z.string().uuid().optional().describe("UUID проекта (task_groups.id)."),
    assignee_me: z.boolean().optional().describe("Только задачи, где я исполнитель (assigned_to = me)."),
    include_completed: z.boolean().optional().describe("Включать закрытые задачи."),
    limit: z.number().int().min(1).max(200).optional().describe("Максимум задач в ответе. По умолчанию 50."),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Сколько задач пропустить. Для постраничного обхода, когда has_more=true."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Не аутентифицирован" }], isError: true };
    }
    const supabase = db(ctx);
    const uid = ctx.getUserId();
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;

    // count: "exact" — чтобы вернуть настоящее общее число, а не длину выдачи.
    // Раньше в ответе было «Найдено задач: N», где N — число ВОЗВРАЩЁННЫХ
    // строк. При лимите 50 и 5720 открытых задачах (замер 27.09) модель
    // уверенно заключала, что видит всё, и делала выводы по 0,9% данных.
    let q = supabase
      .from("tasks")
      .select(
        "id,title,description,deadline,start_at,is_completed,is_important,priority,status_meta,group_id,client_id,assigned_to,completed_at",
        { count: "exact" },
      )
      .order("deadline", { ascending: true, nullsFirst: false })
      .range(offset, offset + limit - 1);

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

    const { data, error, count } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const names = await resolveNames(supabase, data ?? []);

    const rows = (data ?? []).map((t) => shapeTask(t, names));

    const total = count ?? rows.length;
    const hasMore = offset + rows.length < total;

    // Текст читает модель, поэтому усечение названо прямо, а не выводится из
    // чисел: «показано 50 из 5720» плюс что делать дальше.
    const text = hasMore
      ? `Показано ${rows.length} задач из ${total} (пропущено ${offset}). Это НЕ все: чтобы увидеть остальные, повторите с offset=${offset + rows.length} или сузьте фильтр.`
      : `Показано ${rows.length} задач из ${total} — это все, что подходят под фильтр.`;

    return {
      content: [{ type: "text", text }],
      structuredContent: {
        tasks: rows,
        total,
        returned: rows.length,
        offset,
        has_more: hasMore,
      },
    };
  },
});
