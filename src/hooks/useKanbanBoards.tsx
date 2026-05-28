import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Tables } from "@/integrations/supabase/types";
import { toast } from "sonner";

export type KanbanBoard = Tables<"kanban_boards">;
export type KanbanColumn = Tables<"kanban_columns">;
export type KanbanCardPosition = Tables<"kanban_card_positions">;

export function useKanbanBoards() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["kanban_boards", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kanban_boards")
        .select("*")
        .eq("is_archived", false)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as KanbanBoard[];
    },
  });
}

export function useKanbanBoard(boardId: string | null | undefined) {
  return useQuery({
    queryKey: ["kanban_board", boardId],
    enabled: !!boardId,
    queryFn: async () => {
      const [boardRes, columnsRes, positionsRes] = await Promise.all([
        supabase.from("kanban_boards").select("*").eq("id", boardId!).maybeSingle(),
        supabase.from("kanban_columns").select("*").eq("board_id", boardId!).order("position"),
        supabase.from("kanban_card_positions").select("*").eq("board_id", boardId!).order("position"),
      ]);
      if (boardRes.error) throw boardRes.error;
      if (columnsRes.error) throw columnsRes.error;
      if (positionsRes.error) throw positionsRes.error;
      return {
        board: boardRes.data as KanbanBoard | null,
        columns: (columnsRes.data ?? []) as KanbanColumn[],
        positions: (positionsRes.data ?? []) as KanbanCardPosition[],
      };
    },
  });
}

export function useCreateKanbanBoard() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { name: string; icon?: string; board_type: "personal" | "project"; group_id?: string | null }) => {
      if (!user) throw new Error("Не авторизован");
      const { data, error } = await supabase
        .from("kanban_boards")
        .insert({
          name: input.name,
          icon: input.icon ?? "LayoutGrid",
          owner_id: user.id,
          board_type: input.board_type,
          group_id: input.group_id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as KanbanBoard;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kanban_boards"] });
      toast.success("Доска создана");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteKanbanBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (boardId: string) => {
      const { error } = await supabase.from("kanban_boards").delete().eq("id", boardId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kanban_boards"] });
      toast.success("Доска удалена");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateKanbanBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; name?: string; icon?: string; is_archived?: boolean }) => {
      const { id, ...patch } = input;
      const { error } = await supabase.from("kanban_boards").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["kanban_boards"] });
      qc.invalidateQueries({ queryKey: ["kanban_board", vars.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ── Columns ──
export function useColumnMutations(boardId: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["kanban_board", boardId] });

  const addColumn = useMutation({
    mutationFn: async (input: { name: string; color?: string; position: number }) => {
      const { error } = await supabase.from("kanban_columns").insert({
        board_id: boardId,
        name: input.name,
        color: input.color ?? "#3B82F6",
        position: input.position,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const updateColumn = useMutation({
    mutationFn: async (input: { id: string; name?: string; color?: string; wip_limit?: number | null; position?: number }) => {
      const { id, ...patch } = input;
      const { error } = await supabase.from("kanban_columns").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteColumn = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("kanban_columns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  return { addColumn, updateColumn, deleteColumn };
}

// ── Card positions ──
export function useMoveCard(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { task_id: string; column_id: string; position: number; completeTask?: boolean }) => {
      const { error } = await supabase
        .from("kanban_card_positions")
        .upsert(
          {
            board_id: boardId,
            task_id: input.task_id,
            column_id: input.column_id,
            position: input.position,
          },
          { onConflict: "board_id,task_id" },
        );
      if (error) throw error;
      if (input.completeTask !== undefined) {
        const { error: tErr } = await supabase
          .from("tasks")
          .update({
            is_completed: input.completeTask,
            completed_at: input.completeTask ? new Date().toISOString() : null,
          })
          .eq("id", input.task_id);
        if (tErr) throw tErr;
      }
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["kanban_board", boardId] });
      const prev = qc.getQueryData<{ positions: KanbanCardPosition[] }>(["kanban_board", boardId]);
      if (prev) {
        const others = prev.positions.filter((p) => p.task_id !== input.task_id);
        const next = [
          ...others,
          {
            board_id: boardId,
            task_id: input.task_id,
            column_id: input.column_id,
            position: input.position,
            updated_at: new Date().toISOString(),
          } as KanbanCardPosition,
        ];
        qc.setQueryData(["kanban_board", boardId], { ...prev, positions: next });
      }
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["kanban_board", boardId], ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["kanban_board", boardId] });
    },
  });
}