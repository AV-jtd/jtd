import { useState } from "react";
import { type Task, type TaskGroup, useAvailableUsers } from "@/hooks/useTasks";
import { type Milestone } from "@/hooks/useMilestones";
import { cn } from "@/lib/utils";
import { Diamond, Plus, Check, X, ChevronRight, ChevronDown } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

export type GanttRow = {
  type: "project" | "task" | "milestone" | "summary";
  project: TaskGroup;
  task?: Task;
  milestone?: Milestone;
  depth: number;
  collapsed?: boolean;
  summaryStart?: Date;
  summaryEnd?: Date;
  progress?: number;
};

interface GanttLeftPanelProps {
  rows: GanttRow[];
  rowHeight: number;
  width: number;
  onMilestoneClick: (ms: Milestone) => void;
  onAddTask: (projectId: string, title: string) => void;
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
  onToggleTask: (id: string, completed: boolean) => void;
  collapsedProjects: Set<string>;
  onToggleCollapse: (projectId: string) => void;
  filterAssignee: string | null;
  hoveredRow: number | null;
  onHoverRow: (index: number | null) => void;
}

export default function GanttLeftPanel({
  rows, rowHeight, width, onMilestoneClick, onAddTask, onUpdateTask, onToggleTask,
  collapsedProjects, onToggleCollapse, filterAssignee, hoveredRow, onHoverRow,
}: GanttLeftPanelProps) {
  const { data: users = [] } = useAvailableUsers();
  const [editingField, setEditingField] = useState<{ rowIndex: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [addingTaskProject, setAddingTaskProject] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");

  const startEdit = (rowIndex: number, field: string, value: string) => {
    setEditingField({ rowIndex, field });
    setEditValue(value);
  };

  const commitEdit = (task: Task) => {
    if (!editingField) return;
    if (editingField.field === "title" && editValue.trim() && editValue.trim() !== task.title) {
      onUpdateTask(task.id, { title: editValue.trim() });
    }
    setEditingField(null);
  };

  const getUserName = (userId: string | null) => {
    if (!userId) return "—";
    const u = users.find(u => u.id === userId);
    return u?.display_name || u?.email?.split("@")[0] || "—";
  };

  return (
    <div className="shrink-0 border-r border-border bg-card overflow-y-auto scrollbar-thin" style={{ width }}>
      {/* Header */}
      <div className="h-10 flex items-center border-b border-border text-xs font-medium text-muted-foreground sticky top-0 bg-card z-10">
        <div className="flex-1 px-3">Задача</div>
        <div className="w-20 px-1 text-center shrink-0">Ответств.</div>
        <div className="w-20 px-1 text-center shrink-0">Дедлайн</div>
      </div>

      {rows.map((row, i) => {
        // Dim rows that don't match assignee filter
        const dimmed = filterAssignee && row.type === "task" && row.task?.assigned_to !== filterAssignee;

        return (
          <div
            key={i}
            className={cn(
              "flex items-center border-b border-border/50 text-xs cursor-default group",
              row.type === "project" || row.type === "summary" ? "font-semibold text-foreground bg-muted/30" :
              row.type === "milestone" ? "text-primary font-medium italic" : "text-muted-foreground hover:bg-muted/20",
              dimmed && "opacity-30"
            )}
            style={{ height: rowHeight }}
          >
            {/* Name column */}
            <div
              className="flex-1 flex items-center gap-1.5 min-w-0 px-1"
              style={{ paddingLeft: 8 + row.depth * 12 }}
            >
              {(row.type === "project" || row.type === "summary") ? (
                <>
                  <button
                    onClick={() => onToggleCollapse(row.project.id)}
                    className="p-0.5 rounded hover:bg-muted/50 shrink-0"
                  >
                    {collapsedProjects.has(row.project.id) ? (
                      <ChevronRight className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </button>
                  <span className="text-sm shrink-0">{row.project.icon && row.project.icon !== "list" ? row.project.icon : "📁"}</span>
                  <span className="truncate">{row.project.name}</span>
                  {row.progress !== undefined && (
                    <span className="text-[10px] text-muted-foreground ml-1 shrink-0">{Math.round(row.progress)}%</span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setAddingTaskProject(row.project.id); setNewTaskTitle(""); }}
                    className="ml-auto p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                    title="Добавить задачу"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </>
              ) : row.type === "milestone" ? (
                <div className="flex items-center gap-1.5 min-w-0 cursor-pointer" onClick={() => row.milestone && onMilestoneClick(row.milestone)}>
                  <Diamond className="h-3 w-3 shrink-0" style={{ color: row.milestone?.color || "#3b82f6" }} />
                  <span className="truncate">{row.milestone?.name}</span>
                </div>
              ) : row.task ? (
                editingField?.rowIndex === i && editingField.field === "title" ? (
                  <input
                    autoFocus
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onBlur={() => commitEdit(row.task!)}
                    onKeyDown={e => { if (e.key === "Enter") commitEdit(row.task!); if (e.key === "Escape") setEditingField(null); }}
                    className="w-full h-5 text-xs bg-background border border-border rounded px-1 outline-none"
                  />
                ) : (
                  <div className="flex items-center gap-1 min-w-0">
                    <button
                      onClick={() => onToggleTask(row.task!.id, !row.task!.is_completed)}
                      className={cn("h-3.5 w-3.5 rounded-sm border shrink-0 flex items-center justify-center",
                        row.task.is_completed ? "bg-primary border-primary" : "border-muted-foreground/40"
                      )}
                    >
                      {row.task.is_completed && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                    </button>
                    <span
                      className={cn("truncate cursor-text", row.task.is_completed && "line-through opacity-50")}
                      onDoubleClick={() => startEdit(i, "title", row.task!.title)}
                    >
                      {row.task.title}
                    </span>
                  </div>
                )
              ) : null}
            </div>

            {/* Assignee column */}
            <div className="w-20 px-1 text-center shrink-0 text-[10px] truncate">
              {row.type === "task" && row.task && (
                <span className="truncate">{getUserName(row.task.assigned_to)}</span>
              )}
            </div>

            {/* Deadline column */}
            <div className="w-20 px-1 text-center shrink-0 text-[10px]">
              {row.type === "task" && row.task?.deadline && (
                <span className={cn(
                  new Date(row.task.deadline) < new Date() && !row.task.is_completed && "text-destructive font-medium"
                )}>
                  {format(parseISO(row.task.deadline), "d MMM", { locale: ru })}
                </span>
              )}
              {row.type === "milestone" && row.milestone && (
                <span>{format(parseISO(row.milestone.planned_date), "d MMM", { locale: ru })}</span>
              )}
            </div>
          </div>
        );
      })}

      {/* Inline add task row */}
      {addingTaskProject && (
        <div className="flex items-center gap-1 px-3 py-1 border-b border-border/50">
          <form
            className="flex items-center gap-1 flex-1"
            onSubmit={e => {
              e.preventDefault();
              if (newTaskTitle.trim()) {
                onAddTask(addingTaskProject, newTaskTitle.trim());
                setNewTaskTitle("");
                setAddingTaskProject(null);
              }
            }}
          >
            <input
              autoFocus
              value={newTaskTitle}
              onChange={e => setNewTaskTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Escape") { setAddingTaskProject(null); setNewTaskTitle(""); } }}
              placeholder="Новая задача..."
              className="flex-1 h-6 text-xs bg-background border border-border rounded px-2 outline-none"
            />
            <button type="button" onClick={() => setAddingTaskProject(null)} className="p-0.5 text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
