import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { db, fail, insertTask, resolveUser } from "./_shared";
import { layoutPlan, planSpanDays, type TemplateItem, type TemplateLink } from "../../planTemplate";

/**
 * «Сделай план покупки оборудования по примеру проекта такого-то, только
 * приёмка в апреле» — один вызов.
 *
 * Берёт форму проекта-образца (что за чем, с какими промежутками), раскладывает
 * её от указанной даты и применяет правки из сообщения. Форма снимается в
 * смещениях, а не в абсолютных датах: иначе «по примеру» означало бы «теми же
 * числами прошлого года».
 *
 * Расчёт весь в src/lib/planTemplate.ts и покрыт тестами. Предпросмотр и запись
 * считаются ОДНИМ вызовом этого расчёта — показать одно, а записать другое
 * здесь было бы особенно обидно: человек согласовывает даты, глядя на
 * предпросмотр.
 *
 * Как и upsert_plan, без apply=true не пишет ничего.
 *
 * ЧТО НЕ ПЕРЕНОСИТСЯ, намеренно: отметки о выполнении и фактические даты
 * образца (новый план не может быть выполнен заранее), базовые даты, статусы
 * задач, исполнители (кто делал в прошлый раз — не значит, что делает сейчас;
 * для этого есть assignee_for_all или правка задач после раскладки).
 */

const MAX_ITEMS = 200;

export default defineTool({
  name: "apply_plan_template",
  title: "План по образцу другого проекта",
  description:
    "Переносит форму проекта-образца в другой проект: задачи и вехи с теми же промежутками между ними и те же связи, но от новой даты. Отвечает на «сделай план по примеру проекта такого-то». " +
    "start_date — с какой даты начинается новый план. scale сжимает или растягивает весь план (0.5 — вдвое быстрее). " +
    "overrides — правки из сообщения: match (название элемента образца), и либо new_date, либо shift_days; ещё skip (не переносить) и title (переименовать). Правка двигает и то, что стоит за элементом по связям. " +
    "ПО УМОЛЧАНИЮ НИЧЕГО НЕ ЗАПИСЫВАЕТ: возвращает разложенный план на проверку, запись только при apply=true. Не переносятся отметки о выполнении, фактические даты, статусы и исполнители.",
  inputSchema: {
    template_project_id: z.string().uuid().describe("UUID проекта-образца (task_groups.id)."),
    target_project_id: z.string().uuid().describe("UUID проекта, куда раскладывать. Новый проект — create_project."),
    start_date: z.string().describe("Дата начала нового плана, ISO datetime."),
    scale: z.number().min(0.05).max(10).optional().describe("Сжать или растянуть план. 1 — как в образце."),
    assignee_for_all: z.string().optional().describe("Исполнитель для всех задач плана: id, почта или имя. По умолчанию — вы."),
    overrides: z
      .array(
        z.object({
          match: z.string().min(1).describe("Название элемента образца."),
          new_date: z.string().optional().describe("Поставить на эту дату."),
          shift_days: z.number().int().min(-3650).max(3650).optional().describe("Сдвинуть от разложенной даты."),
          skip: z.boolean().optional().describe("Не переносить в новый план."),
          title: z.string().min(1).max(500).optional().describe("Переименовать."),
        }),
      )
      .optional(),
    apply: z.boolean().optional().describe("true — записать. По умолчанию false: только показать."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (
    input: {
      template_project_id: string;
      target_project_id: string;
      start_date: string;
      scale?: number;
      assignee_for_all?: string;
      overrides?: Array<{ match: string; new_date?: string; shift_days?: number; skip?: boolean; title?: string }>;
      apply?: boolean;
    },
    ctx: ToolContext,
  ) => {
    if (!ctx.isAuthenticated()) return fail("Не аутентифицирован");
    const uid = ctx.getUserId()!;
    const supabase = db(ctx);

    if (input.template_project_id === input.target_project_id) {
      return fail("Образец и цель — один и тот же проект: план удвоился бы сам в себе");
    }

    const { data: projects, error: pErr } = await supabase
      .from("task_groups")
      .select("id,name")
      .in("id", [input.template_project_id, input.target_project_id]);
    if (pErr) return fail(pErr.message);
    const template = (projects ?? []).find((p) => p.id === input.template_project_id);
    const target = (projects ?? []).find((p) => p.id === input.target_project_id);
    if (!template) return fail("Проект-образец не найден или недоступен");
    if (!target) return fail("Проект-цель не найден или недоступен");

    let assignee = { id: uid, name: "вы" };
    if (input.assignee_for_all) {
      const r = await resolveUser(supabase, input.assignee_for_all);
      if ("error" in r) return fail(r.error);
      assignee = r;
    }

    // ── Образец ───────────────────────────────────────────────────────────
    // Подпроекты НЕ берём: их задачи, сложенные в один проект, дали бы плоскую
    // мешанину, в которой не видно, что откуда.
    const { data: tasks, error: tErr } = await supabase
      .from("tasks")
      .select("id,title,start_at,deadline", { count: "exact" })
      .eq("group_id", input.template_project_id)
      .or("task_type.is.null,and(task_type.neq.stm_stage,task_type.neq.km_stage)")
      .limit(MAX_ITEMS);
    if (tErr) return fail(tErr.message);

    const { data: milestones, error: mErr } = await supabase
      .from("project_milestones")
      .select("id,name,planned_date")
      .eq("group_id", input.template_project_id);
    if (mErr) return fail(mErr.message);

    const items: TemplateItem[] = [
      ...(tasks ?? []).map((t) => ({
        id: t.id, kind: "task" as const, title: t.title, start: t.start_at, end: t.deadline,
      })),
      ...(milestones ?? []).map((m) => ({
        id: m.id, kind: "milestone" as const, title: m.name, start: null, end: m.planned_date,
      })),
    ];
    if (items.length === 0) return fail(`В проекте «${template.name}» нет ни задач, ни вех — образца не получится`);
    if (items.length >= MAX_ITEMS) {
      return fail(`В образце больше ${MAX_ITEMS} элементов — столько за один вызов не разложить. Возьмите проект поменьше или разложите план вручную через upsert_plan.`);
    }

    // Связи внутри образца. Порциями и двумя запросами: список идентификаторов
    // уезжает в адрес запроса, и or(...) вставляет его дважды — на проде уже
    // ловили «414 Request-URI Too Large».
    const ids = items.map((i) => i.id);
    const inScope = new Set(ids);
    const seen = new Set<string>();
    const links: TemplateLink[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      for (const column of ["predecessor_id", "successor_id"] as const) {
        const { data, error } = await supabase
          .from("task_dependencies")
          .select("predecessor_id,successor_id,dependency_type,lag_days")
          .in(column, chunk);
        if (error) return fail(error.message);
        for (const d of data ?? []) {
          const key = `${d.predecessor_id}>${d.successor_id}`;
          if (seen.has(key) || !inScope.has(d.predecessor_id) || !inScope.has(d.successor_id)) continue;
          seen.add(key);
          links.push({ from: d.predecessor_id, to: d.successor_id, type: d.dependency_type, lag_days: d.lag_days });
        }
      }
    }

    // ── Раскладка ─────────────────────────────────────────────────────────
    const plan = layoutPlan({
      items,
      links,
      startDate: input.start_date,
      scale: input.scale,
      overrides: input.overrides,
    });
    if (plan.problems.length) {
      return fail(
        `План не записан, ${plan.problems.length === 1 ? "мешает" : "мешают"}:\n— ${plan.problems.join("\n— ")}`,
      );
    }

    const shown = {
      template: { id: template.id, name: template.name, anchor: plan.template_anchor },
      target: { id: target.id, name: target.name },
      assignee: assignee.name,
      span_days: planSpanDays(plan.items),
      items: plan.items.map((i) => ({
        kind: i.kind,
        title: i.title,
        start: i.start,
        end: i.end,
        overridden: i.overridden,
        moved_by_links: i.moved_by_links,
      })),
      links: plan.links.length,
      skipped: plan.skipped,
    };

    if (!input.apply) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              written: false,
              checked: true,
              plan: shown,
              counts: {
                tasks: plan.items.filter((i) => i.kind === "task").length,
                milestones: plan.items.filter((i) => i.kind === "milestone").length,
                links: plan.links.length,
              },
              apply_with: "тот же вызов с apply=true, после того как человек посмотрел даты",
              not_copied: "отметки о выполнении, фактические даты, статусы, исполнители образца",
            }),
          },
        ],
      };
    }

    // ── Запись ────────────────────────────────────────────────────────────
    // Транзакций через PostgREST нет: при обрыве отдаём список сделанного —
    // чинить вручную можно только то, про что известно.
    const newId = new Map<string, string>();
    const done: string[] = [];
    const warnings: string[] = [];
    const stop = (msg: string) =>
      fail(
        `Запись прервана: ${msg}\nУспело записаться: ${done.length ? done.join("; ") : "ничего"}.\n` +
          "Повторный вызов создаст элементы заново — сначала посмотрите расписание проекта.",
      );

    const { data: lastMs } = await supabase
      .from("project_milestones").select("position")
      .eq("group_id", input.target_project_id).order("position", { ascending: false }).limit(1).maybeSingle();
    let position = (lastMs?.position ?? 0) + 1;

    for (const it of plan.items) {
      if (it.kind === "task") {
        const created = await insertTask(
          supabase,
          uid,
          {
            title: it.title,
            deadline: it.end,
            start_at: it.start,
            group_id: input.target_project_id,
            assigned_to: assignee.id,
            status_meta: {
              created_by: "claude",
              created_via: "mcp",
              // По какому проекту сделан план — видно потом без догадок.
              source: { kind: "plan", template_project_id: template.id, template_task_id: it.source_id },
            },
          },
          // Одно уведомление на весь план, а не на каждую задачу: двадцать
          // писем подряд человек просто отключит.
          { notifyAssignee: false },
        );
        if ("error" in created) return stop(`не удалось создать задачу «${it.title}»: ${created.error}`);
        warnings.push(...created.warnings);
        newId.set(it.source_id, created.task.id);
        done.push(`задача «${it.title}»`);
      } else {
        const { data: ms, error } = await supabase
          .from("project_milestones")
          .insert({
            group_id: input.target_project_id,
            name: it.title,
            planned_date: it.end,
            status: "pending",
            color: "#3b82f6",
            created_by: uid,
            position: position++,
          })
          .select("id")
          .single();
        if (error) return stop(`не удалось создать веху «${it.title}»: ${error.message}`);
        newId.set(it.source_id, ms.id);
        done.push(`веха «${it.title}»`);
      }
    }

    const kindOf = new Map(plan.items.map((i) => [i.source_id, i.kind]));
    let linked = 0;
    for (const l of plan.links) {
      const from = newId.get(l.from);
      const to = newId.get(l.to);
      if (!from || !to) continue;
      const { error } = await supabase.from("task_dependencies").insert({
        predecessor_id: from,
        successor_id: to,
        dependency_type: l.type,
        lag_days: l.lag_days,
        predecessor_entity_type: kindOf.get(l.from) ?? "task",
        successor_entity_type: kindOf.get(l.to) ?? "task",
        created_by: uid,
      });
      if (error) return stop(`не удалось создать связь: ${error.message}`);
      linked++;
    }

    // Каскад не нужен: даты уже согласованы расчётом, тем же, который показали
    // человеку. Пересчёт после записи сдвинул бы их ещё раз — и не так, как в
    // предпросмотре.

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            written: true,
            plan: shown,
            created: { tasks: plan.items.filter((i) => i.kind === "task").length, milestones: plan.items.filter((i) => i.kind === "milestone").length, links: linked },
            assignee: assignee.name,
            ...(warnings.length ? { warnings } : {}),
          }),
        },
      ],
    };
  },
});
