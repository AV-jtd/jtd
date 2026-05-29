import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type DecisionVisibility = "protocol" | "restricted";
export type DecisionStatus = "active" | "revoked" | "superseded";

export interface Decision {
  id: string;
  user_id: string;
  protocol_id: string;
  source_task_id: string | null;
  title: string;
  body: string | null;
  decided_at: string;
  status: DecisionStatus;
  superseded_by: string | null;
  visibility: DecisionVisibility;
  created_at: string;
  updated_at: string;
  project_ids: string[];
  tag_ids: string[];
  client_ids: string[];
  viewer_ids: string[];
}

interface ScopeArgs {
  protocolId?: string | null;
  groupId?: string | null;
  clientId?: string | null;
  tagIds?: string[];
  enabled?: boolean;
}

/**
 * Returns visible decisions filtered by any of the optional scopes.
 * RLS handles per-row visibility; this hook applies an additional filter for the caller's scope.
 */
export function useDecisions({
  protocolId,
  groupId,
  clientId,
  tagIds,
  enabled = true,
}: ScopeArgs = {}) {
  const { user } = useAuth();
  const tagsKey = (tagIds ?? []).slice().sort().join(",");

  return useQuery({
    queryKey: ["decisions", user?.id, { protocolId, groupId, clientId, tagsKey }],
    enabled: !!user && enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<Decision[]> => {
      let ids: Set<string> | null = null;

      const intersect = (next: string[]) => {
        const setNext = new Set(next);
        if (ids === null) ids = setNext;
        else ids = new Set([...ids].filter((x) => setNext.has(x)));
      };

      if (protocolId) {
        const { data, error } = await supabase.from("decisions").select("id").eq("protocol_id", protocolId);
        if (error) throw error;
        intersect((data ?? []).map((r: any) => r.id));
      }
      if (groupId) {
        const { data, error } = await supabase
          .from("decision_projects")
          .select("decision_id")
          .eq("group_id", groupId);
        if (error) throw error;
        intersect((data ?? []).map((r: any) => r.decision_id));
      }
      if (clientId) {
        const { data, error } = await supabase
          .from("decision_clients")
          .select("decision_id")
          .eq("client_id", clientId);
        if (error) throw error;
        intersect((data ?? []).map((r: any) => r.decision_id));
      }
      if (tagIds && tagIds.length > 0) {
        const { data, error } = await supabase
          .from("decision_tags")
          .select("decision_id")
          .in("tag_id", tagIds);
        if (error) throw error;
        intersect((data ?? []).map((r: any) => r.decision_id));
      }

      let baseQuery = supabase
        .from("decisions")
        .select(
          "id,user_id,protocol_id,source_task_id,title,body,decided_at,status,superseded_by,visibility,created_at,updated_at,decision_projects(group_id),decision_tags(tag_id),decision_clients(client_id),decision_viewers(user_id)",
        )
        .order("decided_at", { ascending: false });

      if (ids !== null) {
        const arr = Array.from(ids);
        if (arr.length === 0) return [];
        baseQuery = baseQuery.in("id", arr);
      }

      const { data, error } = await baseQuery;
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        user_id: r.user_id,
        protocol_id: r.protocol_id,
        source_task_id: r.source_task_id,
        title: r.title,
        body: r.body,
        decided_at: r.decided_at,
        status: r.status,
        superseded_by: r.superseded_by,
        visibility: r.visibility,
        created_at: r.created_at,
        updated_at: r.updated_at,
        project_ids: (r.decision_projects ?? []).map((x: any) => x.group_id),
        tag_ids: (r.decision_tags ?? []).map((x: any) => x.tag_id),
        client_ids: (r.decision_clients ?? []).map((x: any) => x.client_id),
        viewer_ids: (r.decision_viewers ?? []).map((x: any) => x.user_id),
      })) as Decision[];
    },
  });
}

export interface DecisionInput {
  protocol_id: string;
  source_task_id?: string | null;
  title: string;
  body?: string | null;
  decided_at?: string;
  visibility?: DecisionVisibility;
  project_ids?: string[];
  tag_ids?: string[];
  client_ids?: string[];
  viewer_ids?: string[];
}

async function syncChildren(
  decisionId: string,
  table: "decision_projects" | "decision_tags" | "decision_clients" | "decision_viewers",
  column: "group_id" | "tag_id" | "client_id" | "user_id",
  ids: string[],
) {
  await supabase.from(table).delete().eq("decision_id", decisionId);
  if (ids.length === 0) return;
  const rows = ids.map((v) => ({ decision_id: decisionId, [column]: v }));
  const { error } = await supabase.from(table).insert(rows as any);
  if (error) throw error;
}

export function useCreateDecision() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: DecisionInput) => {
      if (!user) throw new Error("Not authenticated");
      // Resolve the user id from the LIVE session (not a possibly-stale cached
      // useAuth().user). On backends still using the strict insert policy
      // (auth.uid() = user_id) a stale id triggers an RLS violation; using the
      // live session id keeps it in sync with the JWT actually sent.
      const { data: sessionData } = await supabase.auth.getSession();
      const authUserId = sessionData.session?.user?.id ?? user.id;
      const { data, error } = await supabase
        .from("decisions")
        .insert({
          user_id: authUserId,
          protocol_id: input.protocol_id,
          source_task_id: input.source_task_id ?? null,
          title: input.title,
          body: input.body ?? null,
          decided_at: input.decided_at ?? new Date().toISOString(),
          visibility: input.visibility ?? "protocol",
        })
        .select("id")
        .single();
      if (error) throw error;
      const id = data!.id as string;
      await syncChildren(id, "decision_projects", "group_id", input.project_ids ?? []);
      await syncChildren(id, "decision_tags", "tag_id", input.tag_ids ?? []);
      await syncChildren(id, "decision_clients", "client_id", input.client_ids ?? []);
      await syncChildren(id, "decision_viewers", "user_id", input.viewer_ids ?? []);
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["decisions"] }),
  });
}

export function useUpdateDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: DecisionInput & { id: string }) => {
      const { error } = await supabase
        .from("decisions")
        .update({
          title: input.title,
          body: input.body ?? null,
          decided_at: input.decided_at,
          visibility: input.visibility ?? "protocol",
          source_task_id: input.source_task_id ?? null,
        })
        .eq("id", id);
      if (error) throw error;
      await syncChildren(id, "decision_projects", "group_id", input.project_ids ?? []);
      await syncChildren(id, "decision_tags", "tag_id", input.tag_ids ?? []);
      await syncChildren(id, "decision_clients", "client_id", input.client_ids ?? []);
      await syncChildren(id, "decision_viewers", "user_id", input.viewer_ids ?? []);
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["decisions"] }),
  });
}

export function useDeleteDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("decisions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["decisions"] }),
  });
}