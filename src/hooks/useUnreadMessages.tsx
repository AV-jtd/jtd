import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

const STORAGE_KEY = "jtd_last_read";

/** Migrate localStorage data to DB (one-time per device) */
async function migrateLocalStorageToDB(userId: string) {
  const migrationKey = "jtd_read_migrated";
  if (localStorage.getItem(migrationKey)) return;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { localStorage.setItem(migrationKey, "1"); return; }

    const data: Record<string, string> = JSON.parse(raw);
    const rows = Object.entries(data).map(([thread_id, last_read_at]) => ({
      user_id: userId,
      thread_id,
      last_read_at,
    }));

    if (rows.length > 0) {
      // Upsert — keep the newer timestamp
      for (const row of rows) {
        await (supabase as any).from("chat_read_status").upsert(row, {
          onConflict: "user_id,thread_id",
        });
      }
    }

    localStorage.setItem(migrationKey, "1");
  } catch {
    // Ignore migration errors
  }
}

/**
 * Tracks unread messages across group chats and task comments.
 * Stores read timestamps in DB so they sync across devices.
 */
export function useUnreadMessages() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const lastReadRef = useRef<Record<string, string>>({});
  const migrated = useRef(false);

  // Load read status from DB
  const loadReadStatus = useCallback(async () => {
    if (!user) return {};
    const { data } = await (supabase as any)
      .from("chat_read_status")
      .select("thread_id, last_read_at")
      .eq("user_id", user.id);

    const map: Record<string, string> = {};
    if (data) {
      for (const row of data) {
        map[row.thread_id] = row.last_read_at;
      }
    }
    lastReadRef.current = map;
    return map;
  }, [user]);

  const computeUnread = useCallback(async () => {
    if (!user) { setUnreadCount(0); return; }

    const lastRead = await loadReadStatus();
    let count = 0;

    // Check group messages — get latest per group
    const { data: groupMsgs } = await supabase
      .from("group_messages")
      .select("group_id, created_at, user_id")
      .order("created_at", { ascending: false })
      .limit(200);

    if (groupMsgs) {
      const seen = new Set<string>();
      for (const m of groupMsgs) {
        if (seen.has(m.group_id)) continue;
        seen.add(m.group_id);
        if (m.user_id === user.id) continue;
        const threadId = `group-${m.group_id}`;
        const lr = lastRead[threadId];
        if (!lr || new Date(m.created_at) > new Date(lr)) {
          count++;
        }
      }
    }

    // Check task comments — get latest per task
    const { data: taskComments } = await supabase
      .from("task_comments")
      .select("task_id, created_at, user_id")
      .order("created_at", { ascending: false })
      .limit(200);

    if (taskComments) {
      const seen = new Set<string>();
      for (const c of taskComments as any[]) {
        if (seen.has(c.task_id)) continue;
        seen.add(c.task_id);
        if (c.user_id === user.id) continue;
        const threadId = `task-${c.task_id}`;
        const lr = lastRead[threadId];
        if (!lr || new Date(c.created_at) > new Date(lr)) {
          count++;
        }
      }
    }

    setUnreadCount(count);
  }, [user, loadReadStatus]);

  // Migration + initial compute
  useEffect(() => {
    if (!user || migrated.current) return;
    migrated.current = true;
    migrateLocalStorageToDB(user.id).then(() => computeUnread());
  }, [user, computeUnread]);

  // Periodic refresh
  useEffect(() => {
    if (!user) return;
    computeUnread();
    const interval = setInterval(computeUnread, 30000);
    return () => clearInterval(interval);
  }, [computeUnread, user]);

  // Realtime subscription moved to useRealtimeSubscriptions (singleton at App root).
  // We listen for invalidation signal via QueryClient subscription instead.
  useEffect(() => {
    if (!user) return;
    // Listen to query invalidations dispatched by the singleton channel
    const handler = () => computeUnread();
    window.addEventListener("jtd:unread-invalidate", handler);
    return () => window.removeEventListener("jtd:unread-invalidate", handler);
  }, [user, computeUnread]);

  const markThreadRead = useCallback(async (threadId: string) => {
    if (!user) return;
    const now = new Date().toISOString();
    lastReadRef.current[threadId] = now;

    // Also update localStorage as fallback
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      data[threadId] = now;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}

    // Upsert to DB
    await (supabase as any).from("chat_read_status").upsert(
      { user_id: user.id, thread_id: threadId, last_read_at: now },
      { onConflict: "user_id,thread_id" }
    );

    // Recompute after marking
    computeUnread();
  }, [user, computeUnread]);

  const isThreadUnread = useCallback((threadId: string, lastMessageAt: string | null, lastMessageUserId?: string | null) => {
    if (!lastMessageAt) return false;
    if (lastMessageUserId === user?.id) return false;
    const lr = lastReadRef.current[threadId];
    if (!lr) return true;
    return new Date(lastMessageAt) > new Date(lr);
  }, [user]);

  return { unreadCount, markThreadRead, isThreadUnread };
}
