import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface WikiPage {
  id: string;
  group_id: string | null;
  user_id: string;
  parent_page_id: string | null;
  title: string;
  content: string;
  icon: string;
  page_type: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface StructuredSection {
  id: string;
  group_id: string;
  user_id: string;
  section_key: string;
  content: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export function useWikiPages(groupId: string) {
  return useQuery({
    queryKey: ["wiki-pages", groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wiki_pages")
        .select("*")
        .eq("group_id", groupId)
        .order("position", { ascending: true });
      if (error) throw error;
      return data as WikiPage[];
    },
    enabled: !!groupId,
  });
}

export function useStructuredSections(groupId: string) {
  return useQuery({
    queryKey: ["structured-sections", groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wiki_structured_sections")
        .select("*")
        .eq("group_id", groupId)
        .order("position", { ascending: true });
      if (error) throw error;
      return data as StructuredSection[];
    },
    enabled: !!groupId,
  });
}

export function useWikiMutations(groupId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const createPage = useMutation({
    mutationFn: async (params: { title?: string; parentPageId?: string | null; icon?: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("wiki_pages")
        .insert({
          group_id: groupId,
          user_id: user.id,
          title: params.title || "Новая страница",
          parent_page_id: params.parentPageId || null,
          icon: params.icon || "📄",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wiki-pages", groupId] }),
  });

  const updatePage = useMutation({
    mutationFn: async (params: { id: string; title?: string; content?: string; icon?: string }) => {
      const { id, ...updates } = params;
      const { error } = await supabase
        .from("wiki_pages")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wiki-pages", groupId] }),
  });

  const deletePage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("wiki_pages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wiki-pages", groupId] });
      toast.success("Страница удалена");
    },
  });

  const upsertSection = useMutation({
    mutationFn: async (params: { sectionKey: string; content: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("wiki_structured_sections")
        .upsert({
          group_id: groupId,
          user_id: user.id,
          section_key: params.sectionKey,
          content: params.content,
          updated_at: new Date().toISOString(),
        }, { onConflict: "group_id,section_key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["structured-sections", groupId] }),
  });

  return { createPage, updatePage, deletePage, upsertSection };
}
