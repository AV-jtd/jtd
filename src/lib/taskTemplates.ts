import { supabase } from "@/integrations/supabase/client";

export interface TaskTemplate {
  title: string;
  subtasks: string[];
}

/**
 * Fetch existing tasks with 3+ subtasks from a project (and its subprojects)
 * to use as contextual templates for AI suggestions.
 * Returns up to `limit` templates sorted by subtask count (richest first).
 */
export async function fetchTaskTemplates(
  groupId: string | null | undefined,
  allGroupIds?: string[],
  limit = 10,
): Promise<TaskTemplate[]> {
  if (!groupId) return [];

  const ids = allGroupIds?.length ? allGroupIds : [groupId];

  // Fetch in batches of 20
  const results: { title: string; subtasks: { title: string; is_completed: boolean; position: number }[] }[] = [];
  for (let i = 0; i < ids.length; i += 20) {
    const batch = ids.slice(i, i + 20);
    const { data } = await supabase
      .from("tasks")
      .select("title, subtasks(title, is_completed, position)")
      .in("group_id", batch)
      .order("created_at", { ascending: false })
      .limit(100);
    if (data) results.push(...(data as any));
  }

  // Filter to tasks with 3+ subtasks, sort by subtask count desc
  return results
    .filter(t => t.subtasks && t.subtasks.length >= 3)
    .sort((a, b) => b.subtasks.length - a.subtasks.length)
    .slice(0, limit)
    .map(t => ({
      title: t.title,
      subtasks: t.subtasks
        .sort((a, b) => a.position - b.position)
        .map(s => s.title),
    }));
}

/**
 * Format templates as a string block for AI prompts.
 */
export function formatTemplatesForPrompt(templates: TaskTemplate[]): string {
  if (!templates.length) return "";
  const examples = templates.map(t =>
    `Задача: "${t.title}"\n  Шаги: ${t.subtasks.map((s, i) => `${i + 1}. ${s}`).join("; ")}`
  ).join("\n");
  return `\n\n📚 Шаблоны из проекта (используй как образец для похожих задач — копируй структуру шагов для аналогичных задач):\n${examples}`;
}
