import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

/** Сообщения-маркеры, которые не должны попадать в превью ленты. */
function isSystemContent(content: string): boolean {
  return content.startsWith("__sys_");
}

export type ClientTaskThread = {
  taskId: string;
  title: string;
  isCompleted: boolean;
  groupId: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastMessageAuthor: string | null;
  messageCount: number;
};

/**
 * Агрегаты чатов задач, привязанных к клиенту (tasks.client_id).
 *
 * Возвращает по одной «ветке» на задачу, у которой есть хотя бы одно живое
 * сообщение. Тянем только агрегаты (последнее сообщение + счётчик), полные
 * сообщения подгружаются лениво при разворачивании карточки. Отсортировано
 * по времени последнего сообщения (свежие сверху).
 */
export function useClientTaskThreads(clientId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["client_task_threads", clientId],
    queryFn: async (): Promise<ClientTaskThread[]> => {
      if (!clientId) return [];

      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title, is_completed, group_id")
        .eq("client_id", clientId)
        .limit(300);
      const taskRows = (tasks as any[]) || [];
      if (taskRows.length === 0) return [];

      const taskIds = taskRows.map((t) => t.id as string);

      // Только живые сообщения (kind='message' или без kind), без логов/систем.
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
        if (!info) continue; // у задачи нет переписки → не показываем ветку
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
    enabled: !!user && !!clientId,
    staleTime: 1000 * 30,
  });
}
