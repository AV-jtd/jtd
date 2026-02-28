import { useState, useRef } from "react";
import { type Task, type TaskGroup, type Subtask, useAvailableUsers } from "@/hooks/useTasks";
import { type Milestone } from "@/hooks/useMilestones";
import { cn } from "@/lib/utils";
import { Diamond, Plus, Check, X, ChevronRight, ChevronDown, CalendarIcon, User } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

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

type AddingState = {
  projectId: string;
  entityType: "task" | "subproject" | "step";
  taskId?: string; // for steps
} | null;

interface GanttLeftPanelProps {
  rows: GanttRow[];
  rowHeight: number;
  width: number;
  onMilestoneClick: (ms: Milestone) => void;
  onAddTask: (projectId: string, title: string) => void;
  onAddSubproject: (parentId: string, name: string) => void;
  onAddSubtask: (taskId: string, title: string) => void;
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
  onToggleTask: (id: string, completed: boolean) => void;
  collapsedProjects: Set<string>;
  onToggleCollapse: (projectId: string) => void;
  filterAssignee: string | null;
  hoveredRow: number | null;
  onHoverRow: (index: number | null) => void;
}

export default function GanttLeftPanel({
  rows, rowHeight, width, onMilestoneClick, onAddTask, onAddSubproject, onAddSubtask, onUpdateTask, onToggleTask,
  collapsedProjects, onToggleCollapse, filterAssignee, hoveredRow, onHoverRow,
}: GanttLeftPanelProps) {
  const { data: users = [] } = useAvailableUsers();
  const [editingField, setEditingField] = useState<{ rowIndex: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [adding, setAdding] = useState<AddingState>(null);
  const [newTitle, setNewTitle] = useState("");
  const [showTypeMenu, setShowTypeMenu] = useState<string | null>(null); // projectId for type dropdown
  const [assigneePopover, setAssigneePopover] = useState<string | null>(null); // taskId
  const [deadlinePopover, setDeadlinePopover] = useState<string | null>(null); // taskId

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

  const getUserInitials = (userId: string | null) => {
    if (!userId) return null;
    const u = users.find(u => u.id === userId);
    if (!u) return null;
    const name = u.display_name || u.email?.split("@")[0] || "?";
    return name.slice(0, 2).toUpperCase();
  };

  const getUserName = (userId: string | null) => {
    if (!userId) return "Не назначен";
    const u = users.find(u => u.id === userId);
    return u?.display_name || u?.email?.split("@")[0] || "—";
  };

  const handleSubmitNew = () => {
    if (!adding || !newTitle.trim()) return;
    if (adding.entityType === "task") {
      onAddTask(adding.projectId, newTitle.trim());
    } else if (adding.entityType === "subproject") {
      onAddSubproject(adding.projectId, newTitle.trim());
    } else if (adding.entityType === "step" && adding.taskId) {
      onAddSubtask(adding.taskId, newTitle.trim());
    }
    setNewTitle("");
    setAdding(null);
  };

  const startAdding = (projectId: string, entityType: "task" | "subproject" | "step", taskId?: string) => {
    setAdding({ projectId, entityType, taskId });
    setNewTitle("");
    setShowTypeMenu(null);
  };

  return (
    <div className="shrink-0 border-r border-border bg-card overflow-y-auto scrollbar-thin" style={{ width }}>
      {/* Header */}
      <div className="h-10 flex items-center border-b border-border text-xs font-medium text-muted-foreground sticky top-0 bg-card z-10">
        <div className="flex-1 px-3">Задача</div>
        <div className="w-9 px-0.5 text-center shrink-0">
          <User className="h-3 w-3 mx-auto" />
        </div>
        <div className="w-16 px-0.5 text-center shrink-0">Срок</div>
      </div>

      {rows.map((row, i) => {
        const dimmed = filterAssignee && row.type === "task" && row.task?.assigned_to !== filterAssignee;

        return (
          <div
            key={i}
            className={cn(
              "flex items-center border-b border-border/50 text-xs cursor-default group",
              row.type === "project" || row.type === "summary" ? "font-semibold text-foreground bg-muted/30" :
              row.type === "milestone" ? "text-primary font-medium italic" : "text-muted-foreground",
              dimmed && "opacity-30",
              hoveredRow === i && "bg-muted/40"
            )}
            style={{ height: rowHeight }}
            onMouseEnter={() => onHoverRow(i)}
            onMouseLeave={() => onHoverRow(null)}
          >
            {/* Name column */}
            <div
              className="flex-1 flex items-center gap-1 min-w-0 px-1"
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
                    <span className="text-[10px] text-muted-foreground ml-0.5 shrink-0">{Math.round(row.progress)}%</span>
                  )}

                  {/* Context "+" with type dropdown */}
                  <div className="relative ml-auto shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowTypeMenu(showTypeMenu === row.project.id ? null : row.project.id);
                      }}
                      className="p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                      title="Добавить..."
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                    {showTypeMenu === row.project.id && (
                      <div className="absolute right-0 top-5 z-30 bg-popover border border-border rounded-md shadow-lg py-0.5 min-w-[120px]">
                        <button
                          onClick={() => startAdding(row.project.id, "task")}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                        >
                          📝 Задача
                        </button>
                        <button
                          onClick={() => startAdding(row.project.id, "subproject")}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                        >
                          📁 Подпроект
                        </button>
                      </div>
                    )}
                  </div>
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
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    <button
                      onClick={() => onToggleTask(row.task!.id, !row.task!.is_completed)}
                      className={cn("h-3.5 w-3.5 rounded-sm border shrink-0 flex items-center justify-center",
                        row.task.is_completed ? "bg-primary border-primary" : "border-muted-foreground/40"
                      )}
                    >
                      {row.task.is_completed && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                    </button>
                    <span
                      className={cn("truncate cursor-text flex-1", row.task.is_completed && "line-through opacity-50")}
                      onDoubleClick={() => startEdit(i, "title", row.task!.title)}
                    >
                      {row.task.title}
                    </span>
                    {/* Add step button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startAdding(row.project.id, "step", row.task!.id);
                      }}
                      className="p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity shrink-0"
                      title="Добавить шаг"
                    >
                      <Plus className="h-2.5 w-2.5" />
                    </button>
                  </div>
                )
              ) : null}
            </div>

            {/* Assignee icon */}
            <div className="w-9 px-0.5 text-center shrink-0">
              {row.type === "task" && row.task && (
                <Popover open={assigneePopover === row.task.id} onOpenChange={(v) => setAssigneePopover(v ? row.task!.id : null)}>
                  <PopoverTrigger asChild>
                    <button
                      className={cn(
                        "h-5 w-5 rounded-full text-[8px] font-bold mx-auto flex items-center justify-center transition-colors",
                        row.task.assigned_to
                          ? "bg-primary/20 text-primary hover:bg-primary/30"
                          : "bg-muted text-muted-foreground/50 hover:bg-muted-foreground/20 hover:text-muted-foreground"
                      )}
                      title={getUserName(row.task.assigned_to)}
                    >
                      {getUserInitials(row.task.assigned_to) || <User className="h-2.5 w-2.5" />}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-1" side="left" align="start" sideOffset={4}>
                    <div className="text-[10px] font-medium text-muted-foreground px-2 py-1">Ответственный</div>
                    <button
                      onClick={() => { onUpdateTask(row.task!.id, { assigned_to: null }); setAssigneePopover(null); }}
                      className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted rounded-sm text-muted-foreground"
                    >
                      Без назначения
                    </button>
                    <div className="max-h-36 overflow-y-auto">
                      {users.map(u => (
                        <button
                          key={u.id}
                          onClick={() => { onUpdateTask(row.task!.id, { assigned_to: u.id }); setAssigneePopover(null); }}
                          className={cn(
                            "w-full text-left px-2 py-1.5 text-xs hover:bg-muted rounded-sm",
                            row.task!.assigned_to === u.id && "bg-primary/10 text-primary font-medium"
                          )}
                        >
                          {u.display_name || u.email}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>

            {/* Deadline clickable */}
            <div className="w-16 px-0.5 text-center shrink-0">
              {row.type === "task" && row.task && (
                <Popover open={deadlinePopover === row.task.id} onOpenChange={(v) => setDeadlinePopover(v ? row.task!.id : null)}>
                  <PopoverTrigger asChild>
                    <button
                      className={cn(
                        "text-[10px] px-1 py-0.5 rounded transition-colors truncate",
                        row.task.deadline
                          ? new Date(row.task.deadline) < new Date() && !row.task.is_completed
                            ? "text-destructive font-medium hover:bg-destructive/10"
                            : "text-muted-foreground hover:bg-muted"
                          : "text-muted-foreground/40 hover:bg-muted hover:text-muted-foreground"
                      )}
                      title={row.task.deadline ? format(parseISO(row.task.deadline), "d MMMM yyyy", { locale: ru }) : "Установить дедлайн"}
                    >
                      {row.task.deadline ? format(parseISO(row.task.deadline), "d MMM", { locale: ru }) : (
                        <CalendarIcon className="h-3 w-3 mx-auto" />
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" side="left" align="start" sideOffset={4}>
                    <Calendar
                      mode="single"
                      selected={row.task.deadline ? parseISO(row.task.deadline) : undefined}
                      onSelect={(date) => {
                        onUpdateTask(row.task!.id, { deadline: date ? date.toISOString() : null });
                        setDeadlinePopover(null);
                      }}
                      locale={ru}
                      className="rounded-md border"
                    />
                    {row.task.deadline && (
                      <div className="p-2 border-t">
                        <button
                          onClick={() => { onUpdateTask(row.task!.id, { deadline: null }); setDeadlinePopover(null); }}
                          className="w-full text-xs text-destructive hover:bg-destructive/10 rounded px-2 py-1"
                        >
                          Убрать дедлайн
                        </button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              )}
              {row.type === "milestone" && row.milestone && (
                <span className="text-[10px]">{format(parseISO(row.milestone.planned_date), "d MMM", { locale: ru })}</span>
              )}
            </div>
          </div>
        );
      })}

      {/* Inline add row */}
      {adding && (
        <div className="flex items-center gap-1 px-3 py-1 border-b border-border/50 bg-muted/20">
          <span className="text-[10px] text-muted-foreground shrink-0">
            {adding.entityType === "task" ? "📝" : adding.entityType === "subproject" ? "📁" : "✓"}
          </span>
          <form
            className="flex items-center gap-1 flex-1"
            onSubmit={e => { e.preventDefault(); handleSubmitNew(); }}
          >
            <input
              autoFocus
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Escape") { setAdding(null); setNewTitle(""); } }}
              onBlur={() => { if (!newTitle.trim()) { setAdding(null); } }}
              placeholder={
                adding.entityType === "task" ? "Новая задача..."
                : adding.entityType === "subproject" ? "Имя подпроекта..."
                : "Новый шаг..."
              }
              className="flex-1 h-6 text-xs bg-background border border-border rounded px-2 outline-none"
            />
            <button type="button" onClick={() => { setAdding(null); setNewTitle(""); }} className="p-0.5 text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
