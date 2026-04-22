import React, { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { StmMatrixCell } from "./StmMatrixCell";
import type { StmProject } from "../hooks/useStmProjects";
import type { StmStage } from "../lib/stages";
import { ChevronRight, ChevronDown, MessageSquare } from "lucide-react";
import { StmExpandedRow } from "./StmExpandedRow";

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
  const { group, meta, currentStageKey, stageTasks, progress } = project;

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
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task_groups"] });
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
              <div className="text-sm font-medium text-stm-fg truncate">{group.name}</div>
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
          className="min-w-[260px] w-[260px] shrink-0 p-1.5 border-l border-stm-border/40 bg-stm-card/40"
          onClick={(e) => e.stopPropagation()}
        >
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
              className="w-full h-full min-h-[56px] bg-stm-glass/40 border border-stm-accent/40 rounded px-2 py-1 text-[11px] text-stm-fg placeholder:text-stm-fg/30 focus:outline-none focus:ring-1 focus:ring-stm-accent/60 resize-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingComment(true)}
              className="group/cmt w-full h-full min-h-[56px] flex items-start gap-1.5 text-left px-2 py-1 rounded border border-stm-border/30 bg-stm-glass/20 hover:bg-stm-glass/40 hover:border-stm-accent/40 transition-colors"
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
    </>
  );
}

export const StmMatrixRow = React.memo(StmMatrixRowInner);