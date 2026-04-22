import React from "react";
import { cn } from "@/lib/utils";
import { StmMatrixCell } from "./StmMatrixCell";
import type { StmProject } from "../hooks/useStmProjects";
import type { StmStage } from "../lib/stages";
import { ChevronRight, ChevronDown, GanttChart } from "lucide-react";
import TaskItem from "@/components/TaskItem";

interface Props {
  project: StmProject;
  stages: StmStage[];
  expanded?: boolean;
  onToggleExpand?: (groupId: string) => void;
  onOpenGantt?: (groupId: string) => void;
}

function StmMatrixRowInner({ project, stages, expanded, onToggleExpand, onOpenGantt }: Props) {
  const { group, meta, currentStageKey, stageTasks, progress } = project;

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
          className="sticky left-0 z-[1] min-w-[260px] w-[260px] shrink-0 px-3 py-2.5 text-left bg-stm-card/95 backdrop-blur-md border-r border-stm-border/40 hover:bg-stm-card transition-colors"
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
          return (
            <div
              key={stage.key}
              className={cn(
                "min-w-[80px] w-[80px] shrink-0 p-1.5 border-r border-stm-border/20",
                stage.key === currentStageKey && "bg-stm-accent/5",
              )}
            >
              <StmMatrixCell task={task} isCurrent={stage.key === currentStageKey} />
            </div>
          );
        })}
      </div>

      {/* Expanded panel: each stage = a task with steps/deadlines/assignees */}
      {expanded && (
        <div className="sticky left-0 z-[1] bg-stm-bg/95 backdrop-blur-sm border-b border-stm-border/40 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] uppercase tracking-[0.15em] text-stm-fg/50 font-semibold">
              Этапы SKU · {stages.length} гейтов
            </div>
            <button
              type="button"
              onClick={() => onOpenGantt?.(group.id)}
              className="inline-flex items-center gap-1 text-[11px] text-stm-fg/60 hover:text-stm-accent transition-colors"
            >
              <GanttChart className="h-3 w-3" /> Открыть Гантт
            </button>
          </div>
          <div className="space-y-1 bg-background/60 rounded-lg p-2 border border-stm-border/30 max-w-5xl">
            {stages.map(stage => {
              const task = stageTasks.find(t => (t as any).stage_key === stage.key) ?? null;
              if (!task) {
                return (
                  <div key={stage.key} className="px-2 py-1.5 text-xs text-stm-fg/40 italic">
                    {stage.title} — задача ещё не создана
                  </div>
                );
              }
              return <TaskItem key={task.id} task={task} sortable={false} />;
            })}
          </div>
        </div>
      )}
    </>
  );
}

export const StmMatrixRow = React.memo(StmMatrixRowInner);