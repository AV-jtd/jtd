import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { db, fail, resolveUser } from "./_shared";
import { resolveNames } from "./_names";
import { bucketByUrgency, milestonesAtRisk } from "../../attention";
import { driftDays } from "../../drift";

/**
 * «Что горит» — сводка по всем проектам сразу.
 *
 * Зачем. Почти все остальные инструменты требуют назвать проект, а человеческий
 * вопрос звучит иначе: «что горит на этой неделе», «где я держу людей», «что у
 * меня без сроков». Чтобы ответить, приходилось перебирать проекты по одному —
 * то есть человек должен был сам вспомнить, о каких проектах спрашивать. Это и
 * есть главное неудобство набора, а не отсутствие ещё одного расчёта по Ганту.
 *
 * Что считается, считается на сервере: `count: "exact"` с `head: true` даёт
 * честное общее число без выкачивания строк. Списки — короткие и по делу:
 * «просрочено 47, вот десять самых давних» полезнее, чем 47 строк, из которых
 * никто не прочтёт и половины.
 *
 * ГРАНИЦА, О КОТОРОЙ СКАЗАНО В ОТВЕТЕ. Сводка охватывает то, что видно
 * пользователю по правам доступа. «Мои» — задачи, где он исполнитель; «мною
 * поставленные» — где он автор. Третьего варианта («всё, что видно») намеренно
 * нет по умолчанию: на 5720 задачах это сводка ни о чём.
 */

const LIST = 10;

export default defineTool({
  name: "get_attention",
  title: "Что горит",
  description:
    "Сводка по ВСЕМ проектам сразу, без указания проекта: просроченные задачи, сроки на сегодня, на горизонт вперёд, задачи без срока, пропущенные и приближающиеся вехи, самые уехавшие от плана задачи. Отвечает на «что горит», «что на этой неделе», «что у меня без сроков». scope: mine — где вы исполнитель (по умолчанию), created_by_me — что вы поставили другим, person — за конкретного человека. Числа общие и честные, списки короткие — по десять самых важных.",
  inputSchema: {
    horizon_days: z.number().int().min(1).max(90).optional().describe("Горизонт «скоро», дней. По умолчанию 7."),
    scope: z.enum(["mine", "created_by_me", "person"]).optional().describe("По умолчанию mine."),
    person: z.string().optional().describe("Для scope=person: id, почта или имя."),
    project_id: z.string().uuid().optional().describe("Ограничить одним проектом, если нужно."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (
    input: { horizon_days?: number; scope?: "mine" | "created_by_me" | "person"; person?: string; project_id?: string },
    ctx: ToolContext,
  ) => {
    if (!ctx.isAuthenticated()) return fail("Не аутентифицирован");
    const uid = ctx.getUserId()!;
    const supabase = db(ctx);
    const horizon = input.horizon_days ?? 7;
    const scope = input.scope ?? "mine";

    let who = { id: uid, name: "вы" };
    if (scope === "person") {
      if (!input.person) return fail("Для scope=person нужно указать person");
      const r = await resolveUser(supabase, input.person);
      if ("error" in r) return fail(r.error);
      who = r;
    }

    // Проекты в области: нужны, чтобы вехи не пришли из чужих проектов.
    let groupIds: string[] | null = null;
    if (input.project_id) {
      const { data: p } = await supabase
        .from("task_groups").select("id").eq("id", input.project_id).maybeSingle();
      if (!p) return fail("Проект не найден или недоступен");
      const { data: subs } = await supabase.from("task_groups").select("id").eq("parent_id", p.id);
      groupIds = [p.id, ...(subs ?? []).map((s) => s.id)];
    }

    const base = () => {
      let q = supabase
        .from("tasks")
        .select("id,title,deadline,original_deadline,group_id,assigned_to", { count: "exact" })
        .eq("is_completed", false)
        // Этапы СТМ и КМ — служебные записи, в сводке они не задачи.
        .or("task_type.is.null,and(task_type.neq.stm_stage,task_type.neq.km_stage)");
      if (scope === "created_by_me") q = q.eq("user_id", uid);
      else q = q.eq("assigned_to", who.id);
      if (groupIds) q = q.in("group_id", groupIds);
      return q;
    };

    // Срочное и без срока берём отдельными запросами: иначе на человеке с
    // тысячей открытых задач лимит отрежет как раз просроченные.
    const horizonEnd = new Date(Date.now() + horizon * 86400000).toISOString();
    const { data: dated, error: dErr, count: datedCount } = await base()
      .not("deadline", "is", null)
      .lte("deadline", horizonEnd)
      .order("deadline", { ascending: true })
      .limit(200);
    if (dErr) return fail(dErr.message);

    const { count: undatedCount } = await base().is("deadline", null).limit(1);
    const { data: undatedSample } = await base()
      .is("deadline", null)
      .order("created_at", { ascending: true })
      .limit(LIST);

    const rows = dated ?? [];
    const names = await resolveNames(supabase, [...rows, ...(undatedSample ?? [])]);
    const decorate = (t: { id: string; title: string; deadline: string | null; group_id: string | null; assigned_to: string | null }) => ({
      id: t.id,
      title: t.title,
      deadline: t.deadline,
      project_name: t.group_id ? (names.project.get(t.group_id) ?? null) : null,
      assignee_name: t.assigned_to ? (names.person.get(t.assigned_to) ?? null) : null,
    });

    const buckets = bucketByUrgency(rows.map(decorate), horizon);

    // Вехи: в области пользователя. Без проекта — по проектам, где он состоит,
    // иначе пришли бы вехи всей компании.
    let msGroupIds = groupIds;
    if (!msGroupIds) {
      const { data: mine } = await supabase.from("group_members").select("group_id").eq("user_id", uid);
      msGroupIds = [...new Set((mine ?? []).map((m) => m.group_id))];
    }
    let milestones: Array<{ id: string; name: string; planned_date: string | null; actual_date: string | null; group_id: string }> = [];
    if (msGroupIds.length) {
      const { data } = await supabase
        .from("project_milestones")
        .select("id,name,planned_date,actual_date,group_id")
        .in("group_id", msGroupIds)
        .is("actual_date", null)
        .lte("planned_date", horizonEnd)
        .order("planned_date", { ascending: true })
        .limit(100);
      milestones = data ?? [];
    }
    const msNames = new Map<string, string>();
    if (milestones.length) {
      const { data: groups } = await supabase
        .from("task_groups").select("id,name").in("id", [...new Set(milestones.map((m) => m.group_id))]);
      for (const g of groups ?? []) msNames.set(g.id, g.name);
    }
    const risky = milestonesAtRisk(
      milestones.map((m) => ({ ...m, project_name: msNames.get(m.group_id) ?? null })),
      horizon,
    );

    // Самые уехавшие от плана — тем же помощником, что везде: испорченная
    // базовая дата не превращается в сдвиг на две тысячи лет.
    const drifted = rows
      .map((t) => ({ ...decorate(t), drift_days: driftDays(t.original_deadline, t.deadline) }))
      .filter((t) => t.drift_days !== null && t.drift_days !== 0)
      .sort((a, b) => Math.abs(b.drift_days!) - Math.abs(a.drift_days!))
      .slice(0, LIST);

    const short = <T extends { id: string }>(list: T[]) => list.slice(0, LIST);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            about: scope === "created_by_me" ? "задачи, которые вы поставили" : `задачи ${who.name}`,
            horizon_days: horizon,
            scope: input.project_id ? { project_id: input.project_id } : "все проекты",
            overdue: { count: buckets.overdue.length, items: short(buckets.overdue) },
            today: { count: buckets.today.length, items: short(buckets.today) },
            soon: { count: buckets.soon.length, items: short(buckets.soon) },
            later_than_horizon: buckets.later,
            no_deadline: { count: undatedCount ?? 0, items: (undatedSample ?? []).map(decorate) },
            milestones_at_risk: {
              missed: risky.filter((m) => m.missed).length,
              upcoming: risky.filter((m) => !m.missed).length,
              items: short(risky),
            },
            drifted_most: drifted,
            // Честно про полноту: сводка, которая молчит об усечении, хуже
            // отсутствующей — по ней делают вывод «всё под контролем».
            complete: (datedCount ?? rows.length) <= rows.length,
            ...((datedCount ?? 0) > rows.length
              ? { note: `Задач со сроком в горизонте ${datedCount}, разобрано ${rows.length}. Сузьте горизонт или укажите проект.` }
              : {}),
          }),
        },
      ],
    };
  },
});
