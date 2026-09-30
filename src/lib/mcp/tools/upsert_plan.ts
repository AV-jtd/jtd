import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { db, fail, insertTask, isPlanningPhase, resolveUser } from "./_shared";
import { cascade, entityKind, fetchDependencies, findCycle } from "./_cascade";
import { MILESTONE_STATUSES } from "./create_milestone";
import { DEPENDENCY_TYPES } from "./link_tasks";

/**
 * План целиком за один вызов: задачи, вехи и связи между ними.
 *
 * Зачем. Разложить протокол совещания по задачам поштучно — это двадцать
 * вызовов, и на середине легко остановиться: половина плана в базе, половина
 * в переписке, и никто не знает, какая именно половина. Здесь либо проверено
 * всё, либо не записано ничего.
 *
 * ПО УМОЛЧАНИЮ НИЧЕГО НЕ ПИШЕТСЯ. Нужен явный apply=true. Причина та же, по
 * которой показ последствий переноса сделан отдельным инструментом: значение
 * по умолчанию должно быть безопасным, а не удобным. Сначала человек смотрит
 * разложенный план, потом его записывают.
 *
 * Задачи создаются тем же кодом, что create_task (insertTask в _shared.ts):
 * участник-создатель, тег проекта, уведомления. Задача из плана обязана быть
 * такой же, как созданная по одной, иначе у половины не окажется тега проекта,
 * и обнаружится это по пустым подборкам.
 */

const MAX_ITEMS = 60;

type Item = {
  key?: string;
  id?: string;
  kind: "task" | "milestone";
  title: string;
  start_at?: string;
  deadline?: string;
  description?: string;
  assignee?: string;
  status?: (typeof MILESTONE_STATUSES)[number];
};

type Link = { from: string; to: string; type?: (typeof DEPENDENCY_TYPES)[number]; lag_days?: number };

const parseDate = (raw: string, what: string): { date: string } | { error: string } => {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return { error: `${what}: не разобрал дату «${raw}». Нужен ISO datetime.` };
  const y = d.getUTCFullYear();
  if (y < 2000 || y > 2100) return { error: `${what}: дата ${raw} вне разумного диапазона (2000–2100).` };
  return { date: d.toISOString() };
};

export default defineTool({
  name: "upsert_plan",
  title: "Разложить план проекта",
  description:
    "Собирает или переразлагает план проекта одним вызовом: задачи, вехи и связи между ними. ПО УМОЛЧАНИЮ НИЧЕГО НЕ ЗАПИСЫВАЕТ — возвращает разложенный план на проверку; запись только при apply=true, после того как человек посмотрел. " +
    "У элементов есть key — короткое имя внутри этого вызова, на него ссылаются связи (links: from/to принимают key или UUID уже существующего элемента). Элемент с id обновляется, без id — создаётся. " +
    "kind: task или milestone; у вехи обязательна deadline (это её плановая дата). Проверяется всё до записи: даты, исполнители, ссылки, кольца в связях. Либо проверено всё, либо не записано ничего.",
  inputSchema: {
    project_id: z.string().uuid().describe("UUID проекта (task_groups.id)."),
    apply: z.boolean().optional().describe("true — записать. По умолчанию false: только показать."),
    items: z
      .array(
        z.object({
          key: z.string().min(1).max(40).optional().describe("Имя внутри вызова, для ссылок из links."),
          id: z.string().uuid().optional().describe("UUID существующего элемента — тогда он обновляется."),
          kind: z.enum(["task", "milestone"]),
          title: z.string().min(1).max(500),
          start_at: z.string().optional().describe("Начало, ISO datetime. У вехи не используется."),
          deadline: z.string().optional().describe("Срок; у вехи — плановая дата (обязательна при создании)."),
          description: z.string().max(2000).optional(),
          assignee: z.string().optional().describe("Исполнитель задачи: id, почта или имя."),
          status: z.enum(MILESTONE_STATUSES).optional().describe("Только для вехи."),
        }),
      )
      .min(1)
      .max(MAX_ITEMS),
    links: z
      .array(
        z.object({
          from: z.string().describe("key из items или UUID существующего элемента."),
          to: z.string().describe("key из items или UUID существующего элемента."),
          type: z.enum(DEPENDENCY_TYPES).optional().describe("По умолчанию FS."),
          lag_days: z.number().int().min(-365).max(365).optional(),
        }),
      )
      .optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (
    input: { project_id: string; apply?: boolean; items: Item[]; links?: Link[] },
    ctx: ToolContext,
  ) => {
    if (!ctx.isAuthenticated()) return fail("Не аутентифицирован");
    const uid = ctx.getUserId()!;
    const supabase = db(ctx);

    const { data: project, error: pErr } = await supabase
      .from("task_groups").select("id,name").eq("id", input.project_id).maybeSingle();
    if (pErr) return fail(pErr.message);
    if (!project) return fail("Проект не найден или недоступен");

    // ── Проверка целиком, до единой записи ────────────────────────────────
    const problems: string[] = [];
    const byKey = new Map<string, Item>();
    for (const [i, it] of input.items.entries()) {
      const where = it.key ? `«${it.key}»` : `элемент ${i + 1} («${it.title}»)`;
      if (it.key) {
        if (byKey.has(it.key)) problems.push(`${where}: key повторяется — ссылки стали бы двусмысленными`);
        byKey.set(it.key, it);
      }
      if (it.kind === "milestone" && !it.id && !it.deadline) {
        problems.push(`${where}: у вехи нужна deadline — это её плановая дата`);
      }
      if (it.kind === "milestone" && it.assignee) problems.push(`${where}: у вехи нет исполнителя`);
      if (it.kind === "task" && it.status) problems.push(`${where}: status здесь только для вехи`);

      const dates: Record<string, string> = {};
      for (const field of ["start_at", "deadline"] as const) {
        const raw = it[field];
        if (raw === undefined) continue;
        const parsed = parseDate(raw, `${where}, ${field}`);
        if ("error" in parsed) {
          problems.push(parsed.error);
          continue;
        }
        dates[field] = parsed.date;
      }
      if (dates.start_at && dates.deadline && new Date(dates.start_at) > new Date(dates.deadline)) {
        problems.push(`${where}: начало позже срока — задача получилась бы отрицательной длины`);
      }
      it.start_at = dates.start_at ?? it.start_at;
      it.deadline = dates.deadline ?? it.deadline;
    }

    // Исполнители разбираются здесь же: имя, которое не удалось сопоставить,
    // должно отменить весь план, а не выясниться на двенадцатой задаче.
    const assignees = new Map<string, { id: string; name: string }>();
    for (const it of input.items) {
      if (!it.assignee || assignees.has(it.assignee)) continue;
      const r = await resolveUser(supabase, it.assignee);
      if ("error" in r) {
        problems.push(`«${it.title}»: ${r.error}`);
        continue;
      }
      assignees.set(it.assignee, r);
    }

    // Существующие элементы: проверяем доступ и что вид совпадает с заявленным.
    const existingKind = new Map<string, "task" | "milestone">();
    for (const it of input.items) {
      if (!it.id) continue;
      const kind = await entityKind(supabase, it.id);
      if (!kind) {
        problems.push(`«${it.title}» (${it.id}): не найден или нет доступа`);
        continue;
      }
      if (kind !== it.kind) problems.push(`«${it.title}» (${it.id}): в базе это ${kind}, а в плане ${it.kind}`);
      existingKind.set(it.id, kind);
    }

    // Ссылки: концы должны быть либо key из этого вызова, либо существующий UUID.
    const links = input.links ?? [];
    const endpoint = async (ref: string, side: string, n: number): Promise<string | null> => {
      if (byKey.has(ref)) return ref;
      const item = input.items.find((i) => i.id === ref);
      if (item) return ref;
      const kind = await entityKind(supabase, ref);
      if (kind) return ref;
      problems.push(`связь ${n + 1}, ${side}: «${ref}» — ни key из этого вызова, ни доступный UUID`);
      return null;
    };
    for (const [n, l] of links.entries()) {
      const from = await endpoint(l.from, "from", n);
      const to = await endpoint(l.to, "to", n);
      if (from && to && from === to) problems.push(`связь ${n + 1}: элемент связан сам с собой`);
    }

    const deps = await fetchDependencies(supabase);
    if ("error" in deps) return fail(deps.error);

    // Кольца — по новым связям вместе с уже существующими. Новые элементы в
    // базе ещё не существуют, поэтому обычная проверка одного ребра не годится.
    const cycle = findCycle([
      ...deps.map((d) => ({ from: d.predecessor_id, to: d.successor_id })),
      ...links.map((l) => ({ from: l.from, to: l.to })),
    ]);
    if (cycle) problems.push(`связи замыкаются в кольцо: ${cycle.join(" → ")}`);

    if (problems.length) {
      return fail(
        `План не записан, ${problems.length === 1 ? "мешает" : "мешают"}:\n— ${problems.join("\n— ")}`,
      );
    }

    const plan = {
      project: { id: project.id, name: project.name },
      create: input.items.filter((i) => !i.id).map((i) => ({
        key: i.key ?? null, kind: i.kind, title: i.title,
        start_at: i.start_at ?? null, deadline: i.deadline ?? null,
        assignee: i.assignee ? assignees.get(i.assignee)!.name : null,
      })),
      update: input.items.filter((i) => i.id).map((i) => ({
        id: i.id, kind: i.kind, title: i.title,
        start_at: i.start_at ?? null, deadline: i.deadline ?? null,
        assignee: i.assignee ? assignees.get(i.assignee)!.name : null,
      })),
      links: links.map((l) => ({ from: l.from, to: l.to, type: l.type ?? "FS", lag_days: l.lag_days ?? 0 })),
    };

    if (!input.apply) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              written: false,
              checked: true,
              plan,
              counts: { create: plan.create.length, update: plan.update.length, links: plan.links.length },
              apply_with: "тот же вызов с apply=true, после того как человек посмотрел план",
            }),
          },
        ],
      };
    }

    // ── Запись ────────────────────────────────────────────────────────────
    // Проверки пройдены, но частичная запись всё равно возможна — транзакции
    // через PostgREST нет. Поэтому ведём список сделанного и, если что-то
    // сорвалось, отдаём его целиком: чинить вручную можно только то, про что
    // известно.
    const planningCache = new Map<string, boolean>();
    const resolved = new Map<string, string>(); // key или id → настоящий UUID
    const done: string[] = [];
    const warnings: string[] = [];

    const stop = (msg: string) =>
      fail(
        `Запись прервана: ${msg}\nУспело записаться: ${done.length ? done.join("; ") : "ничего"}.\n` +
          "Повторный вызов создаст новые элементы заново — сначала посмотрите расписание проекта.",
      );

    for (const it of input.items) {
      if (it.id) {
        const table = it.kind === "task" ? "tasks" : "project_milestones";
        const patch: Record<string, unknown> = { title: it.title };
        if (it.kind === "task") {
          if (it.start_at) patch.start_at = it.start_at;
          if (it.deadline) patch.deadline = it.deadline;
          // Базовая дата идёт за сроком, пока план не зафиксирован — как в
          // приложении и в остальных инструментах коннектора.
          if (it.deadline && (await isPlanningPhase(supabase, input.project_id, planningCache))) {
            patch.original_deadline = it.deadline;
          }
          if (it.description !== undefined) patch.description = it.description;
          if (it.assignee) patch.assigned_to = assignees.get(it.assignee)!.id;
        } else {
          patch.name = it.title;
          delete patch.title;
          if (it.deadline) patch.planned_date = it.deadline;
          if (it.description !== undefined) patch.description = it.description;
          if (it.status) patch.status = it.status;
          patch.updated_at = new Date().toISOString();
        }
        const { data: upd, error } = await supabase.from(table).update(patch).eq("id", it.id).select("id");
        if (error) return stop(`не удалось обновить «${it.title}»: ${error.message}`);
        if (!upd?.length) return stop(`нет прав на изменение «${it.title}»`);
        resolved.set(it.id, it.id);
        if (it.key) resolved.set(it.key, it.id);
        done.push(`обновлено «${it.title}»`);
        continue;
      }

      if (it.kind === "task") {
        const created = await insertTask(supabase, uid, {
          title: it.title,
          description: it.description ?? null,
          deadline: it.deadline ?? null,
          start_at: it.start_at ?? null,
          group_id: input.project_id,
          assigned_to: it.assignee ? assignees.get(it.assignee)!.id : uid,
          status_meta: { created_by: "claude", created_via: "mcp", source: { kind: "plan" } },
        });
        if ("error" in created) return stop(`не удалось создать задачу «${it.title}»: ${created.error}`);
        warnings.push(...created.warnings);
        resolved.set(it.key ?? created.task.id, created.task.id);
        done.push(`создана задача «${it.title}»`);
      } else {
        const { data: last } = await supabase
          .from("project_milestones").select("position")
          .eq("group_id", input.project_id).order("position", { ascending: false }).limit(1).maybeSingle();
        const { data: ms, error } = await supabase
          .from("project_milestones")
          .insert({
            group_id: input.project_id,
            name: it.title,
            planned_date: it.deadline!,
            description: it.description ?? null,
            status: it.status ?? "pending",
            color: "#3b82f6",
            created_by: uid,
            position: (last?.position ?? 0) + 1,
          })
          .select("id")
          .single();
        if (error) return stop(`не удалось создать веху «${it.title}»: ${error.message}`);
        resolved.set(it.key ?? ms.id, ms.id);
        done.push(`создана веха «${it.title}»`);
      }
    }

    const knownKinds = new Map<string, "task" | "milestone">();
    for (const it of input.items) {
      const id = resolved.get(it.key ?? it.id ?? "");
      if (id) knownKinds.set(id, it.kind);
    }

    const linkedIds: string[] = [];
    for (const l of links) {
      const from = resolved.get(l.from) ?? l.from;
      const to = resolved.get(l.to) ?? l.to;
      if (deps.some((d) => d.predecessor_id === from && d.successor_id === to)) {
        warnings.push(`связь ${l.from} → ${l.to} уже была, пропущена`);
        continue;
      }
      const fromKind = knownKinds.get(from) ?? (await entityKind(supabase, from));
      const toKind = knownKinds.get(to) ?? (await entityKind(supabase, to));
      if (!fromKind || !toKind) return stop(`не удалось определить вид элементов связи ${l.from} → ${l.to}`);
      const { error } = await supabase.from("task_dependencies").insert({
        predecessor_id: from,
        successor_id: to,
        dependency_type: l.type ?? "FS",
        lag_days: l.lag_days ?? 0,
        predecessor_entity_type: fromKind,
        successor_entity_type: toKind,
        created_by: uid,
      });
      if (error) return stop(`не удалось создать связь ${l.from} → ${l.to}: ${error.message}`);
      linkedIds.push(from, to);
      done.push(`связь ${l.from} → ${l.to}`);
    }

    // Каскад один раз в конце, а не после каждой связи: иначе промежуточные
    // сдвиги наложатся друг на друга и план уедет от того, что показывали.
    let shifted: Awaited<ReturnType<typeof cascade>> | null = null;
    if (linkedIds.length) {
      const fresh = await fetchDependencies(supabase);
      if ("error" in fresh) {
        warnings.push(`сроки не пересчитаны: ${fresh.error}`);
      } else {
        const r = await cascade(supabase, fresh, [...new Set(linkedIds)]);
        if ("error" in r) warnings.push(`сроки пересчитаны не полностью: ${r.error}`);
        else shifted = r;
      }
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            written: true,
            project: plan.project,
            created: plan.create.length,
            updated: plan.update.length,
            links: linkedIds.length ? plan.links.length : 0,
            ids: Object.fromEntries(resolved),
            shifted: shifted && "shifted" in shifted ? shifted.shifted : [],
            ...(warnings.length ? { warnings } : {}),
          }),
        },
      ],
    };
  },
});
