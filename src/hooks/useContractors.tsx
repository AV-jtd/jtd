import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

export interface Contractor {
  id: string;
  user_id: string;
  name: string;
  organization: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  color: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export function useContractors() {
  return useQuery<Contractor[]>({
    queryKey: ["contractors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contractors")
        .select("*")
        .order("position", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Contractor[];
    },
    staleTime: 60_000,
  });
}

export function useCreateContractor() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<Contractor> & { name: string }) => {
      if (!user) throw new Error("Не авторизован");
      const { data, error } = await supabase
        .from("contractors")
        .insert({
          user_id: user.id,
          name: input.name.trim(),
          organization: input.organization ?? null,
          contact_name: input.contact_name ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          notes: input.notes ?? null,
          color: input.color ?? "#f59e0b",
        })
        .select()
        .single();
      if (error) throw error;
      return data as Contractor;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contractors"] }),
    onError: (e: any) => {
      toast({ title: "Не удалось создать подрядчика", description: e?.message, variant: "destructive" });
    },
  });
}

export function useUpdateContractor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Contractor> & { id: string }) => {
      const { error } = await supabase.from("contractors").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contractors"] }),
  });
}

export function useDeleteContractor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contractors").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contractors"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
