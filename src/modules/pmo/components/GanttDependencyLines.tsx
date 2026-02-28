import { useMemo } from "react";
import type { GanttRow } from "./GanttLeftPanel";

interface Dependency {
  id: string;
  predecessor_id: string;
  successor_id: string;
  dependency_type: string;
  lag_days: number;
  predecessor_entity_type: string;
  successor_entity_type: string;
}

interface GanttDependencyLinesProps {
  rows: GanttRow[];
  dependencies: Dependency[];
  rowHeight: number;
  getBarStyle: (task: any) => { left: number; width: number };
  getMilestoneX?: (ms: any) => number;
  getSummaryBarStyle?: (start: Date, end: Date) => { left: number; width: number };
  criticalTaskIds?: Set<string>;
  onClickDependency?: (dep: Dependency) => void;
}

export default function GanttDependencyLines({ rows, dependencies, rowHeight, getBarStyle, getMilestoneX, getSummaryBarStyle, criticalTaskIds }: GanttDependencyLinesProps) {
  const lines = useMemo(() => {
    return dependencies.map(dep => {
      // Find predecessor row
      const predIdx = rows.findIndex(r => {
        if (dep.predecessor_entity_type === "task") return r.type === "task" && r.task?.id === dep.predecessor_id;
        if (dep.predecessor_entity_type === "milestone") return r.type === "milestone" && r.milestone?.id === dep.predecessor_id;
        if (dep.predecessor_entity_type === "project") return r.type === "project" && r.project?.id === dep.predecessor_id;
        return r.type === "task" && r.task?.id === dep.predecessor_id;
      });
      const succIdx = rows.findIndex(r => {
        if (dep.successor_entity_type === "task") return r.type === "task" && r.task?.id === dep.successor_id;
        if (dep.successor_entity_type === "milestone") return r.type === "milestone" && r.milestone?.id === dep.successor_id;
        if (dep.successor_entity_type === "project") return r.type === "project" && r.project?.id === dep.successor_id;
        return r.type === "task" && r.task?.id === dep.successor_id;
      });
      if (predIdx === -1 || succIdx === -1) return null;

      // Get start/end X for predecessor
      let startX = 0;
      const predRow = rows[predIdx];
      if (predRow.type === "task" && predRow.task) {
        const bar = getBarStyle(predRow.task);
        startX = bar.left + bar.width;
      } else if (predRow.type === "milestone" && predRow.milestone && getMilestoneX) {
        startX = getMilestoneX(predRow.milestone) + 10;
      } else if (predRow.type === "project" && predRow.summaryStart && predRow.summaryEnd && getSummaryBarStyle) {
        const bar = getSummaryBarStyle(predRow.summaryStart, predRow.summaryEnd);
        startX = bar.left + bar.width;
      }

      // Get end X for successor
      let endX = 0;
      const succRow = rows[succIdx];
      if (succRow.type === "task" && succRow.task) {
        const bar = getBarStyle(succRow.task);
        endX = bar.left;
      } else if (succRow.type === "milestone" && succRow.milestone && getMilestoneX) {
        endX = getMilestoneX(succRow.milestone) - 10;
      } else if (succRow.type === "project" && succRow.summaryStart && succRow.summaryEnd && getSummaryBarStyle) {
        const bar = getSummaryBarStyle(succRow.summaryStart, succRow.summaryEnd);
        endX = bar.left;
      }

      const startY = predIdx * rowHeight + rowHeight / 2;
      const endY = succIdx * rowHeight + rowHeight / 2;

      const midX = Math.max(startX + 8, (startX + endX) / 2);
      const path = `M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`;

      const isCritical = criticalTaskIds?.has(dep.predecessor_id) && criticalTaskIds?.has(dep.successor_id);

      return { id: dep.id, path, endX, endY, isCritical };
    }).filter(Boolean) as { id: string; path: string; endX: number; endY: number; isCritical: boolean }[];
  }, [rows, dependencies, rowHeight, getBarStyle, getMilestoneX, getSummaryBarStyle, criticalTaskIds]);

  if (lines.length === 0) return null;

  return (
    <svg className="absolute inset-0 pointer-events-none z-10" style={{ width: "100%", height: rows.length * rowHeight }}>
      <defs>
        <marker id="gantt-arrow" viewBox="0 0 6 6" refX="6" refY="3" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 6 3 L 0 6 Z" fill="hsl(var(--primary))" opacity="0.6" />
        </marker>
        <marker id="gantt-arrow-critical" viewBox="0 0 6 6" refX="6" refY="3" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 6 3 L 0 6 Z" fill="hsl(var(--destructive))" opacity="0.8" />
        </marker>
      </defs>
      {lines.map(l => (
        <path
          key={l.id}
          d={l.path}
          fill="none"
          stroke={l.isCritical ? "hsl(var(--destructive))" : "hsl(var(--primary))"}
          strokeWidth={l.isCritical ? "2" : "1.5"}
          strokeOpacity={l.isCritical ? "0.7" : "0.5"}
          markerEnd={l.isCritical ? "url(#gantt-arrow-critical)" : "url(#gantt-arrow)"}
        />
      ))}
    </svg>
  );
}
