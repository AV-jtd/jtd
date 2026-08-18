import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

/**
 * Singleton Realtime subscriptions.
 * Mounts ONCE at the App root (inside AuthProvider) instead of being
 * re-created in every useTasks() / useTaskGroups() / useUnreadMessages() instance.
 *
 * Previously these channels were opened by hooks that are called from 16+ components,
 * resulting in 15-20 duplicate WebSocket subscriptions and a global refetch storm
 * on every subtask change (unfiltered subtasks-realtime channel).
 *
 * Invalidations are debounced (500ms) so a burst of changes (e.g. offline-sync replay)
 * collapses into a single refetch instead of cascading network requests.
 */
export function useRealtimeSubscriptions() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const tasksTimer = useRef<number | null>(null);
  const groupsTimer = useRef<number | null>(null);
  const unreadTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!user) return;

    const debouncedInvalidate = (
      ref: React.MutableRefObject<number | null>,
      keys: string[][]
    ) => {
      if (ref.current) window.clearTimeout(ref.current);
      ref.current = window.setTimeout(() => {
        keys.forEach((key) => qc.invalidateQueries({ queryKey: key }));
        ref.current = null;
      }, 1500);
    };

    // Subtasks (was: every useTasks() instance opened this — and unfiltered)
    const subtasksChannel = supabase
      .channel("global-subtasks-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subtasks" },
        () => debouncedInvalidate(tasksTimer, [["tasks"], ["client_room_tasks"], ["client_task_threads"]])
      )
      .subscribe();

    // Tasks: changes from other users (or other tabs/devices). Optimistic updates
    // already cover the local user's own actions, but realtime ensures changes
    // made elsewhere become visible. Debounced (1s) to absorb burst replays.
    // STM Mission Control's stage tasks (task_type='stm_stage') are rows in
    // this same table, cached separately under ["stm-stage-tasks", userId] —
    // include it so cross-user/cross-tab edits reach the STM matrix too.
    const tasksChannel = supabase
      .channel("global-tasks-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        () => debouncedInvalidate(tasksTimer, [["tasks"], ["client_room_tasks"], ["client_task_threads"], ["stm-stage-tasks"], ["km-stage-tasks"], ["tasks-by-groups"]])
      )
      .subscribe();

    // Group members for THIS user (was: every useTaskGroups() instance opened this)
    const groupMembersChannel = supabase
      .channel("global-group-members")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_members",
          filter: `user_id=eq.${user.id}`,
        },
        () =>
          debouncedInvalidate(groupsTimer, [
            ["task_groups"],
            ["group_members"],
            ["client_room_tasks"],
            ["client_room_info"],
          ])
      )
      .subscribe();

    // Unread messages badge — broadcast a custom event picked up by useUnreadMessages
    const fireUnread = () => {
      if (unreadTimer.current) window.clearTimeout(unreadTimer.current);
      unreadTimer.current = window.setTimeout(() => {
        window.dispatchEvent(new Event("jtd:unread-invalidate"));
        // Keep the Client Room "Эфир" chat activity live.
        qc.invalidateQueries({ queryKey: ["client_chat_events"] });
        unreadTimer.current = null;
      }, 500);
    };
    const unreadChannel = supabase
      .channel("global-unread-badge")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_messages" },
        fireUnread
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "task_comments" },
        fireUnread
      )
      .subscribe();

    return () => {
      if (tasksTimer.current) window.clearTimeout(tasksTimer.current);
      if (groupsTimer.current) window.clearTimeout(groupsTimer.current);
      if (unreadTimer.current) window.clearTimeout(unreadTimer.current);
      supabase.removeChannel(subtasksChannel);
      supabase.removeChannel(tasksChannel);
      supabase.removeChannel(groupMembersChannel);
      supabase.removeChannel(unreadChannel);
    };
  }, [user, qc]);
}
