import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export type Client = {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  tag_id: string | null;
  group_id: string | null;
  user_id: string;
  created_at: string;
  updated_at: string;
};

export function useClients(groupId?: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["clients", groupId],
    queryFn: async () => {
      let query = supabase.from("clients" as any).select("*");
      if (groupId) query = query.eq("group_id", groupId);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Client[];
    },
    enabled: !!user,
  });
}

export function useClientMutations() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const addClient = useMutation({
    mutationFn: async ({
      name,
      group_id,
      contact_name,
      phone,
      email,
    }: {
      name: string;
      group_id?: string | null;
      contact_name?: string | null;
      phone?: string | null;
      email?: string | null;
    }) => {
      // Find "Клиенты" subcategory under "CRM / Продажи"
      const { data: crmCat } = await supabase
        .from("tag_categories" as any)
        .select("id")
        .eq("user_id", user!.id)
        .eq("name", "CRM / Продажи")
        .is("parent_id", null)
        .limit(1);

      let clientsCatId: string | null = null;
      if (crmCat && (crmCat as any[]).length > 0) {
        const { data: subCat } = await supabase
          .from("tag_categories" as any)
          .select("id")
          .eq("parent_id", (crmCat as any[])[0].id)
          .eq("name", "Клиенты")
          .limit(1);
        if (subCat && (subCat as any[]).length > 0) {
          clientsCatId = (subCat as any[])[0].id;
        }
      }

      // Create tag for client
      const { data: tagData, error: tagError } = await supabase
        .from("tags")
        .insert({
          name,
          user_id: user!.id,
          color: "#ef4444",
          category_id: clientsCatId,
        })
        .select()
        .single();
      if (tagError) throw tagError;

      // Create client record
      const { data: clientData, error } = await supabase
        .from("clients" as any)
        .insert({
          name,
          group_id: group_id || null,
          tag_id: tagData.id,
          user_id: user!.id,
          contact_name: contact_name || null,
          phone: phone || null,
          email: email || null,
        })
        .select()
        .single();
      if (error) throw error;

      // If group_id provided, also add tag to group
      if (group_id) {
        await supabase.from("group_tags" as any).insert({ group_id, tag_id: tagData.id }).catch(() => {});
      }

      return clientData as unknown as Client;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
      qc.invalidateQueries({ queryKey: ["group_tags"] });
      toast.success("Клиент создан");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateClient = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Client> & { id: string }) => {
      const { error } = await supabase
        .from("clients" as any)
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
    onError: (e) => toast.error(e.message),
  });

  const deleteClient = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Клиент удалён");
    },
    onError: (e) => toast.error(e.message),
  });

  return { addClient, updateClient, deleteClient };
}
