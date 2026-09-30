import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { db, fail, notify } from "./_shared";

/**
 * Публикация протокола: черновик становится рабочим документом.
 *
 * Повторяет usePublishProtocol: снимается `is_draft` со всех задач протокола,
 * `draft_status` протокола становится `published`, мягкие задачи «изучить,
 * доработать протокол» (`task_type = 'protocol_review'`) закрываются с
 * результатом «Опубликовано».
 *
 * Публикация — это момент, когда поручения становятся видны исполнителям
 * (дальше работают обычные права доступа). Поэтому по умолчанию инструмент
 * ничего не пишет, а перечисляет, что именно станет видно и кому: после
 * публикации отозвать это нельзя — люди уже прочитали.
 *
 * Уведомления об опубликованных поручениях ОТПРАВЛЯЮТСЯ, в отличие от переноса
 * сроков (там решение владельца — молчать). Здесь это не лишнее письмо, а
 * единственный способ узнать, что тебе что-то поручили: до публикации задачи
 * человек не видел вовсе.
 */

export default defineTool({
  name: "publish_protocol",
  title: "Опубликовать протокол",
  description:
    "Публикует черновик протокола: поручения становятся видны исполнителям, и они получают уведомление. Мягкие задачи «изучить, доработать протокол» закрываются с результатом «Опубликовано». ПО УМОЛЧАНИЮ НИЧЕГО НЕ ПИШЕТ: перечисляет поручения и исполнителей, которым они станут видны; публикация только при apply=true — отозвать её нельзя, люди уже прочитают.",
  inputSchema: {
    protocol_id: z.string().uuid().describe("UUID протокола (task_groups.id с project_type=protocol)."),
    apply: z.boolean().optional().describe("true — опубликовать. По умолчанию false: только показать."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input: { protocol_id: string; apply?: boolean }, ctx: ToolContext) => {
    if (!ctx.isAuthenticated()) return fail("Не аутентифицирован");
    const uid = ctx.getUserId()!;
    const supabase = db(ctx);

    const { data: protocol, error } = await supabase
      .from("task_groups")
      .select("id,name,project_type,draft_status")
      .eq("id", input.protocol_id)
      .maybeSingle();
    if (error) return fail(error.message);
    if (!protocol) return fail("Протокол не найден или недоступен");
    if (protocol.project_type !== "protocol") {
      return fail(`«${protocol.name}» — это проект, а не протокол. Публикуются только протоколы.`);
    }
    if (protocol.draft_status === "published") return fail(`Протокол «${protocol.name}» уже опубликован`);

    const { data: drafts, error: dErr } = await supabase
      .from("tasks")
      .select("id,title,assigned_to,deadline")
      .eq("group_id", protocol.id)
      .eq("is_draft", true);
    if (dErr) return fail(dErr.message);
    const rows = drafts ?? [];

    const ids = [...new Set(rows.map((t) => t.assigned_to).filter((v): v is string => !!v))];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: profiles } = await supabase.from("profiles").select("id,display_name,email").in("id", ids);
      for (const p of profiles ?? []) names.set(p.id, p.display_name ?? p.email ?? p.id);
    }

    const willAppear = rows.map((t) => ({
      title: t.title,
      assignee: t.assigned_to ? (names.get(t.assigned_to) ?? t.assigned_to) : null,
      deadline: t.deadline,
    }));
    const withoutAssignee = willAppear.filter((t) => !t.assignee).length;
    const withoutDeadline = willAppear.filter((t) => !t.deadline).length;

    if (!input.apply) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              published: false,
              protocol: { id: protocol.id, name: protocol.name },
              will_become_visible: willAppear,
              count: willAppear.length,
              // Это то, что стоит поправить ДО публикации, а не после: потом
              // поручение уже прочитали и переспрашивать неудобно.
              check_first: {
                without_assignee: withoutAssignee,
                without_deadline: withoutDeadline,
                hint:
                  withoutAssignee || withoutDeadline
                    ? "Поручения без исполнителя или без срока обычно значат, что на встрече это не договорили. Лучше уточнить до публикации."
                    : "У всех поручений есть исполнитель и срок.",
              },
              warning: "После публикации исполнители увидят поручения и получат уведомление. Отозвать это нельзя.",
              apply_with: "тот же вызов с apply=true",
            }),
          },
        ],
      };
    }

    if (rows.length) {
      const { error: tErr } = await supabase
        .from("tasks").update({ is_draft: false }).eq("group_id", protocol.id).eq("is_draft", true);
      if (tErr) return fail(`Поручения не опубликованы: ${tErr.message}`);
    }

    const { data: updated, error: gErr } = await supabase
      .from("task_groups").update({ draft_status: "published" }).eq("id", protocol.id).select("id");
    if (gErr) return fail(`Поручения опубликованы, но статус протокола не изменён: ${gErr.message}`);
    if (!updated?.length) return fail("Нет прав на публикацию этого протокола");

    const warnings: string[] = [];
    // Мягкие задачи «изучить, доработать протокол» живут по source_protocol_id,
    // а не по group_id — каскад их не тронет, закрываем отдельно, как приложение.
    const { error: rErr } = await supabase
      .from("tasks")
      .update({ is_completed: true, completed_at: new Date().toISOString(), closure_result: "Опубликовано" })
      .eq("source_protocol_id", protocol.id)
      .eq("task_type", "protocol_review")
      .eq("is_completed", false);
    if (rErr) warnings.push(`задачи «изучить протокол» не закрыты: ${rErr.message}`);

    // Уведомления по одному человеку, а не по задаче: три поручения одному
    // человеку — одно письмо, а не три.
    for (const person of ids) {
      if (person === uid) continue;
      const mine = willAppear.filter((t) => t.assignee === (names.get(person) ?? person));
      await notify(
        supabase,
        "new_task_in_group",
        `${protocol.name}: поручений ${mine.length}`,
        [person],
        null,
      );
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            published: true,
            protocol: { id: protocol.id, name: protocol.name, status: "published" },
            tasks_published: rows.length,
            notified: ids.filter((p) => p !== uid).length,
            ...(warnings.length ? { warnings } : {}),
          }),
        },
      ],
    };
  },
});
