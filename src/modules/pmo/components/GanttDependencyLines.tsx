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

export type DepStyleVariant = "bezier" | "dashed" | "gradient" | "dots";

interface GanttDependencyLinesProps {
  rows: GanttRow[];
  dependencies: Dependency[];
  rowHeight: number;
  rowTops?: number[];
  totalRowsHeight?: number;
  getRowHeight?: (i: number) => number;
  getBarStyle: (task: any) => { left: number; width: number };
  getMilestoneX?: (ms: any) => number;
  getSummaryBarStyle?: (start: Date, end: Date) => { left: number; width: number };
  criticalTaskIds?: Set<string>;
  depStyle?: DepStyleVariant;
  onClickDependency?: (dep: Dependency) => void;
}

export default function GanttDependencyLines({ rows, dependencies, rowHeight, rowTops, totalRowsHeight, getRowHeight, getBarStyle, getMilestoneX, getSummaryBarStyle, criticalTaskIds, depStyle = "bezier", onClickDependency }: GanttDependencyLinesProps) {
  const lines = useMemo(() => {
    return dependencies.map(dep => {
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

      const startY = rowTops ? rowTops[predIdx] + (getRowHeight ? getRowHeight(predIdx) : rowHeight) / 2 : predIdx * rowHeight + rowHeight / 2;
      const endY = rowTops ? rowTops[succIdx] + (getRowHeight ? getRowHeight(succIdx) : rowHeight) / 2 : succIdx * rowHeight + rowHeight / 2;
      const isCritical = criticalTaskIds?.has(dep.predecessor_id) && criticalTaskIds?.has(dep.successor_id);

      // Get project colors for gradient style
      const predColor = predRow.project?.color || "#3b82f6";
      const succColor = succRow.project?.color || "#3b82f6";

      return { id: dep.id, startX, startY, endX, endY, isCritical, dep, predColor, succColor };
    }).filter(Boolean) as { id: string; startX: number; startY: number; endX: number; endY: number; isCritical: boolean; dep: Dependency; predColor: string; succColor: string }[];
  }, [rows, dependencies, rowHeight, rowTops, getRowHeight, getBarStyle, getMilestoneX, getSummaryBarStyle, criticalTaskIds]);

  if (lines.length === 0) return null;

  const svgHeight = totalRowsHeight ?? rows.length * rowHeight;

  return (
    <svg className="absolute inset-0 pointer-events-none z-10" style={{ width: "100%", height: svgHeight }}>
      <defs>
        {/* Arrow markers */}
        <marker id="gantt-arrow" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 1 L 7 4 L 0 7 Z" fill="hsl(var(--primary))" opacity="0.5" />
        </marker>
        <marker id="gantt-arrow-critical" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 1 L 7 4 L 0 7 Z" fill="hsl(var(--destructive))" opacity="0.7" />
        </marker>
        <marker id="gantt-arrow-dashed" viewBox="0 0 6 6" refX="6" refY="3" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M 0 0.5 L 5.5 3 L 0 5.5 Z" fill="hsl(var(--muted-foreground))" opacity="0.5" />
        </marker>
        {/* Gradient defs per line */}
        {depStyle === "gradient" && lines.map(l => (
          <linearGradient key={`grad-${l.id}`} id={`grad-${l.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={l.isCritical ? "hsl(var(--destructive))" : l.predColor} stopOpacity="0.6" />
            <stop offset="100%" stopColor={l.isCritical ? "hsl(var(--destructive))" : l.succColor} stopOpacity="0.6" />
          </linearGradient>
        ))}
      </defs>

      {lines.map(l => {
        const { startX, startY, endX, endY, isCritical, dep, id } = l;
        const midX = Math.max(startX + 12, (startX + endX) / 2);
        const color = isCritical ? "hsl(var(--destructive))" : "hsl(var(--primary))";
        const opacity = isCritical ? 0.6 : 0.35;
        const sw = isCritical ? 1.5 : 1;

        // Build path based on style
        let pathD: string;
        if (depStyle === "bezier") {
          // Smooth S-curve
          const cx1 = startX + (midX - startX) * 0.7;
          const cx2 = endX - (midX - startX) * 0.7;
          pathD = `M ${startX} ${startY} C ${cx1} ${startY}, ${cx2} ${endY}, ${endX} ${endY}`;
        } else {
          // Orthogonal path for dashed/gradient/dots
          pathD = `M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`;
        }

        return (
          <g key={id}>
            {/* Hit area */}
            <path
              d={pathD}
              fill="none"
              stroke="transparent"
              strokeWidth="14"
              className="pointer-events-auto cursor-pointer"
              onClick={() => onClickDependency?.(dep)}
            />

            {/* Dots style: only show connectors, no lines */}
            {depStyle === "dots" ? (
              <>
                {/* Start dot */}
                <circle
                  cx={startX}
                  cy={startY}
                  r={isCritical ? 4 : 3}
                  fill={color}
                  opacity={isCritical ? 0.7 : 0.5}
                />
                {/* End dot with inner arrow */}
                <circle
                  cx={endX}
                  cy={endY}
                  r={isCritical ? 5 : 4}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.5}
                  opacity={isCritical ? 0.7 : 0.5}
                />
                <circle
                  cx={endX}
                  cy={endY}
                  r={isCritical ? 2.5 : 2}
                  fill={color}
                  opacity={isCritical ? 0.7 : 0.5}
                />
                {/* Subtle connecting line */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={color}
                  strokeWidth={0.5}
                  strokeOpacity={0.15}
                  strokeDasharray="2 4"
                />
              </>
            ) : depStyle === "dashed" ? (
              <path
                d={pathD}
                fill="none"
                stroke={color}
                strokeWidth={sw}
                strokeOpacity={opacity}
                strokeDasharray={isCritical ? "6 3" : "4 3"}
                markerEnd="url(#gantt-arrow-dashed)"
              />
            ) : depStyle === "gradient" ? (
              <path
                d={pathD}
                fill="none"
                stroke={`url(#grad-${id})`}
                strokeWidth={isCritical ? 2.5 : 2}
                strokeLinecap="round"
                markerEnd={isCritical ? "url(#gantt-arrow-critical)" : "url(#gantt-arrow)"}
              />
            ) : (
              /* bezier (default) */
              <path
                d={pathD}
                fill="none"
                stroke={color}
                strokeWidth={isCritical ? 1.5 : 1}
                strokeOpacity={opacity}
                strokeLinecap="round"
                markerEnd={isCritical ? "url(#gantt-arrow-critical)" : "url(#gantt-arrow)"}
              />
            )}

            {/* Dependency type label */}
            {(dep.dependency_type !== "FS" || dep.lag_days !== 0) && (() => {
              const labelX = (startX + endX) / 2;
              const labelY = (startY + endY) / 2 - 6;
              const label = dep.dependency_type + (dep.lag_days !== 0 ? ` ${dep.lag_days > 0 ? "+" : ""}${dep.lag_days}d` : "");
              return (
                <text
                  x={labelX}
                  y={labelY}
                  className="pointer-events-none"
                  fill="hsl(var(--muted-foreground))"
                  fontSize="9"
                  fontWeight="500"
                  textAnchor="middle"
                >
                  {label}
                </text>
              );
            })()}
          </g>
        );
      })}
    </svg>
  );
}
