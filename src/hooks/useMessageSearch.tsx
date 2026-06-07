import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type MessageSearchResult = {
  /** message id (group_messages.id or task_comments.id) */
  id: string;
  source: "group" | "task";
  /** group_id (for group results) or parent group of the task (for task results) */
  groupId: string | null;
  /** task_id for task results */
  taskId: string | null;
  content: string;
  authorId: string | null;
  authorName: string | null;
  createdAt: string;
  /** project name or task title to display in the result row */
  threadName: string;
};

/**
 * Global full-text search across all chat messages.
 *
 * When `query` has 3+ characters (after a 300ms debounce) it runs two parallel
 * Supabase ILIKE queries against `group_messages` and `task_comments`, enriches
 * the rows with author display names and thread (project/task) names, and
 * returns them merged and sorted newest-first.
 */
export function useMessageSearch(query: string) {
  const { user } = useAuth();
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const enabled = !!user && debounced.length >= 3;

  return useQuery({
    queryKey: ["message_search", debounced],
    enabled,
    queryFn: async (): Promise<MessageSearchResult[]> => {
      const like = `%${debounced.replace(/[%_]/g, (m) => "\\" + m)}%`;

      const [gmRes, tcRes] = await Promise.all([
        supabase
          .from("group_messages")
          .select("id, group_id, content, user_id, created_at")
          .ilike("content", like)
          .order("created_at", { ascending: false })
          .limit(15),
        supabase
          .from("task_comments")
          .select("id, task_id, content, user_id, created_at")
          .ilike("content", like)
          .eq("kind", "message")
          .order("created_at", { ascending: false })
          .limit(15),
      ]);

      const gmRows = (gmRes.data as any[]) || [];
      const tcRows = (tcRes.data as any[]) || [];

      // Resolve thread names: group names + task titles (+ their parent group).
      const groupIds = [...new Set(gmRows.map((r) => r.group_id).filter(Boolean))];
      const taskIds = [...new Set(tcRows.map((r) => r.task_id).filter(Boolean))];

      const [groupsRes, tasksRes] = await Promise.all([
        groupIds.length
          ? supabase.from("task_groups").select("id, name").in("id", groupIds)
          : Promise.resolve({ data: [] as any[] }),
        taskIds.length
          ? supabase.from("tasks").select("id, title, group_id").in("id", taskIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const groupNameMap = new Map<string, string>(
        ((groupsRes.data as any[]) || []).map((g) => [g.id, g.name]),
      );
      const taskMap = new Map<string, { title: string; group_id: string | null }>(
        ((tasksRes.data as any[]) || []).map((t) => [t.id, { title: t.title, group_id: t.group_id ?? null }]),
      );

      // Author names — one batched profiles lookup for the union.
      const authorIds = [
        ...new Set([...gmRows, ...tcRows].map((r) => r.user_id).filter(Boolean)),
      ] as string[];
      const profileMap = new Map<string, string>();
      if (authorIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, display_name, email")
          .in("id", authorIds);
        for (const p of (profs as any[]) || []) {
          profileMap.set(p.id, p.display_name || p.email || "—");
        }
      }

      const results: MessageSearchResult[] = [];

      for (const r of gmRows) {
        results.push({
          id: r.id,
          source: "group",
          groupId: r.group_id ?? null,
          taskId: null,
          content: r.content ?? "",
          authorId: r.user_id ?? null,
          authorName: r.user_id ? profileMap.get(r.user_id) ?? null : null,
          createdAt: r.created_at,
          threadName: (r.group_id && groupNameMap.get(r.group_id)) || "Проект",
        });
      }

      for (const r of tcRows) {
        const t = r.task_id ? taskMap.get(r.task_id) : undefined;
        results.push({
          id: r.id,
          source: "task",
          groupId: t?.group_id ?? null,
          taskId: r.task_id ?? null,
          content: r.content ?? "",
          authorId: r.user_id ?? null,
          authorName: r.user_id ? profileMap.get(r.user_id) ?? null : null,
          createdAt: r.created_at,
          threadName: t?.title || "Задача",
        });
      }

      results.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      return results;
    },
    staleTime: 1000 * 30,
  });
}
