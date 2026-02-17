import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { Tables, TablesInsert } from "@/integrations/supabase/types";
import { toast } from "sonner";

export type Task = Tables<"tasks"> & {
  subtasks?: Tables<"subtasks">[];
  task_tags?: { tag_id: string }[];
  tags?: Tables<"tags">[];
  recurrence?: string | null;
  recurrence_end_date?: string | null;
  parent_recurring_id?: string | null;
  priority?: number | null;
};
export type TaskGroup = Tables<"task_groups"> & { linked_tag_id?: string | null; parent_id?: string | null };
export type Tag = Tables<"tags">;
export type Subtask = Tables<"subtasks">;
export type TaskParticipant = { id: string; task_id: string; user_id: string; role: string; created_at: string };
export type Profile = { id: string; display_name: string | null; email: string | null; telegram_username: string | null };

export function useTaskGroups() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Subscribe to group_members changes so added users see projects instantly
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('group_members_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_members', filter: `user_id=eq.${user.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["task_groups"] });
          qc.invalidateQueries({ queryKey: ["group_members"] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, qc]);

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
    staleTime: 1000 * 30, // 30 seconds for groups (shorter to catch membership changes)
    refetchOnWindowFocus: 'always',
  });
}

export function useTasks(groupId?: string | null, filterTags?: string[] | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["tasks", user?.id, groupId, filterTags],
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

      if (filterTags && filterTags.length > 0) {
        tasks = tasks.filter(t =>
          filterTags.every(tagId =>
            t.task_tags?.some(tt => tt.tag_id === tagId)
          )
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

export function useAvailableUsers() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["available_users", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, email, telegram_username");
      if (error) throw error;
      return (data || []) as Profile[];
    },
    enabled: !!user,
  });
}

export function useTaskParticipants(taskId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["task_participants", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_participants" as any)
        .select("*")
        .eq("task_id", taskId!);
      if (error) throw error;
      return (data || []) as unknown as TaskParticipant[];
    },
    enabled: !!user && !!taskId,
  });
}

export function useGroupMembers(groupId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["group_members", groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("group_members")
        .select("*")
        .eq("group_id", groupId!);
      if (error) throw error;
      return data as { id: string; group_id: string; user_id: string; role: string; invited_by: string; created_at: string }[];
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
    onMutate: async ({ id, icon, color }) => {
      await qc.cancelQueries({ queryKey: ["task_groups"] });
      const prev = qc.getQueryData<TaskGroup[]>(["task_groups"]);
      if (prev) {
        qc.setQueryData<TaskGroup[]>(["task_groups"], prev.map(g =>
          g.id === id ? { ...g, ...(icon !== undefined ? { icon } : {}), ...(color !== undefined ? { color } : {}) } : g
        ));
      }
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) qc.setQueryData(["task_groups"], context.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["task_groups"] }),
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

      // Auto-add creator as participant
      const { error: partError } = await supabase.from("task_participants").insert({
        task_id: taskData.id,
        user_id: user!.id,
        role: "creator",
      });
      if (partError) console.error("Failed to add creator as participant:", partError);

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
      // Get full task to check recurrence
      const { data: taskData } = await supabase.from("tasks").select("*").eq("id", id).single();
      
      const { error } = await supabase.from("tasks").update({
        is_completed,
        completed_at: is_completed ? new Date().toISOString() : null,
      }).eq("id", id);
      if (error) throw error;

      // Auto-create next recurring task
      if (is_completed && taskData && (taskData as any).recurrence) {
        const rec = (taskData as any).recurrence as string;
        const now = new Date();
        let nextDeadline: Date | null = null;
        
        if (taskData.deadline) {
          const d = new Date(taskData.deadline);
          if (rec === "daily") d.setDate(d.getDate() + 1);
          else if (rec === "weekly") d.setDate(d.getDate() + 7);
          else if (rec === "monthly") d.setMonth(d.getMonth() + 1);
          else if (rec === "yearly") d.setFullYear(d.getFullYear() + 1);
          nextDeadline = d;
        } else {
          if (rec === "daily") now.setDate(now.getDate() + 1);
          else if (rec === "weekly") now.setDate(now.getDate() + 7);
          else if (rec === "monthly") now.setMonth(now.getMonth() + 1);
          else if (rec === "yearly") now.setFullYear(now.getFullYear() + 1);
          nextDeadline = now;
        }

        const endDate = (taskData as any).recurrence_end_date;
        if (endDate && nextDeadline && nextDeadline > new Date(endDate)) {
          // Past end date, don't create next
        } else {
          await supabase.from("tasks").insert({
            title: taskData.title,
            description: taskData.description,
            group_id: taskData.group_id,
            user_id: taskData.user_id,
            is_important: taskData.is_important,
            deadline: nextDeadline?.toISOString() || null,
            assigned_to: taskData.assigned_to,
            recurrence: rec,
            recurrence_end_date: endDate,
            parent_recurring_id: (taskData as any).parent_recurring_id || id,
          } as any);
        }
      }
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
    mutationFn: async ({ group_id, user_id: memberId, role = "participant" }: { group_id: string; user_id?: string; user_email?: string; role?: string }) => {
      let targetUserId = memberId;
      
      if (!targetUserId) {
        throw new Error("user_id is required");
      }

      // Check if already a member
      const { data: existing } = await supabase
        .from("group_members")
        .select("id")
        .eq("group_id", group_id)
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (existing) {
        throw new Error("Пользователь уже в проекте");
      }

      const { error } = await supabase.from("group_members").insert({
        group_id,
        user_id: targetUserId,
        invited_by: user!.id,
        role,
      });
      if (error) throw error;

      // Also grant tag access if group has a linked tag
      const { data: group } = await supabase
        .from("task_groups")
        .select("*")
        .eq("id", group_id)
        .single();
      
      if (group && group.linked_tag_id) {
        await supabase.from("tag_access").insert({
          tag_id: group.linked_tag_id,
          user_id: targetUserId,
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

  const addGroupMemberByEmail = useMutation({
    mutationFn: async ({ group_id, user_email, role = "participant" }: { group_id: string; user_email: string; role?: string }) => {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", user_email)
        .single();
      if (profileError) throw new Error("Пользователь не найден");

      const { error } = await supabase.from("group_members").insert({
        group_id,
        user_id: profile.id,
        invited_by: user!.id,
        role,
      });
      if (error) throw error;

      const { data: group } = await supabase
        .from("task_groups")
        .select("*")
        .eq("id", group_id)
        .single();
      
      if (group && group.linked_tag_id) {
        await supabase.from("tag_access").insert({
          tag_id: group.linked_tag_id,
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
        .from("group_members")
        .delete()
        .eq("group_id", group_id)
        .eq("user_id", member_user_id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group_members"] }),
  });

  const updateGroupDescription = useMutation({
    mutationFn: async ({ id, description }: { id: string; description: string | null }) => {
      const { error } = await supabase.from("task_groups").update({ description } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task_groups"] }),
  });

  const updateGroupParent = useMutation({
    mutationFn: async ({ id, parent_id }: { id: string; parent_id: string | null }) => {
      const { error } = await supabase.from("task_groups").update({ parent_id }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task_groups"] }),
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

  const reorderGroups = useMutation({
    mutationFn: async (items: { id: string; position: number }[]) => {
      const promises = items.map(({ id, position }) =>
        supabase.from("task_groups").update({ position }).eq("id", id)
      );
      const results = await Promise.all(promises);
      const err = results.find(r => r.error);
      if (err?.error) throw err.error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task_groups"] }),
  });

  const addParticipant = useMutation({
    mutationFn: async ({ task_id, user_id, role }: { task_id: string; user_id: string; role: string }) => {
      const { error } = await supabase.from("task_participants" as any).insert({ task_id, user_id, role });
      if (error) throw error;
      // If role is assignee, also update task.assigned_to for backward compat
      if (role === "assignee") {
        await supabase.from("tasks").update({ assigned_to: user_id }).eq("id", task_id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task_participants"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const removeParticipant = useMutation({
    mutationFn: async ({ task_id, user_id }: { task_id: string; user_id: string }) => {
      const { error } = await supabase
        .from("task_participants" as any)
        .delete()
        .eq("task_id", task_id)
        .eq("user_id", user_id);
      if (error) throw error;
      // If this was the assignee, clear assigned_to
      const { data: remaining } = await supabase
        .from("task_participants" as any)
        .select("*")
        .eq("task_id", task_id)
        .eq("role", "assignee");
      if (!remaining || remaining.length === 0) {
        await supabase.from("tasks").update({ assigned_to: null }).eq("id", task_id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task_participants"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e) => toast.error(e.message),
  });

  return {
    addGroup, renameGroup, deleteGroup, updateGroupAppearance, updateGroupDescription, updateGroupParent,
    addTask, updateTask, deleteTask, toggleTask, toggleImportant,
    addSubtask, toggleSubtask, deleteSubtask,
    addTag, renameTag, deleteTag, addTaskTag, removeTaskTag,
    addGroupMember, addGroupMemberByEmail, removeGroupMember, grantTagAccess,
    reorderTasks, reorderGroups,
    addParticipant, removeParticipant,
  };
}
