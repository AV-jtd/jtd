import { useMemo } from "react";
import type { GanttRow } from "./GanttLeftPanel";
import type { EntityType } from "@/hooks/useDependencies";

interface Dependency {
  id: string;
  predecessor_id: string;
  successor_id: string;
  dependency_type: string;
  lag_days: number;
  predecessor_entity_type: EntityType;
  successor_entity_type: EntityType;
}

interface GanttDependencyLinesProps {
  rows: GanttRow[];
  dependencies: Dependency[];
  rowHeight: number;
  getBarStyle: (task: any) => { left: number; width: number };
  getMilestoneX?: (ms: any) => number;
  getSummaryBarStyle?: (start: Date, end: Date) => { left: number; width: number };
  criticalTaskIds?: Set<string>;
}

function findRowIndex(rows: GanttRow[], entityId: string, entityType: EntityType): number {
  return rows.findIndex(r => {
    if (entityType === "task") return r.type === "task" && r.task?.id === entityId;
    if (entityType === "milestone") return r.type === "milestone" && r.milestone?.id === entityId;
    if (entityType === "project") return r.type === "project" && r.project?.id === entityId;
    return false;
  });
}

function getEndpointX(
  row: GanttRow,
  entityType: EntityType,
  side: "start" | "end",
  getBarStyle: (task: any) => { left: number; width: number },
  getMilestoneX?: (ms: any) => number,
  getSummaryBarStyle?: (start: Date, end: Date) => { left: number; width: number },
): number {
  if (entityType === "task" && row.task) {
    const bar = getBarStyle(row.task);
    return side === "end" ? bar.left + bar.width : bar.left;
  }
  if (entityType === "milestone" && row.milestone && getMilestoneX) {
    return getMilestoneX(row.milestone);
  }
  if (entityType === "project" && row.summaryStart && row.summaryEnd && getSummaryBarStyle) {
    const bar = getSummaryBarStyle(row.summaryStart, row.summaryEnd);
    return side === "end" ? bar.left + bar.width : bar.left;
  }
  return 0;
}

export default function GanttDependencyLines({
  rows, dependencies, rowHeight, getBarStyle, getMilestoneX, getSummaryBarStyle, criticalTaskIds
}: GanttDependencyLinesProps) {
  const lines = useMemo(() => {
    return dependencies.map(dep => {
      const predType = dep.predecessor_entity_type || "task";
      const succType = dep.successor_entity_type || "task";
      const predIdx = findRowIndex(rows, dep.predecessor_id, predType);
      const succIdx = findRowIndex(rows, dep.successor_id, succType);
      if (predIdx === -1 || succIdx === -1) return null;

      const predRow = rows[predIdx];
      const succRow = rows[succIdx];

      const startX = getEndpointX(predRow, predType, "end", getBarStyle, getMilestoneX, getSummaryBarStyle);
      const startY = predIdx * rowHeight + rowHeight / 2;
      const endX = getEndpointX(succRow, succType, "start", getBarStyle, getMilestoneX, getSummaryBarStyle);
      const endY = succIdx * rowHeight + rowHeight / 2;

      const midX = Math.max(startX + 8, (startX + endX) / 2);
      const path = `M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`;

      const isCritical = predType === "task" && succType === "task"
        && criticalTaskIds?.has(dep.predecessor_id) && criticalTaskIds?.has(dep.successor_id);

      const depType = dep.dependency_type || "FS";
      const lagLabel = dep.lag_days > 0 ? `+${dep.lag_days}д` : "";
      const label = depType !== "FS" || dep.lag_days > 0 ? `${depType}${lagLabel}` : "";

      return { id: dep.id, path, endX, endY, startX, startY, midX, isCritical, label };
    }).filter(Boolean) as {
      id: string; path: string; endX: number; endY: number;
      startX: number; startY: number; midX: number; isCritical: boolean; label: string;
    }[];
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
        <g key={l.id}>
          <path
            d={l.path}
            fill="none"
            stroke={l.isCritical ? "hsl(var(--destructive))" : "hsl(var(--primary))"}
            strokeWidth={l.isCritical ? "2" : "1.5"}
            strokeOpacity={l.isCritical ? "0.7" : "0.5"}
            markerEnd={l.isCritical ? "url(#gantt-arrow-critical)" : "url(#gantt-arrow)"}
          />
          {l.label && (
            <text
              x={l.midX}
              y={Math.min(l.startY, l.endY) + (Math.abs(l.endY - l.startY) / 2) - 4}
              fontSize="9"
              fill="hsl(var(--muted-foreground))"
              textAnchor="middle"
              className="select-none"
            >
              {l.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
