import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

/**
 * Prefetches all key data when user logs in so it's available offline.
 * Runs once per session and populates React Query cache → IndexedDB.
 */
export function usePrefetchData() {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user) return;

    const prefetch = async () => {
      // Prefetch in parallel — all critical data for offline access
      await Promise.allSettled([
        qc.prefetchQuery({
          queryKey: ["task_groups", user.id],
          queryFn: async () => {
            const { data, error } = await supabase
              .from("task_groups")
              .select("*")
              .order("position");
            if (error) throw error;
            return data;
          },
          staleTime: 1000 * 60 * 5,
        }),
        qc.prefetchQuery({
          queryKey: ["tasks", user.id, null, null],
          queryFn: async () => {
            const { data, error } = await supabase
              .from("tasks")
              .select("*, subtasks(*), task_tags(tag_id)")
              .order("is_completed", { ascending: true })
              .order("position")
              .order("created_at", { ascending: false });
            if (error) throw error;
            return data;
          },
          staleTime: 1000 * 60 * 5,
        }),
        qc.prefetchQuery({
          queryKey: ["tags", user.id],
          queryFn: async () => {
            const { data, error } = await supabase
              .from("tags")
              .select("*")
              .order("name");
            if (error) throw error;
            return data;
          },
          staleTime: 1000 * 60 * 5,
        }),
        qc.prefetchQuery({
          queryKey: ["tag_categories", user.id],
          queryFn: async () => {
            const { data, error } = await supabase
              .from("tag_categories")
              .select("*")
              .order("position");
            if (error) throw error;
            return data;
          },
          staleTime: 1000 * 60 * 5,
        }),
        qc.prefetchQuery({
          queryKey: ["project_folders", user.id],
          queryFn: async () => {
            const { data, error } = await supabase
              .from("project_folders")
              .select("*")
              .order("position");
            if (error) throw error;
            return data;
          },
          staleTime: 1000 * 60 * 5,
        }),
        qc.prefetchQuery({
          queryKey: ["project_folder_items", user.id],
          queryFn: async () => {
            const { data, error } = await supabase
              .from("project_folder_items")
              .select("*")
              .order("position");
            if (error) throw error;
            return data;
          },
          staleTime: 1000 * 60 * 5,
        }),
        qc.prefetchQuery({
          queryKey: ["clients", user.id],
          queryFn: async () => {
            const { data, error } = await supabase
              .from("clients")
              .select("*")
              .order("name");
            if (error) throw error;
            return data;
          },
          staleTime: 1000 * 60 * 5,
        }),
      ]);
    };

    prefetch();
  }, [user?.id, qc]);
}
