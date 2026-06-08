import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { ClientTaskThread } from "./useClientTaskThreads";

/** Сообщения-маркеры, которые не должны попадать в превью ленты. */
function isSystemContent(content: string): boolean {
  return content.startsWith("__sys_");
}

/**
 * Агрегаты чатов задач, привязанных к проекту (tasks.group_id).
 *
 * Зеркалит useClientTaskThreads, но фильтрует по группе. Возвращает по одной
 * «ветке» на задачу с живой перепиской, отсортировано по свежести.
 */
export function useProjectTaskThreads(groupId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["project_task_threads", groupId],
    queryFn: async (): Promise<ClientTaskThread[]> => {
      if (!groupId) return [];

      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title, is_completed, group_id")
        .eq("group_id", groupId)
        .limit(300);
      const taskRows = (tasks as any[]) || [];
      if (taskRows.length === 0) return [];

      const taskIds = taskRows.map((t) => t.id as string);

      const { data: comments } = await supabase
        .from("task_comments")
        .select("task_id, content, created_at, user_id, kind")
        .in("task_id", taskIds)
        .order("created_at", { ascending: false })
        .limit(2000);

      const agg = new Map<
        string,
        { content: string; created_at: string; user_id: string; count: number }
      >();
      for (const c of (comments as any[]) || []) {
        if (c.kind === "log" || c.kind === "system") continue;
        if (typeof c.content === "string" && isSystemContent(c.content)) continue;
        const existing = agg.get(c.task_id);
        if (!existing) {
          agg.set(c.task_id, {
            content: c.content,
            created_at: c.created_at,
            user_id: c.user_id,
            count: 1,
          });
        } else {
          existing.count += 1;
        }
      }

      const authorIds = [...new Set([...agg.values()].map((v) => v.user_id).filter(Boolean))];
      const profileMap = new Map<string, string>();
      if (authorIds.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", authorIds);
        for (const p of (profiles as any[]) || []) profileMap.set(p.id, p.display_name || "");
      }

      const threads: ClientTaskThread[] = [];
      for (const t of taskRows) {
        const info = agg.get(t.id);
        if (!info) continue;
        threads.push({
          taskId: t.id,
          title: t.title,
          isCompleted: !!t.is_completed,
          groupId: t.group_id ?? null,
          lastMessage: info.content,
          lastMessageAt: info.created_at,
          lastMessageAuthor: profileMap.get(info.user_id) || null,
          messageCount: info.count,
        });
      }

      threads.sort((a, b) => {
        if (!a.lastMessageAt) return 1;
        if (!b.lastMessageAt) return -1;
        return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
      });

      return threads;
    },
    enabled: !!user && !!groupId,
    staleTime: 1000 * 30,
  });
}
