import React from "react";
import { cn } from "@/lib/utils";
import { StmMatrixCell } from "./StmMatrixCell";
import type { StmProject } from "../hooks/useStmProjects";
import type { StmStage } from "../lib/stages";
import { ChevronRight, ChevronDown } from "lucide-react";
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
          return (
            <div
              key={stage.key}
              className={cn(
                "min-w-[80px] w-[80px] shrink-0 p-1.5 border-r border-stm-border/20",
                stage.key === currentStageKey && "bg-stm-accent/5",
                isMilestone && "bg-stm-accent/[0.04] border-r-stm-accent/30",
              )}
            >
              <StmMatrixCell task={task} isCurrent={stage.key === currentStageKey} />
            </div>
          );
        })}
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