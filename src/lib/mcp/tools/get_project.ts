// Глобального process в edge-runtime (Deno 1.45) нет — только импортом.
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { resolveNames } from "./_names";

function db(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_project",
  title: "Проект — карточка, метрики и последние обсуждения",
  description:
    "Детали проекта, агрегаты (всего задач, открыто, просрочено), ближайшие вехи и последние сообщения в чате проекта. Метрики считаются на сервере, а не по выборке, поэтому им можно верить.",
  inputSchema: {
    project_id: z.string().uuid(),
    messages_limit: z
      .number()
      .int()
      .min(0)
      .max(50)
      .optional()
      .describe("Сколько последних сообщений чата вернуть. По умолчанию 10, 0 — не возвращать."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ project_id, messages_limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Не аутентифицирован" }], isError: true };
    const supabase = db(ctx);
    const msgLimit = messages_limit ?? 10;
    const nowIso = new Date().toISOString();

    // Метрики считаются запросами с count и head, без выгрузки строк. Раньше
    // сюда тянулись ВСЕ задачи проекта и считались по длине массива: при
    // достаточно большом проекте (или при появлении предела строк у PostgREST)
    // числа поехали бы молча. Сейчас проектов больше тысячи задач нет, но
    // считать по выборке всё равно неправильно.
    const countOf = (build: (q: ReturnType<typeof baseTasks>) => ReturnType<typeof baseTasks>) =>
      build(baseTasks());
    function baseTasks() {
      return supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("group_id", project_id);
    }

    const [
      { data: project, error: projectError },
      totalRes,
      openRes,
      overdueRes,
      milestonesRes,
      messagesRes,
    ] = await Promise.all([
      supabase.from("task_groups").select("*").eq("id", project_id).maybeSingle(),
      countOf((q) => q),
      countOf((q) => q.eq("is_completed", false)),
      countOf((q) => q.eq("is_completed", false).lt("deadline", nowIso)),
      // Таблица называется project_milestones. Здесь стояло "milestones" —
      // такой таблицы нет, запрос всегда падал, а его ошибка не проверялась:
      // вехи молча приходили пустыми. Теперь ошибка видна в ответе.
      supabase
        .from("project_milestones")
        .select("id,name,planned_date,actual_date,status")
        .eq("group_id", project_id)
        .order("planned_date", { nullsFirst: false })
        .limit(20),
      msgLimit > 0
        ? supabase
            .from("group_messages")
            .select("id,content,created_at,user_id,external_author,source")
            .eq("group_id", project_id)
            .order("created_at", { ascending: false })
            .limit(msgLimit)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (projectError) return { content: [{ type: "text", text: projectError.message }], isError: true };
    if (!project) return { content: [{ type: "text", text: "Проект не найден или нет доступа" }], isError: true };

    const total = totalRes.count ?? 0;
    const open = openRes.count ?? 0;
    const overdue = overdueRes.count ?? 0;

    // Имя автора сообщения: иначе на «кто это написал» нужен отдельный вызов.
    const msgs = (messagesRes.data ?? []) as Array<{
      id: string; content: string | null; created_at: string;
      user_id: string | null; external_author: string | null; source: string | null;
    }>;
    const names = await resolveNames(
      supabase,
      msgs.map((m) => ({ assigned_to: m.user_id })),
    );

    // Проблемы второстепенных запросов не прячем: пустой список и молчание —
    // это ровно тот случай, из-за которого вехи не приходили полгода.
    const warnings: string[] = [];
    if (milestonesRes.error) warnings.push(`вехи не получены: ${milestonesRes.error.message}`);
    if (messagesRes.error) warnings.push(`сообщения не получены: ${messagesRes.error.message}`);

    const head = `${project.name}: ${open} из ${total} открыто, просрочено ${overdue}`;
    const tail = warnings.length ? ` ⚠️ ${warnings.join("; ")}` : "";

    return {
      content: [{ type: "text", text: head + tail }],
      structuredContent: {
        project,
        metrics: { total, open, completed: total - open, overdue },
        milestones: milestonesRes.data ?? [],
        recent_messages: msgs.map((m) => ({
          id: m.id,
          content: m.content,
          created_at: m.created_at,
          author: m.external_author ?? (m.user_id ? names.person.get(m.user_id) ?? null : null),
          source: m.source,
        })),
        warnings,
      },
    };
  },
});
