import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

/**
 * Хуки для новой 3-уровневой оргструктуры.
 *
 *  - parent_department_id в departments — древо (Дирекция → Отдел → Подотдел).
 *  - user_departments — many-to-many пользователь↔отдел с флагом is_primary.
 *  - department_directors — явные кураторы (поверх head родителя).
 *
 *  RPC:
 *  - get_user_departments(user) — все отделы пользователя (для эмодзи).
 *  - get_user_visible_departments(user) — поддерево, видимое директору/head.
 *  - get_department_descendants(dept) — рекурсивный список потомков.
 */

export interface UserDepartmentRow {
  user_id: string;
  department_id: string;
  is_primary: boolean;
  created_at: string;
}

export interface DepartmentDirectorRow {
  director_user_id: string;
  department_id: string;
  created_at: string;
}

/** Все привязки user→department (для всех пользователей одним запросом). */
export function useAllUserDepartments() {
  return useQuery<UserDepartmentRow[]>({
    queryKey: ["user-departments", "all"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("user_departments")
        .select("user_id,department_id,is_primary,created_at");
      if (error) throw error;
      return (data ?? []) as UserDepartmentRow[];
    },
  });
}

/** Привязки отделов конкретного пользователя. */
export function useUserDepartments(userId: string | null | undefined) {
  return useQuery<UserDepartmentRow[]>({
    queryKey: ["user-departments", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("user_departments")
        .select("user_id,department_id,is_primary,created_at")
        .eq("user_id", userId!);
      if (error) throw error;
      return (data ?? []) as UserDepartmentRow[];
    },
  });
}

/** Все кураторы (admin-таблица — обычно небольшая). */
export function useDepartmentDirectors() {
  return useQuery<DepartmentDirectorRow[]>({
    queryKey: ["department-directors"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("department_directors")
        .select("director_user_id,department_id,created_at");
      if (error) throw error;
      return (data ?? []) as DepartmentDirectorRow[];
    },
  });
}

/** Отделы, видимые текущему пользователю как head/директору (поддерево + кураторства). */
export function useMyVisibleDepartments() {
  const { user } = useAuth();
  return useQuery<string[]>({
    queryKey: ["visible-departments", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_user_visible_departments", {
        _user_id: user!.id,
      });
      if (error) throw error;
      return ((data ?? []) as Array<{ department_id: string }>).map((r) => r.department_id);
    },
  });
}

/** Является ли текущий юзер head или явным куратором какого-либо отдела. */
export function useIsDirector() {
  const { user } = useAuth();
  return useQuery<boolean>({
    queryKey: ["is-director", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const [headRes, dirRes] = await Promise.all([
        supabase.from("departments").select("id").eq("head_user_id", user!.id).limit(1),
        (supabase as any).from("department_directors").select("department_id").eq("director_user_id", user!.id).limit(1),
      ]);
      const isHead = !headRes.error && (headRes.data ?? []).length > 0;
      const isDir = !dirRes.error && (dirRes.data ?? []).length > 0;
      return isHead || isDir;
    },
  });
}

/** Задачи всего поддерева отделов, видимых юзеру. Используется во вкладке «Моя Дирекция». */
export function useMyDirectorateTasks() {
  const { user } = useAuth();
  const visible = useMyVisibleDepartments();
  return useQuery({
    queryKey: ["directorate-tasks", user?.id, visible.data?.join(",")],
    enabled: !!user && !!visible.data && visible.data.length > 0,
    staleTime: 15_000,
    queryFn: async () => {
      const ids = visible.data!;
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id,title,description,deadline,assigned_to,department_id,contractor_id,is_completed,is_important,priority,group_id,source_protocol_id,status_meta,completed_at,created_at,updated_at,user_id",
        )
        .in("department_id", ids)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

// =============== Mutations (admin) ================

export function useSetUserDepartments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { userId: string; primaryDeptId: string | null; extraDeptIds: string[] }) => {
      const { userId, primaryDeptId, extraDeptIds } = params;
      // Снести все
      const { error: delErr } = await (supabase as any)
        .from("user_departments")
        .delete()
        .eq("user_id", userId);
      if (delErr) throw delErr;
      const rows: { user_id: string; department_id: string; is_primary: boolean }[] = [];
      if (primaryDeptId) {
        rows.push({ user_id: userId, department_id: primaryDeptId, is_primary: true });
      }
      for (const d of extraDeptIds) {
        if (d !== primaryDeptId) rows.push({ user_id: userId, department_id: d, is_primary: false });
      }
      if (rows.length > 0) {
        const { error: insErr } = await (supabase as any).from("user_departments").insert(rows);
        if (insErr) throw insErr;
      }
      // Профиль синхронится триггером, но на всякий случай
      await supabase.from("profiles").update({ department_id: primaryDeptId }).eq("id", userId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-departments"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["visible-departments"] });
      toast({ title: "Отделы пользователя обновлены" });
    },
    onError: (e: any) => {
      toast({ title: "Не удалось обновить отделы", description: e?.message, variant: "destructive" });
    },
  });
}

export function useAddDepartmentDirector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { userId: string; departmentId: string }) => {
      const { error } = await (supabase as any).from("department_directors").insert({
        director_user_id: params.userId,
        department_id: params.departmentId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["department-directors"] });
      qc.invalidateQueries({ queryKey: ["visible-departments"] });
    },
    onError: (e: any) => {
      toast({ title: "Не удалось назначить зама", description: e?.message, variant: "destructive" });
    },
  });
}

export function useRemoveDepartmentDirector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { userId: string; departmentId: string }) => {
      const { error } = await (supabase as any)
        .from("department_directors")
        .delete()
        .eq("director_user_id", params.userId)
        .eq("department_id", params.departmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["department-directors"] });
      qc.invalidateQueries({ queryKey: ["visible-departments"] });
    },
  });
}

export function useUpdateDepartmentParent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; parent_department_id: string | null }) => {
      const { error } = await (supabase as any)
        .from("departments")
        .update({ parent_department_id: params.parent_department_id })
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["departments"] }),
    onError: (e: any) => {
      toast({
        title: "Не удалось изменить родителя",
        description: e?.message?.includes("depth") ? "Глубина не может быть больше 3 уровней" : e?.message,
        variant: "destructive",
      });
    },
  });
}
