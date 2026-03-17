import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type ThreadType = "group" | "task";

export type Thread = {
  id: string;
  type: ThreadType;
  name: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastMessageAuthor: string | null;
  lastMessageUserId: string | null;
  messageCount: number;
  /** For group threads */
  groupId?: string;
  /** For task threads */
  taskId?: string;
  groupName?: string;
};

export function useThreads() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["messenger_threads", user?.id],
    queryFn: async () => {
      const threads: Thread[] = [];

      // 1. Group threads: groups with at least one message
      const { data: groupMsgs } = await supabase
        .from("group_messages" as any)
        .select("group_id, content, created_at, user_id")
        .order("created_at", { ascending: false })
        .limit(500);

      if (groupMsgs && groupMsgs.length > 0) {
        const groupMap = new Map<string, { content: string; created_at: string; user_id: string; count: number }>();
        (groupMsgs as any[]).forEach((m) => {
          if (!groupMap.has(m.group_id)) {
            groupMap.set(m.group_id, { content: m.content, created_at: m.created_at, user_id: m.user_id, count: 1 });
          } else {
            groupMap.get(m.group_id)!.count++;
          }
        });

        const groupIds = [...groupMap.keys()];
        const { data: groups } = await supabase
          .from("task_groups")
          .select("id, name, icon, color")
          .in("id", groupIds);

        // Fetch profile names for last message authors
        const authorIds = [...new Set([...groupMap.values()].map(v => v.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, email")
          .in("id", authorIds);
        const profileMap = new Map((profiles || []).map(p => [p.id, p.display_name || ""]));

        (groups || []).forEach((g) => {
          const info = groupMap.get(g.id);
          if (info) {
            threads.push({
              id: `group-${g.id}`,
              type: "group",
              name: `${(g as any).icon && (g as any).icon !== "list" ? (g as any).icon + " " : ""}${g.name}`,
              lastMessage: info.content,
              lastMessageAt: info.created_at,
              lastMessageAuthor: profileMap.get(info.user_id) || null,
              lastMessageUserId: info.user_id,
              messageCount: info.count,
              groupId: g.id,
            });
          }
        });
      }

      // 2. Task threads: tasks with at least one comment
      const { data: taskComments } = await supabase
        .from("task_comments" as any)
        .select("task_id, content, created_at, user_id")
        .order("created_at", { ascending: false })
        .limit(500);

      if (taskComments && taskComments.length > 0) {
        const taskMap = new Map<string, { content: string; created_at: string; user_id: string; count: number }>();
        (taskComments as any[]).forEach((c) => {
          if (!taskMap.has(c.task_id)) {
            taskMap.set(c.task_id, { content: c.content, created_at: c.created_at, user_id: c.user_id, count: 1 });
          } else {
            taskMap.get(c.task_id)!.count++;
          }
        });

        const taskIds = [...taskMap.keys()];
        const { data: tasks } = await supabase
          .from("tasks")
          .select("id, title, group_id")
          .in("id", taskIds);

        // Get group names for context
        const taskGroupIds = [...new Set((tasks || []).filter(t => t.group_id).map(t => t.group_id!))];
        let taskGroupMap = new Map<string, string>();
        if (taskGroupIds.length > 0) {
          const { data: tGroups } = await supabase
            .from("task_groups")
            .select("id, name")
            .in("id", taskGroupIds);
          taskGroupMap = new Map((tGroups || []).map(g => [g.id, g.name]));
        }

        const authorIds = [...new Set([...taskMap.values()].map(v => v.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, email")
          .in("id", authorIds);
        const profileMap = new Map((profiles || []).map(p => [p.id, p.display_name || ""]));

        (tasks || []).forEach((t) => {
          const info = taskMap.get(t.id);
          if (info) {
            threads.push({
              id: `task-${t.id}`,
              type: "task",
              name: t.title,
              lastMessage: info.content,
              lastMessageAt: info.created_at,
              lastMessageAuthor: profileMap.get(info.user_id) || null,
              messageCount: info.count,
              taskId: t.id,
              groupName: t.group_id ? taskGroupMap.get(t.group_id) || undefined : undefined,
            });
          }
        });
      }

      // Sort by last message date
      threads.sort((a, b) => {
        if (!a.lastMessageAt) return 1;
        if (!b.lastMessageAt) return -1;
        return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
      });

      return threads;
    },
    enabled: !!user,
    staleTime: 1000 * 15,
  });
}
