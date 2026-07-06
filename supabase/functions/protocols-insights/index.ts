import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { blockConsultant } from "../_shared/consultant-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_AXES = [
  { key: "clients", label: "Клиент" },
  { key: "brand", label: "Бренд" },
  { key: "product_category", label: "Категория" },
  { key: "site", label: "Площадка" },
  { key: "territory", label: "Территория" },
  { key: "event_topic", label: "Тема" },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const blocked = await blockConsultant(req, { corsHeaders });
  if (blocked) return blocked;

  try {
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not configured");

    const authHeader = req.headers.get("authorization") || "";
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await anon.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const weekAgoIso = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 1) Видимые пользователю протоколы (RLS через anon-клиент).
    const { data: protocols, error: pErr } = await anon
      .from("task_groups")
      .select("id, name, draft_status")
      .eq("project_type", "protocol")
      .is("closed_at", null);
    if (pErr) throw pErr;
    const protocolIds = (protocols || []).map((p: any) => p.id);

    if (protocolIds.length === 0) {
      return new Response(JSON.stringify({ insight: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Все задачи протоколов (служебный клиент, мы уже отфильтровали по видимым protocolIds).
    const { data: tasks, error: tErr } = await admin
      .from("tasks")
      .select("id, title, group_id, deadline, original_deadline, is_completed, completed_at, created_at, updated_at, assigned_to")
      .in("group_id", protocolIds)
      .limit(5000);
    if (tErr) throw tErr;

    const activeTasks = (tasks || []).filter((t: any) => !t.is_completed);

    // «Зависшая» задача (за неделю): просрочена ИЛИ без срока ИЛИ без ответственного,
    // и при этом без обновлений > 7 дней (либо создана > 7 дней назад).
    const isStuck = (t: any) => {
      const updated = new Date(t.updated_at).getTime();
      const created = new Date(t.created_at).getTime();
      const stale = (now.getTime() - updated) > 7 * 24 * 3600 * 1000
        || (now.getTime() - created) > 7 * 24 * 3600 * 1000;
      const overdue = !!t.deadline && new Date(t.deadline) < now;
      const noDeadline = !t.deadline;
      const noAssignee = !t.assigned_to;
      return stale && (overdue || noDeadline || noAssignee);
    };

    const stuckTasks = activeTasks.filter(isStuck);
    const stuckIds = stuckTasks.map((t: any) => t.id);

    // Закрыто за неделю
    const closedThisWeek = (tasks || []).filter(
      (t: any) => t.is_completed && t.completed_at && t.completed_at >= weekAgoIso,
    );
    // Создано за неделю
    const createdThisWeek = (tasks || []).filter((t: any) => t.created_at >= weekAgoIso);

    // 3) Срез по осям: считаем зависшие задачи по системным тегам.
    let axesSummary: Array<{
      axisKey: string;
      axisLabel: string;
      chips: Array<{ tagId: string; tagName: string; stuckCount: number }>;
    }> = [];

    if (stuckIds.length > 0) {
      // task_tags (id ↔ tag_id) для зависших задач
      const { data: taskTags } = await admin
        .from("task_tags")
        .select("task_id, tag_id")
        .in("task_id", stuckIds);
      const allTagIds = Array.from(new Set((taskTags || []).map((r: any) => r.tag_id)));
      if (allTagIds.length > 0) {
        const { data: tagRows } = await admin
          .from("tags")
          .select("id, name, system_key, is_system")
          .in("id", allTagIds)
          .eq("is_system", true);

        const tagInfo = new Map<string, { name: string; system_key: string }>();
        (tagRows || []).forEach((t: any) => {
          if (t.system_key) tagInfo.set(t.id, { name: t.name, system_key: t.system_key });
        });

        // axisKey → tagId → count
        const grouped: Record<string, Map<string, { name: string; count: number }>> = {};
        for (const ax of SYSTEM_AXES) grouped[ax.key] = new Map();

        for (const row of taskTags || []) {
          const info = tagInfo.get(row.tag_id);
          if (!info) continue;
          if (!grouped[info.system_key]) continue;
          const m = grouped[info.system_key];
          const cur = m.get(row.tag_id) || { name: info.name, count: 0 };
          cur.count += 1;
          m.set(row.tag_id, cur);
        }

        axesSummary = SYSTEM_AXES
          .map((ax) => ({
            axisKey: ax.key,
            axisLabel: ax.label,
            chips: Array.from(grouped[ax.key].entries())
              .map(([tagId, v]) => ({ tagId, tagName: v.name, stuckCount: v.count }))
              .sort((a, b) => b.stuckCount - a.stuckCount)
              .slice(0, 6),
          }))
          .filter((g) => g.chips.length > 0);
      }
    }

    // 4) AI-комментарий: 1-2 предложения, что бросается в глаза.
    const compactCtx: string[] = [];
    compactCtx.push(`Активных протоколов: ${protocolIds.length}`);
    compactCtx.push(`Активных вопросов: ${activeTasks.length}`);
    compactCtx.push(`Зависших за неделю: ${stuckTasks.length}`);
    compactCtx.push(`Закрыто за 7 дн.: ${closedThisWeek.length}; создано: ${createdThisWeek.length}`);
    if (axesSummary.length > 0) {
      compactCtx.push("Топ-зависания по осям:");
      for (const g of axesSummary.slice(0, 4)) {
        const tops = g.chips.slice(0, 3).map((c) => `${c.tagName}(${c.stuckCount})`).join(", ");
        compactCtx.push(`- ${g.axisLabel}: ${tops}`);
      }
    }

    let comment = "";
    if (stuckTasks.length > 0) {
      try {
        const aiResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`, "HTTP-Referer": "https://justtodoit.ru",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              {
                role: "system",
                content:
                  "Ты — аналитик по протоколам совещаний. Дай 1-2 коротких предложения (≤180 знаков) на русском, без markdown, с эмодзи, о том, какая ось/контекст вызывает наибольшее зависание вопросов на этой неделе. Будь конкретен — называй имена тегов из контекста.",
              },
              { role: "user", content: compactCtx.join("\n") },
            ],
            stream: false,
          }),
        });
        if (aiResp.ok) {
          const j = await aiResp.json();
          comment = j?.choices?.[0]?.message?.content?.trim() || "";
        } else if (aiResp.status === 429 || aiResp.status === 402) {
          // тихий фолбэк — отдадим без AI
        }
      } catch (e) {
        console.error("AI insight error:", e);
      }
    }

    return new Response(
      JSON.stringify({
        insight: {
          generatedAt: now.toISOString(),
          totals: {
            protocols: protocolIds.length,
            active: activeTasks.length,
            stuck: stuckTasks.length,
            closedThisWeek: closedThisWeek.length,
            createdThisWeek: createdThisWeek.length,
          },
          axes: axesSummary,
          comment,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("protocols-insights error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
