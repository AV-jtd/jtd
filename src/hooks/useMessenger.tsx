import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type ThreadType = "group" | "task";
export type ThreadKindFilter = "chat" | "log" | "all";

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
  /** For task threads — current completion status (closed = strike-through). */
  taskCompleted?: boolean;
  groupName?: string;
  /** Visual hints for project (group) threads, used by the messenger to
   *  visually distinguish project chats from task chats in the list. */
  groupIcon?: string | null;
  groupColor?: string | null;
  groupLogoUrl?: string | null;
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
      excludeLogs?: boolean;
      onlyLogs?: boolean;
      includeExternalAuthor?: boolean;
}): Promise<
  Map<string, { content: string; created_at: string; user_id: string; external_author?: string | null; count: number }>
> {
  const {
    table,
    parentKey,
    pageSize = 500,
    maxPages = 10,
    desiredThreads = 50,
    gracePages = 1,
        excludeLogs = false,
        onlyLogs = false,
        includeExternalAuthor = false,
  } = opts;

  const map = new Map<string, { content: string; created_at: string; user_id: string; external_author?: string | null; count: number }>();
  let cursor: string | null = null;
  let pagesSinceNewThread = 0;

  for (let page = 0; page < maxPages; page++) {
    let q = supabase
      .from(table as any)
      .select(`${parentKey}, content, created_at, user_id${excludeLogs ? ", kind" : ""}${includeExternalAuthor ? ", external_author" : ""}`)
      .order("created_at", { ascending: false })
      .limit(pageSize);
    if (cursor) q = q.lt("created_at", cursor);
    if (excludeLogs) q = q.neq("kind", "log");
    if (onlyLogs) q = q.eq("kind", "log");

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
          external_author: includeExternalAuthor ? (row.external_author ?? null) : null,
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

export function useThreads(kindFilter: ThreadKindFilter = "chat") {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["messenger_threads", user?.id, kindFilter],
    queryFn: async () => {
      const threads: Thread[] = [];

      // Step 1: collect aggregate maps. The "log" tab is task-only — group
      // chats don't generate log entries, so we skip group_messages entirely
      // in that mode.
      const taskOpts =
        kindFilter === "chat"
          ? { excludeLogs: true }
          : kindFilter === "log"
            ? { onlyLogs: true }
            : {};
      const [groupMap, taskMap] = await Promise.all([
        kindFilter === "log"
          ? Promise.resolve(new Map())
          : fetchThreadAggregates({ table: "group_messages", parentKey: "group_id", includeExternalAuthor: true }),
        fetchThreadAggregates({ table: "task_comments", parentKey: "task_id", ...taskOpts }),
      ]);

      // Step 2: build the union of user_ids for the last-message authors across
      // both thread kinds. Previously we ran TWO separate `profiles` queries
      // (one per thread kind) and the same author often appeared in both —
      // doubling work and roundtrips. Now we do exactly ONE batched profiles
      // query for the unique union.
      const authorIdSet = new Set<string>();
      for (const v of groupMap.values()) if (v.user_id) authorIdSet.add(v.user_id);
      for (const v of taskMap.values()) if (v.user_id) authorIdSet.add(v.user_id);
      const authorIds = [...authorIdSet];

      // Step 3: fan out independent lookups in parallel. None of them depend
      // on each other's results, so there's no reason to await sequentially.
      const groupIds = [...groupMap.keys()];
      const taskIds = [...taskMap.keys()];

      const [groupsRes, tasksRes, profilesRes] = await Promise.all([
        groupIds.length > 0
          ? supabase.from("task_groups").select("id, name, icon, color, logo_url").in("id", groupIds)
          : Promise.resolve({ data: [] as any[] }),
        taskIds.length > 0
          ? supabase.from("tasks").select("id, title, group_id, is_completed").in("id", taskIds)
          : Promise.resolve({ data: [] as any[] }),
        authorIds.length > 0
          ? supabase.from("profiles").select("id, display_name, email").in("id", authorIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const groups = (groupsRes.data as any[]) || [];
      const tasks = (tasksRes.data as any[]) || [];
      const profileMap = new Map(
        ((profilesRes.data as any[]) || []).map((p) => [p.id, p.display_name || ""]),
      );

      // Step 4: for task threads we still need parent-group names for the
      // subtitle. Fetch only the groups that aren't already in `groups`
      // (they likely overlap — task often lives in a group that also has its
      // own messages) so we don't refetch the same row twice.
      const knownGroupNames = new Map<string, string>(groups.map((g) => [g.id, g.name]));
      const missingTaskGroupIds = [
        ...new Set(
          tasks
            .map((t) => t.group_id as string | null)
            .filter((id): id is string => !!id && !knownGroupNames.has(id)),
        ),
      ];
      if (missingTaskGroupIds.length > 0) {
        const { data: extraGroups } = await supabase
          .from("task_groups")
          .select("id, name")
          .in("id", missingTaskGroupIds);
        for (const g of (extraGroups as any[]) || []) {
          knownGroupNames.set(g.id, g.name);
        }
      }

      // Step 5: assemble threads.
      for (const g of groups) {
        const info = groupMap.get(g.id);
        if (!info) continue;
        threads.push({
          id: `group-${g.id}`,
          type: "group",
          // Keep the plain name — icon/color/logo are passed separately so the
          // messenger UI can render a coloured avatar instead of stuffing the
          // emoji into the title.
          name: g.name,
          lastMessage: info.content,
          lastMessageAt: info.created_at,
          lastMessageAuthor:
            profileMap.get(info.user_id) || info.external_author || null,
          lastMessageUserId: info.user_id,
          messageCount: info.count,
          groupId: g.id,
          groupIcon: (g as any).icon ?? null,
          groupColor: (g as any).color ?? null,
          groupLogoUrl: (g as any).logo_url ?? null,
        });
      }

      for (const t of tasks) {
        const info = taskMap.get(t.id);
        if (!info) continue;
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
          taskCompleted: !!(t as any).is_completed,
          groupName: t.group_id ? knownGroupNames.get(t.group_id) || undefined : undefined,
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
    // Cache for 60s. Realtime invalidates this query when a new message
    // arrives — so the stale window mainly protects against repeated
    // open/close of the messenger panel re-running the cursor-paginated
    // fetch. We DO refetch on focus/reconnect (see below) because the
    // WebSocket can drop silently on mobile (background tab, Wi-Fi↔4G
    // handover, locked PWA) and miss INSERTs while it was disconnected.
    staleTime: 1000 * 60,
    // Keep the cached threads in memory for 5 minutes after the panel
    // unmounts, so toggling it back on is instant instead of re-running
    // pagination from scratch.
    gcTime: 1000 * 60 * 5,
    // Recover from missed realtime events: when the user comes back to the
    // tab after a long idle (or reconnects to network), force a refresh.
    // React Query only fires these if the data is `stale`, so they are
    // free during normal active use — they only kick in when needed.
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchOnMount: false,
  });
}

/**
 * Subscribes to realtime INSERTs on `group_messages` and `task_comments`
 * and invalidates the `messenger_threads` query so the side panel stays
 * fresh without waiting for `staleTime` to elapse.
 *
 * Implementation notes:
 * - Uses a single dedicated channel (NOT routed through `channelManager`,
 *   because that one is LRU-capped at 5 and is meant for per-thread chats —
 *   this is a global panel-level subscription that must stay alive while the
 *   panel is mounted).
 * - Coalesces invalidations through a short debounce so a burst of messages
 *   in an open chat doesn't trigger a refetch storm.
 */
export function useThreadsRealtime() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;

    const scheduleInvalidate = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["messenger_threads", user.id], exact: false });
      }, 500);
    };

    let channel = supabase
      .channel("messenger_threads_feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_messages" },
        scheduleInvalidate,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "task_comments" },
        scheduleInvalidate,
      )
      .subscribe();

    // Belt-and-suspenders: if the browser comes back online after being
    // offline, force a refresh — the realtime channel may have missed
    // INSERTs while disconnected (mobile networks especially).
    const onOnline = () => scheduleInvalidate();
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleInvalidate();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);
}
