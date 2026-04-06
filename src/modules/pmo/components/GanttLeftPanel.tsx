import { useState, useRef, forwardRef, useCallback } from "react";
import { type Task, type TaskGroup, type Subtask, useAvailableUsers } from "@/hooks/useTasks";
import { type Milestone } from "@/hooks/useMilestones";
import { cn } from "@/lib/utils";
import { Diamond, Plus, Check, X, ChevronRight, ChevronDown, CalendarIcon, User, Expand, ArrowRightLeft, GripVertical, Link2, Search, Settings2, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { format, parseISO, differenceInCalendarDays, addDays, isPast, isToday, isTomorrow } from "date-fns";
import { ru } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** Column configuration */
export type GanttColumnKey = "rowNum" | "name" | "assignee" | "start" | "deadline" | "duration" | "predecessor" | "gate";

export interface GanttColumnConfig {
  key: GanttColumnKey;
  label: string;
  visible: boolean;
  width: number;
  minWidth: number;
}

export const DEFAULT_COLUMNS: GanttColumnConfig[] = [
  { key: "rowNum", label: "#", visible: true, width: 28, minWidth: 24 },
  { key: "name", label: "Задача", visible: true, width: 0, minWidth: 180 }, // flex
  { key: "gate", label: "Гейт", visible: false, width: 42, minWidth: 36 },
  { key: "assignee", label: "Ответств.", visible: true, width: 32, minWidth: 28 },
  { key: "start", label: "Старт", visible: true, width: 50, minWidth: 42 },
  { key: "deadline", label: "Срок", visible: true, width: 50, minWidth: 42 },
  { key: "duration", label: "Дни", visible: true, width: 36, minWidth: 30 },
  { key: "predecessor", label: "Пред.", visible: true, width: 42, minWidth: 36 },
];

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
  getRowHeight?: (i: number) => number;
  width: number;
  allProjects: TaskGroup[];
  dependencies?: Dependency[];
  columns: GanttColumnConfig[];
  onColumnsChange: (cols: GanttColumnConfig[]) => void;
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
  onOpenTask?: (taskId: string) => void;
  onCreateDependency?: (predecessorId: string, successorId: string) => void;
  collapsedProjects: Set<string>;
  onToggleCollapse: (projectId: string) => void;
  filterAssignee: string | null;
  hoveredRow: number | null;
  onHoverRow: (index: number | null) => void;
  onScroll?: (scrollTop: number) => void; // deprecated — kept for API compat
  onUpdateMilestone?: (id: string, updates: { group_id?: string }) => void;
  getMilestoneOffscreen?: (ms: Milestone) => 'left' | 'right' | null;
}

/** Predecessor picker with search and multi-select */
function PredecessorPicker({
  entityId, taskRows, dependencies, formatPredecessors, onCreateDependency, open, onOpenChange,
}: {
  entityId: string;
  taskRows: GanttRow[];
  dependencies: Dependency[];
  formatPredecessors: (id: string) => string;
  onCreateDependency?: (predId: string, succId: string) => void;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const displayText = formatPredecessors(entityId);

  const filtered = taskRows
    .filter(tr => tr.task!.id !== entityId)
    .filter(tr => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return tr.task!.title.toLowerCase().includes(q) || String(tr.rowNumber).includes(q);
    });

  return (
    <Popover open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSearch(""); }}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "text-[10px] px-0.5 py-0.5 rounded transition-colors truncate max-w-full",
            displayText ? "text-primary hover:bg-primary/10" : "text-muted-foreground/30 hover:bg-muted hover:text-muted-foreground"
          )}
          title={displayText || "Добавить предшественника"}
        >
          {displayText || <Link2 className="h-2.5 w-2.5 mx-auto" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1" side="left" align="start" sideOffset={4}>
        <div className="text-[10px] font-medium text-muted-foreground px-2 py-1">Выбрать предшественников</div>
        <div className="px-1 pb-1">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск по названию или №..."
              className="h-7 text-xs pl-7 pr-2"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-52 overflow-y-auto space-y-0.5">
          {filtered.length === 0 && (
            <div className="text-xs text-muted-foreground px-2 py-2 text-center">Ничего не найдено</div>
          )}
          {filtered.map(tr => {
            const isLinked = dependencies.some(
              d => d.predecessor_id === tr.task!.id && d.successor_id === entityId
            );
            return (
              <button
                key={tr.task!.id}
                onClick={() => {
                  if (!isLinked && onCreateDependency) {
                    onCreateDependency(tr.task!.id, entityId);
                  }
                }}
                className={cn(
                  "w-full text-left px-2 py-1.5 text-xs hover:bg-muted rounded-sm truncate flex items-center gap-1.5",
                  isLinked && "bg-primary/10 text-primary"
                )}
              >
                {isLinked && <Check className="h-3 w-3 shrink-0 text-primary" />}
                <span className="text-[10px] text-muted-foreground w-4 shrink-0 text-right">{tr.rowNumber}</span>
                <span className="truncate">{tr.task!.title}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const GanttLeftPanel = forwardRef<HTMLDivElement, GanttLeftPanelProps>(function GanttLeftPanel({
  rows, rowHeight, getRowHeight: getRowHeightProp, width, allProjects, dependencies = [], columns: columnConfig, onColumnsChange, onMilestoneClick, onAddTask, onAddSubproject, onAddSubtask, onUpdateTask, onToggleTask, onUpdateSubtask, onToggleSubtask,
  onMoveTask, onMoveProject, onReorderTask, onOpenTask, onCreateDependency, collapsedProjects, onToggleCollapse, filterAssignee, hoveredRow, onHoverRow, onScroll,
  onUpdateMilestone, getMilestoneOffscreen,
}, ref) {
  const { data: users = [] } = useAvailableUsers();
  const [editingField, setEditingField] = useState<{ rowIndex: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [adding, setAdding] = useState<AddingState>(null);
  const [newTitle, setNewTitle] = useState("");
  const [showTypeMenu, setShowTypeMenu] = useState<string | null>(null);
  const [assigneePopover, setAssigneePopover] = useState<string | null>(null);
  const [deadlinePopover, setDeadlinePopover] = useState<string | null>(null);
  const [predPopover, setPredPopover] = useState<string | null>(null);
  const [durationEdit, setDurationEdit] = useState<{ taskId: string; value: string } | null>(null);
  const [colSettingsOpen, setColSettingsOpen] = useState(false);
  const [colDragIdx, setColDragIdx] = useState<number | null>(null);
  const [colDropIdx, setColDropIdx] = useState<number | null>(null);
  const colResizeRef = useRef<{ key: GanttColumnKey; startX: number; startW: number } | null>(null);

  const isColVisible = (key: GanttColumnKey) => columnConfig.find(c => c.key === key)?.visible ?? true;
  const colWidth = (key: GanttColumnKey) => columnConfig.find(c => c.key === key)?.width ?? 40;

  const toggleColumn = (key: GanttColumnKey) => {
    if (key === "name") return;
    onColumnsChange(columnConfig.map(c => c.key === key ? { ...c, visible: !c.visible } : c));
  };

  const handleColDragStart = (e: React.DragEvent, idx: number) => {
    setColDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  };
  const handleColDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setColDropIdx(idx);
  };
  const handleColDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (colDragIdx === null || colDragIdx === targetIdx) { setColDragIdx(null); setColDropIdx(null); return; }
    const reordered = [...columnConfig];
    const [moved] = reordered.splice(colDragIdx, 1);
    reordered.splice(targetIdx, 0, moved);
    onColumnsChange(reordered);
    setColDragIdx(null);
    setColDropIdx(null);
  };

  const handleColResizeStart = (e: React.MouseEvent, key: GanttColumnKey) => {
    e.preventDefault();
    e.stopPropagation();
    const col = columnConfig.find(c => c.key === key);
    if (!col) return;
    colResizeRef.current = { key, startX: e.clientX, startW: col.width };
    const onMove = (ev: MouseEvent) => {
      if (!colResizeRef.current) return;
      const delta = ev.clientX - colResizeRef.current.startX;
      const minW = col.minWidth;
      const newW = Math.max(minW, colResizeRef.current.startW + delta);
      onColumnsChange(columnConfig.map(c => c.key === key ? { ...c, width: newW } : c));
    };
    const onUp = () => {
      colResizeRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const resetColumns = () => onColumnsChange(DEFAULT_COLUMNS);

  const getTaskDuration = (task: Task): number | null => {
    const start = task.start_at ? parseISO(task.start_at) : null;
    const end = task.deadline ? parseISO(task.deadline) : null;
    if (start && end) return Math.max(differenceInCalendarDays(end, start), 0);
    return null;
  };

  const handleDurationCommit = (task: Task) => {
    if (!durationEdit) return;
    const days = parseInt(durationEdit.value, 10);
    if (isNaN(days) || days < 0) { setDurationEdit(null); return; }
    const start = task.start_at ? parseISO(task.start_at) : new Date();
    const newDeadline = addDays(start, days);
    const updates: Partial<Task> = { deadline: newDeadline.toISOString() };
    if (!task.start_at) updates.start_at = start.toISOString();
    onUpdateTask(task.id, updates);
    setDurationEdit(null);
  };

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
      const targetGroupId = tgtRow.type === "project" ? tgtRow.project.id : tgtRow.project.id;
      const targetPosition = tgtRow.task?.position ?? targetIdx;
      onReorderTask(srcRow.task.id, targetPosition, targetGroupId);
    }
    // Milestone DnD: move to target project
    if (srcRow?.type === "milestone" && srcRow.milestone && tgtRow && onUpdateMilestone) {
      const targetGroupId = tgtRow.project.id;
      if (targetGroupId !== srcRow.milestone.group_id) {
        onUpdateMilestone(srcRow.milestone.id, { group_id: targetGroupId });
      }
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
      className="shrink-0 border-r border-border bg-card"
      style={{ width }}
    >
      {/* Header */}
      <div className="flex items-center border-b border-border text-xs font-medium text-muted-foreground sticky top-0 bg-card z-30" style={{ height: 32 }}>
        {/* Render columns in config order */}
        {columnConfig.map((col) => {
          if (!col.visible) return null;
          if (col.key === "name") {
            return (
              <div key={col.key} className="flex-1 px-1 min-w-0 flex items-center gap-1 relative">
                <span>Задача</span>
                <Popover open={colSettingsOpen} onOpenChange={setColSettingsOpen}>
                  <PopoverTrigger asChild>
                    <button className="p-0.5 rounded hover:bg-muted/50 text-muted-foreground/50 hover:text-muted-foreground ml-auto shrink-0" title="Настройки колонок">
                      <Settings2 className="h-3 w-3" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2" side="bottom" align="start">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="text-[10px] font-medium text-muted-foreground">Колонки (перетащите для порядка)</div>
                      <button onClick={resetColumns} className="p-0.5 rounded hover:bg-muted text-muted-foreground/50 hover:text-muted-foreground" title="Сбросить настройки">
                        <RotateCcw className="h-3 w-3" />
                      </button>
                    </div>
                    {columnConfig.map((c, ci) => (
                      <div
                        key={c.key}
                        draggable={c.key !== "name"}
                        onDragStart={(e) => handleColDragStart(e, ci)}
                        onDragOver={(e) => handleColDragOver(e, ci)}
                        onDrop={(e) => handleColDrop(e, ci)}
                        onDragEnd={() => { setColDragIdx(null); setColDropIdx(null); }}
                        className={cn(
                          "flex items-center gap-2 py-1 text-xs rounded px-1 transition-colors",
                          c.key !== "name" ? "cursor-grab hover:bg-muted/50" : "opacity-60",
                          colDragIdx === ci && "opacity-30",
                          colDropIdx === ci && colDragIdx !== null && "border-t-2 border-t-primary"
                        )}
                      >
                        {c.key !== "name" && <GripVertical className="h-3 w-3 text-muted-foreground/40 shrink-0" />}
                        <input
                          type="checkbox"
                          checked={c.visible}
                          onChange={() => toggleColumn(c.key)}
                          className="rounded shrink-0"
                          disabled={c.key === "name"}
                        />
                        <span className="flex-1 truncate">{c.label}</span>
                        {c.key !== "name" && (
                          <input
                            type="number"
                            min={c.minWidth}
                            max={200}
                            value={c.width}
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10);
                              if (!isNaN(v) && v >= c.minWidth) {
                                onColumnsChange(columnConfig.map(cc => cc.key === c.key ? { ...cc, width: v } : cc));
                              }
                            }}
                            className="w-10 h-5 text-[10px] text-center bg-background border border-border rounded px-0.5 outline-none shrink-0"
                            title="Ширина (px)"
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                      </div>
                    ))}
                  </PopoverContent>
                </Popover>
              </div>
            );
          }
          const headerContent: Record<string, React.ReactNode> = {
            rowNum: <span className="text-[10px]">#</span>,
            assignee: <User className="h-3 w-3 mx-auto" />,
            start: <span className="text-[10px]">Старт</span>,
            deadline: <span className="text-[10px]">Срок</span>,
            duration: <span className="text-[10px]" title="Длительность (дни)">Дни</span>,
            predecessor: <Link2 className="h-3 w-3 mx-auto" />,
          };
          return (
            <div
              key={col.key}
              style={{ width: col.width }}
              className="text-center shrink-0 relative select-none"
            >
              {headerContent[col.key]}
              {/* Resize handle */}
              <div
                className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/30 transition-colors z-10"
                onMouseDown={(e) => handleColResizeStart(e, col.key)}
              />
            </div>
          );
        })}
      </div>

      {rows.map((row, i) => {
        const dimmed = filterAssignee && (
          (row.type === "task" && row.task?.assigned_to !== filterAssignee) ||
          (row.type === "subtask" && row.subtask?.assigned_to !== filterAssignee)
        );
        const entityId = row.task?.id || row.subtask?.id || row.milestone?.id;
        const isDraggable = row.type === "task" || row.type === "milestone";
        const isDropTarget = dropTargetIdx === i;

        return (
          <div
            key={i}
            className={cn(
              "flex items-center border-b border-border/50 text-xs cursor-default group",
              row.type === "project" || row.type === "summary" ? "font-semibold text-foreground bg-muted/40" :
              row.type === "milestone" ? "text-[#EF4444] font-semibold" :
              row.type === "subtask" ? "text-muted-foreground/70" : "text-muted-foreground",
              dimmed && "opacity-30",
              hoveredRow === i && "bg-muted/50",
              dragRowIdx === i && "opacity-30",
              isDropTarget && dragRowIdx !== null && "border-t-2 border-t-primary"
            )}
            style={{ height: getRowHeightProp ? getRowHeightProp(i) : rowHeight, ...(row.type === "milestone" ? { backgroundColor: "rgba(239,68,68,0.03)" } : {}) }}
            onMouseEnter={() => onHoverRow(i)}
            onMouseLeave={() => onHoverRow(null)}
            draggable={isDraggable}
            onDragStart={isDraggable ? (e) => handleDragStart(e, i) : undefined}
            onDragOver={(e) => handleDragOver(e, i)}
            onDrop={(e) => handleDrop(e, i)}
            onDragEnd={handleDragEnd}
          >
            {/* Render cells in column config order */}
            {columnConfig.map((col) => {
              if (!col.visible) return null;

              if (col.key === "rowNum") {
                return (
                  <div key={col.key} style={{ width: col.width }} className="text-center shrink-0 text-[10px] text-muted-foreground/50 flex items-center justify-center gap-0">
                    {isDraggable && (
                      <GripVertical className="h-3 w-3 text-muted-foreground/30 cursor-grab shrink-0" />
                    )}
                    {row.rowNumber !== undefined && <span>{row.rowNumber}</span>}
                  </div>
                );
              }

              if (col.key === "name") {
                return (
                  <div
                    key={col.key}
                    className="flex-1 flex items-center gap-1 min-w-0 px-1"
                    style={{ paddingLeft: Math.max(2, row.depth * 10) }}
                  >
                    {(row.type === "project" || row.type === "summary") ? (
                      <>
                        <button onClick={() => onToggleCollapse(row.project.id)} className="p-0.5 rounded hover:bg-muted/50 shrink-0">
                          {collapsedProjects.has(row.project.id) ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
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
                        {(row.depth > 0 || !row.project.parent_id) && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button onClick={(e) => e.stopPropagation()} className="p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity shrink-0" title="Переместить проект">
                                <ArrowRightLeft className="h-2.5 w-2.5" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-48 p-1" side="right" align="start" sideOffset={4}>
                              <div className="text-[10px] font-medium text-muted-foreground px-2 py-1">Переместить в проект</div>
                              <button onClick={() => onMoveProject(row.project.id, null)} className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted rounded-sm text-muted-foreground">📂 Корневой уровень</button>
                              <div className="max-h-48 overflow-y-auto">
                                {allProjects.filter(p => p.id !== row.project.id && p.parent_id !== row.project.id).map(p => (
                                  <button key={p.id} onClick={() => onMoveProject(row.project.id, p.id)} className={cn("w-full text-left px-2 py-1.5 text-xs hover:bg-muted rounded-sm truncate", row.project.parent_id === p.id && "bg-primary/10 text-primary font-medium")}>
                                    {p.icon && p.icon !== "list" ? `${p.icon} ` : "📁 "}{p.name}
                                  </button>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
                        <div className="relative ml-auto shrink-0">
                          <button onClick={(e) => { e.stopPropagation(); setShowTypeMenu(showTypeMenu === row.project.id ? null : row.project.id); }} className="p-0.5 rounded opacity-60 hover:opacity-100 hover:bg-muted/50 transition-opacity" title="Добавить...">
                            <Plus className="h-3 w-3" />
                          </button>
                          {showTypeMenu === row.project.id && (
                            <div className="absolute right-0 top-5 z-30 bg-popover border border-border rounded-md shadow-lg py-0.5 min-w-[120px]">
                              <button onClick={() => startAdding(row.project.id, "task")} className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors">📝 Задача</button>
                              <button onClick={() => startAdding(row.project.id, "subproject")} className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors">📁 Подпроект</button>
                            </div>
                          )}
                        </div>
                      </>
                    ) : row.type === "milestone" ? (
                      <div className="flex items-center gap-1.5 min-w-0 cursor-pointer flex-1" onClick={() => row.milestone && onMilestoneClick(row.milestone)}>
                        <Diamond className="h-3.5 w-3.5 shrink-0 fill-[#EF4444] text-[#EF4444]" />
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild><span className="truncate uppercase font-semibold text-[11px]">{row.milestone?.name}</span></TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs text-xs">{row.milestone?.name}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    ) : row.type === "subtask" && row.subtask ? (
                      <div className="flex items-center gap-1 min-w-0 flex-1">
                        <button onClick={() => onToggleSubtask(row.subtask!.id, !row.subtask!.is_completed)} className={cn("h-3 w-3 rounded-full border-[1.5px] shrink-0 flex items-center justify-center transition-colors", row.subtask.is_completed ? "bg-primary/60 border-primary/60" : "border-muted-foreground/30")}>
                          {row.subtask.is_completed && <Check className="h-2 w-2 text-primary-foreground" />}
                        </button>
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild><span className={cn("truncate text-[11px] flex-1", row.subtask.is_completed && "line-through opacity-40")}>{row.subtask.title}</span></TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs text-xs">{row.subtask.title}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    ) : row.task ? (
                      editingField?.rowIndex === i && editingField.field === "title" ? (
                        <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => commitEdit(row.task!)} onKeyDown={e => { if (e.key === "Enter") commitEdit(row.task!); if (e.key === "Escape") setEditingField(null); }} className="w-full h-5 text-xs bg-background border border-border rounded px-1 outline-none" />
                      ) : (
                        <div className="flex items-start gap-1 min-w-0 flex-1">
                          <button onClick={() => onToggleTask(row.task!.id, !row.task!.is_completed)} className={cn("h-3.5 w-3.5 rounded-full border-[1.5px] shrink-0 flex items-center justify-center transition-colors mt-0.5", row.task.is_completed ? "bg-primary border-primary" : "border-muted-foreground/40")}>
                            {row.task.is_completed && <Check className="h-2 w-2 text-primary-foreground" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <TooltipProvider delayDuration={300}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    className={cn("cursor-text text-[11px] leading-[1.3]", row.task.is_completed && "line-through opacity-50")}
                                    style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", whiteSpace: "normal", wordBreak: "break-word" }}
                                    onDoubleClick={() => startEdit(i, "title", row.task!.title)}
                                  >{row.task.title}</span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-sm text-xs p-2">
                                  <div className="font-medium">{row.task.title}</div>
                                  {row.task.description && <div className="text-muted-foreground mt-0.5 line-clamp-2">{row.task.description}</div>}
                                  {row.task.original_deadline && row.task.deadline && row.task.original_deadline !== row.task.deadline && (
                                    <div className="text-amber-500 text-[10px] mt-0.5">Перенос: {format(parseISO(row.task.original_deadline), "d MMM", { locale: ru })} → {format(parseISO(row.task.deadline), "d MMM", { locale: ru })}</div>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          {/* Action buttons on hover */}
                          <div className="flex items-center shrink-0 mt-0.5">
                            {onOpenTask && (
                              <button onClick={(e) => { e.stopPropagation(); onOpenTask(row.task!.id); }} className="p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity shrink-0" title="Раскрыть задачу">
                                <Expand className="h-2.5 w-2.5" />
                              </button>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); startAdding(row.project.id, "step", row.task!.id); }} className="p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity shrink-0" title="Добавить шаг">
                              <Plus className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        </div>
                      )
                    ) : null}
                  </div>
                );
              }

              if (col.key === "assignee") {
                return (
                  <div key={col.key} style={{ width: col.width }} className="text-center shrink-0">
                    {row.type === "task" && row.task && (
                      <Popover open={assigneePopover === row.task.id} onOpenChange={(v) => setAssigneePopover(v ? row.task!.id : null)}>
                        <PopoverTrigger asChild>
                          <button className={cn("h-5 w-5 rounded-full text-[8px] font-bold mx-auto flex items-center justify-center transition-colors", row.task.assigned_to ? "bg-primary/20 text-primary hover:bg-primary/30" : "bg-muted text-muted-foreground/50 hover:bg-muted-foreground/20 hover:text-muted-foreground")} title={getUserName(row.task.assigned_to)}>
                            {getUserInitials(row.task.assigned_to) || <User className="h-2.5 w-2.5" />}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-48 p-1" side="left" align="start" sideOffset={4}>
                          <div className="text-[10px] font-medium text-muted-foreground px-2 py-1">Ответственный</div>
                          <button onClick={() => { onUpdateTask(row.task!.id, { assigned_to: null }); setAssigneePopover(null); }} className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted rounded-sm text-muted-foreground">Без назначения</button>
                          <div className="max-h-36 overflow-y-auto">
                            {users.map(u => (
                              <button key={u.id} onClick={() => { onUpdateTask(row.task!.id, { assigned_to: u.id }); setAssigneePopover(null); }} className={cn("w-full text-left px-2 py-1.5 text-xs hover:bg-muted rounded-sm", row.task!.assigned_to === u.id && "bg-primary/10 text-primary font-medium")}>{u.display_name || u.email}</button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                    {row.type === "subtask" && row.subtask && (
                      <Popover open={assigneePopover === row.subtask.id} onOpenChange={(v) => setAssigneePopover(v ? row.subtask!.id : null)}>
                        <PopoverTrigger asChild>
                          <button className={cn("h-4 w-4 rounded-full text-[7px] font-bold mx-auto flex items-center justify-center transition-colors", row.subtask.assigned_to ? "bg-primary/15 text-primary hover:bg-primary/25" : "bg-muted/50 text-muted-foreground/30 hover:bg-muted-foreground/15 hover:text-muted-foreground")} title={getUserName(row.subtask.assigned_to)}>
                            {getUserInitials(row.subtask.assigned_to) || <User className="h-2 w-2" />}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-48 p-1" side="left" align="start" sideOffset={4}>
                          <div className="text-[10px] font-medium text-muted-foreground px-2 py-1">Ответственный</div>
                          <button onClick={() => { onUpdateSubtask(row.subtask!.id, { assigned_to: null }); setAssigneePopover(null); }} className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted rounded-sm text-muted-foreground">Без назначения</button>
                          <div className="max-h-36 overflow-y-auto">
                            {users.map(u => (
                              <button key={u.id} onClick={() => { onUpdateSubtask(row.subtask!.id, { assigned_to: u.id }); setAssigneePopover(null); }} className={cn("w-full text-left px-2 py-1.5 text-xs hover:bg-muted rounded-sm", row.subtask!.assigned_to === u.id && "bg-primary/10 text-primary font-medium")}>{u.display_name || u.email}</button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                );
              }

              if (col.key === "start") {
                return (
                  <div key={col.key} style={{ width: col.width }} className="text-center shrink-0">
                    {row.type === "task" && row.task && (
                      <Popover open={deadlinePopover === `start-${row.task.id}`} onOpenChange={(v) => setDeadlinePopover(v ? `start-${row.task!.id}` : null)}>
                        <PopoverTrigger asChild>
                          <button className={cn("text-[10px] px-0.5 py-0.5 rounded transition-colors truncate", row.task.start_at ? "text-muted-foreground hover:bg-muted" : "text-muted-foreground/30 hover:bg-muted hover:text-muted-foreground")} title={row.task.start_at ? format(parseISO(row.task.start_at), "d MMMM yyyy", { locale: ru }) : "Установить старт"}>
                            {row.task.start_at ? format(parseISO(row.task.start_at), "d MMM", { locale: ru }) : <CalendarIcon className="h-2.5 w-2.5 mx-auto" />}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" side="left" align="start" sideOffset={4}>
                          <Calendar mode="single" selected={row.task.start_at ? parseISO(row.task.start_at) : undefined} onSelect={(date) => { onUpdateTask(row.task!.id, { start_at: date ? date.toISOString() : null } as any); setDeadlinePopover(null); }} locale={ru} className="rounded-md border" />
                          {row.task.start_at && (
                            <div className="p-2 border-t">
                              <button onClick={() => { onUpdateTask(row.task!.id, { start_at: null } as any); setDeadlinePopover(null); }} className="w-full text-xs text-destructive hover:bg-destructive/10 rounded px-2 py-1">Убрать старт</button>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                );
              }

              if (col.key === "deadline") {
                return (
                  <div key={col.key} style={{ width: col.width }} className="text-center shrink-0">
                    {row.type === "task" && row.task && (
                      <Popover open={deadlinePopover === row.task.id} onOpenChange={(v) => setDeadlinePopover(v ? row.task!.id : null)}>
                        <PopoverTrigger asChild>
                          <button className={cn("text-[10px] px-0.5 py-0.5 rounded transition-colors truncate", row.task.deadline ? (new Date(row.task.deadline) < new Date() && !row.task.is_completed ? "text-destructive font-medium hover:bg-destructive/10" : "text-muted-foreground hover:bg-muted") : "text-muted-foreground/40 hover:bg-muted hover:text-muted-foreground")} title={row.task.deadline ? format(parseISO(row.task.deadline), "d MMMM yyyy", { locale: ru }) : "Установить дедлайн"}>
                            {row.task.deadline ? format(parseISO(row.task.deadline), "d MMM", { locale: ru }) : <CalendarIcon className="h-2.5 w-2.5 mx-auto" />}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" side="left" align="start" sideOffset={4}>
                          <Calendar mode="single" selected={row.task.deadline ? parseISO(row.task.deadline) : undefined} onSelect={(date) => { onUpdateTask(row.task!.id, { deadline: date ? date.toISOString() : null }); setDeadlinePopover(null); }} locale={ru} className="rounded-md border" />
                          {row.task.deadline && (
                            <div className="p-2 border-t">
                              <button onClick={() => { onUpdateTask(row.task!.id, { deadline: null }); setDeadlinePopover(null); }} className="w-full text-xs text-destructive hover:bg-destructive/10 rounded px-2 py-1">Убрать дедлайн</button>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    )}
                    {row.type === "subtask" && row.subtask && (
                      <Popover open={deadlinePopover === row.subtask.id} onOpenChange={(v) => setDeadlinePopover(v ? row.subtask!.id : null)}>
                        <PopoverTrigger asChild>
                          <button className={cn("text-[10px] px-0.5 py-0.5 rounded transition-colors truncate", row.subtask.deadline ? (new Date(row.subtask.deadline) < new Date() && !row.subtask.is_completed ? "text-destructive font-medium hover:bg-destructive/10" : "text-muted-foreground hover:bg-muted") : "text-muted-foreground/30 hover:bg-muted hover:text-muted-foreground")} title={row.subtask.deadline ? format(parseISO(row.subtask.deadline), "d MMMM yyyy", { locale: ru }) : "Установить срок"}>
                            {row.subtask.deadline ? format(parseISO(row.subtask.deadline), "d MMM", { locale: ru }) : <CalendarIcon className="h-2 w-2 mx-auto" />}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" side="left" align="start" sideOffset={4}>
                          <Calendar mode="single" selected={row.subtask.deadline ? parseISO(row.subtask.deadline) : undefined} onSelect={(date) => { onUpdateSubtask(row.subtask!.id, { deadline: date ? date.toISOString() : null }); setDeadlinePopover(null); }} locale={ru} className="rounded-md border" />
                          {row.subtask.deadline && (
                            <div className="p-2 border-t">
                              <button onClick={() => { onUpdateSubtask(row.subtask!.id, { deadline: null }); setDeadlinePopover(null); }} className="w-full text-xs text-destructive hover:bg-destructive/10 rounded px-2 py-1">Убрать срок</button>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    )}
                    {row.type === "milestone" && row.milestone && (() => {
                      const dateStr = format(parseISO(row.milestone.planned_date), "d MMM", { locale: ru });
                      const offscreen = getMilestoneOffscreen?.(row.milestone);
                      return (
                        <span className="text-[10px] text-[#EF4444] font-medium whitespace-nowrap">
                          {offscreen === 'left' && '← '}{dateStr}{offscreen === 'right' && ' →'}
                        </span>
                      );
                    })()}
                  </div>
                );
              }

              if (col.key === "duration") {
                return (
                  <div key={col.key} style={{ width: col.width }} className="text-center shrink-0">
                    {row.type === "task" && row.task && (() => {
                      const task = row.task!;
                      const dur = getTaskDuration(task);
                      const isEditing = durationEdit?.taskId === task.id;
                      if (isEditing) {
                        return (
                          <input autoFocus type="number" min={0} value={durationEdit!.value} onChange={e => setDurationEdit({ taskId: task.id, value: e.target.value })} onBlur={() => handleDurationCommit(task)} onKeyDown={e => { if (e.key === "Enter") handleDurationCommit(task); if (e.key === "Escape") setDurationEdit(null); }} className="w-full h-5 text-[10px] text-center bg-background border border-border rounded px-0.5 outline-none" />
                        );
                      }
                      return (
                        <button onClick={() => setDurationEdit({ taskId: task.id, value: String(dur ?? "") })} className={cn("text-[10px] px-0.5 py-0.5 rounded transition-colors w-full", dur !== null ? "text-muted-foreground hover:bg-muted" : "text-muted-foreground/30 hover:bg-muted hover:text-muted-foreground")} title="Длительность (дни). Нажмите для редактирования">
                          {dur !== null ? dur : "—"}
                        </button>
                      );
                    })()}
                  </div>
                );
              }

              if (col.key === "predecessor") {
                return (
                  <div key={col.key} style={{ width: col.width }} className="text-center shrink-0">
                    {row.type === "task" && row.task && entityId && (
                      <PredecessorPicker entityId={entityId} taskRows={taskRows} dependencies={dependencies} formatPredecessors={formatPredecessors} onCreateDependency={onCreateDependency} open={predPopover === entityId} onOpenChange={(v) => setPredPopover(v ? entityId! : null)} />
                    )}
                  </div>
                );
              }

              return null;
            })}
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
