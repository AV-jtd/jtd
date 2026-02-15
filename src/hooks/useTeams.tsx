import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface Team {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  created_at: string;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
  created_at: string;
  profile?: { display_name: string | null; email: string | null };
}

export function useTeams() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["teams", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams" as any)
        .select("*");
      if (error) throw error;
      return data as unknown as Team[];
    },
    enabled: !!user,
  });
}

export function useTeamMembers(teamId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["team_members", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members" as any)
        .select("*")
        .eq("team_id", teamId!);
      if (error) throw error;

      // Fetch profiles for each member
      const userIds = (data as any[]).map((m: any) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", userIds);

      return (data as any[]).map((m: any) => ({
        ...m,
        profile: profiles?.find((p) => p.id === m.user_id) || null,
      })) as TeamMember[];
    },
    enabled: !!user && !!teamId,
  });
}

export function useSubordinateTasks() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["subordinate_tasks", user?.id],
    queryFn: async () => {
      // Get all teams where user is director
      const { data: memberships } = await supabase
        .from("team_members" as any)
        .select("team_id, role")
        .eq("user_id", user!.id)
        .eq("role", "director");

      if (!memberships?.length) return { members: [], tasks: [] };

      const teamIds = (memberships as any[]).map((m: any) => m.team_id);

      // Get subordinate members
      const { data: subordinates } = await supabase
        .from("team_members" as any)
        .select("user_id, team_id")
        .in("team_id", teamIds)
        .eq("role", "member");

      if (!subordinates?.length) return { members: [], tasks: [] };

      const subUserIds = [...new Set((subordinates as any[]).map((s: any) => s.user_id))];

      // Fetch profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, email");

      // Tasks are fetched via RLS — the director policy grants SELECT
      const { data: tasks } = await supabase
        .from("tasks")
        .select("*, subtasks(*), task_tags(tag_id)")
        .in("user_id", subUserIds)
        .order("created_at", { ascending: false });

      return {
        members: (profiles || []).filter((p) => subUserIds.includes(p.id)),
        tasks: tasks || [],
      };
    },
    enabled: !!user,
  });
}

export function useTeamMutations() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const createTeam = useMutation({
    mutationFn: async (name: string) => {
      // Create team
      const { data: team, error } = await supabase
        .from("teams" as any)
        .insert({ name, created_by: user!.id } as any)
        .select()
        .single();
      if (error) throw error;

      // Add self as director
      const { error: memberError } = await supabase
        .from("team_members" as any)
        .insert({
          team_id: (team as any).id,
          user_id: user!.id,
          role: "director",
        } as any);
      if (memberError) throw memberError;

      return team as unknown as Team;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams"] });
      qc.invalidateQueries({ queryKey: ["team_members"] });
      toast.success("Команда создана");
    },
    onError: (e) => toast.error(e.message),
  });

  const joinTeam = useMutation({
    mutationFn: async (inviteCode: string) => {
      const { data, error } = await supabase.functions.invoke("join-team", {
        body: { invite_code: inviteCode },
      });
      if (error) {
        if (error instanceof FunctionsHttpError) {
          const body = await error.context.json();
          if (body?.error) throw new Error(body.error);
        }
        throw error;
      }
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["teams"] });
      qc.invalidateQueries({ queryKey: ["team_members"] });
      toast.success(`Вы присоединились к команде «${data.team_name}»`);
    },
    onError: (e) => toast.error(e.message),
  });

  const removeMember = useMutation({
    mutationFn: async ({ teamId, memberId }: { teamId: string; memberId: string }) => {
      const { error } = await supabase
        .from("team_members" as any)
        .delete()
        .eq("team_id", teamId)
        .eq("user_id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team_members"] });
      qc.invalidateQueries({ queryKey: ["subordinate_tasks"] });
    },
  });

  const deleteTeam = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("teams" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams"] });
      qc.invalidateQueries({ queryKey: ["team_members"] });
      toast.success("Команда удалена");
    },
    onError: (e) => toast.error(e.message),
  });

  return { createTeam, joinTeam, removeMember, deleteTeam };
}
