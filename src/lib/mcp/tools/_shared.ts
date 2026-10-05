// Общее для инструментов записи: клиент с токеном пользователя, уведомления,
// поиск людей, статусы-теги, пометка «сделано Claude», повторяющиеся задачи.
//
// Правило этого модуля: действие через Claude ведёт себя как то же действие в
// приложении (src/hooks/useTasks.tsx и соседи). Иначе коннектор обходит то,
// что приложение делает само: уведомления, утверждение, повтор задач.

// Глобального process в edge-runtime (Deno 1.45) нет — только импортом.
import process from "node:process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

export function db(ctx: ToolContext): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const fail = (text: string) => ({ content: [{ type: "text" as const, text }], isError: true });

/**
 * Уведомление через ту же функцию notify-event, что зовёт приложение. Сбой
 * уведомления не должен ронять действие — как и в приложении.
 */
export async function notify(
  supabase: SupabaseClient,
  event: string,
  taskTitle: string,
  targetUserIds: string[],
  taskId: string | null,
): Promise<void> {
  const targets = [...new Set(targetUserIds.filter(Boolean))];
  if (targets.length === 0) return;
  try {
    await supabase.functions.invoke("notify-event", {
      body: { event, taskTitle, targetUserIds: targets, taskId },
    });
  } catch {
    /* как в приложении: fire-and-forget */
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Человек по UUID, почте или части имени. Claude разбирает письма, где люди
 * названы по имени, — требовать от него UUID значит заставлять угадывать.
 * Неоднозначность не угадываем: возвращаем кандидатов.
 */
export async function resolveUser(
  supabase: SupabaseClient,
  who: string,
): Promise<{ id: string; name: string } | { error: string }> {
  const q = who.trim();
  if (UUID_RE.test(q)) {
    const { data } = await supabase.from("profiles").select("id,display_name").eq("id", q).is("deleted_at", null).maybeSingle();
    return data ? { id: data.id, name: data.display_name ?? q } : { error: `Пользователь ${q} не найден` };
  }
  const esc = q.replace(/[\\%_,()]/g, (m) => "\\" + m);
  const { data, error } = await supabase
    .from("profiles")
    .select("id,display_name,email,work_email")
    .is("deleted_at", null)
    .or(`display_name.ilike.%${esc}%,email.ilike.%${esc}%,work_email.ilike.%${esc}%`)
    .limit(6);
  if (error) return { error: error.message };
  const rows = data ?? [];
  const exact = rows.filter((r) =>
    [r.display_name, r.email, r.work_email].some((v) => v && v.toLowerCase() === q.toLowerCase()),
  );
  const pick = exact.length === 1 ? exact : rows;
  if (pick.length === 1) return { id: pick[0].id, name: pick[0].display_name ?? pick[0].email ?? pick[0].id };
  if (pick.length === 0) return { error: `Никого не нашлось по «${q}»` };
  const list = pick.map((r) => `${r.display_name ?? "?"} <${r.work_email ?? r.email ?? "?"}> (${r.id})`).join("; ");
  return { error: `По «${q}» несколько человек — уточните или передайте id: ${list}` };
}

/**
 * Статусы — теги системной категории protocol_status (как в useSetTaskStatus).
 * Категория ОДНА на всех (is_system), не у каждого пользователя своя;
 * если её ещё нет — создаётся по требованию, как в приложении.
 */
export const STATUS_NAMES = ["в работе", "отправлено", "ждём ответ", "получен ответ", "завершено", "отменено"] as const;
export type StatusName = (typeof STATUS_NAMES)[number];

const plain = (s: string) => s.replace(/[^\p{L}\p{N} ]/gu, "").trim().toLowerCase().replace(/ё/g, "е");

export async function setStatus(
  supabase: SupabaseClient,
  userId: string,
  taskId: string,
  status: StatusName | "none",
): Promise<{ name: string | null } | { error: string }> {
  const loadCategory = () =>
    supabase.from("tag_categories").select("id").eq("system_key", "protocol_status").eq("is_system", true).limit(1).maybeSingle();
  let { data: cat } = await loadCategory();
  if (!cat) {
    await supabase.rpc("seed_protocol_status_for_user", { _user_id: userId });
    ({ data: cat } = await loadCategory());
  }
  if (!cat) return { error: "Не удалось найти или создать статусы задач" };
  const { data: tags, error } = await supabase.from("tags").select("id,name").eq("category_id", cat.id);
  if (error) return { error: error.message };
  const all = tags ?? [];
  const target = status === "none" ? null : all.find((t) => plain(t.name) === plain(status));
  if (status !== "none" && !target) return { error: `Статус «${status}» не найден среди: ${all.map((t) => t.name).join(", ")}` };

  const toRemove = all.map((t) => t.id).filter((id) => id !== target?.id);
  if (toRemove.length) {
    const { error: e } = await supabase.from("task_tags").delete().eq("task_id", taskId).in("tag_id", toRemove);
    if (e) return { error: e.message };
  }
  if (target) {
    const { error: e } = await supabase.from("task_tags").upsert({ task_id: taskId, tag_id: target.id }, { onConflict: "task_id,tag_id" });
    if (e) return { error: e.message };
    // «Отправлено» фиксирует время отправки один раз — как в приложении.
    if (plain(target.name) === "отправлено") await mergeStatusMeta(supabase, taskId, { sent_at: new Date().toISOString() }, true);
  }
  return { name: target?.name ?? null };
}

/**
 * Дописать в status_meta, не затирая: там уже лежат поля протоколов
 * (linked_*, sent_at и др.). onlyIfAbsent — не перезаписывать существующие ключи.
 */
export async function mergeStatusMeta(
  supabase: SupabaseClient,
  taskId: string,
  patch: Record<string, unknown>,
  onlyIfAbsent = false,
): Promise<string | null> {
  const { data, error } = await supabase.from("tasks").select("status_meta").eq("id", taskId).maybeSingle();
  if (error) return error.message;
  const cur = (data?.status_meta ?? {}) as Record<string, unknown>;
  const next = onlyIfAbsent ? { ...patch, ...cur } : { ...cur, ...patch };
  const { error: e } = await supabase.from("tasks").update({ status_meta: next }).eq("id", taskId);
  return e ? e.message : null;
}

/** Правила повтора — те же, что в toggleTask приложения. */
export function nextRecurrence(from: Date, rule: string): Date {
  const d = new Date(from);
  if (rule === "daily") d.setDate(d.getDate() + 1);
  else if (rule === "weekdays") {
    d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  } else if (rule === "every2days") d.setDate(d.getDate() + 2);
  else if (rule === "every3days") d.setDate(d.getDate() + 3);
  else if (rule === "weekly") d.setDate(d.getDate() + 7);
  else if (rule === "biweekly") d.setDate(d.getDate() + 14);
  else if (rule === "monthly") d.setMonth(d.getMonth() + 1);
  else if (rule === "quarterly") d.setMonth(d.getMonth() + 3);
  else if (rule === "semiannually") d.setMonth(d.getMonth() + 6);
  else if (rule === "yearly") d.setFullYear(d.getFullYear() + 1);
  return d;
}

/**
 * Вставка задачи вместе со всем, что приложение делает после неё: участник-
 * создатель, тег проекта, уведомления исполнителю и участникам проекта
 * (useTasks.addTask).
 *
 * Вынесено, чтобы create_task и upsert_plan не разошлись. Задача, созданная
 * планом, обязана быть такой же, как созданная по одной: иначе у половины
 * задач не окажется тега проекта, и обнаружится это по пустым подборкам.
 */
export async function insertTask(
  supabase: SupabaseClient,
  uid: string,
  fields: {
    title: string;
    description?: string | null;
    deadline?: string | null;
    start_at?: string | null;
    group_id?: string | null;
    client_id?: string | null;
    assigned_to: string;
    is_important?: boolean;
    priority?: number | null;
    status_meta: Record<string, unknown>;
    /** Черновик протокола: задача не видна исполнителю до публикации. */
    is_draft?: boolean;
    source_protocol_id?: string | null;
    protocol_scope?: string | null;
  },
  opts: { notifyAssignee?: boolean } = {},
): Promise<{ task: { id: string; title: string; deadline: string | null; group_id: string | null; assigned_to: string }; warnings: string[] } | { error: string }> {
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      user_id: uid,
      title: fields.title,
      description: fields.description ?? null,
      deadline: fields.deadline ?? null,
      group_id: fields.group_id ?? null,
      client_id: fields.client_id ?? null,
      assigned_to: fields.assigned_to,
      is_important: fields.is_important ?? false,
      priority: fields.priority ?? null,
      // Начало по умолчанию «сейчас» — как в приложении. План передаёт своё.
      start_at: fields.start_at ?? new Date().toISOString(),
      status_meta: fields.status_meta,
      ...(fields.is_draft ? { is_draft: true } : {}),
      ...(fields.source_protocol_id ? { source_protocol_id: fields.source_protocol_id } : {}),
      ...(fields.protocol_scope ? { protocol_scope: fields.protocol_scope } : {}),
    })
    .select("id,title,deadline,group_id,assigned_to")
    .single();
  if (error) return { error: error.message };

  const warnings: string[] = [];
  const { error: pErr } = await supabase
    .from("task_participants")
    .insert({ task_id: data.id, user_id: uid, role: "creator" });
  if (pErr) warnings.push(`участник-создатель не добавлен: ${pErr.message}`);

  if (data.group_id) {
    // Тег проекта ставится и черновику: приложение делает это до проверки на
    // черновик, и без тега задача не попадёт в подборки после публикации.
    const { data: group } = await supabase
      .from("task_groups").select("linked_tag_id").eq("id", data.group_id).maybeSingle();
    if (group?.linked_tag_id) {
      const { error: tErr } = await supabase
        .from("task_tags").insert({ task_id: data.id, tag_id: group.linked_tag_id });
      if (tErr) warnings.push(`тег проекта не поставлен: ${tErr.message}`);
    }
    // А уведомления черновик не рассылает: задача ещё не существует для
    // исполнителя, и письмо про неё было бы обещанием, которого никто не давал.
    // Ровно так же поступает приложение (useTasks.addTask, «SKIP for drafts»).
    if (!fields.is_draft) {
      const { data: members } = await supabase.from("group_members").select("user_id").eq("group_id", data.group_id);
      await notify(
        supabase, "new_task_in_group", data.title,
        (members ?? []).map((m) => m.user_id).filter((id) => id !== uid), data.id,
      );
    }
  }
  if (!fields.is_draft && opts.notifyAssignee !== false && fields.assigned_to !== uid) {
    await notify(supabase, "task_assigned", data.title, [fields.assigned_to], data.id);
  }

  return { task: data, warnings };
}

// Правило этапа планирования — в src/lib/baselinePhase.ts (общее с приложением).
export { shouldKeepBaselineInStep, isPlanningPhase } from "../../baselinePhase";
