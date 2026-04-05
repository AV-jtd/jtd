import { useState, useRef, forwardRef, useCallback } from "react";
import { type Task, type TaskGroup, type Subtask, useAvailableUsers } from "@/hooks/useTasks";
import { type Milestone } from "@/hooks/useMilestones";
import { cn } from "@/lib/utils";
import { Diamond, Plus, Check, X, ChevronRight, ChevronDown, CalendarIcon, User, ArrowRightLeft, GripVertical, Link2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type GanttRow = {
  type: "project" | "task" | "milestone" | "summary" | "subtask";
  project: TaskGroup;
  task?: Task;
  milestone?: Milestone;
  subtask?: Subtask;
  parentTask?: Task;
  depth: number;
  collapsed?: boolean;
  summaryStart?: Date;
  summaryEnd?: Date;
  progress?: number;
  rowNumber?: number; // sequential task/subtask number
};

type AddingState = {
  projectId: string;
  entityType: "task" | "subproject" | "step";
  taskId?: string;
} | null;

interface Dependency {
  id: string;
  predecessor_id: string;
  successor_id: string;
  dependency_type: string;
  lag_days: number;
  predecessor_entity_type: string;
  successor_entity_type: string;
}

interface GanttLeftPanelProps {
  rows: GanttRow[];
  rowHeight: number;
  width: number;
  allProjects: TaskGroup[];
  dependencies?: Dependency[];
  onMilestoneClick: (ms: Milestone) => void;
  onAddTask: (projectId: string, title: string) => void;
  onAddSubproject: (parentId: string, name: string) => void;
  onAddSubtask: (taskId: string, title: string) => void;
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
  onToggleTask: (id: string, completed: boolean) => void;
  onUpdateSubtask: (id: string, updates: Partial<Subtask>) => void;
  onToggleSubtask: (id: string, completed: boolean) => void;
  onMoveTask: (taskId: string, newGroupId: string) => void;
  onMoveProject: (projectId: string, newParentId: string | null) => void;
  onReorderTask?: (taskId: string, newPosition: number, newGroupId: string) => void;
  onCreateDependency?: (predecessorId: string, successorId: string) => void;
  collapsedProjects: Set<string>;
  onToggleCollapse: (projectId: string) => void;
  filterAssignee: string | null;
  hoveredRow: number | null;
  onHoverRow: (index: number | null) => void;
  onScroll?: (scrollTop: number) => void;
}

const GanttLeftPanel = forwardRef<HTMLDivElement, GanttLeftPanelProps>(function GanttLeftPanel({
  rows, rowHeight, width, allProjects, dependencies = [], onMilestoneClick, onAddTask, onAddSubproject, onAddSubtask, onUpdateTask, onToggleTask, onUpdateSubtask, onToggleSubtask,
  onMoveTask, onMoveProject, onReorderTask, onCreateDependency, collapsedProjects, onToggleCollapse, filterAssignee, hoveredRow, onHoverRow, onScroll,
}, ref) {
  const { data: users = [] } = useAvailableUsers();
  const [editingField, setEditingField] = useState<{ rowIndex: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [adding, setAdding] = useState<AddingState>(null);
  const [newTitle, setNewTitle] = useState("");
  const [showTypeMenu, setShowTypeMenu] = useState<string | null>(null);
  const [assigneePopover, setAssigneePopover] = useState<string | null>(null);
  const [deadlinePopover, setDeadlinePopover] = useState<string | null>(null);
  const [predPopover, setPredPopover] = useState<string | null>(null); // for predecessor picker

  // DnD state
  const [dragRowIdx, setDragRowIdx] = useState<number | null>(null);
  const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null);

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

  // Build row number → id map for predecessor display
  const rowNumberMap = new Map<string, number>();
  rows.forEach(r => {
    if (r.rowNumber !== undefined) {
      const id = r.task?.id || r.subtask?.id || r.milestone?.id;
      if (id) rowNumberMap.set(id, r.rowNumber);
    }
  });

  // Get predecessors for a given entity
  const getPredecessors = (entityId: string) => {
    return dependencies.filter(d => d.successor_id === entityId);
  };

  // Format predecessor display
  const formatPredecessors = (entityId: string) => {
    const preds = getPredecessors(entityId);
    if (preds.length === 0) return "";
    return preds.map(p => {
      const num = rowNumberMap.get(p.predecessor_id);
      const suffix = p.dependency_type !== "FS" ? p.dependency_type : "";
      const lag = p.lag_days !== 0 ? `${p.lag_days > 0 ? "+" : ""}${p.lag_days}` : "";
      return `${num ?? "?"}${suffix}${lag}`;
    }).join(", ");
  };

  // DnD handlers
  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDragRowIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTargetIdx(idx);
  };

  const handleDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (dragRowIdx === null || dragRowIdx === targetIdx) {
      setDragRowIdx(null);
      setDropTargetIdx(null);
      return;
    }
    const srcRow = rows[dragRowIdx];
    const tgtRow = rows[targetIdx];
    
    if (srcRow?.type === "task" && srcRow.task && tgtRow && onReorderTask) {
      // Determine target group and position
      const targetGroupId = tgtRow.type === "project" ? tgtRow.project.id : tgtRow.project.id;
      const targetPosition = tgtRow.task?.position ?? targetIdx;
      onReorderTask(srcRow.task.id, targetPosition, targetGroupId);
    }
    setDragRowIdx(null);
    setDropTargetIdx(null);
  };

  const handleDragEnd = () => {
    setDragRowIdx(null);
    setDropTargetIdx(null);
  };

  // Get all task rows for predecessor picker
  const taskRows = rows.filter(r => r.type === "task" && r.task && r.rowNumber !== undefined);

  return (
    <div
      ref={ref}
      className="shrink-0 border-r border-border bg-card overflow-y-auto scrollbar-thin"
      style={{ width, overscrollBehavior: "auto", touchAction: "pan-y" }}
      onScroll={(e) => onScroll?.((e.target as HTMLDivElement).scrollTop)}
    >
      {/* Header */}
      <div className="flex items-center border-b border-border text-xs font-medium text-muted-foreground sticky top-0 bg-card z-10" style={{ height: 52 }}>
        <div className="w-7 text-center shrink-0 text-[10px]">#</div>
        <div className="flex-1 px-1 min-w-0">Задача</div>
        <div className="w-8 text-center shrink-0">
          <User className="h-3 w-3 mx-auto" />
        </div>
        <div className="w-[50px] text-center shrink-0 text-[10px]">Старт</div>
        <div className="w-[50px] text-center shrink-0 text-[10px]">Срок</div>
        <div className="w-[42px] text-center shrink-0 text-[10px]" title="Предшественник">
          <Link2 className="h-3 w-3 mx-auto" />
        </div>
      </div>

      {rows.map((row, i) => {
        const dimmed = filterAssignee && (
          (row.type === "task" && row.task?.assigned_to !== filterAssignee) ||
          (row.type === "subtask" && row.subtask?.assigned_to !== filterAssignee)
        );
        const entityId = row.task?.id || row.subtask?.id || row.milestone?.id;
        const isDraggable = row.type === "task";
        const isDropTarget = dropTargetIdx === i;

        return (
          <div
            key={i}
            className={cn(
              "flex items-center border-b border-border/50 text-xs cursor-default group",
              row.type === "project" || row.type === "summary" ? "font-semibold text-foreground bg-muted/30" :
              row.type === "milestone" ? "text-primary font-medium italic" : "text-muted-foreground",
              dimmed && "opacity-30",
              hoveredRow === i && "bg-muted/40",
              dragRowIdx === i && "opacity-30",
              isDropTarget && dragRowIdx !== null && "border-t-2 border-t-primary"
            )}
            style={{ height: rowHeight }}
            onMouseEnter={() => onHoverRow(i)}
            onMouseLeave={() => onHoverRow(null)}
            draggable={isDraggable}
            onDragStart={isDraggable ? (e) => handleDragStart(e, i) : undefined}
            onDragOver={(e) => handleDragOver(e, i)}
            onDrop={(e) => handleDrop(e, i)}
            onDragEnd={handleDragEnd}
          >
            {/* Row number */}
            <div className="w-7 text-center shrink-0 text-[10px] text-muted-foreground/50 flex items-center justify-center gap-0">
              {isDraggable && (
                <GripVertical className="h-3 w-3 text-muted-foreground/30 cursor-grab shrink-0" />
              )}
              {row.rowNumber !== undefined && (
                <span>{row.rowNumber}</span>
              )}
            </div>

            {/* Name column */}
            <div
              className="flex-1 flex items-center gap-1 min-w-0 px-1"
              style={{ paddingLeft: Math.max(2, row.depth * 10) }}
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
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="truncate font-medium">{row.project.name}</span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">
                        {row.project.name}
                        {row.progress !== undefined && <span className="ml-1 text-muted-foreground">({Math.round(row.progress)}%)</span>}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  {row.progress !== undefined && (
                    <span className="text-[10px] text-muted-foreground ml-0.5 shrink-0">{Math.round(row.progress)}%</span>
                  )}

                  {/* Move project */}
                  {(row.depth > 0 || !row.project.parent_id) && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity shrink-0"
                          title="Переместить проект"
                        >
                          <ArrowRightLeft className="h-2.5 w-2.5" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-48 p-1" side="right" align="start" sideOffset={4}>
                        <div className="text-[10px] font-medium text-muted-foreground px-2 py-1">Переместить в проект</div>
                        <button
                          onClick={() => onMoveProject(row.project.id, null)}
                          className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted rounded-sm text-muted-foreground"
                        >
                          📂 Корневой уровень
                        </button>
                        <div className="max-h-48 overflow-y-auto">
                          {allProjects.filter(p => p.id !== row.project.id && p.parent_id !== row.project.id).map(p => (
                            <button
                              key={p.id}
                              onClick={() => onMoveProject(row.project.id, p.id)}
                              className={cn(
                                "w-full text-left px-2 py-1.5 text-xs hover:bg-muted rounded-sm truncate",
                                row.project.parent_id === p.id && "bg-primary/10 text-primary font-medium"
                              )}
                            >
                              {p.icon && p.icon !== "list" ? `${p.icon} ` : "📁 "}{p.name}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}

                  {/* "+" menu */}
                  <div className="relative ml-auto shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowTypeMenu(showTypeMenu === row.project.id ? null : row.project.id);
                      }}
                      className="p-0.5 rounded opacity-60 hover:opacity-100 hover:bg-muted/50 transition-opacity"
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
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="truncate">{row.milestone?.name}</span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">{row.milestone?.name}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              ) : row.type === "subtask" && row.subtask ? (
                <div className="flex items-center gap-1 min-w-0 flex-1">
                  <button
                    onClick={() => onToggleSubtask(row.subtask!.id, !row.subtask!.is_completed)}
                    className={cn("h-3 w-3 rounded-sm border shrink-0 flex items-center justify-center",
                      row.subtask.is_completed ? "bg-primary/60 border-primary/60" : "border-muted-foreground/30"
                    )}
                  >
                    {row.subtask.is_completed && <Check className="h-2 w-2 text-primary-foreground" />}
                  </button>
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={cn("truncate text-[11px] flex-1", row.subtask.is_completed && "line-through opacity-40")}>
                          {row.subtask.title}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">{row.subtask.title}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
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
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className={cn("truncate cursor-text flex-1", row.task.is_completed && "line-through opacity-50")}
                            onDoubleClick={() => startEdit(i, "title", row.task!.title)}
                          >
                            {row.task.title}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-sm text-xs p-2">
                          <div className="font-medium">{row.task.title}</div>
                          {row.task.description && <div className="text-muted-foreground mt-0.5 line-clamp-2">{row.task.description}</div>}
                          {row.task.original_deadline && row.task.deadline && row.task.original_deadline !== row.task.deadline && (
                            <div className="text-amber-500 text-[10px] mt-0.5">
                              Перенос: {format(parseISO(row.task.original_deadline), "d MMM", { locale: ru })} → {format(parseISO(row.task.deadline), "d MMM", { locale: ru })}
                            </div>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    {/* Move task */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity shrink-0"
                          title="Переместить в проект"
                        >
                          <ArrowRightLeft className="h-2.5 w-2.5" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-48 p-1" side="right" align="start" sideOffset={4}>
                        <div className="text-[10px] font-medium text-muted-foreground px-2 py-1">Переместить в проект</div>
                        <div className="max-h-48 overflow-y-auto">
                          {allProjects.filter(p => p.id !== row.task!.group_id).map(p => (
                            <button
                              key={p.id}
                              onClick={() => onMoveTask(row.task!.id, p.id)}
                              className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted rounded-sm truncate"
                            >
                              {p.icon && p.icon !== "list" ? `${p.icon} ` : "📁 "}{p.name}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    {/* Add step */}
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
            <div className="w-8 text-center shrink-0">
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
              {row.type === "subtask" && row.subtask && (
                <Popover open={assigneePopover === row.subtask.id} onOpenChange={(v) => setAssigneePopover(v ? row.subtask!.id : null)}>
                  <PopoverTrigger asChild>
                    <button
                      className={cn(
                        "h-4 w-4 rounded-full text-[7px] font-bold mx-auto flex items-center justify-center transition-colors",
                        row.subtask.assigned_to
                          ? "bg-primary/15 text-primary hover:bg-primary/25"
                          : "bg-muted/50 text-muted-foreground/30 hover:bg-muted-foreground/15 hover:text-muted-foreground"
                      )}
                      title={getUserName(row.subtask.assigned_to)}
                    >
                      {getUserInitials(row.subtask.assigned_to) || <User className="h-2 w-2" />}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-1" side="left" align="start" sideOffset={4}>
                    <div className="text-[10px] font-medium text-muted-foreground px-2 py-1">Ответственный</div>
                    <button
                      onClick={() => { onUpdateSubtask(row.subtask!.id, { assigned_to: null }); setAssigneePopover(null); }}
                      className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted rounded-sm text-muted-foreground"
                    >
                      Без назначения
                    </button>
                    <div className="max-h-36 overflow-y-auto">
                      {users.map(u => (
                        <button
                          key={u.id}
                          onClick={() => { onUpdateSubtask(row.subtask!.id, { assigned_to: u.id }); setAssigneePopover(null); }}
                          className={cn(
                            "w-full text-left px-2 py-1.5 text-xs hover:bg-muted rounded-sm",
                            row.subtask!.assigned_to === u.id && "bg-primary/10 text-primary font-medium"
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

            {/* Start date */}
            <div className="w-[50px] text-center shrink-0">
              {row.type === "task" && row.task && (
                <Popover open={deadlinePopover === `start-${row.task.id}`} onOpenChange={(v) => setDeadlinePopover(v ? `start-${row.task!.id}` : null)}>
                  <PopoverTrigger asChild>
                    <button
                      className={cn(
                        "text-[10px] px-0.5 py-0.5 rounded transition-colors truncate",
                        row.task.start_at
                          ? "text-muted-foreground hover:bg-muted"
                          : "text-muted-foreground/30 hover:bg-muted hover:text-muted-foreground"
                      )}
                      title={row.task.start_at ? format(parseISO(row.task.start_at), "d MMMM yyyy", { locale: ru }) : "Установить старт"}
                    >
                      {row.task.start_at ? format(parseISO(row.task.start_at), "d MMM", { locale: ru }) : (
                        <CalendarIcon className="h-2.5 w-2.5 mx-auto" />
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" side="left" align="start" sideOffset={4}>
                    <Calendar
                      mode="single"
                      selected={row.task.start_at ? parseISO(row.task.start_at) : undefined}
                      onSelect={(date) => {
                        onUpdateTask(row.task!.id, { start_at: date ? date.toISOString() : null } as any);
                        setDeadlinePopover(null);
                      }}
                      locale={ru}
                      className="rounded-md border"
                    />
                    {row.task.start_at && (
                      <div className="p-2 border-t">
                        <button
                          onClick={() => { onUpdateTask(row.task!.id, { start_at: null } as any); setDeadlinePopover(null); }}
                          className="w-full text-xs text-destructive hover:bg-destructive/10 rounded px-2 py-1"
                        >
                          Убрать старт
                        </button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              )}
            </div>

            {/* Deadline */}
            <div className="w-[50px] text-center shrink-0">
              {row.type === "task" && row.task && (
                <Popover open={deadlinePopover === row.task.id} onOpenChange={(v) => setDeadlinePopover(v ? row.task!.id : null)}>
                  <PopoverTrigger asChild>
                    <button
                      className={cn(
                        "text-[10px] px-0.5 py-0.5 rounded transition-colors truncate",
                        row.task.deadline
                          ? new Date(row.task.deadline) < new Date() && !row.task.is_completed
                            ? "text-destructive font-medium hover:bg-destructive/10"
                            : "text-muted-foreground hover:bg-muted"
                          : "text-muted-foreground/40 hover:bg-muted hover:text-muted-foreground"
                      )}
                      title={row.task.deadline ? format(parseISO(row.task.deadline), "d MMMM yyyy", { locale: ru }) : "Установить дедлайн"}
                    >
                      {row.task.deadline ? format(parseISO(row.task.deadline), "d MMM", { locale: ru }) : (
                        <CalendarIcon className="h-2.5 w-2.5 mx-auto" />
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
              {row.type === "subtask" && row.subtask && (
                <Popover open={deadlinePopover === row.subtask.id} onOpenChange={(v) => setDeadlinePopover(v ? row.subtask!.id : null)}>
                  <PopoverTrigger asChild>
                    <button
                      className={cn(
                        "text-[10px] px-0.5 py-0.5 rounded transition-colors truncate",
                        row.subtask.deadline
                          ? new Date(row.subtask.deadline) < new Date() && !row.subtask.is_completed
                            ? "text-destructive font-medium hover:bg-destructive/10"
                            : "text-muted-foreground hover:bg-muted"
                          : "text-muted-foreground/30 hover:bg-muted hover:text-muted-foreground"
                      )}
                      title={row.subtask.deadline ? format(parseISO(row.subtask.deadline), "d MMMM yyyy", { locale: ru }) : "Установить срок"}
                    >
                      {row.subtask.deadline ? format(parseISO(row.subtask.deadline), "d MMM", { locale: ru }) : (
                        <CalendarIcon className="h-2 w-2 mx-auto" />
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" side="left" align="start" sideOffset={4}>
                    <Calendar
                      mode="single"
                      selected={row.subtask.deadline ? parseISO(row.subtask.deadline) : undefined}
                      onSelect={(date) => {
                        onUpdateSubtask(row.subtask!.id, { deadline: date ? date.toISOString() : null });
                        setDeadlinePopover(null);
                      }}
                      locale={ru}
                      className="rounded-md border"
                    />
                    {row.subtask.deadline && (
                      <div className="p-2 border-t">
                        <button
                          onClick={() => { onUpdateSubtask(row.subtask!.id, { deadline: null }); setDeadlinePopover(null); }}
                          className="w-full text-xs text-destructive hover:bg-destructive/10 rounded px-2 py-1"
                        >
                          Убрать срок
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

            {/* Predecessor column */}
            <div className="w-[42px] text-center shrink-0">
              {row.type === "task" && row.task && entityId && (
                <PredecessorPicker
                  entityId={entityId}
                  taskRows={taskRows}
                  dependencies={dependencies}
                  formatPredecessors={formatPredecessors}
                  onCreateDependency={onCreateDependency}
                  open={predPopover === entityId}
                  onOpenChange={(v) => setPredPopover(v ? entityId! : null)}
                />
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

      {/* Quick add row */}
      {rows.length > 0 && !adding && (() => {
        const lastProjectRow = [...rows].reverse().find(r => r.type === "project");
        if (!lastProjectRow) return null;
        return (
          <button
            onClick={() => startAdding(lastProjectRow.project.id, "task")}
            className="flex items-center gap-1.5 w-full px-3 py-2 text-xs text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/30 transition-colors border-b border-border/30"
          >
            <Plus className="h-3 w-3" />
            <span>Добавить задачу</span>
          </button>
        );
      })()}
    </div>
  );
});

export default GanttLeftPanel;
