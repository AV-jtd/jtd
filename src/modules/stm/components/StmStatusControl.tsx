import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { patchGroupInCache, restoreGroupSnapshots, STM_KEYS } from "../lib/stmCache";
import {
  STM_LIFECYCLE,
  getStmLifecycleOption,
  type StmLifecycle,
  type StmMeta,
} from "../lib/stages";

const TONE_DOT: Record<string, string> = {
  muted: "bg-muted-foreground/50",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
};

const TONE_TEXT: Record<string, string> = {
  muted: "text-muted-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
};

interface Props {
  groupId: string;
  groupName: string;
  meta: StmMeta;
  current: StmLifecycle;
  archivedAt: string | null;
  /** Compact: icon-sized trigger (just the dot). */
  compact?: boolean;
}

/**
 * SKU lifecycle status selector.
 * - 5 statuses; "Стоп от сети" + "Выведено" archive the SKU (set closed_at).
 * - Only "Стоп от сети" requires a mandatory comment (captured via dialog).
 * - Switching to a non-archiving status clears closed_at and the comment.
 */
export default function StmStatusControl({ groupId, groupName, meta, current, archivedAt, compact }: Props) {
  const qc = useQueryClient();
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (commentOpen) setComment("");
  }, [commentOpen]);

  const currentOpt = getStmLifecycleOption(current);

  const mutation = useMutation({
    mutationFn: async (vars: { status: StmLifecycle; comment: string | null }) => {
      const opt = getStmLifecycleOption(vars.status);
      const nextMeta = { ...meta, lifecycle: vars.status };
      const payload: Record<string, unknown> = {
        stm_meta: nextMeta,
        closed_at: opt.archives ? (archivedAt ?? new Date().toISOString()) : null,
        archive_comment: vars.status === "stop" ? vars.comment : null,
      };
      const { error } = await supabase.from("task_groups").update(payload as any).eq("id", groupId);
      if (error) throw error;
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: STM_KEYS.groups() });
      const opt = getStmLifecycleOption(vars.status);
      const snapshots = patchGroupInCache(qc, groupId, {
        stm_meta: { ...meta, lifecycle: vars.status },
        closed_at: opt.archives ? (archivedAt ?? new Date().toISOString()) : null,
        archive_comment: vars.status === "stop" ? vars.comment : null,
      } as any);
      return { snapshots };
    },
    onError: (e: any, _v, ctx: any) => {
      if (ctx?.snapshots) restoreGroupSnapshots(qc, ctx.snapshots);
      toast.error(e.message || "Не удалось сохранить статус");
    },
    onSuccess: (_d, vars) => {
      const opt = getStmLifecycleOption(vars.status);
      toast.success(opt.archives ? `«${opt.label}» — SKU в архиве` : `Статус: ${opt.label}`);
      setCommentOpen(false);
    },
  });

  const handleSelect = (status: StmLifecycle) => {
    if (status === current) return;
    const opt = getStmLifecycleOption(status);
    if (opt.requiresComment) {
      setCommentOpen(true);
      return;
    }
    mutation.mutate({ status, comment: null });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title={`Статус: ${currentOpt.label}`}
            className={cn(
              "shrink-0 inline-flex items-center gap-1 rounded border border-border bg-background/60 hover:bg-muted/50 hover:border-primary/40 transition-colors",
              compact ? "h-6 px-1.5" : "h-7 px-2",
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", TONE_DOT[currentOpt.tone])} aria-hidden />
            {!compact && (
              <span className={cn("text-[10px] font-medium leading-none", TONE_TEXT[currentOpt.tone])}>
                {currentOpt.label}
              </span>
            )}
            <ChevronDown className="h-3 w-3 text-muted-foreground/60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {STM_LIFECYCLE.map(opt => (
            <DropdownMenuItem
              key={opt.key}
              onSelect={(e) => { e.preventDefault(); handleSelect(opt.key); }}
              className="gap-2 text-xs"
            >
              <span className={cn("h-2 w-2 rounded-full shrink-0", TONE_DOT[opt.tone])} aria-hidden />
              <span className="flex-1">{opt.label}</span>
              {opt.archives && (
                <span className="text-[9px] uppercase tracking-wide text-muted-foreground/70">архив</span>
              )}
              {opt.key === current && <Check className="h-3.5 w-3.5 text-primary" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={commentOpen} onOpenChange={setCommentOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-destructive" aria-hidden />
              Стоп от сети
            </DialogTitle>
            <DialogDescription className="truncate">{groupName}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="stm-stop-comment" className="text-xs">
              Причина стопа <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="stm-stop-comment"
              autoFocus
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Почему сеть остановила SKU (обязательно)…"
              rows={4}
              className="resize-none"
            />
            <p className="text-[11px] text-muted-foreground">
              SKU уйдёт в архив. Комментарий сохранится в карточке.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCommentOpen(false)}>Отмена</Button>
            <Button
              variant="destructive"
              disabled={comment.trim().length === 0 || mutation.isPending}
              onClick={() => mutation.mutate({ status: "stop", comment: comment.trim() })}
            >
              {mutation.isPending ? "Сохранение…" : "В архив"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
