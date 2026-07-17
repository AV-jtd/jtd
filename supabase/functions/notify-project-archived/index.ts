import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Fires when a project is archived (closed_at set) from the UI
 * (useTasks.tsx → closeProject). Posts a short "done" announcement with
 * brief stats to the project's linked Telegram group, if any. Silent
 * no-op when there's no linked chat — most projects don't have one.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!BOT_TOKEN) {
      return new Response(JSON.stringify({ ok: true, sent: false, reason: "no bot token" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await authClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { groupId } = await req.json();
    if (!groupId) {
      return new Response(JSON.stringify({ error: "groupId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const svc = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: link } = await svc
      .from("telegram_group_chats")
      .select("telegram_chat_id")
      .eq("group_id", groupId)
      .maybeSingle();
    if (!link) {
      return new Response(JSON.stringify({ ok: true, sent: false, reason: "no linked chat" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: group } = await svc
      .from("task_groups")
      .select("id, name, created_at, closed_at")
      .eq("id", groupId)
      .single();
    if (!group) {
      return new Response(JSON.stringify({ ok: true, sent: false, reason: "group not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Include subgroups, mirroring send-weekly-group-report.
    const { data: subgroups } = await svc.from("task_groups").select("id").eq("parent_id", groupId);
    const allGroupIds = [groupId, ...(subgroups ?? []).map((s: any) => s.id)];

    const { data: tasks } = await svc
      .from("tasks")
      .select("id, is_completed, assigned_to")
      .in("group_id", allGroupIds);
    const allTasks = tasks ?? [];
    const total = allTasks.length;
    const completed = allTasks.filter((t: any) => t.is_completed).length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 100;
    const participants = new Set(allTasks.map((t: any) => t.assigned_to).filter(Boolean)).size;

    const closedAt = group.closed_at ? new Date(group.closed_at) : new Date();
    const createdAt = group.created_at ? new Date(group.created_at) : null;
    const durationDays = createdAt
      ? Math.max(1, Math.round((closedAt.getTime() - createdAt.getTime()) / 86_400_000))
      : null;

    const lines = [
      `🎉 <b>Проект «${escapeHtml(group.name)}» завершён!</b> Молодцы! 👏`,
      ``,
      `📊 Задач: <b>${completed}/${total}</b>${total > 0 ? ` (${pct}%)` : ""}`,
    ];
    if (durationDays != null) lines.push(`⏱ Длительность: <b>${durationDays} дн.</b>`);
    if (participants > 0) lines.push(`👥 Участников: <b>${participants}</b>`);

    const tgResp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: link.telegram_chat_id,
        text: lines.join("\n"),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!tgResp.ok) {
      const errBody = await tgResp.text();
      return new Response(JSON.stringify({ ok: false, sent: false, error: errBody }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, sent: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
