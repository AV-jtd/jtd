import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { db, fail } from "./_shared";
import { driftDays } from "../../drift";

/**
 * Состояние базового плана проекта.
 *
 * Зачем отдельный инструмент. Перенося сроки, Claude до сих пор не знал, идёт
 * ли ещё планирование или план уже утверждён — а разница принципиальная: в
 * первом случае базовая дата едет за сроком и сдвига нет, во втором сдвиг
 * записывается и попадает в портфель. Сказать человеку «это запишется как
 * отклонение» можно только зная статус.
 *
 * Здесь же — АВТОФИКСАЦИЯ, про которую легко забыть: edge-функция
 * `auto-baseline-lock` фиксирует план сам, через `baseline_auto_lock_hours`
 * часов после создания проекта (по умолчанию 48). То есть план, разложенный
 * сегодня, через двое суток станет утверждённым без чьего-либо участия, и
 * дальше каждая правка сроков — уже отклонение. Отвечаем, сколько часов
 * осталось.
 */

export default defineTool({
  name: "get_baseline",
  title: "Базовый план проекта",
  description:
    "Состояние базового плана: planning (план ещё составляется — правки сроков не считаются сдвигом) или locked (план утверждён — каждая правка записывается как отклонение). Показывает, кто утверждающий, когда зафиксирован, сколько задач уже с отклонением и через сколько часов сработает автофиксация. Спрашивайте перед переносом сроков: от статуса зависит, будет ли сдвиг записан в портфель.",
  inputSchema: {
    project_id: z.string().uuid().describe("UUID проекта (task_groups.id)."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (input: { project_id: string }, ctx: ToolContext) => {
    if (!ctx.isAuthenticated()) return fail("Не аутентифицирован");
    const supabase = db(ctx);

    const { data: project, error } = await supabase
      .from("task_groups")
      .select("id,name,parent_id,baseline_status,baseline_locked_at,baseline_approver_id,baseline_auto_lock_hours,created_at")
      .eq("id", input.project_id)
      .maybeSingle();
    if (error) return fail(error.message);
    if (!project) return fail("Проект не найден или недоступен");

    // У подпроекта статус родителя тоже важен: приложение считает этапом
    // планирования, если планируется хотя бы один из двух.
    let parent: { id: string; name: string; baseline_status: string | null } | null = null;
    if (project.parent_id) {
      const { data } = await supabase
        .from("task_groups").select("id,name,baseline_status").eq("id", project.parent_id).maybeSingle();
      parent = data ?? null;
    }
    const planning = project.baseline_status === "planning" || parent?.baseline_status === "planning";

    let approver: string | null = null;
    if (project.baseline_approver_id) {
      const { data } = await supabase
        .from("profiles").select("display_name,email").eq("id", project.baseline_approver_id).maybeSingle();
      approver = data?.display_name ?? data?.email ?? null;
    }

    // Автофиксация считается от создания проекта — так устроена функция
    // auto-baseline-lock, и это не то же самое, что «через 48 часов от сегодня».
    const hours = project.baseline_auto_lock_hours ?? 48;
    let autoLock: { at: string; hours_left: number } | null = null;
    if (planning && project.baseline_status === "planning" && !project.parent_id) {
      const at = new Date(new Date(project.created_at).getTime() + hours * 3600000);
      autoLock = { at: at.toISOString(), hours_left: Math.round((at.getTime() - Date.now()) / 3600000) };
    }

    // Сколько задач уже разошлось с базовым планом. Считаем тем же помощником,
    // что приложение: испорченная базовая дата не превращается в сдвиг на две
    // тысячи лет.
    const { data: tasks, error: tErr } = await supabase
      .from("tasks")
      .select("id,deadline,original_deadline")
      .eq("group_id", input.project_id)
      .not("deadline", "is", null)
      .limit(2000);
    if (tErr) return fail(tErr.message);
    let drifted = 0;
    let maxDrift = 0;
    let withoutBaseline = 0;
    for (const t of tasks ?? []) {
      if (!t.original_deadline) {
        withoutBaseline++;
        continue;
      }
      const d = driftDays(t.original_deadline, t.deadline);
      if (d === null || d === 0) continue;
      drifted++;
      if (Math.abs(d) > Math.abs(maxDrift)) maxDrift = d;
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            project: { id: project.id, name: project.name },
            status: project.baseline_status,
            counts_as_planning: planning,
            meaning: planning
              ? "План составляется: базовая дата идёт за сроком, правки сдвигом не записываются."
              : "План утверждён: каждая правка срока записывается как отклонение и попадает в портфель.",
            locked_at: project.baseline_locked_at,
            approver,
            parent: parent ? { id: parent.id, name: parent.name, status: parent.baseline_status } : null,
            auto_lock: autoLock,
            auto_lock_hours: hours,
            tasks: {
              with_deadline: (tasks ?? []).length,
              drifted,
              max_drift_days: maxDrift || null,
              without_baseline: withoutBaseline,
            },
          }),
        },
      ],
    };
  },
});
