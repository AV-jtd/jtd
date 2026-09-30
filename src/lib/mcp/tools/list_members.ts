import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { db, fail } from "./_shared";

/**
 * Участники проекта.
 *
 * Нужен для двух вещей, которые до сих пор упирались в догадки: «на кого можно
 * поставить эту задачу» и «кого мы перегрузили планом». Раньше исполнителя
 * приходилось называть по памяти из переписки, а `resolveUser` честно отказывал
 * на неоднозначном имени — правильно, но разговор на этом кончался.
 *
 * Без `project_id` возвращаются люди из всех проектов, где состоит сам
 * пользователь: список всех профилей базы через коннектор не выдаём, это
 * справочник сотрудников, а не рабочий контекст.
 */

export default defineTool({
  name: "list_members",
  title: "Участники проекта",
  description:
    "Участники проекта: кто состоит и с какой ролью. Нужен, чтобы выбрать исполнителя и понять, о чьей загрузке речь. Без project_id — люди из всех проектов, где состоите вы.",
  inputSchema: {
    project_id: z.string().uuid().optional().describe("UUID проекта. Без него — по всем вашим проектам."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (input: { project_id?: string }, ctx: ToolContext) => {
    if (!ctx.isAuthenticated()) return fail("Не аутентифицирован");
    const uid = ctx.getUserId()!;
    const supabase = db(ctx);

    let groupIds: string[];
    if (input.project_id) {
      const { data: project } = await supabase
        .from("task_groups").select("id,name").eq("id", input.project_id).maybeSingle();
      if (!project) return fail("Проект не найден или недоступен");
      groupIds = [project.id];
    } else {
      const { data: mine, error } = await supabase.from("group_members").select("group_id").eq("user_id", uid);
      if (error) return fail(error.message);
      groupIds = [...new Set((mine ?? []).map((m) => m.group_id))];
      if (groupIds.length === 0) return fail("Вы не состоите ни в одном проекте");
    }

    const { data: rows, error } = await supabase
      .from("group_members")
      .select("user_id,role,group_id")
      .in("group_id", groupIds);
    if (error) return fail(error.message);

    const userIds = [...new Set((rows ?? []).map((r) => r.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id,display_name,email,work_email")
      .in("id", userIds)
      .is("deleted_at", null);
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

    // Один человек может состоять в нескольких проектах — сводим в одну строку,
    // иначе «участников 14» при семи людях вводит в заблуждение.
    const people = new Map<string, { id: string; name: string; email: string | null; roles: Set<string>; projects: number }>();
    for (const r of rows ?? []) {
      const p = byId.get(r.user_id);
      // Удалённый профиль в участниках остаться может; человека там уже нет.
      if (!p) continue;
      const entry = people.get(r.user_id) ?? {
        id: r.user_id,
        name: p.display_name ?? p.email ?? r.user_id,
        email: p.work_email ?? p.email ?? null,
        roles: new Set<string>(),
        projects: 0,
      };
      if (r.role) entry.roles.add(r.role);
      entry.projects++;
      people.set(r.user_id, entry);
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            scope: input.project_id ? { project_id: input.project_id } : { projects: groupIds.length },
            members: [...people.values()]
              .sort((a, b) => a.name.localeCompare(b.name, "ru"))
              .map((p) => ({
                id: p.id,
                name: p.name,
                email: p.email,
                roles: [...p.roles],
                ...(input.project_id ? {} : { in_projects: p.projects }),
              })),
            count: people.size,
          }),
        },
      ],
    };
  },
});
