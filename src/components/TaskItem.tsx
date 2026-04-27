import { useState, useMemo, useEffect, useRef, useCallback, memo } from "react";
import { useUndo } from "@/hooks/useUndoStack";
import { useQuery } from "@tanstack/react-query";

import { useNavigate } from "react-router-dom";
import { Task, Subtask, useTaskMutations, useVisibleTags, useAvailableUsers, useTaskParticipants, useTaskGroups, useLinkedTagIds, Profile, useTasks, useTagCategories, TaskGroup, type Tag as TagType, type TagCategory } from "@/hooks/useTasks";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable as useSortableDnd } from "@dnd-kit/sortable";
import { CSS as DndCSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { useAuth } from "@/hooks/useAuth";
import TaskChat from "@/components/TaskChat";
import { useTaskComments } from "@/hooks/useComments";
import ProjectIcon from "@/components/ProjectIcon";
import UserPicker from "@/components/UserPicker";
import MultiAssigneePicker from "@/components/MultiAssigneePicker";
import TaskClientPicker from "@/components/TaskClientPicker";
import ClientAvatar from "@/components/ClientAvatar";
import AssigneePicker, { type AssigneeSelection } from "@/components/AssigneePicker";
import AssigneeBadge from "@/components/AssigneeBadge";
import { TaskClosureDialog, TaskApprovalActions } from "@/components/TaskApprovalDialog";
import LazyMount from "@/components/LazyMount";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Loader2, ShieldCheck, BookOpen } from "lucide-react";
import { toast } from "sonner";
import {
  Check, Star, ChevronDown, ChevronRight, Plus, Trash2, Calendar, Tag, X, UserPlus, Expand, FileText, GripVertical, Clock, Repeat, Users, FolderOpen, Flag, MessageCircle, Wand2, GanttChart, ArrowRight, Forward, ArrowUpFromLine, MoveRight, ArrowDownToLine,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { format, isToday, isTomorrow, isPast, parseISO, differenceInDays, addDays } from "date-fns";
import { ru } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PopoverSearchList } from "@/components/ui/popover-search";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import ConfirmDelete from "@/components/ConfirmDelete";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useIsMobile } from "@/hooks/use-mobile";
import { getInitials, getAvatarColors } from "@/lib/initials";
import { filterRealProjects } from "@/lib/projectFilters";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { startMeasure } from "@/lib/perf/perfMetrics";

interface TaskItemProps {
  task: Task;
  sortable?: boolean;
  initialOpen?: boolean;
  onOpened?: () => void;
  onTagClick?: (tagId: string) => void;
  onProjectClick?: (groupId: string) => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onLongPress?: () => void;
  // Shared data props — lifted from parent to avoid per-item hook subscriptions
  sharedTags?: TagType[];
  sharedUsers?: Profile[];
  sharedGroups?: TaskGroup[];
  sharedTagCategories?: TagCategory[];
  sharedLinkedTagIds?: Set<string>;
  sharedMutations?: ReturnType<typeof useTaskMutations>;
  /** Bulk-fetched set of task IDs that have at least one comment (for chat icon highlight). */
  sharedTasksWithComments?: Set<string>;
}

const PRIORITIES = [
  { value: 1, label: "P1 — Критический", color: "text-red-500", bgColor: "bg-red-500/10", dotColor: "bg-red-500" },
  { value: 2, label: "P2 — Высокий", color: "text-orange-500", bgColor: "bg-orange-500/10", dotColor: "bg-orange-500" },
  { value: 3, label: "P3 — Средний", color: "text-yellow-500", bgColor: "bg-yellow-500/10", dotColor: "bg-yellow-500" },
  { value: 4, label: "P4 — Низкий", color: "text-blue-400", bgColor: "bg-blue-400/10", dotColor: "bg-blue-400" },
] as const;

const RECURRENCE_LABELS: Record<string, string> = {
  daily: "Ежедневно",
  weekdays: "По будням",
  every2days: "Каждые 2 дня",
  every3days: "Каждые 3 дня",
  weekly: "Еженедельно",
  biweekly: "Каждые 2 недели",
  monthly: "Ежемесячно",
  quarterly: "Ежеквартально",
  semiannually: "Каждые 6 мес.",
  yearly: "Ежегодно",
};

const getPriority = (value: number | null | undefined) => PRIORITIES.find(p => p.value === value);

/* ── Days-based deadline picker for quick popover ── */
function DeadlineQuickPopover({ task, onUpdate }: { task: Task; onUpdate: (id: string, updates: Partial<Task>) => void }) {
  const [daysInput, setDaysInput] = useState(7);
  const [showDays, setShowDays] = useState(false);
  const baseDate = task.deadline ? parseISO(task.deadline) : new Date();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors" title="Срок">
          <Calendar className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1.5 bg-popover border-border z-50" side="left">
        <p className="text-xs font-medium text-muted-foreground px-2 py-1">Срок</p>
        {[
          { label: "Сегодня", days: 0 },
          { label: "Завтра", days: 1 },
          { label: "Через 3 дня", days: 3 },
          { label: "Через неделю", days: 7 },
        ].map(opt => {
          const d = new Date();
          d.setDate(d.getDate() + opt.days);
          const val = format(d, "yyyy-MM-dd");
          return (
            <button
              key={opt.days}
              onClick={() => onUpdate(task.id, { deadline: val })}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors"
            >
              {opt.label}
            </button>
          );
        })}

        {/* Days slider */}
        <div className="border-t border-border mt-1 pt-1">
          <button
            onClick={() => setShowDays(!showDays)}
            className="flex items-center gap-1 w-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Clock className="h-3 w-3" />
            {showDays ? "Скрыть" : "Через N дней..."}
          </button>
          {showDays && (
            <div className="px-2 py-1.5 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {task.deadline ? "+" : "Через"}
                </span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={daysInput}
                  onChange={(e) => setDaysInput(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
                  className="w-12 h-6 text-xs text-center rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
                <span className="text-[10px] text-muted-foreground">дн.</span>
              </div>
              <Slider
                min={1}
                max={90}
                step={1}
                value={[Math.min(daysInput, 90)]}
                onValueChange={([v]) => setDaysInput(v)}
                className="w-full"
              />
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-muted-foreground/60">
                  → {format(addDays(baseDate, daysInput), "d MMM", { locale: ru })}
                </span>
                <button
                  onClick={() => onUpdate(task.id, { deadline: addDays(baseDate, daysInput).toISOString() })}
                  className="text-[10px] px-2 py-0.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  ОК
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border mt-1 pt-1">
          <input
            type="date"
            value={task.deadline ? format(parseISO(task.deadline), "yyyy-MM-dd") : ""}
            onChange={(e) => onUpdate(task.id, { deadline: e.target.value || null })}
            className="w-full text-xs bg-muted/50 outline-none border border-border rounded-lg px-2 py-1.5 transition-all"
          />
        </div>
        {task.deadline && (
          <button
            onClick={() => onUpdate(task.id, { deadline: null })}
            className="mt-1 text-xs text-destructive hover:underline w-full text-left px-2 py-1"
          >
            Убрать срок
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ── Dates section — compact single row ── */
function DeadlineDetailSection({ task, onUpdate }: { task: Task; onUpdate: (id: string, updates: Partial<Task>) => void }) {
  const [daysInput, setDaysInput] = useState(7);
  const [showDays, setShowDays] = useState(false);
  const baseDate = task.deadline ? parseISO(task.deadline) : new Date();

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <Calendar className="h-3 w-3" /> Даты
      </p>
      {/* Compact single row: Deadline — Start */}
      <div className="flex items-center gap-2 text-sm">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-[10px] text-muted-foreground/60 shrink-0">Срок</span>
          <input
            type="date"
            value={task.deadline ? format(parseISO(task.deadline), "yyyy-MM-dd") : ""}
            onChange={(e) => onUpdate(task.id, { deadline: e.target.value || null })}
            className="text-xs bg-muted/50 outline-none border border-border rounded-lg px-2 py-1 focus:ring-1 focus:ring-primary/20 transition-all w-[110px]"
          />
          {task.deadline && (
            <button onClick={() => onUpdate(task.id, { deadline: null })} className="text-muted-foreground hover:text-destructive transition-colors">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <span className="text-muted-foreground/30">—</span>
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-[10px] text-muted-foreground/60 shrink-0">Начало</span>
          <input
            type="date"
            value={task.deferred_until ? format(parseISO(task.deferred_until), "yyyy-MM-dd") : ""}
            onChange={(e) => onUpdate(task.id, { deferred_until: e.target.value || null })}
            className="text-xs bg-muted/50 outline-none border border-border rounded-lg px-2 py-1 focus:ring-1 focus:ring-primary/20 transition-all w-[110px]"
          />
          {task.deferred_until && (
            <button onClick={() => onUpdate(task.id, { deferred_until: null })} className="text-muted-foreground hover:text-destructive transition-colors">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Days-based input */}
      <button
        onClick={() => setShowDays(!showDays)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <Clock className="h-3 w-3" />
        {showDays ? "Скрыть" : "Через N дней..."}
      </button>
      {showDays && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            {task.deadline ? "+" : "Через"}
          </span>
          <input
            type="number"
            min={1}
            max={365}
            value={daysInput}
            onChange={(e) => setDaysInput(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
            className="w-14 h-6 text-xs text-center rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          <span className="text-[10px] text-muted-foreground">дн.</span>
          <Slider
            min={1}
            max={90}
            step={1}
            value={[Math.min(daysInput, 90)]}
            onValueChange={([v]) => setDaysInput(v)}
            className="w-32"
          />
          <span className="text-[9px] text-muted-foreground/60">
            → {format(addDays(baseDate, daysInput), "d MMM", { locale: ru })}
          </span>
          <button
            onClick={() => onUpdate(task.id, { deadline: addDays(baseDate, daysInput).toISOString() })}
            className="text-[10px] px-2 py-0.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            ОК
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Move subtask / demote dialog ── */
function MoveSubtaskDialog({ open, onOpenChange, currentTaskId, groupId, onSelect, title = "Переместить в задачу" }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTaskId: string;
  groupId: string | null;
  onSelect: (targetTaskId: string) => void;
  title?: string;
}) {
  const { data: tasks = [] } = useTasks(groupId);
  const [search, setSearch] = useState("");
  const filtered = tasks.filter(t => t.id !== currentTaskId && !t.is_completed && t.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[50dvh] rounded-t-2xl p-4 overflow-y-auto">
        <p className="text-sm font-semibold mb-2">{title}</p>
        <input
          autoFocus
          placeholder="Поиск задачи..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 text-sm bg-muted/50 border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary/40 mb-2"
        />
        <div className="space-y-1 max-h-[30dvh] overflow-y-auto">
          {filtered.length === 0 && <p className="text-xs text-muted-foreground p-2">Нет задач</p>}
          {filtered.map(t => (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-left hover:bg-muted transition-colors"
            >
              <span className="truncate">{t.title}</span>
              {t.subtasks && t.subtasks.length > 0 && (
                <span className="text-[10px] text-muted-foreground shrink-0">{t.subtasks.length} шагов</span>
              )}
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ── Sortable Subtask Row ── */
interface SortableSubtaskRowProps {
  sub: Subtask;
  task: Task;
  editingSubtaskId: string | null;
  editingSubtaskTitle: string;
  onStartEdit: (sub: Subtask) => void;
  onChangeTitle: (title: string) => void;
  onSaveTitle: (id: string) => void;
  onCancelEdit: () => void;
  onToggle: (id: string, done: boolean) => void;
  onDelete: (id: string) => void;
  onUpdateDeadline: (id: string, dl: string | null) => void;
  onUpdateAssignee: (id: string, uid: string | null) => void;
  onPromote?: (subtaskId: string) => void;
  onMoveToTask?: (subtaskId: string) => void;
  availableUsers: Profile[];
  getProfileName: (userId: string) => string;
}

function SortableSubtaskRowInner({ sub, task, editingSubtaskId, editingSubtaskTitle, onStartEdit, onChangeTitle, onSaveTitle, onCancelEdit, onToggle, onDelete, onUpdateDeadline, onUpdateAssignee, onPromote, onMoveToTask, availableUsers, getProfileName }: SortableSubtaskRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortableDnd({ id: sub.id });
  const style = { transform: DndCSS.Transform.toString(transform), transition };
  const isEditing = editingSubtaskId === sub.id;

  return (
    <div ref={setNodeRef} style={style} className={cn("flex items-start gap-2.5 group/sub py-1", isDragging && "opacity-50 z-50 relative")}>
      <button {...attributes} {...listeners} className="text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing mt-1 touch-none shrink-0">
        <GripVertical className="h-3 w-3" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(sub.id, !sub.is_completed); }}
        className="-m-2 p-2 touch-manipulation mt-0.5"
      >
        <span className={cn(
          "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-all",
          sub.is_completed ? "bg-primary border-primary" : "border-muted-foreground/40 hover:border-primary"
        )}>
          {sub.is_completed && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
        </span>
      </button>
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            autoFocus
            value={editingSubtaskTitle}
            onChange={(e) => onChangeTitle(e.target.value)}
            onBlur={() => onSaveTitle(sub.id)}
            onKeyDown={(e) => { if (e.key === "Enter") onSaveTitle(sub.id); if (e.key === "Escape") onCancelEdit(); }}
            className="text-sm bg-transparent outline-none w-full border-b border-primary/40 py-0.5"
          />
        ) : (
          <span
            onDoubleClick={() => onStartEdit(sub)}
            className={cn("text-sm cursor-pointer", sub.is_completed && "line-through text-muted-foreground")}
            title="Двойной клик для переименования"
          >
            {sub.title}
          </span>
        )}
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {/* Deadline */}
          <Popover>
            <PopoverTrigger asChild>
              <button className={cn(
                "text-[11px] flex items-center gap-0.5 hover:opacity-70 transition-opacity",
                sub.deadline
                  ? isPast(parseISO(sub.deadline)) && !sub.is_completed
                    ? "text-destructive"
                    : sub.deadline && task.deadline && parseISO(sub.deadline) > parseISO(task.deadline)
                      ? "text-amber-500"
                      : "text-muted-foreground"
                  : "text-muted-foreground/50"
              )}>
                <Calendar className="h-3 w-3" />
                {sub.deadline ? format(parseISO(sub.deadline), "d MMM", { locale: ru }) : "Срок"}
                {sub.deadline && task.deadline && parseISO(sub.deadline) > parseISO(task.deadline) && !sub.is_completed && (
                  <span className="text-[9px] text-amber-500 font-medium" title="Срок шага позже дедлайна задачи — дедлайн будет сдвинут">↑</span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" side="bottom" align="start">
              <div className="flex flex-col gap-1 mb-2">
                {[
                  { label: "Сегодня", days: 0 },
                  { label: "Завтра", days: 1 },
                  { label: "Через неделю", days: 7 },
                ].map(preset => {
                  const d = new Date(); d.setDate(d.getDate() + preset.days); d.setHours(23, 59, 59, 0);
                  return (
                    <button key={preset.days} onClick={() => onUpdateDeadline(sub.id, d.toISOString())}
                      className="text-xs text-left px-2 py-1 rounded hover:bg-muted transition-colors">{preset.label}</button>
                  );
                })}
                {sub.deadline && (
                  <button onClick={() => onUpdateDeadline(sub.id, null)}
                    className="text-xs text-left px-2 py-1 rounded hover:bg-muted text-destructive transition-colors">Убрать срок</button>
                )}
              </div>
              <CalendarPicker
                mode="single"
                selected={sub.deadline ? parseISO(sub.deadline) : undefined}
                onSelect={(date) => {
                  if (date) { date.setHours(23, 59, 59, 0); onUpdateDeadline(sub.id, date.toISOString()); }
                }}
                className="p-2 pointer-events-auto"
                locale={ru}
              />
            </PopoverContent>
          </Popover>
          {/* Assignee */}
          <Popover>
            <PopoverTrigger asChild>
              <button className={cn(
                "text-[11px] flex items-center gap-1 hover:opacity-70 transition-opacity",
                sub.assigned_to ? "text-primary" : "text-muted-foreground/50"
              )}>
                {sub.assigned_to ? (
                  <span
                    className={cn(
                      "h-4 w-4 rounded-full text-[8px] font-bold flex items-center justify-center shrink-0",
                      sub.assigned_to !== task.assigned_to && sub.assigned_to !== task.user_id && "ring-1 ring-primary/30"
                    )}
                    style={getAvatarColors(getProfileName(sub.assigned_to))}
                  >
                    {getInitials(getProfileName(sub.assigned_to))}
                  </span>
                ) : (
                  <Users className="h-3 w-3" />
                )}
                {sub.assigned_to ? getProfileName(sub.assigned_to) : "Ответств."}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" side="bottom" align="start">
              <PopoverSearchList
                items={availableUsers}
                searchKey={(u) => u.display_name || u.email || ""}
                placeholder="Найти..."
                renderItem={(u) => (
                  <button key={u.id}
                    onClick={() => onUpdateAssignee(sub.id, u.id)}
                    className={cn("flex w-full px-2 py-1.5 rounded text-left text-sm hover:bg-muted transition-colors", sub.assigned_to === u.id && "bg-muted font-medium")}
                  >{u.display_name || "Без имени"}</button>
                )}
                footer={sub.assigned_to ? (
                  <button onClick={() => onUpdateAssignee(sub.id, null)}
                    className="flex w-full px-2 py-1.5 rounded text-left text-sm hover:bg-muted text-destructive transition-colors mt-0.5">Убрать</button>
                ) : undefined}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="text-muted-foreground/30 opacity-0 group-hover/sub:opacity-100 hover:text-foreground mt-0.5 shrink-0 transition-opacity">
            <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {onPromote && (
            <DropdownMenuItem onClick={() => onPromote(sub.id)} className="text-xs gap-2">
              <ArrowUpFromLine className="h-3 w-3" /> Повысить до задачи
            </DropdownMenuItem>
          )}
          {onMoveToTask && (
            <DropdownMenuItem onClick={() => onMoveToTask(sub.id)} className="text-xs gap-2">
              <MoveRight className="h-3 w-3" /> В другую задачу
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => onDelete(sub.id)} className="text-xs gap-2 text-destructive focus:text-destructive">
            <Trash2 className="h-3 w-3" /> Удалить
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
const SortableSubtaskRow = memo(SortableSubtaskRowInner, (prev, next) => (
  prev.sub === next.sub &&
  prev.task === next.task &&
  prev.editingSubtaskId === next.editingSubtaskId &&
  prev.editingSubtaskTitle === next.editingSubtaskTitle &&
  prev.availableUsers === next.availableUsers
));

function TaskItemInner({ task, sortable, initialOpen, onOpened, onTagClick, onProjectClick, selectable, selected, onToggleSelect, onLongPress, sharedTags, sharedUsers, sharedGroups, sharedTagCategories, sharedLinkedTagIds, sharedMutations, sharedTasksWithComments }: TaskItemProps) {
  const isMobile = useIsMobile();
  const { user: currentUser } = useAuth();
  const navigateTo = useNavigate();
  const { pushUndo } = useUndo();
  // Use shared data from parent when available to avoid per-item hook subscriptions
  const _ownMutations = useTaskMutations();
  const mutations = sharedMutations || _ownMutations;
  const { toggleTask, toggleImportant, deleteTask, updateTask, addSubtask, toggleSubtask, deleteSubtask, updateSubtask, reorderSubtasks, promoteSubtaskToTask, demoteTaskToSubtask, moveSubtaskToTask, addTaskTag, removeTaskTag, addParticipant, removeParticipant, submitForApproval, approveTask, rejectTask } = mutations;
  const { data: _ownTags = [] } = useVisibleTags();
  const allTags = sharedTags || _ownTags;
  const _ownLinkedTagIds = useLinkedTagIds();
  const linkedTagIds = sharedLinkedTagIds || _ownLinkedTagIds;
  const { data: _ownUsers = [] } = useAvailableUsers();
  const availableUsers = sharedUsers || _ownUsers;
  const { data: participants = [] } = useTaskParticipants(task.id);
  const { data: _ownGroups = [] } = useTaskGroups();
  const allGroups = sharedGroups || _ownGroups;
  const { data: _ownCategories = [] } = useTagCategories();
  const tagCategories = sharedTagCategories || _ownCategories;
  // Reuse the same queryKey as TaskClientPicker so the cache is shared.
  const { data: clientsList = [] } = useQuery({
    queryKey: ["clients", "task-picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, logo_url")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
    enabled: !!(task as any).client_id,
  });
  const linkedClient = useMemo(() => {
    const cid = (task as any).client_id;
    if (!cid) return null;
    return (clientsList as any[]).find((c) => c.id === cid) ?? null;
  }, [clientsList, (task as any).client_id]);
  const [expanded, setExpanded] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(!!initialOpen);
  // Lazy-load comments only when detail panel is open to avoid N queries
  const { data: chatComments = [] } = useTaskComments(detailsOpen ? task.id : null);
  // Cheap presence flag from bulk query in parent — used to highlight chat icon
  // when the detail panel is closed (we don't fetch full thread for every list row).
  const hasComments = chatComments.length > 0 || (sharedTasksWithComments?.has(task.id) ?? false);
  const [highlighted, setHighlighted] = useState(false);
  const [newSubtask, setNewSubtask] = useState("");
  const [showAddSubtask, setShowAddSubtask] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [userPickerOpen, setUserPickerOpen] = useState<"assignee" | "participant" | "quick-participant" | "quick-assignee" | "reassign" | null>(null);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState(task.description || "");
  const [tagSearch, setTagSearch] = useState("");
  const [suggestedTagIds, setSuggestedTagIds] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const suggestionsLoaded = useRef(false);
  const [aiSubtasks, setAiSubtasks] = useState<string[]>([]);
  const [loadingDecompose, setLoadingDecompose] = useState(false);
  const [closureDialogOpen, setClosureDialogOpen] = useState(false);
  // Defer mounting the heavy closure dialog (file uploads + AI summary)
  // until the user opens it for the first time. After that it stays mounted
  // so subsequent opens are instant.
  const [closureDialogOpenedOnce, setClosureDialogOpenedOnce] = useState(false);
  const openClosureDialog = useCallback(() => {
    setClosureDialogOpenedOnce(true);
    setClosureDialogOpen(true);
  }, []);
  const [savingToWiki, setSavingToWiki] = useState(false);
  const [stepsCollapsed, setStepsCollapsed] = useState(false);
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState("");
  const [moveSubtaskId, setMoveSubtaskId] = useState<string | null>(null);
  const [demoteOpen, setDemoteOpen] = useState(false);
  const subtaskSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const itemRef = useRef<HTMLDivElement>(null);

  const isCreator = currentUser?.id === task.user_id;
  const isPendingApproval = task.approval_status === "pending";

  useEffect(() => {
    if (initialOpen && itemRef.current) {
      itemRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlighted(true);
      const timer = setTimeout(() => {
        setHighlighted(false);
        onOpened?.();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [initialOpen]);

  const subtasks = task.subtasks || [];
  const completedSubs = useMemo(
    () => subtasks.filter(s => s.is_completed).length,
    [subtasks],
  );
  const linkedTagId = useMemo(
    () => (task.group_id ? allGroups.find(g => g.id === task.group_id)?.linked_tag_id ?? null : null),
    [task.group_id, allGroups],
  );
  const taskTagIds = useMemo(
    () => task.task_tags?.map(tt => tt.tag_id) || [],
    [task.task_tags],
  );
  const taskTagIdSet = useMemo(() => new Set(taskTagIds), [taskTagIds]);
  const taskTags = useMemo(
    () => allTags.filter(t => taskTagIdSet.has(t.id) && t.id !== linkedTagId && !linkedTagIds.has(t.id)),
    [allTags, taskTagIdSet, linkedTagId, linkedTagIds],
  );
  const availableTags = useMemo(
    () => allTags.filter(t => !taskTagIdSet.has(t.id) && !linkedTagIds.has(t.id)),
    [allTags, taskTagIdSet, linkedTagIds],
  );

  // Build disambiguation: tags with duplicate names show category path
  const tagCategoryPath = useMemo(() => {
    const catMap = new Map(tagCategories.map(c => [c.id, c]));
    const getPath = (catId: string | null | undefined): string => {
      if (!catId) return "";
      const cat = catMap.get(catId);
      if (!cat) return "";
      const parentPath = cat.parent_id ? getPath(cat.parent_id) : "";
      return parentPath ? `${parentPath} › ${cat.name}` : cat.name;
    };
    const nameCounts = new Map<string, number>();
    allTags.filter(t => !linkedTagIds.has(t.id)).forEach(t => {
      const key = t.name.toLowerCase();
      nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
    });
    const result = new Map<string, string>();
    allTags.forEach(t => {
      if ((nameCounts.get(t.name.toLowerCase()) || 0) > 1) {
        const path = getPath(t.category_id);
        if (path) result.set(t.id, path);
      }
    });
    return result;
  }, [allTags, tagCategories, linkedTagIds]);

  // ── Undoable wrappers ──
  const undoableToggleTask = useCallback(() => {
    const prev = task.is_completed;
    toggleTask.mutate({ id: task.id, is_completed: !prev });
    pushUndo({
      label: prev ? `Восстановлено «${task.title}»` : `Завершено «${task.title}»`,
      undo: () => toggleTask.mutate({ id: task.id, is_completed: prev }),
      redo: () => toggleTask.mutate({ id: task.id, is_completed: !prev }),
    });
  }, [task.id, task.is_completed, task.title, toggleTask, pushUndo]);

  const undoableToggleImportant = useCallback(() => {
    const prev = task.is_important;
    toggleImportant.mutate({ id: task.id, is_important: !prev });
    pushUndo({
      label: !prev ? `⭐ «${task.title}»` : `Снято ⭐ «${task.title}»`,
      undo: () => toggleImportant.mutate({ id: task.id, is_important: prev }),
      redo: () => toggleImportant.mutate({ id: task.id, is_important: !prev }),
    });
  }, [task.id, task.is_important, task.title, toggleImportant, pushUndo]);

  const undoableDeleteTask = useCallback(() => {
    const snap = { ...task, subtasks: [...(task.subtasks || [])], task_tags: [...(task.task_tags || [])] };
    deleteTask.mutate(task.id);
    pushUndo({
      label: `Удалено «${task.title}»`,
      undo: async () => {
        await supabase.from("tasks").insert({
          id: snap.id, title: snap.title, description: snap.description,
          group_id: snap.group_id, user_id: snap.user_id, deadline: snap.deadline,
          is_completed: snap.is_completed, is_important: snap.is_important,
          position: snap.position, priority: snap.priority, assigned_to: snap.assigned_to,
          task_type: snap.task_type, start_at: snap.start_at,
          recurrence: snap.recurrence, recurrence_end_date: snap.recurrence_end_date,
        } as any);
        if (snap.subtasks.length > 0) {
          await supabase.from("subtasks").insert(
            snap.subtasks.map(s => ({ id: s.id, task_id: snap.id, title: s.title, position: s.position, is_completed: s.is_completed, deadline: s.deadline, assigned_to: s.assigned_to }))
          );
        }
        if (snap.task_tags.length > 0) {
          await supabase.from("task_tags").insert(
            snap.task_tags.map(tt => ({ task_id: snap.id, tag_id: tt.tag_id }))
          );
        }
        // Trigger UI refresh
        window.dispatchEvent(new Event("undo-invalidate"));
      },
      redo: () => deleteTask.mutate(snap.id),
    });
  }, [task, deleteTask, pushUndo]);

  const undoableUpdateTask = useCallback((id: string, updates: Partial<Task>) => {
    const prevValues: Record<string, any> = {};
    for (const key of Object.keys(updates)) {
      prevValues[key] = (task as any)[key];
    }
    updateTask.mutate({ id, ...updates });
    const fields: Record<string, string> = { deadline: "срок", description: "описание", title: "название", assigned_to: "ответственный", priority: "приоритет", group_id: "проект" };
    const changedField = fields[Object.keys(updates)[0]] || Object.keys(updates)[0] || "поле";
    pushUndo({
      label: `${changedField} «${task.title}»`,
      undo: () => updateTask.mutate({ id, ...prevValues }),
      redo: () => updateTask.mutate({ id, ...updates }),
    });
  }, [task, updateTask, pushUndo]);

  const fetchTagSuggestions = useCallback(async () => {
    if (suggestionsLoaded.current || availableTags.length === 0) return;
    suggestionsLoaded.current = true;
    setLoadingSuggestions(true);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-tags", {
        body: {
          taskTitle: task.title,
          taskDescription: task.description,
          availableTags: availableTags.map(t => ({ id: t.id, name: t.name })),
        },
      });
      if (!error && data?.suggestedTagIds) {
        setSuggestedTagIds(data.suggestedTagIds);
      }
    } catch (e) {
      console.error("Tag suggestions error:", e);
    } finally {
      setLoadingSuggestions(false);
    }
  }, [task.title, task.description, availableTags]);

  const handleDecompose = useCallback(async () => {
    setLoadingDecompose(true);
    try {
      // Fetch contextual templates from same project
      let taskTemplates: { title: string; subtasks: string[] }[] = [];
      if (task.group_id) {
        const { fetchTaskTemplates } = await import("@/lib/taskTemplates");
        taskTemplates = await fetchTaskTemplates(task.group_id);
      }

      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          message: task.title,
          action: "decompose_task",
          context: {
            title: task.title,
            description: task.description,
            existingSubtasks: subtasks.map(s => s.title),
            taskTemplates,
          },
        },
      });
      if (error) throw error;
      if (data?.error === "rate_limited") {
        const { toast } = await import("sonner");
        toast.error("Слишком много запросов, попробуйте позже");
        return;
      }
      if (data?.error === "payment_required") {
        const { toast } = await import("sonner");
        toast.error("ИИ временно недоступен. Попробуйте позже.");
        return;
      }
      if (data?.subtasks?.length) {
        setAiSubtasks(data.subtasks);
      }
    } catch (e) {
      console.error("Decompose error:", e);
      const { toast } = await import("sonner");
      toast.error("Не удалось разбить задачу");
    } finally {
      setLoadingDecompose(false);
    }
  }, [task.title, task.description, subtasks]);

  const handleSaveToWiki = useCallback(async () => {
    if (!task.group_id || !currentUser) return;
    setSavingToWiki(true);
    try {
      // Build wiki content from task data
      const lines: string[] = [];
      if (task.description) lines.push(task.description);
      if (subtasks.length > 0) {
        lines.push("\n## Шаги");
        subtasks.forEach(s => lines.push(`- [${s.is_completed ? "x" : " "}] ${s.title}`));
      }
      if (task.closure_result) {
        lines.push("\n## Результат");
        lines.push(task.closure_result);
      }
      const content = lines.join("\n");
      const { error } = await supabase.from("wiki_pages").insert({
        group_id: task.group_id,
        user_id: currentUser.id,
        title: `📌 ${task.title}`,
        content,
        icon: "📌",
        page_type: "wiki",
      });
      if (error) throw error;
      toast.success("Задача добавлена в базу знаний");
    } catch (e) {
      console.error("Save to wiki error:", e);
      toast.error("Не удалось сохранить в базу знаний");
    } finally {
      setSavingToWiki(false);
    }
  }, [task, subtasks, currentUser]);

  const participantIds = useMemo(() => participants.map(p => p.user_id), [participants]);

  const handleSubtaskDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const sorted = [...subtasks].sort((a, b) => a.position - b.position);
    const oldIndex = sorted.findIndex(s => s.id === active.id);
    const newIndex = sorted.findIndex(s => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = [...sorted];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    reorderSubtasks.mutate(reordered.map((s, i) => ({ id: s.id, position: i })));
  }, [subtasks, reorderSubtasks]);

  const handleSaveSubtaskTitle = useCallback((subId: string) => {
    if (editingSubtaskTitle.trim() && editingSubtaskId === subId) {
      const sub = subtasks.find(s => s.id === subId);
      if (sub && editingSubtaskTitle.trim() !== sub.title) {
        updateSubtask.mutate({ id: subId, title: editingSubtaskTitle.trim() });
      }
    }
    setEditingSubtaskId(null);
  }, [editingSubtaskTitle, editingSubtaskId, subtasks, updateSubtask]);

  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: task.id, disabled: !sortable });

  const formatDeadline = (deadline: string) => {
    const date = parseISO(deadline);
    if (isToday(date)) return "Сегодня";
    if (isTomorrow(date)) return "Завтра";
    return format(date, "d MMM", { locale: ru });
  };

  const deadlineOverdue = task.deadline && isPast(parseISO(task.deadline)) && !task.is_completed;

  const handleAddSubtask = () => {
    if (newSubtask.trim()) {
      addSubtask.mutate({ task_id: task.id, title: newSubtask.trim() });
      setNewSubtask("");
    }
  };

  const handleSaveTitle = () => {
    if (editTitle.trim() && editTitle !== task.title) {
      updateTask.mutate({ id: task.id, title: editTitle.trim() });
    }
    setEditing(false);
  };

  const handleSaveDescription = () => {
    const newDesc = descriptionDraft.trim() || null;
    if (newDesc !== (task.description || null)) {
      updateTask.mutate({ id: task.id, description: newDesc });
    }
    setEditingDescription(false);
  };

  const getProfileName = (userId: string) => {
    const p = availableUsers.find(u => u.id === userId);
    return p?.display_name || userId.slice(0, 8);
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <>
    <div
      ref={(node) => { setNodeRef(node); (itemRef as React.MutableRefObject<HTMLDivElement | null>).current = node; }}
      style={style}
      className={cn(
        "group bg-card rounded-xl border transition-all duration-300 will-change-auto",
        selected ? "border-primary/40 bg-primary/5" : "border-border",
        task.is_completed ? "opacity-50 hover:opacity-70" : "hover:border-primary/20 hover:shadow-md hover:shadow-primary/5",
        isDragging && "opacity-70 shadow-lg z-50 relative",
        highlighted && "ring-2 ring-primary/40 border-primary/30 shadow-lg shadow-primary/10"
      )}
      onContextMenu={(e) => {
        if (onLongPress && !selectable) {
          e.preventDefault();
          onLongPress();
        }
      }}
    >
      <div className="flex items-start gap-3 p-3.5">
        {/* Selection checkbox */}
        {selectable && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
            className="-m-2 p-2 touch-manipulation"
          >
            <span className={cn(
              "h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-all",
              selected
                ? "bg-primary border-primary"
                : "border-muted-foreground/40 hover:border-primary"
            )}>
              {selected && <Check className="h-3 w-3 text-primary-foreground" />}
            </span>
          </button>
        )}
        {/* Drag handle */}
        {sortable && !selectable && (
          <button
            {...attributes}
            {...listeners}
            className="mt-1 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing shrink-0 touch-none"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        {/* Checkbox */}
        {!selectable && (
          <button
            onClick={(e) => {
              e.stopPropagation();
                if (!task.is_completed && task.requires_approval && task.approval_status !== "approved") {
                openClosureDialog();
              } else {
                undoableToggleTask();
              }
            }}
            className={cn(
              "-m-2 p-2 touch-manipulation",
            )}
          >
            <span className={cn(
              "h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
              task.is_completed
                ? "bg-primary border-primary animate-check-bounce"
                : "border-muted-foreground/40 hover:border-primary"
            )}>
              {task.is_completed && <Check className="h-3 w-3 text-primary-foreground" />}
            </span>
          </button>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {subtasks.length > 0 && (
              <button
                onClick={() => {
                  const end = startMeasure("click", "TaskItem.expandSteps");
                  setExpanded(!expanded);
                  end();
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            )}
            {editing ? (
              <input
                autoFocus
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={handleSaveTitle}
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveTitle(); if (e.key === "Escape") setEditing(false); }}
                className="flex-1 bg-transparent outline-none text-sm font-medium"
              />
            ) : (
              <span
                onDoubleClick={() => { setEditing(true); setEditTitle(task.title); }}
                className={cn("text-sm font-medium cursor-pointer", task.is_completed && "line-through text-muted-foreground")}
                title="Двойной клик для редактирования"
              >
                {task.title}
              </span>
            )}
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {subtasks.length > 0 && (
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                {completedSubs}/{subtasks.length} шагов
                <span className="inline-block w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                  <span
                    className="block h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${Math.round((completedSubs / subtasks.length) * 100)}%` }}
                  />
                </span>
                <span className="text-[10px] text-muted-foreground/70">{Math.round((completedSubs / subtasks.length) * 100)}%</span>
              </span>
            )}
            {task.description && !detailsOpen && (
              <span className="text-xs flex items-center gap-1 text-muted-foreground">
                <FileText className="h-3 w-3" />
              </span>
            )}
            {task.deadline && (
              <span className={cn(
                "text-xs flex items-center gap-1",
                deadlineOverdue ? "text-destructive" : "text-muted-foreground"
              )}>
                <Calendar className="h-3 w-3" />
                {formatDeadline(task.deadline)}
                {(() => {
                  const orig = task.original_deadline;
                  if (!orig || orig === task.deadline) return null;
                  const drift = differenceInDays(parseISO(task.deadline), parseISO(orig));
                  if (drift === 0) return null;
                  return (
                    <span className={cn(
                      "text-[10px] font-medium ml-0.5",
                      drift > 0 ? "text-orange-500" : "text-emerald-500"
                    )}>
                      {drift > 0 ? `+${drift}д` : `${drift}д`}
                    </span>
                  );
                })()}
              </span>
            )}
            {task.deferred_until && new Date(task.deferred_until) > new Date() && (
              <span className="text-xs flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" />
                до {format(parseISO(task.deferred_until), "d MMM", { locale: ru })}
              </span>
            )}
            {task.recurrence && (
              <span className="text-xs flex items-center gap-1 text-muted-foreground">
                <Repeat className="h-3 w-3" />
                {RECURRENCE_LABELS[task.recurrence] || task.recurrence}
              </span>
            )}
            {(() => {
              const p = getPriority(task.priority);
              return p ? (
                <span className={cn("text-xs flex items-center gap-1 font-medium", p.color)}>
                  <Flag className="h-3 w-3" />
                  P{p.value}
                </span>
              ) : null;
            })()}
            {/* Delegation chain chip */}
            {task.delegated_from && task.assigned_to && task.delegated_from !== task.assigned_to && (() => {
              const fromName = getProfileName(task.delegated_from).split(" ")[0];
              const toName = getProfileName(task.assigned_to).split(" ")[0];
              return (
                <span
                  className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-accent/50 text-accent-foreground shrink-0"
                  title={`Делегировано: ${getProfileName(task.delegated_from)} \u2192 ${getProfileName(task.assigned_to)}`}
                >
                  <Forward className="h-2.5 w-2.5 shrink-0" />
                  {fromName}
                  <ArrowRight className="h-2 w-2 shrink-0 text-muted-foreground" />
                  {toName}
                </span>
              );
            })()}
            {/* Client chip — shown when task is linked to a CRM client */}
            {linkedClient && (
              <span
                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary shrink-0 max-w-[160px]"
                title={`Клиент: ${linkedClient.name}`}
              >
                <ClientAvatar client={linkedClient} size="xs" />
                <span className="truncate">{linkedClient.name}</span>
              </span>
            )}
            {(() => {
              const MAX_CHIPS = 2;
              const MAX_EXPAND = 3;
              const assigneeParticipant = participants.find(p => p.role === "assignee");
              // If assigned_to exists but no participant record, show assignee directly
              const hasAssigneeFromField = task.assigned_to && !assigneeParticipant;
              const syntheticAssignee = hasAssigneeFromField
                ? { id: `synth-${task.assigned_to}`, user_id: task.assigned_to!, role: "assignee" as const, task_id: task.id, created_at: "" }
                : null;
              const allParticipants = syntheticAssignee
                ? [syntheticAssignee, ...participants]
                : participants;
              if (allParticipants.length === 0) {
                // Если нет пользователей-исполнителей, но есть отдел/подрядчик — покажем чип
                if (task.department_id || task.contractor_id) {
                  return <AssigneeBadge departmentId={task.department_id} contractorId={task.contractor_id} />;
                }
                return null;
              }
              const assignee = allParticipants.find(p => p.role === "assignee");
              const sorted = assignee
                ? [assignee, ...allParticipants.filter(p => p.id !== assignee.id)]
                : allParticipants;
              const shown = sorted.slice(0, MAX_CHIPS);
              const expandable = sorted.slice(MAX_CHIPS, MAX_CHIPS + MAX_EXPAND);
              const remaining = sorted.length - MAX_CHIPS - expandable.length;

              return (
                <span
                  className="inline-flex items-center gap-1 group/participants"
                  title={sorted.map(p => getProfileName(p.user_id)).join(", ")}
                >
                  {shown.map(p => (
                    <span
                      key={p.id}
                      className={cn(
                        "inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full transition-colors shrink-0",
                        p.role === "assignee"
                          ? "bg-primary/15 text-primary font-semibold"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {getProfileName(p.user_id).split(" ")[0]}
                    </span>
                  ))}
                  {(expandable.length > 0 || remaining > 0) && (
                    <>
                      <span className="text-[10px] px-1 py-0.5 rounded-full bg-muted text-muted-foreground/60 group-hover/participants:hidden transition-all shrink-0">
                        +{expandable.length + remaining}
                      </span>
                      {expandable.map(p => (
                        <span
                          key={p.id}
                          className={cn(
                            "hidden group-hover/participants:inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full animate-scale-in shrink-0",
                            p.role === "assignee"
                              ? "bg-primary/15 text-primary font-semibold"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {getProfileName(p.user_id).split(" ")[0]}
                        </span>
                      ))}
                      {remaining > 0 && (
                        <span className="hidden group-hover/participants:inline-flex text-[10px] px-1 py-0.5 rounded-full bg-muted text-muted-foreground/60 animate-scale-in shrink-0">
                          +{remaining}
                        </span>
                      )}
                    </>
                  )}
                  <AssigneeBadge departmentId={task.department_id} contractorId={task.contractor_id} />
                </span>
              );
            })()}
            {/* Project badge */}
            {task.group_id && (() => {
              const group = allGroups.find(g => g.id === task.group_id);
              if (!group) return null;
              const parentGroup = group.parent_id ? allGroups.find(g => g.id === group.parent_id) : null;
              return (
                <span className="inline-flex items-center gap-1 text-xs font-medium">
                  {parentGroup && (
                    <>
                      <span
                        className="inline-flex items-center gap-1 cursor-pointer hover:opacity-70 transition-opacity"
                        style={{ color: parentGroup.color || '#3b82f6' }}
                        onClick={(e) => { e.stopPropagation(); onProjectClick?.(parentGroup.id); }}
                      >
                        <ProjectIcon group={parentGroup} size="xs" fallbackEmoji="📁" />
                        {parentGroup.name}
                      </span>
                      <span className="text-muted-foreground">/</span>
                    </>
                  )}
                  <span
                    className="inline-flex items-center gap-1 cursor-pointer hover:opacity-70 transition-opacity"
                    style={{ color: group.color || '#3b82f6' }}
                    onClick={(e) => { e.stopPropagation(); onProjectClick?.(group.id); }}
                  >
                    {!parentGroup && <ProjectIcon group={group} size="xs" fallbackEmoji="📁" />}
                    {group.name}
                  </span>
                  {!group.parent_id && (
                    <span
                      className="p-0.5 cursor-pointer text-muted-foreground hover:text-primary transition-colors"
                      onClick={(e) => { e.stopPropagation(); navigateTo(`/pmo/project/${group.id}?view=gantt`); }}
                      title="Открыть в PMO (Гант)"
                    >
                      <GanttChart className="h-3 w-3" />
                    </span>
                  )}
                </span>
              );
            })()}
            {/* Source protocol badge — задача вышла из протокола встречи */}
            {task.source_protocol_id && task.source_protocol_id !== task.group_id && (() => {
              const protocolGroup = allGroups.find(g => g.id === task.source_protocol_id);
              if (!protocolGroup) return null;
              const meetingDateStr = (protocolGroup as any).protocol_meta?.meeting_date as string | undefined;
              const dateSource = meetingDateStr || protocolGroup.created_at;
              const formattedDate = dateSource ? format(parseISO(dateSource), "d MMM", { locale: ru }) : "";
              return (
                <span
                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300 cursor-pointer hover:bg-purple-500/20 transition-colors shrink-0"
                  onClick={(e) => { e.stopPropagation(); navigateTo(`/protocols/${protocolGroup.id}`); }}
                  title={`Из протокола: ${protocolGroup.name}`}
                >
                  <FileText className="h-2.5 w-2.5" />
                  из протокола{formattedDate && ` от ${formattedDate}`}
                </span>
              );
            })()}
            {/* Внутренняя пометка убрана из общих списков. В будущем — возможно "внешняя". */}
            {taskTags.map(tag => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full cursor-pointer hover:opacity-80 transition-opacity"
                style={{ backgroundColor: `${tag.color}20`, color: tag.color || undefined }}
                onClick={(e) => { e.stopPropagation(); onTagClick?.(tag.id); }}
              >
                {tag.name}
              </span>
            ))}
            {/* Approval status badges */}
            {task.requires_approval && !task.is_completed && !isPendingApproval && (
              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-accent text-accent-foreground shrink-0">
                <ShieldCheck className="h-2.5 w-2.5" />
                Утверждение
              </span>
            )}
            {isPendingApproval && (
              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-medium shrink-0 animate-pulse">
                ⏳ На утверждении
              </span>
            )}
          </div>
        </div>

        {/* Actions — always visible 3×2 grid */}
        <div className="grid grid-cols-3 gap-0.5 shrink-0" style={{ width: 'auto' }}>
          <button
            onClick={() => {
              const next = !detailsOpen;
              const end = next ? startMeasure("panel-open", "TaskItem.details") : null;
              setDetailsOpen(next);
              end?.();
            }}
            className={cn(
              "p-1.5 rounded transition-colors",
              detailsOpen ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
            title="Детали"
          >
            <Expand className="h-3.5 w-3.5" />
          </button>

          <LazyMount
            forceMount={userPickerOpen === "quick-participant"}
            trigger={
              <button className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors" title="Участник">
                <UserPlus className="h-3.5 w-3.5" />
              </button>
            }
          >
            {(open, setOpen) => (
              <MultiAssigneePicker
                users={availableUsers}
                excludeIds={participantIds}
                open={open || userPickerOpen === "quick-participant"}
                onOpenChange={(o) => { setOpen(o); setUserPickerOpen(o ? "quick-participant" : null); }}
                onSelectUsers={(ids) => {
                  ids.forEach((uid) =>
                    addParticipant.mutate({ task_id: task.id, user_id: uid, role: "participant" })
                  );
                }}
                trigger={
                  <button className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors" title="Участник">
                    <UserPlus className="h-3.5 w-3.5" />
                  </button>
                }
              />
            )}
          </LazyMount>

          <LazyMount
            forceMount={userPickerOpen === "quick-assignee"}
            trigger={
              <button className={cn(
                "p-1.5 rounded transition-colors",
                (task.assigned_to || task.department_id || task.contractor_id) ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )} title="Ответственный">
                <Wand2 className="h-3.5 w-3.5" />
              </button>
            }
          >
            {(open, setOpen) => (
              <AssigneePicker
                users={availableUsers}
                current={
                  task.department_id
                    ? { kind: "department", id: task.department_id }
                    : task.contractor_id
                    ? { kind: "contractor", id: task.contractor_id }
                    : task.assigned_to
                    ? { kind: "user", id: task.assigned_to }
                    : { kind: null, id: null }
                }
                open={open || userPickerOpen === "quick-assignee"}
                onOpenChange={(o) => { setOpen(o); setUserPickerOpen(o ? "quick-assignee" : null); }}
                onSelect={(sel) => {
                  const currentAssignee = participants.find(p => p.role === "assignee");
                  if (sel.kind === "user" && sel.id) {
                    if (task.department_id || task.contractor_id) {
                      updateTask.mutate({ id: task.id, department_id: null, contractor_id: null });
                    }
                    addParticipant.mutate({ task_id: task.id, user_id: sel.id, role: "assignee" });
                  } else if (sel.kind === "department" && sel.id) {
                    if (currentAssignee) removeParticipant.mutate({ task_id: task.id, user_id: currentAssignee.user_id });
                    updateTask.mutate({ id: task.id, department_id: sel.id, contractor_id: null });
                  } else if (sel.kind === "contractor" && sel.id) {
                    if (currentAssignee) removeParticipant.mutate({ task_id: task.id, user_id: currentAssignee.user_id });
                    updateTask.mutate({ id: task.id, contractor_id: sel.id, department_id: null });
                  } else {
                    if (currentAssignee) removeParticipant.mutate({ task_id: task.id, user_id: currentAssignee.user_id });
                    updateTask.mutate({ id: task.id, department_id: null, contractor_id: null });
                  }
                }}
                trigger={
                  <button className={cn(
                    "p-1.5 rounded transition-colors",
                    (task.assigned_to || task.department_id || task.contractor_id) ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  )} title="Ответственный">
                    <Wand2 className="h-3.5 w-3.5" />
                  </button>
                }
              />
            )}
          </LazyMount>

          <DeadlineQuickPopover task={task} onUpdate={(id, updates) => undoableUpdateTask(id, updates)} />

          <Popover onOpenChange={(open) => { if (open) { setTagSearch(""); fetchTagSuggestions(); } }}>
            <PopoverTrigger asChild>
              <button className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors" title="Тэг">
                <Tag className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2 bg-popover border-border z-50" side="left" onOpenAutoFocus={(e) => e.preventDefault()}>
              <div className="space-y-1">
                <input
                  type="text"
                  placeholder="Найти тэг..."
                  value={tagSearch}
                  onChange={(e) => setTagSearch(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm bg-muted/50 border border-border rounded outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
                  autoFocus
                />
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {!tagSearch && suggestedTagIds.length > 0 && (
                    <>
                      <p className="text-[10px] font-medium text-muted-foreground px-2 py-0.5 flex items-center gap-1">
                        <Sparkles className="h-3 w-3 text-primary" /> ИИ-рекомендации
                      </p>
                      {availableTags
                        .filter(t => suggestedTagIds.includes(t.id))
                        .map(tag => (
                          <button
                            key={`ai-${tag.id}`}
                            onClick={() => { addTaskTag.mutate({ task_id: task.id, tag_id: tag.id }); setTagSearch(""); }}
                            className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-primary/10 transition-colors border-l-2 border-primary/30"
                          >
                            <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color || undefined }} />
                            <span className="truncate">{tag.name}{tagCategoryPath.get(tag.id) && <span className="text-muted-foreground text-[10px] ml-1 opacity-60">{tagCategoryPath.get(tag.id)}</span>}</span>
                            <Sparkles className="h-3 w-3 text-primary/50 ml-auto shrink-0" />
                          </button>
                        ))}
                      <div className="border-t border-border my-1" />
                    </>
                  )}
                  {!tagSearch && loadingSuggestions && (
                    <p className="text-[10px] text-muted-foreground px-2 py-1 flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Подбираем тэги...
                    </p>
                  )}
                  {availableTags.filter(t => ((t.name + " " + (tagCategoryPath.get(t.id) || "")).toLowerCase().includes(tagSearch.toLowerCase()))).length === 0 && (
                    <p className="text-xs text-muted-foreground px-2 py-1">Нет тэгов</p>
                  )}
                  {availableTags
                    .filter(t => ((t.name + " " + (tagCategoryPath.get(t.id) || "")).toLowerCase().includes(tagSearch.toLowerCase())))
                    .filter(t => tagSearch || !suggestedTagIds.includes(t.id))
                    .map(tag => (
                      <button
                        key={tag.id}
                        onClick={() => { addTaskTag.mutate({ task_id: task.id, tag_id: tag.id }); setTagSearch(""); }}
                        className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors"
                      >
                        <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color || undefined }} />
                        <span className="truncate">{tag.name}{tagCategoryPath.get(tag.id) && <span className="text-muted-foreground text-[10px] ml-1 opacity-60">{tagCategoryPath.get(tag.id)}</span>}</span>
                      </button>
                    ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <button
            onClick={() => undoableToggleImportant()}
            className={cn(
              "p-1.5 rounded transition-colors",
              task.is_important ? "text-warning" : "text-muted-foreground hover:text-warning"
            )}
            title="Важная"
          >
            <Star className={cn("h-3.5 w-3.5", task.is_important && "fill-current")} />
          </button>

          {/* Row 3: Chat, Project, AI */}
          <button
            onClick={() => {
              if (!detailsOpen) {
                setDetailsOpen(true);
                setTimeout(() => {
                  const el = document.getElementById(`task-chat-${task.id}`);
                  el?.scrollIntoView({ behavior: "smooth", block: "center" });
                  el?.querySelector("input")?.focus();
                }, 150);
              } else {
                const el = document.getElementById(`task-chat-${task.id}`);
                if (el) {
                  el.scrollIntoView({ behavior: "smooth", block: "center" });
                  el.querySelector("input")?.focus();
                }
              }
            }}
            className={cn(
              "p-1.5 rounded transition-colors",
              hasComments ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
            title="Чат"
          >
            <MessageCircle className={cn("h-3.5 w-3.5", hasComments && "fill-primary/20")} />
          </button>

          <Popover>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "p-1.5 rounded transition-colors",
                  task.group_id ? "text-primary" : "text-muted-foreground hover:text-primary"
                )}
                title={task.group_id ? "Сменить проект" : "В проект"}
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-2 bg-popover border-border z-50" side="left">
              <PopoverSearchList
                items={allGroups.filter(g => !g.parent_id)}
                searchKey={(g) => g.name}
                placeholder="Найти проект..."
                emptyText="Нет проектов"
                renderItem={(g) => {
                  const subs = allGroups.filter(s => s.parent_id === g.id);
                  return (
                    <div key={g.id}>
                      <button
                        onClick={() => updateTask.mutate({ id: task.id, group_id: g.id })}
                        className={cn(
                          "flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors",
                          task.group_id === g.id && "bg-primary/10 text-primary"
                        )}
                      >
                        <ProjectIcon group={g} size="xs" fallbackEmoji="📁" />
                        <span className="truncate" style={{ color: g.color || undefined }}>{g.name}</span>
                      </button>
                      {subs.map(sub => (
                        <button
                          key={sub.id}
                          onClick={() => updateTask.mutate({ id: task.id, group_id: sub.id })}
                          className={cn(
                            "flex items-center gap-2 w-full pl-6 pr-2 py-1 rounded text-xs hover:bg-muted transition-colors text-muted-foreground",
                            task.group_id === sub.id && "bg-primary/10 text-primary"
                          )}
                        >
                          <span className="truncate" style={{ color: sub.color || undefined }}>{sub.name}</span>
                        </button>
                      ))}
                    </div>
                  );
                }}
              />
              {task.group_id && (
                <button
                  onClick={() => updateTask.mutate({ id: task.id, group_id: null })}
                  className="mt-1 text-xs text-destructive hover:underline w-full text-left px-2 py-1 border-t border-border pt-1.5"
                >
                  Убрать из проекта
                </button>
              )}
            </PopoverContent>
          </Popover>

          <TaskClientPicker
            clientId={(task as any).client_id ?? null}
            onChange={(clientId) =>
              updateTask.mutate({ id: task.id, client_id: clientId } as any)
            }
          />
        </div>
      </div>

      {/* Expandable details panel */}
      {detailsOpen && (() => {
        const detailsContent = (
          <div className={cn(
            "space-y-3",
            isMobile ? "px-4 pb-4 pt-2" : "px-3.5 pb-3 ml-8 border-t border-border pt-3"
          )}>
            {isMobile && <h2 className="text-sm font-semibold text-foreground mb-2">{task.title}</h2>}

            {/* Overdue alert banner */}
            {deadlineOverdue && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
                <span className="text-destructive text-xs font-semibold flex items-center gap-1">
                  ⚠ Просрочено на {differenceInDays(new Date(), parseISO(task.deadline!))} дн.
                </span>
              </div>
            )}

            {/* Quick actions: close + reschedule */}
            <div className="flex items-center gap-2 flex-wrap">
              {!task.is_completed && (
                <button
                  onClick={() => {
                    if (task.requires_approval && task.approval_status !== "approved") {
                      openClosureDialog();
                    } else {
                      undoableToggleTask();
                    }
                  }}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
                >
                  <Check className="h-3.5 w-3.5" />
                  Закрыть задачу
                </button>
              )}
              {task.is_completed && (
                <button
                  onClick={() => undoableToggleTask()}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors font-medium"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                  Вернуть в работу
                </button>
              )}
              {!task.is_completed && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors font-medium">
                      <Calendar className="h-3.5 w-3.5" />
                      Перенести срок
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-1.5 bg-popover border-border z-50" side="bottom">
                    <p className="text-xs font-medium text-muted-foreground px-2 py-1">Перенести на</p>
                    {[
                      { label: "Завтра", days: 1 },
                      { label: "Через 3 дня", days: 3 },
                      { label: "Через неделю", days: 7 },
                      { label: "Через 2 недели", days: 14 },
                    ].map(opt => {
                      const d = new Date();
                      d.setDate(d.getDate() + opt.days);
                      const val = format(d, "yyyy-MM-dd");
                      return (
                        <button
                          key={opt.days}
                          onClick={() => undoableUpdateTask(task.id, { deadline: val })}
                          className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors"
                        >
                          {opt.label}
                          <span className="ml-auto text-[10px] text-muted-foreground">{format(d, "d MMM", { locale: ru })}</span>
                        </button>
                      );
                    })}
                  </PopoverContent>
                </Popover>
              )}
            </div>

            {/* Project line — visible in detail */}
            {task.group_id && (() => {
              const group = allGroups.find(g => g.id === task.group_id);
              if (!group) return null;
              const parentGroup = group.parent_id ? allGroups.find(g => g.id === group.parent_id) : null;
              return (
                <div className="flex items-center gap-1.5 text-xs">
                  <FolderOpen className="h-3 w-3 text-muted-foreground shrink-0" />
                  {parentGroup && (
                    <>
                      <span
                        className="inline-flex items-center gap-1 cursor-pointer hover:underline underline-offset-2"
                        style={{ color: parentGroup.color || '#3b82f6' }}
                        onClick={() => onProjectClick?.(parentGroup.id)}
                      >
                        <ProjectIcon group={parentGroup} size="xs" fallbackEmoji="📁" />
                        {parentGroup.name}
                      </span>
                      <span className="text-muted-foreground/40">/</span>
                    </>
                  )}
                  <span
                    className="inline-flex items-center gap-1 font-medium cursor-pointer hover:underline underline-offset-2"
                    style={{ color: group.color || '#3b82f6' }}
                    onClick={() => onProjectClick?.(group.id)}
                  >
                    {!parentGroup && <ProjectIcon group={group} size="xs" fallbackEmoji="📁" />}
                    {group.name}
                  </span>
                </div>
              );
            })()}

          {/* Source protocol section — context of meeting */}
          {task.source_protocol_id && task.source_protocol_id !== task.group_id && (() => {
            const protocolGroup = allGroups.find(g => g.id === task.source_protocol_id);
            if (!protocolGroup) return null;
            const meta = (protocolGroup as any).protocol_meta ?? {};
            const meetingDateStr = meta.meeting_date as string | undefined;
            const dateSource = meetingDateStr || protocolGroup.created_at;
            const formattedDate = dateSource ? format(parseISO(dateSource), "d MMMM yyyy", { locale: ru }) : "—";
            const fmtLabel: Record<string, string> = { offline: "Офлайн", online: "Онлайн", hybrid: "Гибрид", call: "Звонок" };
            const formatStr = meta.format ? fmtLabel[meta.format] || meta.format : null;
            const location = meta.location as string | undefined;
            return (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <FileText className="h-3 w-3" /> Источник
                </p>
                <button
                  onClick={() => navigateTo(`/protocols/${protocolGroup.id}`)}
                  className="w-full text-left rounded-lg border border-purple-500/30 bg-purple-500/5 hover:bg-purple-500/10 transition-colors px-3 py-2 group/source"
                >
                  <div className="flex items-center gap-2 text-xs font-medium text-purple-700 dark:text-purple-300">
                    <FileText className="h-3 w-3 shrink-0" />
                    <span className="truncate">Протокол от {formattedDate}</span>
                    <ArrowRight className="h-3 w-3 ml-auto opacity-0 group-hover/source:opacity-100 transition-opacity" />
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {protocolGroup.name}
                  </div>
                  {(formatStr || location) && (
                    <div className="text-[10px] text-muted-foreground/80 mt-0.5 flex items-center gap-1.5">
                      {formatStr && <span>{formatStr}</span>}
                      {formatStr && location && <span className="opacity-40">•</span>}
                      {location && <span className="truncate">{location}</span>}
                    </div>
                  )}
                </button>
              </div>
            );
          })()}

          {/* Description */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <FileText className="h-3 w-3" /> Описание
            </p>
            {editingDescription ? (
              <div className="space-y-1.5">
                <Textarea
                  autoFocus
                  value={descriptionDraft}
                  onChange={(e) => setDescriptionDraft(e.target.value)}
                  placeholder="Добавьте описание..."
                  className="text-sm min-h-[60px] resize-none"
                />
                <div className="flex gap-2">
                  <button onClick={handleSaveDescription} className="text-xs text-primary hover:text-primary/80">Сохранить</button>
                  <button onClick={() => { setEditingDescription(false); setDescriptionDraft(task.description || ""); }} className="text-xs text-muted-foreground hover:text-foreground">Отмена</button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => { setEditingDescription(true); setDescriptionDraft(task.description || ""); }}
                className="text-sm text-foreground/80 cursor-pointer hover:bg-muted/50 rounded px-2 py-1.5 min-h-[32px] transition-colors"
              >
                {task.description || <span className="text-muted-foreground italic">Нажмите чтобы добавить описание...</span>}
              </div>
            )}
          </div>

          {/* Assignee */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <UserPlus className="h-3 w-3" /> Ответственный
            </p>
            {(() => {
              const assignee = participants.find(p => p.role === "assignee");
              const canReassign = assignee && currentUser && assignee.user_id === currentUser.id;
              const delegatedFromName = task.delegated_from ? getProfileName(task.delegated_from) : null;
              const hasDelegation = !!(task.department_id || task.contractor_id);
              const currentSelection: AssigneeSelection = task.department_id
                ? { kind: "department", id: task.department_id }
                : task.contractor_id
                ? { kind: "contractor", id: task.contractor_id }
                : assignee
                ? { kind: "user", id: assignee.user_id }
                : { kind: null, id: null };
              const handleAssigneeSelect = (sel: AssigneeSelection) => {
                if (sel.kind === "user" && sel.id) {
                  // очистить отдел/подрядчика и назначить пользователя
                  updateTask.mutate({ id: task.id, department_id: null, contractor_id: null });
                  addParticipant.mutate({ task_id: task.id, user_id: sel.id, role: "assignee" });
                } else if (sel.kind === "department" && sel.id) {
                  // снять текущего ответственного, проставить отдел
                  if (assignee) removeParticipant.mutate({ task_id: task.id, user_id: assignee.user_id });
                  updateTask.mutate({ id: task.id, department_id: sel.id, contractor_id: null });
                } else if (sel.kind === "contractor" && sel.id) {
                  if (assignee) removeParticipant.mutate({ task_id: task.id, user_id: assignee.user_id });
                  updateTask.mutate({ id: task.id, contractor_id: sel.id, department_id: null });
                } else {
                  // полностью снять
                  if (assignee) removeParticipant.mutate({ task_id: task.id, user_id: assignee.user_id });
                  updateTask.mutate({ id: task.id, department_id: null, contractor_id: null });
                }
              };
              if (hasDelegation && !assignee) {
                return (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <AssigneeBadge departmentId={task.department_id} contractorId={task.contractor_id} size="sm" />
                      <button
                        onClick={() => updateTask.mutate({ id: task.id, department_id: null, contractor_id: null })}
                        className="text-xs text-muted-foreground hover:text-destructive"
                        title="Снять делегирование"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <AssigneePicker
                      users={availableUsers}
                      current={currentSelection}
                      open={userPickerOpen === "assignee"}
                      onOpenChange={(open) => setUserPickerOpen(open ? "assignee" : null)}
                      onSelect={handleAssigneeSelect}
                      side="bottom"
                      trigger={
                        <button className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
                          <Forward className="h-2.5 w-2.5" /> Изменить
                        </button>
                      }
                    />
                  </div>
                );
              }
              return assignee ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-primary font-semibold">{getProfileName(assignee.user_id)}</span>
                    <button
                      onClick={() => removeParticipant.mutate({ task_id: task.id, user_id: assignee.user_id })}
                      className="text-xs text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  {delegatedFromName && (
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Forward className="h-3 w-3" />
                      <span>Делегировано от <span className="font-medium text-foreground">{delegatedFromName}</span></span>
                    </div>
                  )}
                  {canReassign && (
                    <UserPicker
                      users={availableUsers}
                      excludeIds={[currentUser!.id]}
                      title="Переназначить задачу"
                      placeholder="Кому передать?"
                      open={userPickerOpen === "reassign"}
                      onOpenChange={(open) => setUserPickerOpen(open ? "reassign" : null)}
                      onSelect={(u) => {
                        updateTask.mutate({ id: task.id, assigned_to: u.id, delegated_from: currentUser!.id });
                        addParticipant.mutate({ task_id: task.id, user_id: u.id, role: "assignee" });
                      }}
                      side="bottom"
                      trigger={
                        <button className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
                          <Forward className="h-2.5 w-2.5" /> Переназначить
                        </button>
                      }
                    />
                  )}
                </div>
              ) : (
                <AssigneePicker
                  users={availableUsers}
                  current={currentSelection}
                  open={userPickerOpen === "assignee"}
                  onOpenChange={(open) => setUserPickerOpen(open ? "assignee" : null)}
                  onSelect={handleAssigneeSelect}
                  side="bottom"
                  trigger={
                    <button className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
                      <Plus className="h-2.5 w-2.5" /> Назначить
                    </button>
                  }
                />
              );
            })()}
          </div>

          {/* Participants */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Users className="h-3 w-3" /> Участники
            </p>
            <div className="space-y-1">
              {participants.filter(p => p.role === "participant" || p.role === "creator").map(p => (
                <div key={p.id} className="flex items-center gap-2">
                  <span className="text-sm text-foreground">{getProfileName(p.user_id)}</span>
                  <button
                    onClick={() => removeParticipant.mutate({ task_id: task.id, user_id: p.user_id })}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <MultiAssigneePicker
                users={availableUsers}
                excludeIds={participantIds}
                open={userPickerOpen === "participant"}
                onOpenChange={(open) => setUserPickerOpen(open ? "participant" : null)}
                onSelectUsers={(ids) => {
                  ids.forEach((uid) =>
                    addParticipant.mutate({ task_id: task.id, user_id: uid, role: "participant" })
                  );
                }}
                side="bottom"
                trigger={
                  <button className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
                    <Plus className="h-2.5 w-2.5" /> Участник
                  </button>
                }
              />
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Tag className="h-3 w-3" /> Тэги
            </p>
            <div className="flex flex-wrap gap-1.5">
              {taskTags.map(tag => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full"
                  style={{ backgroundColor: `${tag.color}20`, color: tag.color || undefined }}
                >
                  {tag.name}
                  <X className="h-2.5 w-2.5 cursor-pointer opacity-60 hover:opacity-100" onClick={() => removeTaskTag.mutate({ task_id: task.id, tag_id: tag.id })} />
                </span>
              ))}
              {availableTags.length > 0 && (
                <Popover modal={false} onOpenChange={(open) => { if (open) { setTagSearch(""); fetchTagSuggestions(); } }}>
                  <PopoverTrigger asChild>
                    <button className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
                      <Plus className="h-2.5 w-2.5" /> Тэг
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2 z-[60]" side="bottom" onOpenAutoFocus={(e) => e.preventDefault()} onWheel={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      placeholder="Найти тэг..."
                      value={tagSearch}
                      onChange={(e) => setTagSearch(e.target.value)}
                      className="w-full px-2 py-1.5 text-sm bg-muted/50 border border-border rounded outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground mb-1"
                      autoFocus
                    />
                    <div className="max-h-48 overflow-y-auto overscroll-contain space-y-0.5" onWheelCapture={(e) => e.stopPropagation()} onTouchMoveCapture={(e) => e.stopPropagation()}>
                      {/* AI Suggestions */}
                      {!tagSearch && suggestedTagIds.length > 0 && (
                        <>
                          <p className="text-[10px] font-medium text-muted-foreground px-2 py-0.5 flex items-center gap-1">
                            <Sparkles className="h-3 w-3 text-primary" /> ИИ-рекомендации
                          </p>
                          {availableTags
                            .filter(t => suggestedTagIds.includes(t.id))
                            .map(tag => (
                              <button
                                key={`ai-${tag.id}`}
                                onClick={() => { addTaskTag.mutate({ task_id: task.id, tag_id: tag.id }); setTagSearch(""); }}
                                className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-primary/10 transition-colors border-l-2 border-primary/30"
                              >
                                <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color || undefined }} />
                                <span className="truncate">{tag.name}{tagCategoryPath.get(tag.id) && <span className="text-muted-foreground text-[10px] ml-1 opacity-60">{tagCategoryPath.get(tag.id)}</span>}</span>
                                <Sparkles className="h-3 w-3 text-primary/50 ml-auto shrink-0" />
                              </button>
                            ))}
                          <div className="border-t border-border my-1" />
                        </>
                      )}
                      {!tagSearch && loadingSuggestions && (
                        <p className="text-[10px] text-muted-foreground px-2 py-1 flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" /> Подбираем тэги...
                        </p>
                      )}
                      {availableTags
                        .filter(t => ((t.name + " " + (tagCategoryPath.get(t.id) || "")).toLowerCase().includes(tagSearch.toLowerCase())))
                        .filter(t => tagSearch || !suggestedTagIds.includes(t.id))
                        .map(tag => (
                          <button
                            key={tag.id}
                            onClick={() => { addTaskTag.mutate({ task_id: task.id, tag_id: tag.id }); setTagSearch(""); }}
                            className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors"
                          >
                            <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color || undefined }} />
                            <span className="truncate">{tag.name}{tagCategoryPath.get(tag.id) && <span className="text-muted-foreground text-[10px] ml-1 opacity-60">{tagCategoryPath.get(tag.id)}</span>}</span>
                          </button>
                        ))}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>

          {/* Project */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <FolderOpen className="h-3 w-3" /> Проект
            </p>
            <div className="flex items-center gap-2">
              {task.group_id && allGroups.find(g => g.id === task.group_id) ? (
                <>
                  <span className="text-sm text-foreground">
                    {allGroups.find(g => g.id === task.group_id)!.name}
                  </span>
                  <button
                    onClick={() => updateTask.mutate({ id: task.id, group_id: null })}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </>
              ) : null}
              <Popover modal={false}>
                <PopoverTrigger asChild>
                  <button className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
                    <Plus className="h-2.5 w-2.5" /> {task.group_id ? "Изменить" : "Назначить"}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2 z-[60]" side="bottom" onOpenAutoFocus={(e) => e.preventDefault()} onWheel={(e) => e.stopPropagation()}>
                  <PopoverSearchList
                    items={filterRealProjects(allGroups as any[]).filter(g => g.id !== task.group_id)}
                    searchKey={(g) => g.name}
                    header={<p className="text-xs font-medium text-muted-foreground px-2 py-1">Выберите проект</p>}
                    placeholder="Найти проект..."
                    emptyText="Нет проектов"
                    renderItem={(g) => (
                      <button
                        key={g.id}
                        onClick={() => updateTask.mutate({ id: task.id, group_id: g.id })}
                        className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors"
                      >
                        <FolderOpen className="h-3 w-3 text-muted-foreground" />
                        {g.name}
                      </button>
                    )}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Dates */}
          <DeadlineDetailSection task={task} onUpdate={(id, updates) => undoableUpdateTask(id, updates)} />

          {/* Recurrence */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Repeat className="h-3 w-3" /> Повтор
            </p>
            <div className="flex items-center gap-2">
              <select
                value={task.recurrence || ""}
                onChange={(e) => updateTask.mutate({ id: task.id, recurrence: e.target.value || null })}
                className="text-xs bg-muted/50 outline-none border border-border rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
              >
                <option value="">Без повтора</option>
                <option value="daily">Ежедневно</option>
                <option value="weekdays">По будням (Пн-Пт)</option>
                <option value="every2days">Каждые 2 дня</option>
                <option value="every3days">Каждые 3 дня</option>
                <option value="weekly">Еженедельно</option>
                <option value="biweekly">Каждые 2 недели</option>
                <option value="monthly">Ежемесячно</option>
                <option value="quarterly">Ежеквартально</option>
                <option value="semiannually">Каждые 6 месяцев</option>
                <option value="yearly">Ежегодно</option>
              </select>
              {task.recurrence && (
                <button onClick={() => updateTask.mutate({ id: task.id, recurrence: null })} className="text-muted-foreground hover:text-destructive transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Flag className="h-3 w-3" /> Приоритет
            </p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {PRIORITIES.map(p => {
                const isActive = task.priority === p.value;
                return (
                  <button
                    key={p.value}
                    onClick={() => updateTask.mutate({ id: task.id, priority: isActive ? null : p.value })}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded-lg border transition-all font-medium",
                      isActive
                        ? `${p.bgColor} ${p.color} border-current`
                        : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                    )}
                  >
                    P{p.value}
                  </button>
                );
              })}
              <button
                onClick={() => undoableToggleImportant()}
                className={cn(
                  "p-1 rounded-lg border transition-all",
                  task.is_important
                    ? "text-warning border-warning/30 bg-warning/10"
                    : "border-border text-muted-foreground hover:text-warning hover:border-warning/30"
                )}
                title={task.is_important ? "Убрать важность" : "Сделать важной"}
              >
                <Star className={cn("h-3.5 w-3.5", task.is_important && "fill-current")} />
              </button>
            </div>
          </div>

          {/* Approval toggle */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <ShieldCheck className="h-3 w-3" /> Утверждение
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => updateTask.mutate({ id: task.id, requires_approval: !task.requires_approval })}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-lg border transition-all font-medium",
                  task.requires_approval
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                )}
              >
                {task.requires_approval ? "✓ Требует утверждения" : "Не требует"}
              </button>
            </div>
            {/* Approval actions for task creator */}
            {isPendingApproval && isCreator && (
              <TaskApprovalActions
                taskTitle={task.title}
                closureResult={task.closure_result}
                closureAttachments={Array.isArray(task.closure_attachments) ? (task.closure_attachments as string[]) : []}
                onApprove={() => { approveTask.mutate({ id: task.id }); toast.success("Задача утверждена, результат сохранён в Wiki"); }}
                onReject={() => { rejectTask.mutate({ id: task.id }); toast.info("Задача отклонена, возвращена исполнителю"); }}
              />
            )}
            {isPendingApproval && !isCreator && (
              <p className="text-xs text-amber-600 dark:text-amber-400">⏳ Ожидает утверждения от постановщика</p>
            )}
          </div>

          {/* Subtasks */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Check className="h-3 w-3" /> Шаги
                {subtasks.length > 0 && (
                  <span className="text-[10px] text-muted-foreground/70">
                    ({completedSubs}/{subtasks.length} · {Math.round((completedSubs / subtasks.length) * 100)}%)
                  </span>
                )}
              </p>
              {subtasks.length > 0 && (
                <button
                  onClick={() => setStepsCollapsed(!stepsCollapsed)}
                  className="text-[10px] px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                >
                  {stepsCollapsed ? "Показать" : "Свернуть"}
                </button>
              )}
              <button
                onClick={handleDecompose}
                disabled={loadingDecompose}
                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                title="ИИ-декомпозиция"
              >
                {loadingDecompose ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {loadingDecompose ? "Думаю..." : "Разбить на шаги"}
              </button>
            </div>
            {/* Progress bar */}
            {subtasks.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${Math.round((completedSubs / subtasks.length) * 100)}%` }}
                  />
                </div>
              </div>
            )}
            {/* AI suggested subtasks */}
            {aiSubtasks.length > 0 && (
              <div className="space-y-1 border border-primary/20 rounded-lg p-2 bg-primary/5">
                <p className="text-[10px] font-medium text-primary flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> ИИ предлагает добавить:
                </p>
                {aiSubtasks.map((title, i) => (
                  <div key={i} className="flex items-center gap-2 py-0.5">
                    <button
                      onClick={() => {
                        addSubtask.mutate({ task_id: task.id, title });
                        setAiSubtasks(prev => prev.filter((_, idx) => idx !== i));
                      }}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0"
                    >
                      + Добавить
                    </button>
                    <span className="text-sm text-foreground/80">{title}</span>
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => {
                      aiSubtasks.forEach(title => addSubtask.mutate({ task_id: task.id, title }));
                      setAiSubtasks([]);
                    }}
                    className="text-[10px] px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    Добавить все
                  </button>
                  <button
                    onClick={() => setAiSubtasks([])}
                    className="text-[10px] px-2 py-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Отклонить
                  </button>
                </div>
              </div>
            )}
            {!stepsCollapsed && (
              <DndContext sensors={subtaskSensors} collisionDetection={closestCenter} onDragEnd={handleSubtaskDragEnd} modifiers={[restrictToVerticalAxis]}>
                <SortableContext items={[...subtasks].sort((a, b) => a.position - b.position).map(s => s.id)} strategy={verticalListSortingStrategy}>
                  {[...subtasks].sort((a, b) => a.position - b.position).map((sub) => (
                    <SortableSubtaskRow
                      key={sub.id}
                      sub={sub}
                      task={task}
                      editingSubtaskId={editingSubtaskId}
                      editingSubtaskTitle={editingSubtaskTitle}
                      onStartEdit={(s) => { setEditingSubtaskId(s.id); setEditingSubtaskTitle(s.title); }}
                      onChangeTitle={setEditingSubtaskTitle}
                      onSaveTitle={handleSaveSubtaskTitle}
                      onCancelEdit={() => setEditingSubtaskId(null)}
                      onToggle={(id, done) => toggleSubtask.mutate({ id, is_completed: done })}
                      onDelete={(id) => deleteSubtask.mutate(id)}
                      onUpdateDeadline={(id, dl) => updateSubtask.mutate({ id, deadline: dl })}
                      onUpdateAssignee={(id, uid) => {
                        updateSubtask.mutate({ id, assigned_to: uid });
                        if (uid && uid !== task.user_id && uid !== task.assigned_to && !participants.some(p => p.user_id === uid)) {
                          addParticipant.mutate({ task_id: task.id, user_id: uid, role: "participant" });
                        }
                      }}
                      onPromote={(id) => promoteSubtaskToTask.mutate({ subtaskId: id })}
                      onMoveToTask={(id) => setMoveSubtaskId(id)}
                      availableUsers={availableUsers}
                      getProfileName={getProfileName}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
            <form onSubmit={(e) => { e.preventDefault(); handleAddSubtask(); }} className="flex items-center gap-2">
              <input
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                enterKeyHint="done"
                placeholder="Новый шаг..."
                className="flex-1 text-sm bg-transparent outline-none border-b border-border py-1"
              />
              <button
                type="submit"
                disabled={!newSubtask.trim()}
                className="h-8 w-8 rounded-full border border-primary/30 flex items-center justify-center shrink-0 transition-all hover:border-primary hover:bg-primary/10 disabled:opacity-20 touch-manipulation"
              >
                <Plus className="h-3.5 w-3.5 text-primary" />
              </button>
            </form>
          </div>

          {/* Chat */}
          <TaskChat taskId={task.id} taskTitle={task.title} availableUsers={availableUsers} />

          {/* Created at + Wiki */}
          <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
              <Clock className="h-3 w-3" />
              Создано {format(parseISO(task.created_at), "d MMM yyyy, HH:mm", { locale: ru })}
              <span>· создал: {getProfileName(task.user_id)}</span>
            </div>
            <button
              onClick={() => {
                if (!task.group_id) {
                  toast.error("Задача не привязана к проекту. Добавьте задачу в проект, чтобы сохранить в базу знаний.");
                  return;
                }
                handleSaveToWiki();
              }}
              disabled={savingToWiki}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-primary/5 text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
            >
              {savingToWiki ? <Loader2 className="h-3 w-3 animate-spin" /> : <BookOpen className="h-3 w-3" />}
              В базу знаний
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDemoteOpen(true)}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Понизить эту задачу до шага другой задачи"
              >
                <ArrowDownToLine className="h-3 w-3" /> Понизить до шага
              </button>
              <ConfirmDelete
                title="Удалить задачу"
                description={`Удалить «${task.title}»? Можно отменить через Ctrl+Z.`}
                onConfirm={() => undoableDeleteTask()}
              >
                <button className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md text-destructive hover:bg-destructive/10 transition-colors">
                  <Trash2 className="h-3 w-3" /> Удалить
                </button>
              </ConfirmDelete>
            </div>
          </div>
          </div>
        );
        
        return isMobile ? (
          <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
            <SheetContent side="bottom" className="h-[90dvh] rounded-t-2xl p-0 overflow-y-auto">
              {detailsContent}
            </SheetContent>
          </Sheet>
        ) : detailsContent;
      })()}

      {/* Subtasks compact view */}
      {!detailsOpen && expanded && (
        <div className="px-3.5 pb-3 ml-8 space-y-1">
          <DndContext sensors={subtaskSensors} collisionDetection={closestCenter} onDragEnd={handleSubtaskDragEnd} modifiers={[restrictToVerticalAxis]}>
            <SortableContext items={[...subtasks].sort((a, b) => a.position - b.position).map(s => s.id)} strategy={verticalListSortingStrategy}>
              {[...subtasks].sort((a, b) => a.position - b.position).map((sub) => (
                <SortableSubtaskRow
                  key={sub.id}
                  sub={sub}
                  task={task}
                  editingSubtaskId={editingSubtaskId}
                  editingSubtaskTitle={editingSubtaskTitle}
                  onStartEdit={(s) => { setEditingSubtaskId(s.id); setEditingSubtaskTitle(s.title); }}
                  onChangeTitle={setEditingSubtaskTitle}
                  onSaveTitle={handleSaveSubtaskTitle}
                  onCancelEdit={() => setEditingSubtaskId(null)}
                  onToggle={(id, done) => toggleSubtask.mutate({ id, is_completed: done })}
                  onDelete={(id) => deleteSubtask.mutate(id)}
                  onUpdateDeadline={(id, dl) => updateSubtask.mutate({ id, deadline: dl })}
                   onUpdateAssignee={(id, uid) => {
                     updateSubtask.mutate({ id, assigned_to: uid });
                     if (uid && uid !== task.user_id && uid !== task.assigned_to && !participants.some(p => p.user_id === uid)) {
                       addParticipant.mutate({ task_id: task.id, user_id: uid, role: "participant" });
                     }
                   }}
                   onPromote={(id) => promoteSubtaskToTask.mutate({ subtaskId: id })}
                   onMoveToTask={(id) => setMoveSubtaskId(id)}
                   availableUsers={availableUsers}
                   getProfileName={getProfileName}
                 />
              ))}
            </SortableContext>
          </DndContext>
          {showAddSubtask ? (
            <form onSubmit={(e) => { e.preventDefault(); handleAddSubtask(); }} className="flex items-center gap-2">
              <input
                autoFocus
                enterKeyHint="done"
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                onBlur={() => { setTimeout(() => { if (!newSubtask.trim()) setShowAddSubtask(false); }, 400); }}
                placeholder="Шаг..."
                className="flex-1 text-sm bg-transparent outline-none border-b border-border py-1"
              />
              <button
                type="submit"
                disabled={!newSubtask.trim()}
                className="h-8 w-8 rounded-full border border-primary/30 flex items-center justify-center shrink-0 transition-all hover:border-primary hover:bg-primary/10 disabled:opacity-20 touch-manipulation"
              >
                <Plus className="h-3.5 w-3.5 text-primary" />
              </button>
            </form>
          ) : (
            <button onClick={() => setShowAddSubtask(true)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary py-1">
              <Plus className="h-3 w-3" /> Шаг
            </button>
          )}
        </div>
      )}
    </div>

    {/* Move subtask to another task picker */}
    {moveSubtaskId && (
      <MoveSubtaskDialog
        open={!!moveSubtaskId}
        onOpenChange={(open) => { if (!open) setMoveSubtaskId(null); }}
        currentTaskId={task.id}
        groupId={task.group_id}
        onSelect={(targetTaskId) => {
          moveSubtaskToTask.mutate({ subtaskId: moveSubtaskId, targetTaskId });
          setMoveSubtaskId(null);
        }}
      />
    )}

    {/* Demote task to subtask picker */}
    {demoteOpen && (
      <MoveSubtaskDialog
        open={demoteOpen}
        onOpenChange={setDemoteOpen}
        currentTaskId={task.id}
        groupId={task.group_id}
        title="Понизить до шага задачи"
        onSelect={(targetTaskId) => {
          demoteTaskToSubtask.mutate({ taskId: task.id, targetTaskId });
          setDemoteOpen(false);
        }}
      />
    )}

    {/* Closure dialog: heavy (file uploads, AI summary) — defer mount until first open. */}
    {closureDialogOpenedOnce && (
      <TaskClosureDialog
        open={closureDialogOpen}
        onOpenChange={setClosureDialogOpen}
        taskTitle={task.title}
        taskId={task.id}
        onSubmit={(result, attachmentUrls, summary) => {
          const fullResult = summary ? `${result}\n\n---\n**ИИ-саммари вложений:** ${summary}` : result;
          submitForApproval.mutate({ id: task.id, closure_result: fullResult, attachmentUrls });
          toast.success("Отправлено на утверждение");
        }}
      />
    )}
    </>
  );
}

const TaskItem = memo(TaskItemInner, (prev, next) => {
  return (
    prev.task === next.task &&
    prev.sortable === next.sortable &&
    prev.initialOpen === next.initialOpen &&
    prev.selected === next.selected &&
    prev.selectable === next.selectable
  );
});

export default TaskItem;
