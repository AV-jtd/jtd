import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

const STORAGE_KEY = "jtd_last_read";

function getLastRead(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function setLastRead(threadId: string, timestamp: string) {
  const data = getLastRead();
  data[threadId] = timestamp;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/**
 * Tracks unread messages across group chats and task comments.
 * Returns total unread count + a function to mark a thread as read.
 */
export function useUnreadMessages() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const lastReadRef = useRef(getLastRead());

  const computeUnread = useCallback(async () => {
    if (!user) { setUnreadCount(0); return; }

    const lastRead = getLastRead();
    lastReadRef.current = lastRead;
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
        // Skip own messages
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
  }, [user]);

  // Initial compute + periodic refresh
  useEffect(() => {
    computeUnread();
    const interval = setInterval(computeUnread, 30000);
    return () => clearInterval(interval);
  }, [computeUnread]);

  // Realtime subscriptions for instant badge updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("unread-badge")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_messages" }, () => {
        computeUnread();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "task_comments" }, () => {
        computeUnread();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, computeUnread]);

  const markThreadRead = useCallback((threadId: string) => {
    setLastRead(threadId, new Date().toISOString());
    lastReadRef.current = getLastRead();
    // Recompute after marking
    computeUnread();
  }, [computeUnread]);

  const isThreadUnread = useCallback((threadId: string, lastMessageAt: string | null, lastMessageUserId?: string | null) => {
    if (!lastMessageAt) return false;
    // Own messages don't count as unread
    if (lastMessageUserId === user?.id) return false;
    const lr = lastReadRef.current[threadId];
    if (!lr) return true;
    return new Date(lastMessageAt) > new Date(lr);
  }, [user]);

  return { unreadCount, markThreadRead, isThreadUnread };
}
