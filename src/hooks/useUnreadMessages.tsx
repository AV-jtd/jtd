import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

/**
 * Server-side unread aggregation.
 *
 * Previously the client downloaded the last 200 group_messages + 200
 * task_comments and the full chat_read_status table on every refresh, then
 * intersected them in JS. That scaled poorly and required a 30s polling timer.
 *
 * Now the database does the work in `public.get_unread_threads()` (one round
 * trip, returns only threads that actually have unread messages for the
 * current user). The client just caches that result and reads from it.
 */

type UnreadRow = {
  thread_id: string;
  last_message_at: string;
  unread_count: number;
};

const UNREAD_QUERY_KEY = ["unread_threads"] as const;

/**
 * Window (ms) during which a thread that the user just opened is treated as
 * read locally, even if a stale realtime refetch tries to mark it unread
 * again. Covers:
 *  - the 500ms debounce in `useRealtimeSubscriptions` global-unread-badge
 *  - network round-trip of the chat_read_status upsert
 *  - the follow-up RPC refetch latency
 * 5s is comfortably above the realistic worst case without being noticeable
 * to the user (any genuine new message that arrives after this window will
 * correctly re-mark the thread as unread).
 */
const RECENTLY_READ_WINDOW_MS = 15000;

export function useUnreadMessages() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  // threadId -> timestamp (ms) when the user opened it. Survives across
  // refetches because it lives in a ref, not in query state.
  const recentlyReadRef = useRef<Map<string, number>>(new Map());

  /** Strip thread ids that the user opened within the last few seconds. */
  const filterRecentlyRead = useCallback((rows: UnreadRow[]): UnreadRow[] => {
    const now = Date.now();
    const map = recentlyReadRef.current;
    // Garbage-collect expired entries so the map doesn't grow unbounded.
    for (const [id, ts] of map) {
      if (now - ts > RECENTLY_READ_WINDOW_MS) map.delete(id);
    }
    if (map.size === 0) return rows;
    return rows.filter((r) => !map.has(r.thread_id));
  }, []);

  const { data: rows = [] } = useQuery<UnreadRow[]>({
    queryKey: [...UNREAD_QUERY_KEY, user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await (supabase as any).rpc("get_unread_threads");
      if (error) {
        console.warn("get_unread_threads failed", error);
        return [];
      }
      // Suppress threads the user just opened — protects against the race
      // where a realtime invalidate fires the RPC before our chat_read_status
      // upsert has been committed/visible.
      return filterRecentlyRead((data as UnreadRow[]) ?? []);
    },
    enabled: !!user,
    staleTime: 1000 * 30,
  });

  // Build a Set<string> of unread thread ids for O(1) lookup in render.
  const unreadSet = useMemo(() => new Set(rows.map((r) => r.thread_id)), [rows]);

  // Total badge: number of distinct threads with unread messages (matches the
  // historical behaviour of the old per-thread loop).
  const unreadCount = rows.length;

  // Listen for the invalidation signal dispatched by the singleton realtime
  // channel in `useRealtimeSubscriptions`. A new message arrived — refetch.
  useEffect(() => {
    if (!user) return;
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: [...UNREAD_QUERY_KEY, user.id] });
    };
    window.addEventListener("jtd:unread-invalidate", handler);
    return () => window.removeEventListener("jtd:unread-invalidate", handler);
  }, [user, queryClient]);

  const markThreadRead = useCallback(
    async (threadId: string) => {
      if (!user) return;
      // Local guard: any rendering that happens between now and the server
      // confirming the upsert will treat this thread as read, even if a
      // stale realtime refetch lands in between.
      recentlyReadRef.current.set(threadId, Date.now());

      // Optimistic local update so the badge clears immediately.
      queryClient.setQueryData<UnreadRow[]>(
        [...UNREAD_QUERY_KEY, user.id],
        (prev) => (prev ?? []).filter((r) => r.thread_id !== threadId),
      );

      // Use server-side timestamp via RPC instead of `new Date()` from the
      // client. If the user's device clock lags even a second behind the
      // server, a client-side `last_read_at` would be older than the most
      // recent message timestamps (which are written with `now()` on the
      // server), and the unread count would re-appear as soon as the local
      // "recently read" guard expires.
      const { error } = await (supabase as any).rpc("mark_thread_read", {
        _thread_id: threadId,
      });

      if (error) {
        // Rollback on failure: drop the local guard so the next refetch can
        // restore the unread badge if the server still considers it unread.
        recentlyReadRef.current.delete(threadId);
        queryClient.invalidateQueries({ queryKey: [...UNREAD_QUERY_KEY, user.id] });
        return;
      }

      // On success, force-refetch from the server to converge on the true
      // unread set. The recently-read guard above keeps `threadId` filtered
      // out for a few seconds, so a slow replica or a racing realtime push
      // can't briefly resurrect the red dot.
      queryClient.refetchQueries({ queryKey: [...UNREAD_QUERY_KEY, user.id] });
    },
    [user, queryClient],
  );

  /**
   * Per-thread unread check used by the messenger row renderer.
   *
   * The legacy signature accepts `(threadId, lastMessageAt, lastMessageUserId)`
   * for callers that don't have access to the unread set. We now answer purely
   * from the server-aggregated set, but keep the signature so call sites
   * (MessengerPanel) don't need to change.
   */
  const isThreadUnread = useCallback(
    (threadId: string, _lastMessageAt: string | null, lastMessageUserId?: string | null) => {
      if (lastMessageUserId === user?.id) return false;
      return unreadSet.has(threadId);
    },
    [unreadSet, user],
  );

  return { unreadCount, markThreadRead, isThreadUnread };
}
