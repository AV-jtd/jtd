import React, { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { StmMatrixCell } from "./StmMatrixCell";
import type { StmProject } from "../hooks/useStmProjects";
import type { StmStage } from "../lib/stages";
import { ChevronRight, ChevronDown, MessageSquare, Archive, RotateCcw } from "lucide-react";
import { StmExpandedRow } from "./StmExpandedRow";
import StmArchiveDialog from "./StmArchiveDialog";
import { Button } from "@/components/ui/button";

const RU_DATE_SHORT = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "";

interface Props {
  project: StmProject;
  stages: StmStage[];
  expanded?: boolean;
  onToggleExpand?: (groupId: string) => void;
  onOpenGantt?: (groupId: string) => void;
  activeStageKey?: string | null;
  onActiveStageChange?: (stageKey: string | null) => void;
}

function StmMatrixRowInner({ project, stages, expanded, onToggleExpand, onOpenGantt, activeStageKey, onActiveStageChange }: Props) {
  const { group, meta, currentStageKey, stageTasks, progress, archivedAt, archiveComment } = project;
  const isArchived = !!archivedAt;
  const [archiveOpen, setArchiveOpen] = useState(false);

  // Inline-editable SKU comment. Same field as in StmExpandedRow → changes
  // here are mirrored to the expanded card automatically (single source of truth).
  const qc = useQueryClient();
  const [commentDraft, setCommentDraft] = useState<string>(group.description ?? "");
  const [editingComment, setEditingComment] = useState(false);
  useEffect(() => {
    if (!editingComment) setCommentDraft(group.description ?? "");
  }, [group.id, group.description, editingComment]);
  const saveComment = useMutation({
    mutationFn: async (text: string) => {
      const { error } = await supabase
        .from("task_groups")
        .update({ description: text || null })
        .eq("id", group.id);
      if (error) throw error;
      return text;
    },
    onMutate: async (text: string) => {
      await qc.cancelQueries({ queryKey: ["task_groups"] });
      const snapshots: Array<[readonly unknown[], unknown]> = [];
      qc.getQueriesData<any[]>({ queryKey: ["task_groups"] }).forEach(([key, data]) => {
        if (!Array.isArray(data)) return;
        snapshots.push([key, data]);
        qc.setQueryData(
          key,
          data.map((g: any) => (g.id === group.id ? { ...g, description: text || null } : g)),
        );
      });
      return { snapshots };
    },
    onError: (_e, _v, ctx: any) => {
      ctx?.snapshots?.forEach(([key, data]: [readonly unknown[], unknown]) =>
        qc.setQueryData(key, data),
      );
    },
  });
  const commitComment = () => {
    setEditingComment(false);
    if ((commentDraft || "") !== (group.description || "")) {
      saveComment.mutate(commentDraft.trim());
    }
  };

  return (
    <>
      <div className={cn(
        "flex border-b border-stm-border/30 transition-colors",
        expanded ? "bg-stm-glass/30" : "hover:bg-stm-glass/20",
        isArchived && "opacity-60",
      )}>
        {/* Sticky SKU column */}
        <button
          type="button"
          onClick={() => onToggleExpand?.(group.id)}
          className="sticky left-0 z-[1] min-w-[320px] w-[320px] shrink-0 px-3 py-2.5 text-left bg-stm-card/95 backdrop-blur-md border-r border-stm-border/40 hover:bg-stm-card transition-colors"
          aria-expanded={!!expanded}
        >
          <div className="flex items-center gap-2">
            {expanded
              ? <ChevronDown className="h-3.5 w-3.5 text-stm-fg/60 shrink-0" />
              : <ChevronRight className="h-3.5 w-3.5 text-stm-fg/40 shrink-0" />}
            <span className="text-base">{group.icon || "🏷️"}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className={cn(
                  "text-sm font-medium text-stm-fg truncate",
                  isArchived && "line-through decoration-stm-fg/40",
                )}>{group.name}</div>
                {isArchived && (
                  <span
                    className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-stm-warn/15 border border-stm-warn/40 text-[9px] font-semibold uppercase tracking-wider text-stm-warn"
                    title={archiveComment || "Архив"}
                  >
                    <Archive className="h-2.5 w-2.5" />
                    Архив · {RU_DATE_SHORT(archivedAt)}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-stm-fg/50 truncate">
                {[meta.retailer, meta.brand, meta.drop].filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
            <div className="text-[10px] tabular-nums text-stm-fg/60 font-mono">{progress}%</div>
          </div>
        </button>

        {/* Stage cells — quick visual summary */}
        {stages.map(stage => {
          const task = stageTasks.find(t => (t as any).stage_key === stage.key) ?? null;
          const isMilestone = !!stage.milestoneKey;
          const milestoneLabel = stage.milestoneKey === "approved"
            ? "Утв."
            : stage.milestoneKey === "ordered"
              ? "Заказ"
              : undefined;
          return (
            <div
              key={stage.key}
              className={cn(
                "min-w-[80px] w-[80px] shrink-0 p-1.5 border-r border-stm-border/20 min-h-[68px]",
                stage.key === currentStageKey && "bg-stm-accent/5",
                isMilestone && "bg-stm-accent/[0.04] border-r-stm-accent/30",
              )}
            >
              <StmMatrixCell
                task={task}
                isCurrent={stage.key === currentStageKey}
                isMilestone={isMilestone}
                milestoneLabel={milestoneLabel}
              />
            </div>
          );
        })}

        {/* Right-side comment column — duplicates the SKU comment in the expanded card */}
        <div
          className="min-w-[260px] w-[260px] shrink-0 p-1.5 border-l border-stm-border/40 bg-stm-card/40 flex flex-col gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {isArchived && archiveComment && (
            <div className="px-2 py-1 rounded bg-stm-warn/10 border border-stm-warn/30 text-[10px] text-stm-warn/90 leading-snug line-clamp-2" title={archiveComment}>
              <span className="font-semibold">Архив:</span> {archiveComment}
            </div>
          )}
          {editingComment ? (
            <textarea
              autoFocus
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              onBlur={commitComment}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setCommentDraft(group.description ?? "");
                  setEditingComment(false);
                }
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commitComment();
              }}
              placeholder="Комментарий по SKU…"
              rows={2}
              className="w-full flex-1 min-h-[40px] bg-stm-glass/40 border border-stm-accent/40 rounded px-2 py-1 text-[11px] text-stm-fg placeholder:text-stm-fg/30 focus:outline-none focus:ring-1 focus:ring-stm-accent/60 resize-none"
            />
          ) : (
            <div className="flex items-stretch gap-1 flex-1 min-h-[40px]">
              <button
                type="button"
                onClick={() => setEditingComment(true)}
                className="group/cmt flex-1 min-w-0 flex items-start gap-1.5 text-left px-2 py-1 rounded border border-stm-border/30 bg-stm-glass/20 hover:bg-stm-glass/40 hover:border-stm-accent/40 transition-colors"
                title={group.description || "Добавить комментарий по SKU"}
              >
                <MessageSquare className={cn(
                  "h-3 w-3 shrink-0 mt-0.5 transition-colors",
                  group.description ? "text-stm-accent" : "text-stm-fg/30 group-hover/cmt:text-stm-accent",
                )} />
                <span className={cn(
                  "text-[11px] flex-1 leading-snug line-clamp-3 break-words",
                  group.description ? "text-stm-fg/80" : "text-stm-fg/40 italic",
                )}>
                  {group.description || "Добавить комментарий…"}
                </span>
              </button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setArchiveOpen(true)}
                className="h-auto w-7 shrink-0 text-stm-fg/40 hover:text-stm-warn hover:bg-stm-warn/10"
                title={isArchived ? "Вернуть из архива" : "В архив"}
              >
                {isArchived
                  ? <RotateCcw className="h-3.5 w-3.5" />
                  : <Archive className="h-3.5 w-3.5" />}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Expanded panel: each stage = a task with steps/deadlines/assignees */}
      {expanded && (
        <div className="sticky left-0 z-[1]">
          <StmExpandedRow
            project={project}
            stages={stages}
            onOpenGantt={onOpenGantt}
            activeStageKey={activeStageKey}
            onActiveStageChange={onActiveStageChange}
          />
        </div>
      )}

      <StmArchiveDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        groupId={group.id}
        groupName={group.name}
        unarchive={isArchived}
      />
    </>
  );
}

export const StmMatrixRow = React.memo(StmMatrixRowInner);