import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeIcal(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function formatDateIcal(dateStr: string): string {
  const d = new Date(dateStr);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response("Missing token", { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Look up token
  const { data: tokenRow, error: tokenErr } = await supabase
    .from("calendar_tokens")
    .select("user_id")
    .eq("token", token)
    .single();

  if (tokenErr || !tokenRow) {
    return new Response("Invalid token", { status: 403, headers: corsHeaders });
  }

  const userId = tokenRow.user_id;

  // Get tasks with deadlines for this user
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, deadline, is_completed, is_important, description, group_id")
    .or(`user_id.eq.${userId},assigned_to.eq.${userId}`)
    .not("deadline", "is", null)
    .order("deadline", { ascending: true })
    .limit(500);

  // Build iCal
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//JTD Tasks//Calendar Feed//RU",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Задачи JTD",
    "X-WR-TIMEZONE:UTC",
  ];

  for (const task of tasks || []) {
    const dateStr = formatDateIcal(task.deadline);
    const nextDay = new Date(task.deadline);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const endDateStr = formatDateIcal(nextDay.toISOString());

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${task.id}@jtd.lovable.app`);
    lines.push(`DTSTART;VALUE=DATE:${dateStr}`);
    lines.push(`DTEND;VALUE=DATE:${endDateStr}`);
    lines.push(`SUMMARY:${escapeIcal(task.is_completed ? "✅ " + task.title : task.is_important ? "❗ " + task.title : task.title)}`);
    if (task.description) {
      lines.push(`DESCRIPTION:${escapeIcal(task.description)}`);
    }
    lines.push(`STATUS:${task.is_completed ? "COMPLETED" : "CONFIRMED"}`);
    lines.push("TRANSP:TRANSPARENT");
    lines.push("BEGIN:VALARM");
    lines.push("TRIGGER:-PT1H");
    lines.push("ACTION:DISPLAY");
    lines.push(`DESCRIPTION:Дедлайн: ${escapeIcal(task.title)}`);
    lines.push("END:VALARM");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n"), {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="tasks.ics"',
    },
  });
});
