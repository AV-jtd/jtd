import { useCallback, useEffect, useMemo } from "react";
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

export function useUnreadMessages() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: rows = [] } = useQuery<UnreadRow[]>({
    queryKey: [...UNREAD_QUERY_KEY, user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await (supabase as any).rpc("get_unread_threads");
      if (error) {
        console.warn("get_unread_threads failed", error);
        return [];
      }
      return (data as UnreadRow[]) ?? [];
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
      const now = new Date().toISOString();

      // Optimistic local update so the badge clears immediately.
      queryClient.setQueryData<UnreadRow[]>(
        [...UNREAD_QUERY_KEY, user.id],
        (prev) => (prev ?? []).filter((r) => r.thread_id !== threadId),
      );

      const { error } = await (supabase as any).from("chat_read_status").upsert(
        { user_id: user.id, thread_id: threadId, last_read_at: now },
        { onConflict: "user_id,thread_id" },
      );

      if (error) {
        // Rollback on failure by refetching the source of truth.
        queryClient.invalidateQueries({ queryKey: [...UNREAD_QUERY_KEY, user.id] });
      }
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
