import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { db, fail, insertTask, resolveUser } from "./_shared";

/**
 * Протокол совещания с поручениями — из разговора.
 *
 * Раньше через коннектор протоколы можно было только читать: разобрать встречу
 * получалось, а записать её — нет. При этом именно это и просят в первую
 * очередь: «вот запись совещания, оформи протокол».
 *
 * Протокол в JustTODOit — не отдельная таблица, а проект с
 * `project_type = 'protocol'`; поручения — его задачи. Отсюда устройство:
 * `draft_status` у протокола и `is_draft` у задач.
 *
 * СОЗДАЁТСЯ ЧЕРНОВИКОМ, как и в приложении (NewProtocolDialog: «always as
 * DRAFT»). Черновик не виден исполнителям и никого не уведомляет. Это не
 * перестраховка коннектора, а смысл черновика: пока протокол не сверен с
 * людьми, поручения в нём — чей-то пересказ встречи. Публикация — отдельным
 * вызовом `publish_protocol`, и именно она делает поручения настоящими.
 *
 * Участники и внешние гости складываются в `protocol_meta` теми же полями, что
 * пишет приложение: `internal_attendees` (идентификаторы), `external_attendees`
 * (строки), `format`, `meeting_date`, `context_project_id`.
 */

const MAX_ITEMS = 60;

export default defineTool({
  name: "create_protocol",
  title: "Создать протокол совещания",
  description:
    "Оформляет протокол совещания с поручениями: «вот запись встречи, сделай протокол». Создаётся ЧЕРНОВИКОМ — он не виден исполнителям и никого не уведомляет, пока его не опубликуют через publish_protocol. Так же ведёт себя приложение. " +
    "attendees — свои участники (id, почта или имя), external_attendees — гости строками. action_items — поручения: название, исполнитель, срок. client_id связывает протокол с клиентом CRM, context_project_id — с проектом, в контексте которого шла встреча.",
  inputSchema: {
    title: z.string().min(1).max(300).describe("Название протокола."),
    meeting_date: z.string().describe("Дата встречи, ISO (достаточно ГГГГ-ММ-ДД)."),
    format: z.enum(["offline", "online"]).optional().describe("По умолчанию offline."),
    description: z.string().max(5000).optional().describe("Итоги, решения, заметки по встрече."),
    client_id: z.string().uuid().optional().describe("Клиент CRM, если встреча с клиентом."),
    context_project_id: z.string().uuid().optional().describe("Проект, в контексте которого шла встреча."),
    attendees: z.array(z.string()).max(50).optional().describe("Свои участники: id, почта или имя."),
    external_attendees: z.array(z.string().max(200)).max(50).optional().describe("Внешние гости строками."),
    action_items: z
      .array(
        z.object({
          title: z.string().min(1).max(500),
          assignee: z.string().optional().describe("id, почта или имя; по умолчанию — вы."),
          deadline: z.string().optional().describe("ISO datetime."),
          description: z.string().max(2000).optional(),
        }),
      )
      .max(MAX_ITEMS)
      .optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (
    input: {
      title: string;
      meeting_date: string;
      format?: "offline" | "online";
      description?: string;
      client_id?: string;
      context_project_id?: string;
      attendees?: string[];
      external_attendees?: string[];
      action_items?: Array<{ title: string; assignee?: string; deadline?: string; description?: string }>;
    },
    ctx: ToolContext,
  ) => {
    if (!ctx.isAuthenticated()) return fail("Не аутентифицирован");
    const uid = ctx.getUserId()!;
    const supabase = db(ctx);

    // ── Проверки до записи ────────────────────────────────────────────────
    const meeting = new Date(input.meeting_date);
    if (Number.isNaN(meeting.getTime())) return fail(`Не разобрал дату встречи «${input.meeting_date}».`);
    const year = meeting.getUTCFullYear();
    if (year < 2000 || year > 2100) return fail(`Дата встречи ${input.meeting_date} вне разумного диапазона.`);
    const meetingDate = meeting.toISOString().slice(0, 10);

    const problems: string[] = [];

    // Люди разбираются заранее: имя, которое не сопоставилось, должно отменить
    // протокол целиком, а не выясниться на пятом поручении.
    const people = new Map<string, { id: string; name: string }>();
    for (const who of [...(input.attendees ?? []), ...(input.action_items ?? []).map((i) => i.assignee)]) {
      if (!who || people.has(who)) continue;
      const r = await resolveUser(supabase, who);
      if ("error" in r) problems.push(r.error);
      else people.set(who, r);
    }

    const items = (input.action_items ?? []).map((i) => ({ ...i }));
    for (const it of items) {
      if (it.deadline === undefined) continue;
      const d = new Date(it.deadline);
      if (Number.isNaN(d.getTime())) {
        problems.push(`Поручение «${it.title}»: не разобрал срок «${it.deadline}».`);
        continue;
      }
      const y = d.getUTCFullYear();
      if (y < 2000 || y > 2100) problems.push(`Поручение «${it.title}»: срок ${it.deadline} вне разумного диапазона.`);
      else it.deadline = d.toISOString();
    }

    if (input.client_id) {
      const { data: client } = await supabase.from("clients").select("id").eq("id", input.client_id).maybeSingle();
      if (!client) problems.push("Клиент не найден или недоступен");
    }
    if (input.context_project_id) {
      const { data: project } = await supabase
        .from("task_groups").select("id").eq("id", input.context_project_id).maybeSingle();
      if (!project) problems.push("Проект контекста не найден или недоступен");
    }

    if (problems.length) {
      return fail(`Протокол не создан, ${problems.length === 1 ? "мешает" : "мешают"}:\n— ${problems.join("\n— ")}`);
    }

    // ── Запись ────────────────────────────────────────────────────────────
    const internal = [...new Set([uid, ...(input.attendees ?? []).map((a) => people.get(a)!.id)])];

    const { data: protocol, error } = await supabase
      .from("task_groups")
      .insert({
        name: input.title.trim(),
        user_id: uid,
        icon: "📋",
        color: "#6366f1",
        project_type: "protocol",
        // Всегда черновик — как в приложении.
        draft_status: "draft",
        description: input.description ?? null,
        client_id: input.client_id ?? null,
        protocol_meta: {
          meeting_date: meetingDate,
          format: input.format ?? "offline",
          internal_attendees: internal,
          external_attendees: input.external_attendees ?? [],
          template_system_key: null,
          ...(input.context_project_id ? { context_project_id: input.context_project_id } : {}),
          // Видно, что протокол собран из разговора, а не набран руками.
          created_via: "mcp",
        },
      })
      .select("id,name")
      .single();
    if (error) return fail(error.message);

    const warnings: string[] = [];
    const { error: mErr } = await supabase
      .from("group_members")
      .insert(internal.map((user_id) => ({ group_id: protocol.id, user_id, invited_by: uid, role: user_id === uid ? "owner" : "member" })));
    if (mErr) warnings.push(`участники не добавлены: ${mErr.message}`);

    const created: Array<{ id: string; title: string; assignee: string; deadline: string | null }> = [];
    for (const it of items) {
      const assignee = it.assignee ? people.get(it.assignee)! : { id: uid, name: "вы" };
      const r = await insertTask(supabase, uid, {
        title: it.title,
        description: it.description ?? null,
        deadline: it.deadline ?? null,
        group_id: protocol.id,
        assigned_to: assignee.id,
        // Поля протокола — те же, что ставит приложение поручению внутри
        // протокола (ProtocolInternalSection).
        is_draft: true,
        source_protocol_id: protocol.id,
        protocol_scope: "internal",
        status_meta: { created_by: "claude", created_via: "mcp", source: { kind: "meeting" } },
      });
      if ("error" in r) {
        warnings.push(`поручение «${it.title}» не создано: ${r.error}`);
        continue;
      }
      warnings.push(...r.warnings);
      created.push({ id: r.task.id, title: it.title, assignee: assignee.name, deadline: it.deadline ?? null });
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            created: true,
            protocol: { id: protocol.id, name: protocol.name, status: "draft", meeting_date: meetingDate },
            attendees: internal.length,
            external_attendees: (input.external_attendees ?? []).length,
            action_items: created,
            next_step:
              "Протокол создан ЧЕРНОВИКОМ: исполнители его не видят и уведомлений не получили. " +
              "Покажите протокол человеку, а после сверки опубликуйте через publish_protocol — тогда поручения станут настоящими.",
            ...(warnings.length ? { warnings } : {}),
          }),
        },
      ],
    };
  },
});
