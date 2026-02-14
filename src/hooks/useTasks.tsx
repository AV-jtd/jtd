import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { Tables, TablesInsert } from "@/integrations/supabase/types";
import { toast } from "sonner";

export type Task = Tables<"tasks"> & {
  subtasks?: Tables<"subtasks">[];
  task_tags?: { tag_id: string }[];
  tags?: Tables<"tags">[];
};
export type TaskGroup = Tables<"task_groups"> & { linked_tag_id?: string | null; parent_id?: string | null };
export type Tag = Tables<"tags">;
export type Subtask = Tables<"subtasks">;

export function useTaskGroups() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["task_groups", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_groups")
        .select("*")
        .order("position");
      if (error) throw error;
      return data as TaskGroup[];
    },
    enabled: !!user,
  });
}

export function useTasks(groupId?: string | null, filterTag?: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["tasks", user?.id, groupId, filterTag],
    queryFn: async () => {
      let query = supabase
        .from("tasks")
        .select("*, subtasks(*), task_tags(tag_id)")
        .order("is_completed", { ascending: true })
        .order("position")
        .order("created_at", { ascending: false });

      if (groupId) {
        query = query.eq("group_id", groupId);
      }

      const { data, error } = await query;
      if (error) throw error;

      let tasks = data as Task[];

      if (filterTag) {
        tasks = tasks.filter(t =>
          t.task_tags?.some(tt => tt.tag_id === filterTag)
        );
      }

      return tasks;
    },
    enabled: !!user,
  });
}

export function useTags() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["tags", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("tags").select("*").order("name");
      if (error) throw error;
      return data as Tag[];
    },
    enabled: !!user,
  });
}

export function useGroupMembers(groupId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["group_members", groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("group_members" as any)
        .select("*")
        .eq("group_id", groupId!);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user && !!groupId,
  });
}

export function useTaskMutations() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const addGroup = useMutation({
    mutationFn: async ({ name, parent_id }: { name: string; parent_id?: string | null }) => {
      // 1. Create tag first
      const { data: tagData, error: tagError } = await supabase
        .from("tags")
        .insert({ name, user_id: user!.id, color: "#3b82f6" })
        .select()
        .single();
      if (tagError) throw tagError;

      // 2. Create group with linked_tag_id and optional parent_id
      const { error } = await supabase.from("task_groups").insert({
        name,
        user_id: user!.id,
        linked_tag_id: tagData.id,
        parent_id: parent_id || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task_groups"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const updateGroupAppearance = useMutation({
    mutationFn: async ({ id, icon, color }: { id: string; icon?: string | null; color?: string | null }) => {
      const updates: Record<string, any> = {};
      if (icon !== undefined) updates.icon = icon;
      if (color !== undefined) updates.color = color;
      const { error } = await supabase.from("task_groups").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task_groups"] }),
  });

  const renameGroup = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("task_groups").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task_groups"] }),
    onError: (e) => toast.error(e.message),
  });

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task_groups"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const addTask = useMutation({
    mutationFn: async (task: { title: string; group_id?: string | null; deadline?: string | null }) => {
      const { data: taskData, error } = await supabase.from("tasks").insert({
        title: task.title,
        group_id: task.group_id || null,
        user_id: user!.id,
        deadline: task.deadline || null,
      }).select().single();
      if (error) throw error;

      // Auto-tag: if task is in a group with a linked tag, add that tag
      if (task.group_id) {
        const { data: group } = await supabase
          .from("task_groups")
          .select("*")
          .eq("id", task.group_id)
          .single();
        
        if (group && (group as any).linked_tag_id) {
          await supabase.from("task_tags").insert({
            task_id: taskData.id,
            tag_id: (group as any).linked_tag_id,
          });
        }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (e) => toast.error(e.message),
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<TablesInsert<"tasks">>) => {
      const { error } = await supabase.from("tasks").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const toggleTask = useMutation({
    mutationFn: async ({ id, is_completed }: { id: string; is_completed: boolean }) => {
      const { error } = await supabase.from("tasks").update({
        is_completed,
        completed_at: is_completed ? new Date().toISOString() : null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const toggleImportant = useMutation({
    mutationFn: async ({ id, is_important }: { id: string; is_important: boolean }) => {
      const { error } = await supabase.from("tasks").update({ is_important }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const addSubtask = useMutation({
    mutationFn: async ({ task_id, title }: { task_id: string; title: string }) => {
      const { error } = await supabase.from("subtasks").insert({ task_id, title });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const toggleSubtask = useMutation({
    mutationFn: async ({ id, is_completed }: { id: string; is_completed: boolean }) => {
      const { error } = await supabase.from("subtasks").update({ is_completed }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const deleteSubtask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subtasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const addTag = useMutation({
    mutationFn: async ({ name, color }: { name: string; color?: string }) => {
      const { error } = await supabase.from("tags").insert({ name, color, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tags"] }),
    onError: (e) => toast.error(e.message),
  });

  const renameTag = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("tags").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tags"] }),
    onError: (e) => toast.error(e.message),
  });

  const deleteTag = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tags").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tags"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const addTaskTag = useMutation({
    mutationFn: async ({ task_id, tag_id }: { task_id: string; tag_id: string }) => {
      const { error } = await supabase.from("task_tags").insert({ task_id, tag_id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const removeTaskTag = useMutation({
    mutationFn: async ({ task_id, tag_id }: { task_id: string; tag_id: string }) => {
      const { error } = await supabase.from("task_tags").delete().eq("task_id", task_id).eq("tag_id", tag_id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const addGroupMember = useMutation({
    mutationFn: async ({ group_id, user_email }: { group_id: string; user_email: string }) => {
      // Find user by email in profiles
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", user_email)
        .single();
      if (profileError) throw new Error("Пользователь не найден");

      const { error } = await supabase.from("group_members" as any).insert({
        group_id,
        user_id: profile.id,
        invited_by: user!.id,
      });
      if (error) throw error;

      // Also grant tag access if group has a linked tag
      const { data: group } = await supabase
        .from("task_groups")
        .select("*")
        .eq("id", group_id)
        .single();
      
      if (group && (group as any).linked_tag_id) {
        await supabase.from("tag_access" as any).insert({
          tag_id: (group as any).linked_tag_id,
          user_id: profile.id,
          granted_by: user!.id,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group_members"] });
      toast.success("Участник добавлен");
    },
    onError: (e) => toast.error(e.message),
  });

  const removeGroupMember = useMutation({
    mutationFn: async ({ group_id, member_user_id }: { group_id: string; member_user_id: string }) => {
      const { error } = await supabase
        .from("group_members" as any)
        .delete()
        .eq("group_id", group_id)
        .eq("user_id", member_user_id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group_members"] }),
  });

  const grantTagAccess = useMutation({
    mutationFn: async ({ tag_id, user_email }: { tag_id: string; user_email: string }) => {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", user_email)
        .single();
      if (profileError) throw new Error("Пользователь не найден");

      const { error } = await supabase.from("tag_access" as any).insert({
        tag_id,
        user_id: profile.id,
        granted_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Доступ предоставлен");
    },
    onError: (e) => toast.error(e.message),
  });

  const reorderTasks = useMutation({
    mutationFn: async (items: { id: string; position: number }[]) => {
      const promises = items.map(({ id, position }) =>
        supabase.from("tasks").update({ position }).eq("id", id)
      );
      const results = await Promise.all(promises);
      const err = results.find(r => r.error);
      if (err?.error) throw err.error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  return {
    addGroup, renameGroup, deleteGroup, updateGroupAppearance,
    addTask, updateTask, deleteTask, toggleTask, toggleImportant,
    addSubtask, toggleSubtask, deleteSubtask,
    addTag, renameTag, deleteTag, addTaskTag, removeTaskTag,
    addGroupMember, removeGroupMember, grantTagAccess,
    reorderTasks,
  };
}
