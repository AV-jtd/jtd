import { useMemo } from "react";
import type { GanttRow } from "./GanttLeftPanel";

interface Dependency {
  id: string;
  predecessor_id: string;
  successor_id: string;
  dependency_type: string;
  lag_days: number;
}

interface GanttDependencyLinesProps {
  rows: GanttRow[];
  dependencies: Dependency[];
  rowHeight: number;
  getBarStyle: (task: any) => { left: number; width: number };
}

export default function GanttDependencyLines({ rows, dependencies, rowHeight, getBarStyle }: GanttDependencyLinesProps) {
  const lines = useMemo(() => {
    return dependencies.map(dep => {
      const predIdx = rows.findIndex(r => r.type === "task" && r.task?.id === dep.predecessor_id);
      const succIdx = rows.findIndex(r => r.type === "task" && r.task?.id === dep.successor_id);
      if (predIdx === -1 || succIdx === -1) return null;

      const predTask = rows[predIdx].task!;
      const succTask = rows[succIdx].task!;
      const predBar = getBarStyle(predTask);
      const succBar = getBarStyle(succTask);

      // FS: end of predecessor → start of successor
      const startX = predBar.left + predBar.width;
      const startY = predIdx * rowHeight + rowHeight / 2;
      const endX = succBar.left;
      const endY = succIdx * rowHeight + rowHeight / 2;

      // Build path with right-angle connectors
      const midX = Math.max(startX + 8, (startX + endX) / 2);
      const path = `M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`;

      return { id: dep.id, path, endX, endY };
    }).filter(Boolean) as { id: string; path: string; endX: number; endY: number }[];
  }, [rows, dependencies, rowHeight, getBarStyle]);

  if (lines.length === 0) return null;

  return (
    <svg className="absolute inset-0 pointer-events-none z-10" style={{ width: "100%", height: rows.length * rowHeight }}>
      <defs>
        <marker id="gantt-arrow" viewBox="0 0 6 6" refX="6" refY="3" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 6 3 L 0 6 Z" fill="hsl(var(--primary))" opacity="0.6" />
        </marker>
      </defs>
      {lines.map(l => (
        <path
          key={l.id}
          d={l.path}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="1.5"
          strokeOpacity="0.5"
          markerEnd="url(#gantt-arrow)"
        />
      ))}
    </svg>
  );
}
