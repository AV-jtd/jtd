import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Archive, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { patchGroupInCache, restoreGroupSnapshots, STM_KEYS } from "../lib/stmCache";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  groupId: string;
  groupName: string;
  /** When true → unarchive flow (clears closed_at, no comment required). */
  unarchive?: boolean;
}

/**
 * Archive / unarchive an STM SKU.
 * - Archive: requires a non-empty comment. Sets task_groups.closed_at = now() and saves the comment.
 * - Unarchive: clears closed_at + archive_comment.
 */
export default function StmArchiveDialog({ open, onOpenChange, groupId, groupName, unarchive }: Props) {
  const qc = useQueryClient();
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (open) setComment("");
  }, [open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = unarchive
        ? { closed_at: null, archive_comment: null }
        : { closed_at: new Date().toISOString(), archive_comment: comment.trim() };
      const { error } = await supabase
        .from("task_groups")
        .update(payload as any)
        .eq("id", groupId);
      if (error) throw error;
    },
    onMutate: async () => {
      // Optimistic patch: row updates instantly, no waiting for refetch.
      await qc.cancelQueries({ queryKey: STM_KEYS.groups() });
      const patch = unarchive
        ? { closed_at: null, archive_comment: null }
        : { closed_at: new Date().toISOString(), archive_comment: comment.trim() };
      const snapshots = patchGroupInCache(qc, groupId, patch as any);
      return { snapshots };
    },
    onError: (e: any, _v, ctx: any) => {
      if (ctx?.snapshots) restoreGroupSnapshots(qc, ctx.snapshots);
      toast.error(e.message || "Не удалось сохранить");
    },
    onSuccess: () => {
      toast.success(unarchive ? "SKU восстановлен" : "SKU отправлен в архив");
      onOpenChange(false);
    },
  });

  const canSubmit = unarchive ? true : comment.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {unarchive ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            {unarchive ? "Вернуть из архива" : "Перенести SKU в архив"}
          </DialogTitle>
          <DialogDescription className="truncate">{groupName}</DialogDescription>
        </DialogHeader>

        {!unarchive && (
          <div className="space-y-2">
            <Label htmlFor="archive-comment" className="text-xs">
              Комментарий <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="archive-comment"
              autoFocus
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Причина переноса в архив (обязательно)…"
              rows={4}
              className="resize-none"
            />
            <p className="text-[11px] text-muted-foreground">
              Будет зафиксирован в карточке вместе с датой переноса.
            </p>
          </div>
        )}

        {unarchive && (
          <p className="text-sm text-muted-foreground">
            SKU вернётся в активный список. История архивации будет очищена.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit || mutation.isPending}
            variant={unarchive ? "default" : "destructive"}
          >
            {mutation.isPending ? "Сохранение…" : unarchive ? "Вернуть" : "В архив"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}