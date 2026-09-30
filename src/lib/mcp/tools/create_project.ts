import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { db, fail } from "./_shared";

/**
 * Создание проекта.
 *
 * Понадобился ради сценария «сделай план покупки оборудования по примеру
 * такого-то проекта»: раньше проект приходилось заводить руками, и разговор
 * прерывался ровно посередине.
 *
 * Повторяет useTasks.addGroup, включая то, что легко не заметить:
 *
 * — Проект в JustTODOit — это не просто строка в task_groups, у него есть
 *   связанный тег-зонтик (`linked_tag_id`). По нему в приложении собираются
 *   задачи проекта; проект без него выглядит пустым.
 * — Свободный тег с тем же названием ПЕРЕИСПОЛЬЗУЕТСЯ, а не создаётся второй.
 *   Иначе у задач, уже помеченных этим тегом, окажется чужой зонтик.
 * — Создатель добавляется в участники владельцем, иначе он не увидит проект
 *   там, где список строится по участию.
 * — У подпроекта наследуются метки контекста родителя (`group_tags`).
 *
 * Тёзка отклоняется — как и в приложении: два проекта с одним названием
 * в разговоре не различить, и «добавь в проект оборудование» уйдёт не туда.
 */

export default defineTool({
  name: "create_project",
  title: "Создать проект",
  description:
    "Создаёт проект (task_groups) с тегом-зонтиком, как в приложении. parent_id — сделать подпроектом существующего: метки контекста родителя наследуются. Проект с таким же названием отклоняется. Дальше в проект можно разложить план через upsert_plan или перенести структуру другого проекта через apply_plan_template.",
  inputSchema: {
    name: z.string().min(1).max(200).describe("Название проекта."),
    parent_id: z.string().uuid().optional().describe("UUID родительского проекта, если это подпроект."),
    description: z.string().max(2000).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input: { name: string; parent_id?: string; description?: string }, ctx: ToolContext) => {
    if (!ctx.isAuthenticated()) return fail("Не аутентифицирован");
    const uid = ctx.getUserId()!;
    const supabase = db(ctx);

    const name = input.name.trim();
    const normalized = name.toLowerCase();

    // Тёзка — до любой записи: иначе останется осиротевший тег.
    const { data: groups, error: gErr } = await supabase.from("task_groups").select("id,name,linked_tag_id");
    if (gErr) return fail(gErr.message);
    const dup = (groups ?? []).find((g) => g.name.trim().toLowerCase() === normalized);
    if (dup) return fail(`Проект «${dup.name}» уже существует (${dup.id})`);

    if (input.parent_id && !(groups ?? []).some((g) => g.id === input.parent_id)) {
      return fail("Родительский проект не найден или недоступен");
    }

    // Свободный тег с тем же названием переиспользуем.
    const { data: tags } = await supabase.from("tags").select("id,name,user_id").eq("user_id", uid);
    const linkedTagIds = new Set((groups ?? []).map((g) => g.linked_tag_id).filter(Boolean));
    const reusable = (tags ?? []).find(
      (t) => t.name?.trim().toLowerCase() === normalized && !linkedTagIds.has(t.id),
    );

    let tagId = reusable?.id as string | undefined;
    if (!tagId) {
      const { data: tag, error: tErr } = await supabase
        .from("tags").insert({ name, user_id: uid, color: "#3b82f6" }).select("id").single();
      if (tErr) return fail(`Тег проекта не создан: ${tErr.message}`);
      tagId = tag.id;
    }

    const { data: group, error } = await supabase
      .from("task_groups")
      .insert({
        name,
        user_id: uid,
        linked_tag_id: tagId,
        parent_id: input.parent_id ?? null,
        ...(input.description ? { description: input.description } : {}),
      })
      .select("id,name,parent_id")
      .single();
    if (error) return fail(error.message);

    const warnings: string[] = [];
    const { error: mErr } = await supabase
      .from("group_members")
      .insert({ group_id: group.id, user_id: uid, invited_by: uid, role: "owner" });
    if (mErr) warnings.push(`создатель не добавлен в участники: ${mErr.message}`);

    if (input.parent_id) {
      const { data: parentTags } = await supabase.from("group_tags").select("tag_id").eq("group_id", input.parent_id);
      const inherit = (parentTags ?? []).map((r) => r.tag_id).filter((id) => id && id !== tagId);
      if (inherit.length) {
        const { error: gtErr } = await supabase
          .from("group_tags")
          .insert(inherit.map((tag_id) => ({ group_id: group.id, tag_id })));
        if (gtErr) warnings.push(`метки родителя не унаследованы: ${gtErr.message}`);
      }
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            created: true,
            project: group,
            tag_reused: !!reusable,
            ...(warnings.length ? { warnings } : {}),
          }),
        },
      ],
    };
  },
});
