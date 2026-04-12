import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type ReportBlockType = "kpi" | "chart" | "text" | "table" | "project_link" | "divider";

export interface ReportBlock {
  id: string;
  type: ReportBlockType;
  data: Record<string, any>;
  width?: "full" | "half"; // layout hint
}

export interface ReportPage {
  id: string;
  group_id: string | null;
  user_id: string;
  title: string;
  blocks: ReportBlock[];
  cover_color: string;
  created_at: string;
  updated_at: string;
}

export function useReportPages(groupId: string | null) {
  return useQuery({
    queryKey: ["report-pages", groupId],
    queryFn: async () => {
      let q = supabase.from("report_pages").select("*").order("updated_at", { ascending: false });
      if (groupId) {
        q = q.eq("group_id", groupId);
      } else {
        q = q.is("group_id", null);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data as any[]).map(d => ({
        ...d,
        blocks: (Array.isArray(d.blocks) ? d.blocks : []) as ReportBlock[],
      })) as ReportPage[];
    },
    enabled: groupId !== undefined,
  });
}

export function useReportMutations(groupId: string | null) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const key = ["report-pages", groupId];

  const createReport = useMutation({
    mutationFn: async (title?: string) => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("report_pages")
        .insert({
          group_id: groupId,
          user_id: user.id,
          title: title || "Новый отчёт",
          blocks: [] as any,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const updateReport = useMutation({
    mutationFn: async (params: { id: string; title?: string; blocks?: ReportBlock[]; cover_color?: string }) => {
      const { id, ...updates } = params;
      const payload: any = { ...updates, updated_at: new Date().toISOString() };
      if (updates.blocks) payload.blocks = updates.blocks as any;
      const { error } = await supabase.from("report_pages").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const deleteReport = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("report_pages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Отчёт удалён");
    },
  });

  return { createReport, updateReport, deleteReport };
}
