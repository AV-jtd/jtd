import React, { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { StmMatrixCell } from "./StmMatrixCell";
import type { StmProject } from "../hooks/useStmProjects";
import type { StmStage } from "../lib/stages";
import { ChevronRight, ChevronDown, MessageSquare, Archive } from "lucide-react";
import { StmExpandedRow } from "./StmExpandedRow";
import StmStatusControl from "./StmStatusControl";
import { getStmLifecycleOption } from "../lib/stages";
import { stmRowState, stmTimeInStage } from "../lib/stmAnalytics";

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
  /** Row density. "compact" renders a single-line dot row. */
  density?: "comfortable" | "compact";
}

function StmMatrixRowInner({ project, stages, expanded, onToggleExpand, onOpenGantt, activeStageKey, onActiveStageChange, density = "comfortable" }: Props) {
  const { group, meta, currentStageKey, stageTasks, progress, archivedAt, archiveComment, lifecycle } = project;
  const isArchived = !!archivedAt;
  const lifecycleOpt = getStmLifecycleOption(lifecycle);

  // Row state drives the left status strip + progress bar color.
  const state = stmRowState(project);
  const currentStage = currentStageKey ? stages.find(s => s.key === currentStageKey) : null;
  const timeInStage = stmTimeInStage(project);
  const stripClass =
    state === "overdue" ? "bg-destructive"
    : state === "blocked" ? "bg-warning"
    : state === "stuck" ? "bg-warning/60"
    : state === "done" ? "bg-success"
    : state === "active" ? "bg-primary"
    : "bg-border";
  const barClass =
    state === "overdue" ? "bg-destructive"
    : state === "blocked" ? "bg-warning"
    : state === "stuck" ? "bg-warning/70"
    : state === "done" ? "bg-success"
    : state === "active" ? "bg-primary"
    : "bg-muted-foreground/30";

  const isCompact = density === "compact";

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
      {isCompact ? (
        <div className={cn(
          "flex border-b border-border/60 transition-colors",
          expanded ? "bg-muted/40" : "hover:bg-muted/30",
          isArchived && "opacity-60",
        )}>
          {/* Sticky SKU column — single line */}
          <button
            type="button"
            onClick={() => onToggleExpand?.(group.id)}
            className="relative sticky left-0 z-[1] min-w-[320px] w-[320px] shrink-0 pl-4 pr-3 h-9 flex items-center gap-2 text-left bg-card border-r border-border hover:bg-muted/40 transition-colors"
            aria-expanded={!!expanded}
          >
            <span className={cn("absolute left-0 top-0 bottom-0 w-1", stripClass)} aria-hidden />
            {expanded
              ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
              : <ChevronRight className="h-3 w-3 text-muted-foreground/60 shrink-0" />}
            <span className="text-xs">{group.icon || "🏷️"}</span>
            <span className={cn(
              "text-[12px] font-medium text-foreground truncate flex-1 min-w-0",
              isArchived && "line-through decoration-muted-foreground",
            )}>{group.name}</span>
            {!isArchived && currentStage && progress < 100 && (
              <span className={cn(
                "shrink-0 text-[9px] px-1 py-0.5 rounded leading-none",
                state === "overdue" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
              )}>{currentStage.short}</span>
            )}
            {!isArchived && progress < 100 && (state === "blocked" || state === "stuck") && (
              <span className={cn(
                "shrink-0 text-[9px] px-1 py-0.5 rounded leading-none font-medium whitespace-nowrap",
                state === "blocked" ? "bg-warning/15 text-warning" : "bg-warning/10 text-warning/90",
              )} title={state === "blocked" ? "Этап заблокирован" : `Завис ${timeInStage} дн на этапе`}>
                {state === "blocked" ? "⛔" : `⏳${timeInStage ?? ""}`}
              </span>
            )}
            <span className="shrink-0 w-7 text-right text-[10px] tabular-nums font-mono text-muted-foreground">{progress}%</span>
          </button>

          {/* Stage dots */}
          {stages.map(stage => {
            const task = stageTasks.find(t => (t as any).stage_key === stage.key) ?? null;
            const isMilestone = !!stage.milestoneKey;
            return (
              <div
                key={stage.key}
                className={cn(
                  "min-w-[80px] w-[80px] shrink-0 h-9 border-r border-border/40",
                  stage.key === currentStageKey && "bg-primary/[0.04]",
                  isMilestone && "bg-primary/[0.03]",
                )}
              >
                <StmMatrixCell
                  compact
                  task={task}
                  isCurrent={stage.key === currentStageKey}
                  isMilestone={isMilestone}
                  groupId={group.id}
                  stageKey={stage.key}
                  stageTitle={stage.title}
                  flow={(meta?.flow === "out" ? "out" : "in")}
                />
              </div>
            );
          })}

          {/* Comment column — compact indicator */}
          <div className="min-w-[260px] w-[260px] shrink-0 h-9 px-3 border-l border-border bg-card flex items-center gap-2">
            <MessageSquare className={cn(
              "h-3 w-3 shrink-0",
              group.description ? "text-primary" : "text-muted-foreground/30",
            )} />
            <span className={cn(
              "text-[11px] truncate flex-1 min-w-0",
              group.description ? "text-foreground/70" : "text-muted-foreground/40 italic",
            )}>
              {group.description || "—"}
            </span>
          </div>
        </div>
      ) : (
      <div className={cn(
        "flex border-b border-border transition-colors",
        expanded ? "bg-muted/40" : "hover:bg-muted/30",
        isArchived && "opacity-60",
      )}>
        {/* Sticky SKU column */}
        <button
          type="button"
          onClick={() => onToggleExpand?.(group.id)}
          className="group/sku relative sticky left-0 z-[1] min-w-[320px] w-[320px] shrink-0 pl-4 pr-3 py-2.5 text-left bg-card border-r border-border hover:bg-muted/40 transition-colors"
          aria-expanded={!!expanded}
        >
          {/* Left state strip */}
          <span className={cn("absolute left-0 top-0 bottom-0 w-1", stripClass)} aria-hidden />
          <div className="flex items-center gap-2">
            {expanded
              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />}
            <span className="text-base">{group.icon || "🏷️"}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className={cn(
                  "text-sm font-semibold text-foreground truncate",
                  isArchived && "line-through decoration-muted-foreground",
                )}>{group.name}</div>
                {isArchived && (
                  <span
                    className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-warning/15 border border-warning/40 text-[9px] font-semibold uppercase tracking-wider text-warning"
                    title={archiveComment || lifecycleOpt.label}
                  >
                    <Archive className="h-2.5 w-2.5" />
                    {lifecycleOpt.label} · {RU_DATE_SHORT(archivedAt)}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground truncate">
                {[meta.retailer, meta.brand, meta.drop].filter(Boolean).join(" · ") || "—"}
              </div>
              {/* Progress bar + current stage badge */}
              <div className="flex items-center gap-2 mt-1.5">
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", barClass)}
                    style={{ width: `${Math.max(progress, progress > 0 ? 4 : 0)}%` }}
                  />
                </div>
                <span className="text-[10px] tabular-nums text-muted-foreground font-mono w-8 text-right">{progress}%</span>
              </div>
              {!isArchived && currentStage && progress < 100 && (
                <div className="mt-1">
                  <span className={cn(
                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium",
                    state === "overdue"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-primary/10 text-primary",
                  )}>
                    сейчас: {currentStage.short}
                  </span>
                  {(state === "blocked" || state === "stuck") && (
                    <span className={cn(
                      "ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium",
                      state === "blocked" ? "bg-warning/15 text-warning" : "bg-warning/10 text-warning/90",
                    )} title={state === "blocked" ? "Этап заблокирован" : "Завис на этапе"}>
                      {state === "blocked"
                        ? "⛔ заблокирован"
                        : `⏳ ${timeInStage} дн на этапе`}
                    </span>
                  )}
                </div>
              )}
            </div>
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
                "min-w-[80px] w-[80px] shrink-0 p-1.5 border-r border-border/50 min-h-[68px]",
                stage.key === currentStageKey && "bg-primary/[0.04]",
                isMilestone && "bg-primary/[0.03] border-r-primary/20",
              )}
            >
              <StmMatrixCell
                task={task}
                isCurrent={stage.key === currentStageKey}
                isMilestone={isMilestone}
                milestoneLabel={milestoneLabel}
                groupId={group.id}
                stageKey={stage.key}
                stageTitle={stage.title}
                flow={(meta?.flow === "out" ? "out" : "in")}
              />
            </div>
          );
        })}

        {/* Right-side comment column — duplicates the SKU comment in the expanded card */}
        <div
          className="min-w-[260px] w-[260px] shrink-0 p-1.5 border-l border-border bg-card flex flex-col gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {isArchived && archiveComment && (
            <div className="px-2 py-1 rounded bg-warning/10 border border-warning/30 text-[10px] text-warning leading-snug line-clamp-2" title={archiveComment}>
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
              className="w-full flex-1 min-h-[40px] bg-background border border-primary/40 rounded px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/60 resize-none"
            />
          ) : (
            <div className="flex items-stretch gap-1 flex-1 min-h-[40px]">
              <button
                type="button"
                onClick={() => setEditingComment(true)}
                className="group/cmt flex-1 min-w-0 flex items-start gap-1.5 text-left px-2 py-1 rounded border border-border bg-background/60 hover:bg-muted/50 hover:border-primary/40 transition-colors"
                title={group.description || "Добавить комментарий по SKU"}
              >
                <MessageSquare className={cn(
                  "h-3 w-3 shrink-0 mt-0.5 transition-colors",
                  group.description ? "text-primary" : "text-muted-foreground/50 group-hover/cmt:text-primary",
                )} />
                <span className={cn(
                  "text-[11px] flex-1 leading-snug line-clamp-3 break-words",
                  group.description ? "text-foreground/80" : "text-muted-foreground/60 italic",
                )}>
                  {group.description || "Добавить комментарий…"}
                </span>
              </button>
              <StmStatusControl
                groupId={group.id}
                groupName={group.name}
                meta={meta}
                current={lifecycle}
                archivedAt={archivedAt}
              />
            </div>
          )}
        </div>
      </div>
      )}

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