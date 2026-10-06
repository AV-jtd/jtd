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
  /**
   * Ветка «мне» (миграция 20261006120000): я автор, исполнитель или участник
   * задачи, меня упомянули или ответили мне. Остальное — фон проекта: его
   * показываем точкой, без числа (решение владельца 06.10.2026). undefined —
   * старый сервер, считаем «мне», как раньше.
   */
  for_me?: boolean;
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
  // Map threadId -> unread message count for per-room count badges.
  const unreadCountMap = useMemo(
    () => new Map(rows.map((r) => [r.thread_id, r.unread_count])),
    [rows],
  );

  // Значок — число веток «мне»; фон проекта — отдельным флагом (точка).
  const isForMe = (r: UnreadRow) => r.for_me !== false;
  const forMeSet = useMemo(() => new Set(rows.filter(isForMe).map((r) => r.thread_id)), [rows]);
  const unreadCount = forMeSet.size;
  const hasBackgroundUnread = rows.length > forMeSet.size;

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

  /** Number of unread messages for a thread (0 when read/own last message). */
  const getUnreadCount = useCallback(
    (threadId: string, lastMessageUserId?: string | null) => {
      if (lastMessageUserId === user?.id) return 0;
      // Фон проекта — без числа: строка покажет точку.
      if (!forMeSet.has(threadId)) return 0;
      return unreadCountMap.get(threadId) ?? 0;
    },
    [unreadCountMap, forMeSet, user],
  );

  /**
   * Отметить прочитанными сразу несколько веток (06.10.2026): «Прочитать
   * обсуждения проектов», «Прочитать всё», быстрое «прочитано» в строке.
   * Как markThreadRead: локальная защита от мигания, оптимистично, время —
   * серверное (mark_threads_read).
   */
  const markThreadsRead = useCallback(
    async (threadIds: string[]) => {
      if (!user || threadIds.length === 0) return 0;
      const now = Date.now();
      for (const id of threadIds) recentlyReadRef.current.set(id, now);
      const drop = new Set(threadIds);
      queryClient.setQueryData<UnreadRow[]>(
        [...UNREAD_QUERY_KEY, user.id],
        (prev) => (prev ?? []).filter((r) => !drop.has(r.thread_id)),
      );
      const { data, error } = await (supabase as any).rpc("mark_threads_read", { _thread_ids: threadIds });
      if (error) {
        for (const id of threadIds) recentlyReadRef.current.delete(id);
        queryClient.invalidateQueries({ queryKey: [...UNREAD_QUERY_KEY, user.id] });
        throw error;
      }
      queryClient.refetchQueries({ queryKey: [...UNREAD_QUERY_KEY, user.id] });
      return (data as number) ?? threadIds.length;
    },
    [user, queryClient],
  );

  /** Непрочитанные ветки: все и только фон проекта (не «мне»). */
  const unreadThreadIds = useMemo(
    () => ({
      all: rows.map((r) => r.thread_id),
      background: rows.filter((r) => !forMeSet.has(r.thread_id)).map((r) => r.thread_id),
    }),
    [rows, forMeSet],
  );

  /** Непрочитанная ветка адресована мне (а не фон проекта). */
  const isThreadForMe = useCallback((threadId: string) => forMeSet.has(threadId), [forMeSet]);

  return {
    unreadCount, hasBackgroundUnread, markThreadRead, markThreadsRead, unreadThreadIds,
    isThreadUnread, isThreadForMe, getUnreadCount,
  };
}

/**
 * Держать ветку прочитанной, пока её чат открыт и вкладка видна (06.10.2026).
 *
 * Раньше прочитанной ветку делали только мессенджер и полноэкранный чат: прочёл
 * и даже ответил в карточке задачи — ветка всё равно «непрочитана». Замер
 * 06.10: у сотрудников 25–45 таких веток. Срабатывает при открытии, на каждое
 * новое сообщение (`signal` — например, число сообщений) и при возвращении на
 * вкладку; запрос уходит, только если ветка действительно непрочитана.
 */
export function useMarkReadWhileOpen(threadId: string | null | undefined, signal?: unknown) {
  const { markThreadRead, isThreadUnread } = useUnreadMessages();
  const unread = threadId ? isThreadUnread(threadId, null) : false;

  useEffect(() => {
    if (!threadId || !unread) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    markThreadRead(threadId);
  }, [threadId, unread, signal, markThreadRead]);

  useEffect(() => {
    if (!threadId || !unread || typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") markThreadRead(threadId);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [threadId, unread, markThreadRead]);
}
