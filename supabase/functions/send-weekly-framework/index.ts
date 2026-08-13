import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { FRAMEWORKS, type Framework } from "../_shared/frameworks.ts";

/**
 * Пятничная рассылка «Strategy deck» — один фреймворк в личку.
 *
 * Правила выбора:
 *  - всем подписчикам на неделе уходит ОДИН И ТОТ ЖЕ фреймворк (общий контекст
 *    для обсуждения в команде);
 *  - порядок случайный, но БЕЗ повторов внутри цикла: пока не разосланы все 50,
 *    выбор идёт только из неотправленных. Когда колода кончилась — новый цикл;
 *  - самый первый выпуск принудительно STP (договорённость с заказчиком).
 *
 * Время: пятница 09:09 МСК (решение владельца продукта перед первым запуском
 * 2026-08-14; исходно в PR #7 планировалось 15:00, отдельно от утренних
 * отчётов 08:08 — время сдвинуто, сам принцип "не смешивать с цифрами" тот же).
 */

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://justtodoit.ru";

const FIRST_EVER_FRAMEWORK_ID = "stp";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Понедельник текущей недели по Москве — ключ идемпотентности. */
function weekStartMoscow(): string {
  const m = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
  const day = m.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  m.setDate(m.getDate() + diff);
  return m.toISOString().slice(0, 10);
}

const CAT_LABELS: Record<string, string> = {
  strategy: "Стратегия",
  growth: "Рост",
  customer: "Клиент",
  brand: "Бренд",
  money: "Деньги",
  comms: "Коммуникации",
};

function buildMessage(f: Framework, cycle: number, indexInCycle: number): string {
  const cat = CAT_LABELS[f.cat] ?? f.cat;
  const steps = f.steps.map((s, i) => `${i + 1}. ${escapeHtml(s)}`).join("\n");
  return [
    `🧠 <b>Strategy deck</b> · ${escapeHtml(cat)}`,
    `<i>${indexInCycle} из ${FRAMEWORKS.length}${cycle > 1 ? ` · круг ${cycle}` : ""}</i>`,
    ``,
    `<b>${escapeHtml(f.name)}</b> — ${escapeHtml(f.nameRu)}`,
    `<i>${escapeHtml(f.origin)}</i>`,
    ``,
    escapeHtml(f.essence),
    ``,
    `<b>Когда применять</b>`,
    escapeHtml(f.when),
    ``,
    `<b>Как делать</b>`,
    steps,
    ``,
    `<b>Пример · ${escapeHtml(f.example.company)}</b>`,
    escapeHtml(f.example.text),
    ``,
    `⚠️ <b>Частая ошибка</b>`,
    escapeHtml(f.pitfall),
    ``,
    `<a href="${SITE_URL}/frameworks/">Вся колода — 50 фреймворков</a>`,
  ].join("\n");
}

Deno.serve(async (req) => {
  if (!BOT_TOKEN) {
    return new Response(JSON.stringify({ error: "TELEGRAM_BOT_TOKEN not set" }), { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Пятница по Москве; ?force=1 — ручной прогон для проверки
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const moscowNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
  if (!force && moscowNow.getDay() !== 5) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: "not friday" }));
  }

  const weekStart = weekStartMoscow();

  // ── Выбор фреймворка ────────────────────────────────────────────────
  const { data: log } = await supabase
    .from("framework_broadcast_log")
    .select("framework_id, cycle, week_start");

  const history = log ?? [];

  // Уже рассылали на этой неделе — выходим (страховка от повторного крона)
  if (!force && history.some((r: any) => r.week_start === weekStart)) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: "already sent this week" }));
  }

  let cycle = history.length > 0 ? Math.max(...history.map((r: any) => r.cycle)) : 1;
  let sentInCycle = history.filter((r: any) => r.cycle === cycle).map((r: any) => r.framework_id);

  // Колода в текущем цикле закончилась — открываем следующий круг
  if (sentInCycle.length >= FRAMEWORKS.length) {
    cycle += 1;
    sentInCycle = [];
  }

  const remaining = FRAMEWORKS.filter((f) => !sentInCycle.includes(f.id));

  let chosen: Framework;
  if (history.length === 0) {
    // Самый первый выпуск — всегда STP
    chosen = FRAMEWORKS.find((f) => f.id === FIRST_EVER_FRAMEWORK_ID) ?? remaining[0];
  } else {
    chosen = remaining[Math.floor(Math.random() * remaining.length)];
  }

  const indexInCycle = sentInCycle.length + 1;

  // ── Получатели: привязан Telegram + не отписан ──────────────────────
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, telegram_chat_id")
    .not("telegram_chat_id", "is", null)
    .gt("telegram_chat_id", 0);

  if (!profiles || profiles.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: "no telegram users" }));
  }

  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("user_id, telegram_weekly_framework")
    .in("user_id", profiles.map((p: any) => p.id));

  const optedOut = new Set(
    (prefs ?? [])
      .filter((p: any) => p.telegram_weekly_framework === false)
      .map((p: any) => p.user_id),
  );
  // Колонка DEFAULT true, поэтому отсутствие строки настроек = подписан
  const recipients = profiles.filter((p: any) => !optedOut.has(p.id));

  if (recipients.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: "everyone opted out" }));
  }

  // ── Резервируем неделю ДО отправки: если крон запустится дважды,
  //    второй прогон упрётся в unique-констрейнт и не задублирует рассылку
  const { error: claimErr } = await supabase
    .from("framework_broadcast_log")
    .insert({ framework_id: chosen.id, cycle, week_start: weekStart, recipients: recipients.length });

  if (claimErr && !force) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: "claim failed (already sent)" }));
  }

  const text = buildMessage(chosen, cycle, indexInCycle);
  let sent = 0;
  const errors: string[] = [];

  for (const p of recipients) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: p.telegram_chat_id,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      });
      if (res.ok) sent++;
      else errors.push(`${p.display_name ?? p.id}: ${await res.text()}`);
    } catch (e) {
      errors.push(`${p.display_name ?? p.id}: ${String(e)}`);
    }
  }

  // Фактическое число доставленных
  await supabase
    .from("framework_broadcast_log")
    .update({ recipients: sent })
    .match({ week_start: weekStart });

  return new Response(
    JSON.stringify({
      ok: true,
      framework: chosen.id,
      cycle,
      indexInCycle,
      sent,
      errors: errors.slice(0, 5),
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
