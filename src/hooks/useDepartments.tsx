import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

export interface Department {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  head_user_id: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export function useDepartments() {
  return useQuery<Department[]>({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("*")
        .order("position", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Department[];
    },
    staleTime: 60_000,
  });
}

export function useCreateDepartment() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<Department> & { name: string }) => {
      if (!user) throw new Error("Не авторизован");
      const { data, error } = await supabase
        .from("departments")
        .insert({
          user_id: user.id,
          name: input.name.trim(),
          description: input.description ?? null,
          color: input.color ?? "#6366f1",
          icon: input.icon ?? "building-2",
          head_user_id: input.head_user_id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Department;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (e: any) => {
      toast({ title: "Не удалось создать отдел", description: e?.message, variant: "destructive" });
    },
  });
}

export function useUpdateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Department> & { id: string }) => {
      const { error } = await supabase.from("departments").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["departments"] }),
  });
}

export function useDeleteDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("departments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
