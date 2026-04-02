import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, GanttChart } from "lucide-react";
import { cn } from "@/lib/utils";
import { NPD_GATES, type Task, type TaskGroup } from "./types";

interface MatrixHeaderProps {
  project: TaskGroup;
  projectId: string;
  allTasks: Task[];
  projectGroupIds: Set<string>;
}

function MatrixHeaderInner({ project, projectId, allTasks, projectGroupIds }: MatrixHeaderProps) {
  const navigate = useNavigate();

  const allProjectTasks = allTasks.filter(task => {
    return task.group_id != null && projectGroupIds.has(task.group_id);
  });
  const total = allProjectTasks.length;
  const done = allProjectTasks.filter(t => t.is_completed).length;

  return (
    <header className="flex items-center h-12 px-4 border-b border-border bg-card shrink-0 gap-3">
      <button onClick={() => navigate("/npd")} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
        <ArrowLeft className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm leading-none">{project.icon && project.icon !== "list" ? project.icon : "🧪"}</span>
        <h1 className="text-sm font-bold text-foreground truncate">{project.name}</h1>
      </div>
      {total > 0 && (
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round((done / total) * 100)}%` }} />
          </div>
          <span className="text-[11px] text-muted-foreground font-mono">{done}/{total}</span>
        </div>
      )}
      <div className="flex-1" />
      <Link
        to={`/pmo?project=${projectId}`}
        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
      >
        <GanttChart className="h-3 w-3" />
        Гант
      </Link>
    </header>
  );
}

const MatrixHeader = React.memo(MatrixHeaderInner);
export default MatrixHeader;
