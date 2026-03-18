import { useState, useMemo, useEffect, useRef, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import { Task, Subtask, useTaskMutations, useTags, useAvailableUsers, useTaskParticipants, useTaskGroups, useLinkedTagIds, Profile } from "@/hooks/useTasks";
import TaskChat from "@/components/TaskChat";
import UserPicker from "@/components/UserPicker";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Loader2 } from "lucide-react";
import {
  Check, Star, ChevronDown, ChevronRight, Plus, Trash2, Calendar, Tag, X, UserPlus, Expand, FileText, GripVertical, Clock, Repeat, Users, FolderOpen, Flag, MessageCircle, Wand2, GanttChart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, isToday, isTomorrow, isPast, parseISO, differenceInDays } from "date-fns";
import { ru } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import ConfirmDelete from "@/components/ConfirmDelete";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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

export default function TaskItem({ task, sortable, initialOpen, onOpened, onTagClick, onProjectClick, selectable, selected, onToggleSelect, onLongPress }: TaskItemProps) {
  const navigateTo = useNavigate();
  const { toggleTask, toggleImportant, deleteTask, updateTask, addSubtask, toggleSubtask, deleteSubtask, updateSubtask, addTaskTag, removeTaskTag, addParticipant, removeParticipant } = useTaskMutations();
  const { data: allTags = [] } = useTags();
  const linkedTagIds = useLinkedTagIds();
  const { data: availableUsers = [] } = useAvailableUsers();
  const { data: participants = [] } = useTaskParticipants(task.id);
  const { data: allGroups = [] } = useTaskGroups();
  const [expanded, setExpanded] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(!!initialOpen);
  const [newSubtask, setNewSubtask] = useState("");
  const [showAddSubtask, setShowAddSubtask] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [userPickerOpen, setUserPickerOpen] = useState<"assignee" | "participant" | "quick-participant" | "quick-assignee" | null>(null);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState(task.description || "");
  const [tagSearch, setTagSearch] = useState("");
  const [suggestedTagIds, setSuggestedTagIds] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const suggestionsLoaded = useRef(false);
  const [aiSubtasks, setAiSubtasks] = useState<string[]>([]);
  const [loadingDecompose, setLoadingDecompose] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialOpen && itemRef.current) {
      itemRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      onOpened?.();
    }
  }, [initialOpen]);

  const subtasks = task.subtasks || [];
  const completedSubs = subtasks.filter(s => s.is_completed).length;
  const linkedTagId = task.group_id ? allGroups.find(g => g.id === task.group_id)?.linked_tag_id : null;
  const taskTagIds = task.task_tags?.map(tt => tt.tag_id) || [];
  const taskTags = allTags.filter(t => taskTagIds.includes(t.id) && t.id !== linkedTagId && !linkedTagIds.has(t.id));
  const availableTags = allTags.filter(t => !taskTagIds.includes(t.id) && !linkedTagIds.has(t.id));

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
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          message: task.title,
          action: "decompose_task",
          context: {
            title: task.title,
            description: task.description,
            existingSubtasks: subtasks.map(s => s.title),
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
        toast.error("Недостаточно кредитов AI");
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

  const participantIds = useMemo(() => participants.map(p => p.user_id), [participants]);

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
    <div
      ref={(node) => { setNodeRef(node); (itemRef as React.MutableRefObject<HTMLDivElement | null>).current = node; }}
      style={style}
      className={cn(
        "group bg-card rounded-xl border transition-[border-color,opacity] duration-200 will-change-auto",
        selected ? "border-primary/40 bg-primary/5" : "border-border",
        task.is_completed ? "opacity-50 hover:opacity-70" : "hover:border-primary/20 hover:shadow-md hover:shadow-primary/5",
        isDragging && "opacity-70 shadow-lg z-50 relative"
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
            onClick={(e) => { e.stopPropagation(); toggleTask.mutate({ id: task.id, is_completed: !task.is_completed }); }}
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
              <button onClick={() => setExpanded(!expanded)} className="text-muted-foreground hover:text-foreground">
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
              <span className="text-xs text-muted-foreground">{completedSubs}/{subtasks.length} шагов</span>
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
            {participants.length > 0 && (
              <span className="text-xs flex items-center gap-1 text-muted-foreground">
                <Users className="h-3 w-3" />
                {participants.map((p, i) => (
                  <span key={p.id}>
                    {i > 0 && ", "}
                    <span className={p.role === "assignee" ? "text-primary font-semibold" : ""}>
                      {getProfileName(p.user_id)}
                    </span>
                  </span>
                ))}
              </span>
            )}
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
                        <span className="text-[11px]">{parentGroup.icon || '📁'}</span>
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
                    {!parentGroup && <span className="text-[11px]">{group.icon || '📁'}</span>}
                    {group.name}
                  </span>
                  {!group.parent_id && (
                    <span
                      className="p-0.5 cursor-pointer text-muted-foreground hover:text-primary transition-colors"
                      onClick={(e) => { e.stopPropagation(); navigateTo(`/pmo?project=${group.id}`); }}
                      title="Открыть в PMO (Гант)"
                    >
                      <GanttChart className="h-3 w-3" />
                    </span>
                  )}
                </span>
              );
            })()}
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
          </div>
        </div>

        {/* Actions — 3×2 grid on hover */}
        <div className="grid grid-cols-3 gap-0.5 shrink-0 touch-visible opacity-0 group-hover:opacity-100 transition-opacity"
             style={{ width: 'auto' }}>
          {/* Row 1: Expand, Participant, Assignee */}
          <button
            onClick={() => setDetailsOpen(!detailsOpen)}
            className={cn(
              "p-1.5 rounded transition-colors",
              detailsOpen ? "text-primary opacity-100" : "text-muted-foreground hover:text-foreground"
            )}
            title="Детали"
          >
            <Expand className="h-3.5 w-3.5" />
          </button>

          <UserPicker
            users={availableUsers}
            excludeIds={participantIds}
            open={userPickerOpen === "quick-participant"}
            onOpenChange={(open) => setUserPickerOpen(open ? "quick-participant" : null)}
            onSelect={(u) => addParticipant.mutate({ task_id: task.id, user_id: u.id, role: "participant" })}
            trigger={
              <button className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors" title="Участник">
                <UserPlus className="h-3.5 w-3.5" />
              </button>
            }
          />

          <UserPicker
            users={availableUsers}
            excludeIds={participantIds}
            title="🪄 Назначить ответственного"
            placeholder="Кому поручить?"
            open={userPickerOpen === "quick-assignee"}
            onOpenChange={(open) => setUserPickerOpen(open ? "quick-assignee" : null)}
            onSelect={(u) => addParticipant.mutate({ task_id: task.id, user_id: u.id, role: "assignee" })}
            trigger={
              <button className={cn(
                "p-1.5 rounded transition-colors",
                task.assigned_to ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )} title="Ответственный">
                <Wand2 className="h-3.5 w-3.5" />
              </button>
            }
          />

          {/* Row 2: Deadline, Tag, Star */}
          <Popover>
            <PopoverTrigger asChild>
              <button className={cn(
                "p-1.5 rounded transition-colors",
                task.deadline ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground hover:text-foreground"
              )} title="Срок">
                <Calendar className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-1.5 bg-popover border-border z-50" side="left">
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
                    onClick={() => updateTask.mutate({ id: task.id, deadline: val })}
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors"
                  >
                    {opt.label}
                  </button>
                );
              })}
              <div className="border-t border-border mt-1 pt-1">
                <input
                  type="date"
                  value={task.deadline ? format(parseISO(task.deadline), "yyyy-MM-dd") : ""}
                  onChange={(e) => updateTask.mutate({ id: task.id, deadline: e.target.value || null })}
                  className="w-full text-xs bg-muted/50 outline-none border border-border rounded-lg px-2 py-1.5 transition-all"
                />
              </div>
              {task.deadline && (
                <button
                  onClick={() => updateTask.mutate({ id: task.id, deadline: null })}
                  className="mt-1 text-xs text-destructive hover:underline w-full text-left px-2 py-1"
                >
                  Убрать срок
                </button>
              )}
            </PopoverContent>
          </Popover>

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
                            <span className="truncate">{tag.name}</span>
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
                  {/* All tags */}
                  {availableTags.filter(t => t.name.toLowerCase().includes(tagSearch.toLowerCase())).length === 0 && (
                    <p className="text-xs text-muted-foreground px-2 py-1">Нет тэгов</p>
                  )}
                  {availableTags
                    .filter(t => t.name.toLowerCase().includes(tagSearch.toLowerCase()))
                    .filter(t => tagSearch || !suggestedTagIds.includes(t.id))
                    .map(tag => (
                      <button
                        key={tag.id}
                        onClick={() => { addTaskTag.mutate({ task_id: task.id, tag_id: tag.id }); setTagSearch(""); }}
                        className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors"
                      >
                        <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color || undefined }} />
                        <span className="truncate">{tag.name}</span>
                      </button>
                    ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <button
            onClick={() => toggleImportant.mutate({ id: task.id, is_important: !task.is_important })}
            className={cn(
              "p-1.5 rounded transition-colors",
              task.is_important ? "text-warning opacity-100" : "text-muted-foreground hover:text-warning"
            )}
            title="Важная"
          >
            <Star className={cn("h-3.5 w-3.5", task.is_important && "fill-current")} />
          </button>
        </div>

        {/* Always-visible indicators for active states */}
        <div className="flex items-center gap-0.5 shrink-0 group-hover:hidden">
          {detailsOpen && (
            <button onClick={() => setDetailsOpen(false)} className="p-1.5 text-primary">
              <Expand className="h-3.5 w-3.5" />
            </button>
          )}
          {task.is_important && (
            <span className="p-1.5 text-warning">
              <Star className="h-3.5 w-3.5 fill-current" />
            </span>
          )}
        </div>
      </div>

      {/* Expandable details panel */}
      {detailsOpen && (
        <div className="px-3.5 pb-3 ml-8 space-y-3 border-t border-border pt-3">
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
              return assignee ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-primary font-semibold">{getProfileName(assignee.user_id)}</span>
                  <button
                    onClick={() => removeParticipant.mutate({ task_id: task.id, user_id: assignee.user_id })}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <UserPicker
                  users={availableUsers}
                  excludeIds={participantIds}
                  open={userPickerOpen === "assignee"}
                  onOpenChange={(open) => setUserPickerOpen(open ? "assignee" : null)}
                  onSelect={(u) => addParticipant.mutate({ task_id: task.id, user_id: u.id, role: "assignee" })}
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
              <UserPicker
                users={availableUsers}
                excludeIds={participantIds}
                open={userPickerOpen === "participant"}
                onOpenChange={(open) => setUserPickerOpen(open ? "participant" : null)}
                onSelect={(u) => addParticipant.mutate({ task_id: task.id, user_id: u.id, role: "participant" })}
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
                                <span className="truncate">{tag.name}</span>
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
                        .filter(t => t.name.toLowerCase().includes(tagSearch.toLowerCase()))
                        .filter(t => tagSearch || !suggestedTagIds.includes(t.id))
                        .map(tag => (
                          <button
                            key={tag.id}
                            onClick={() => { addTaskTag.mutate({ task_id: task.id, tag_id: tag.id }); setTagSearch(""); }}
                            className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors"
                          >
                            <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color || undefined }} />
                            <span className="truncate">{tag.name}</span>
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
              {task.group_id ? (
                <>
                  <span className="text-sm text-foreground">
                    {allGroups.find(g => g.id === task.group_id)?.name || "Неизвестный проект"}
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
                  <div className="space-y-0.5 max-h-48 overflow-y-auto overscroll-contain" onWheelCapture={(e) => e.stopPropagation()} onTouchMoveCapture={(e) => e.stopPropagation()}>
                    <p className="text-xs font-medium text-muted-foreground px-2 py-1">Выберите проект</p>
                    {allGroups.filter(g => g.id !== task.group_id).map(g => (
                      <button
                        key={g.id}
                        onClick={() => updateTask.mutate({ id: task.id, group_id: g.id })}
                        className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors"
                      >
                        <FolderOpen className="h-3 w-3 text-muted-foreground" />
                        {g.name}
                      </button>
                    ))}
                    {allGroups.filter(g => g.id !== task.group_id).length === 0 && (
                      <p className="text-xs text-muted-foreground px-2 py-1">Нет проектов</p>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Dates */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3 w-3" /> Даты
            </p>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 w-12">Срок</span>
                <input
                  type="date"
                  value={task.deadline ? format(parseISO(task.deadline), "yyyy-MM-dd") : ""}
                  onChange={(e) => updateTask.mutate({ id: task.id, deadline: e.target.value || null })}
                  className="text-xs bg-muted/50 outline-none border border-border rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                />
                {task.deadline && (
                  <button onClick={() => updateTask.mutate({ id: task.id, deadline: null })} className="text-muted-foreground hover:text-destructive transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 w-12">Начало</span>
                <input
                  type="date"
                  value={task.deferred_until ? format(parseISO(task.deferred_until), "yyyy-MM-dd") : ""}
                  onChange={(e) => updateTask.mutate({ id: task.id, deferred_until: e.target.value || null })}
                  className="text-xs bg-muted/50 outline-none border border-border rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                />
                {task.deferred_until && (
                  <button onClick={() => updateTask.mutate({ id: task.id, deferred_until: null })} className="text-muted-foreground hover:text-destructive transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

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
                onClick={() => toggleImportant.mutate({ id: task.id, is_important: !task.is_important })}
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

          {/* Subtasks */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Check className="h-3 w-3" /> Шаги
              </p>
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
            {subtasks.map((sub) => (
              <div key={sub.id} className="flex items-start gap-2.5 group/sub py-1">
                <button
                  onClick={(e) => { e.stopPropagation(); toggleSubtask.mutate({ id: sub.id, is_completed: !sub.is_completed }); }}
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
                  <span className={cn("text-sm", sub.is_completed && "line-through text-muted-foreground")}>{sub.title}</span>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {/* Deadline */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className={cn(
                          "text-[11px] flex items-center gap-0.5 hover:opacity-70 transition-opacity",
                          sub.deadline
                            ? isPast(parseISO(sub.deadline)) && !sub.is_completed
                              ? "text-destructive"
                              : "text-muted-foreground"
                            : "text-muted-foreground/50"
                        )}>
                          <Calendar className="h-3 w-3" />
                          {sub.deadline ? format(parseISO(sub.deadline), "d MMM", { locale: ru }) : "Срок"}
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
                              <button key={preset.days} onClick={() => updateSubtask.mutate({ id: sub.id, deadline: d.toISOString() })}
                                className="text-xs text-left px-2 py-1 rounded hover:bg-muted transition-colors">{preset.label}</button>
                            );
                          })}
                          {sub.deadline && (
                            <button onClick={() => updateSubtask.mutate({ id: sub.id, deadline: null })}
                              className="text-xs text-left px-2 py-1 rounded hover:bg-muted text-destructive transition-colors">Убрать срок</button>
                          )}
                        </div>
                        <CalendarPicker
                          mode="single"
                          selected={sub.deadline ? parseISO(sub.deadline) : undefined}
                          onSelect={(date) => {
                            if (date) { date.setHours(23, 59, 59, 0); updateSubtask.mutate({ id: sub.id, deadline: date.toISOString() }); }
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
                          "text-[11px] flex items-center gap-0.5 hover:opacity-70 transition-opacity",
                          sub.assigned_to ? "text-primary" : "text-muted-foreground/50"
                        )}>
                          <Wand2 className="h-3 w-3" />
                          {sub.assigned_to ? getProfileName(sub.assigned_to) : "Ответств."}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-2" side="bottom" align="start">
                        <div className="max-h-40 overflow-y-auto space-y-0.5">
                          {availableUsers.map(u => (
                            <button key={u.id}
                              onClick={() => updateSubtask.mutate({ id: sub.id, assigned_to: u.id })}
                              className={cn("flex w-full px-2 py-1.5 rounded text-left text-sm hover:bg-muted transition-colors", sub.assigned_to === u.id && "bg-muted font-medium")}
                            >{u.display_name || "Без имени"}</button>
                          ))}
                          {sub.assigned_to && (
                            <button onClick={() => updateSubtask.mutate({ id: sub.id, assigned_to: null })}
                              className="flex w-full px-2 py-1.5 rounded text-left text-sm hover:bg-muted text-destructive transition-colors">Убрать</button>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <button onClick={() => deleteSubtask.mutate(sub.id)} className="text-muted-foreground opacity-0 group-hover/sub:opacity-100 hover:text-destructive mt-0.5">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
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

          {/* Created at */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60 pt-1 flex-wrap">
            <Clock className="h-3 w-3" />
            Создано {format(parseISO(task.created_at), "d MMM yyyy, HH:mm", { locale: ru })}
            <span>· создал: {getProfileName(task.user_id)}</span>
          </div>
        </div>
      )}

      {/* Subtasks compact view */}
      {!detailsOpen && expanded && (
        <div className="px-3.5 pb-3 ml-8 space-y-1">
          {subtasks.map((sub) => (
            <div key={sub.id} className="flex items-start gap-2.5 group/sub py-1">
              <button
                onClick={(e) => { e.stopPropagation(); toggleSubtask.mutate({ id: sub.id, is_completed: !sub.is_completed }); }}
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
                <span className={cn("text-sm", sub.is_completed && "line-through text-muted-foreground")}>{sub.title}</span>
                {/* Meta row: visible when values set, or on hover */}
                <div className={cn(
                  "flex items-center gap-2 mt-0.5 flex-wrap",
                  !sub.deadline && !sub.assigned_to && "opacity-0 group-hover/sub:opacity-100 transition-opacity"
                )}>
                  {/* Deadline */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className={cn(
                        "text-[11px] flex items-center gap-0.5 hover:opacity-70 transition-opacity",
                        sub.deadline
                          ? isPast(parseISO(sub.deadline)) && !sub.is_completed
                            ? "text-destructive"
                            : "text-muted-foreground"
                          : "text-muted-foreground/50"
                      )}>
                        <Calendar className="h-3 w-3" />
                        {sub.deadline ? format(parseISO(sub.deadline), "d MMM", { locale: ru }) : "Срок"}
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
                            <button key={preset.days} onClick={() => updateSubtask.mutate({ id: sub.id, deadline: d.toISOString() })}
                              className="text-xs text-left px-2 py-1 rounded hover:bg-muted transition-colors">{preset.label}</button>
                          );
                        })}
                        {sub.deadline && (
                          <button onClick={() => updateSubtask.mutate({ id: sub.id, deadline: null })}
                            className="text-xs text-left px-2 py-1 rounded hover:bg-muted text-destructive transition-colors">Убрать срок</button>
                        )}
                      </div>
                      <CalendarPicker
                        mode="single"
                        selected={sub.deadline ? parseISO(sub.deadline) : undefined}
                        onSelect={(date) => {
                          if (date) { date.setHours(23, 59, 59, 0); updateSubtask.mutate({ id: sub.id, deadline: date.toISOString() }); }
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
                        "text-[11px] flex items-center gap-0.5 hover:opacity-70 transition-opacity",
                        sub.assigned_to ? "text-primary" : "text-muted-foreground/50"
                      )}>
                        <Wand2 className="h-3 w-3" />
                        {sub.assigned_to ? getProfileName(sub.assigned_to) : "Ответств."}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2" side="bottom" align="start">
                      <div className="max-h-40 overflow-y-auto space-y-0.5">
                        {availableUsers.map(u => (
                          <button key={u.id}
                            onClick={() => updateSubtask.mutate({ id: sub.id, assigned_to: u.id })}
                            className={cn("flex w-full px-2 py-1.5 rounded text-left text-sm hover:bg-muted transition-colors", sub.assigned_to === u.id && "bg-muted font-medium")}
                          >{u.display_name || "Без имени"}</button>
                        ))}
                        {sub.assigned_to && (
                          <button onClick={() => updateSubtask.mutate({ id: sub.id, assigned_to: null })}
                            className="flex w-full px-2 py-1.5 rounded text-left text-sm hover:bg-muted text-destructive transition-colors">Убрать</button>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <button onClick={() => deleteSubtask.mutate(sub.id)} className="text-muted-foreground opacity-0 group-hover/sub:opacity-100 hover:text-destructive mt-0.5">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
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
  );
}
