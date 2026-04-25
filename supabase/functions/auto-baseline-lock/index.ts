import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Find projects in 'planning' status that have exceeded their auto_lock_hours
    const { data: projects, error: fetchError } = await supabase
      .from("task_groups")
      .select("id, created_at, baseline_auto_lock_hours")
      .eq("baseline_status", "planning")
      .is("parent_id", null);

    if (fetchError) throw fetchError;

    const now = Date.now();
    const toLock = (projects || []).filter((p: any) => {
      const created = new Date(p.created_at).getTime();
      const lockHours = p.baseline_auto_lock_hours || 48;
      return now - created >= lockHours * 60 * 60 * 1000;
    });

    let locked = 0;
    const lockTime = new Date().toISOString();

    for (const project of toLock) {
      // Lock the project
      await supabase
        .from("task_groups")
        .update({ baseline_status: "locked", baseline_locked_at: lockTime })
        .eq("id", project.id);

      // Lock subprojects
      const { data: subgroups } = await supabase
        .from("task_groups")
        .select("id")
        .eq("parent_id", project.id);

      if (subgroups?.length) {
        await Promise.all(
          subgroups.map((sg: any) =>
            supabase
              .from("task_groups")
              .update({ baseline_status: "locked", baseline_locked_at: lockTime })
              .eq("id", sg.id)
          )
        );
      }

      // Fix original_deadline = deadline for all tasks
      const allGroupIds = [project.id, ...(subgroups || []).map((sg: any) => sg.id)];
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, deadline")
        .in("group_id", allGroupIds)
        .not("deadline", "is", null);

      if (tasks?.length) {
        await Promise.all(
          tasks.map((t: any) =>
            supabase
              .from("tasks")
              .update({ original_deadline: t.deadline })
              .eq("id", t.id)
          )
        );
      }

      locked++;
    }

    return new Response(
      JSON.stringify({ locked, checked: projects?.length || 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
