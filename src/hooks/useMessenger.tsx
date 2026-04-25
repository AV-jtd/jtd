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

/**
 * Cursor-paginated fetch of "last message per parent" for a chat-like table.
 *
 * Walks the table in `created_at DESC` pages of `pageSize`. The first row we
 * see for a given `parentKey` (e.g. group_id, task_id) is the latest message
 * for that thread because results are sorted descending. Subsequent rows just
 * bump the message count.
 *
 * Stops when one of the following holds:
 *  - the page is shorter than `pageSize` (we've drained the table), or
 *  - we've walked `maxPages` pages (hard safety cap), or
 *  - we've collected at least `desiredThreads` distinct threads AND the last
 *    `gracePages` consecutive pages haven't introduced any new thread.
 *
 * Returns one entry per distinct parentKey with the latest message metadata
 * and the (partial-but-monotonic) running count.
 */
async function fetchThreadAggregates<T extends string>(opts: {
  table: "group_messages" | "task_comments";
  parentKey: T;
  pageSize?: number;
  maxPages?: number;
  desiredThreads?: number;
  gracePages?: number;
}): Promise<
  Map<string, { content: string; created_at: string; user_id: string; count: number }>
> {
  const {
    table,
    parentKey,
    pageSize = 500,
    maxPages = 10,
    desiredThreads = 50,
    gracePages = 1,
  } = opts;

  const map = new Map<string, { content: string; created_at: string; user_id: string; count: number }>();
  let cursor: string | null = null;
  let pagesSinceNewThread = 0;

  for (let page = 0; page < maxPages; page++) {
    let q = supabase
      .from(table as any)
      .select(`${parentKey}, content, created_at, user_id`)
      .order("created_at", { ascending: false })
      .limit(pageSize);
    if (cursor) q = q.lt("created_at", cursor);

    const { data, error } = await q;
    if (error || !data || data.length === 0) break;

    let foundNewThread = false;
    for (const row of data as any[]) {
      const key = row[parentKey];
      if (!key) continue;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          content: row.content,
          created_at: row.created_at,
          user_id: row.user_id,
          count: 1,
        });
        foundNewThread = true;
      } else {
        existing.count += 1;
      }
    }

    // Cursor = oldest row on this page; next page must be strictly older.
    cursor = (data[data.length - 1] as any).created_at as string;

    // Short page = drained.
    if (data.length < pageSize) break;

    // Soft stop: enough threads + a few quiet pages in a row.
    if (map.size >= desiredThreads) {
      pagesSinceNewThread = foundNewThread ? 0 : pagesSinceNewThread + 1;
      if (pagesSinceNewThread >= gracePages) break;
    }
  }

  return map;
}

export function useThreads() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["messenger_threads", user?.id],
    queryFn: async () => {
      const threads: Thread[] = [];

      // 1. Group threads: groups with at least one message — paginated so threads
      //    aren't lost after the first 500 messages.
      const groupMap = await fetchThreadAggregates({
        table: "group_messages",
        parentKey: "group_id",
      });

      if (groupMap.size > 0) {
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

      // 2. Task threads: tasks with at least one comment — same pagination
      //    strategy as group threads above.
      const taskMap = await fetchThreadAggregates({
        table: "task_comments",
        parentKey: "task_id",
      });

      if (taskMap.size > 0) {
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
              lastMessageUserId: info.user_id,
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
