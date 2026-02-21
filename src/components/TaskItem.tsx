import { useState, useMemo, useEffect, useRef } from "react";
import { Task, Subtask, useTaskMutations, useTags, useAvailableUsers, useTaskParticipants, useTaskGroups, Profile } from "@/hooks/useTasks";
import TaskChat from "@/components/TaskChat";
import {
  Check, Star, ChevronDown, ChevronRight, Plus, Trash2, Calendar, Tag, X, UserPlus, Expand, FileText, GripVertical, Clock, Repeat, Users, FolderOpen, Flag, MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, isToday, isTomorrow, isPast, parseISO, differenceInDays } from "date-fns";
import { ru } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
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
}

const PRIORITIES = [
  { value: 1, label: "P1 — Критический", color: "text-red-500", bgColor: "bg-red-500/10", dotColor: "bg-red-500" },
  { value: 2, label: "P2 — Высокий", color: "text-orange-500", bgColor: "bg-orange-500/10", dotColor: "bg-orange-500" },
  { value: 3, label: "P3 — Средний", color: "text-yellow-500", bgColor: "bg-yellow-500/10", dotColor: "bg-yellow-500" },
  { value: 4, label: "P4 — Низкий", color: "text-blue-400", bgColor: "bg-blue-400/10", dotColor: "bg-blue-400" },
] as const;

const getPriority = (value: number | null | undefined) => PRIORITIES.find(p => p.value === value);

export default function TaskItem({ task, sortable, initialOpen, onOpened }: TaskItemProps) {
  const { toggleTask, toggleImportant, deleteTask, updateTask, addSubtask, toggleSubtask, deleteSubtask, addTaskTag, removeTaskTag, addParticipant, removeParticipant } = useTaskMutations();
  const { data: allTags = [] } = useTags();
  const { data: availableUsers = [] } = useAvailableUsers();
  const { data: participants = [] } = useTaskParticipants(task.id);
  const { data: allGroups = [] } = useTaskGroups();
  const [expanded, setExpanded] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(!!initialOpen);
  const [newSubtask, setNewSubtask] = useState("");
  const [showAddSubtask, setShowAddSubtask] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [userSearch, setUserSearch] = useState("");
  const [userPickerOpen, setUserPickerOpen] = useState<"assignee" | "participant" | "quick-participant" | null>(null);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState(task.description || "");
  const itemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialOpen && itemRef.current) {
      itemRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      onOpened?.();
    }
  }, [initialOpen]);


  const subtasks = task.subtasks || [];
  const completedSubs = subtasks.filter(s => s.is_completed).length;
  const taskTagIds = task.task_tags?.map(tt => tt.tag_id) || [];
  const taskTags = allTags.filter(t => taskTagIds.includes(t.id));
  const availableTags = allTags.filter(t => !taskTagIds.includes(t.id));

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
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
      updateTask.mutate({ id: task.id, description: newDesc } as any);
    }
    setEditingDescription(false);
  };

  const filteredUsers = useMemo(() => {
    const participantIds = participants.map(p => p.user_id);
    return availableUsers.filter(u => {
      if (participantIds.includes(u.id)) return false;
      if (!userSearch.trim()) return true;
      const q = userSearch.toLowerCase();
      return u.display_name?.toLowerCase().includes(q);
    });
  }, [availableUsers, participants, userSearch]);

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
        "group bg-card rounded-xl border border-border transition-all duration-200",
        task.is_completed ? "opacity-50 hover:opacity-70" : "hover:border-primary/20 hover:shadow-md hover:shadow-primary/5",
        isDragging && "opacity-70 shadow-lg z-50 relative"
      )}
    >
      <div className="flex items-start gap-3 p-3.5">
        {/* Drag handle */}
        {sortable && (
          <button
            {...attributes}
            {...listeners}
            className="mt-1 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing shrink-0 touch-none"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        {/* Checkbox */}
        <button
          onClick={() => toggleTask.mutate({ id: task.id, is_completed: !task.is_completed })}
          className={cn(
            "mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
            task.is_completed
              ? "bg-primary border-primary animate-check-bounce"
              : "border-muted-foreground/40 hover:border-primary"
          )}
        >
          {task.is_completed && <Check className="h-3 w-3 text-primary-foreground" />}
        </button>

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
                  const orig = (task as any).original_deadline;
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
            {(task as any).recurrence && (
              <span className="text-xs flex items-center gap-1 text-muted-foreground">
                <Repeat className="h-3 w-3" />
                {{ daily: "Ежедневно", weekly: "Еженедельно", monthly: "Ежемесячно", yearly: "Ежегодно" }[(task as any).recurrence] || (task as any).recurrence}
              </span>
            )}
            {(() => {
              const p = getPriority((task as any).priority);
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
            {taskTags.map(tag => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full"
                style={{
                  backgroundColor: `${tag.color}20`,
                  color: tag.color || undefined,
                }}
              >
                {tag.name}
                <X
                  className="h-2.5 w-2.5 cursor-pointer opacity-60 hover:opacity-100"
                  onClick={() => removeTaskTag.mutate({ task_id: task.id, tag_id: tag.id })}
                />
              </span>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-0.5 sm:gap-1 shrink-0">
          {/* Expand - always visible */}
          <button
            onClick={() => setDetailsOpen(!detailsOpen)}
            className={cn(
              "p-1.5 transition-all",
              detailsOpen
                ? "text-primary"
                : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground"
            )}
          >
            <Expand className="h-3.5 w-3.5" />
          </button>

          {/* Quick add participant */}
          <div>
          <Popover open={userPickerOpen === "quick-participant"} onOpenChange={(open) => { setUserPickerOpen(open ? "quick-participant" : null); setUserSearch(""); }}>
            <PopoverTrigger asChild>
              <button className="p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-opacity">
                <UserPlus className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" side="left">
              <Input
                autoFocus
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Поиск по имени..."
                className="h-7 text-xs mb-2"
              />
              <div className="max-h-40 overflow-y-auto space-y-0.5">
                {filteredUsers.length === 0 && (
                  <p className="text-xs text-muted-foreground px-2 py-1">Не найдено</p>
                )}
                {filteredUsers.map(u => (
                  <button
                    key={u.id}
                    onClick={() => { addParticipant.mutate({ task_id: task.id, user_id: u.id, role: "participant" }); setUserPickerOpen(null); setUserSearch(""); }}
                    className="flex flex-col w-full px-2 py-1.5 rounded text-left hover:bg-muted transition-colors"
                  >
                    <span className="text-sm font-medium">{u.display_name || "Без имени"}</span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          </div>


          {/* Quick set deadline */}
          <div>
          <Popover>
            <PopoverTrigger asChild>
              <button className={cn(
                "p-1.5 transition-opacity",
                task.deadline ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground"
              )}>
                <Calendar className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-1.5" side="left">
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
          </div>

          {/* Quick set deferred - hidden on mobile */}
          <div className="hidden sm:block">
          <Popover>
            <PopoverTrigger asChild>
              <button className={cn(
                "p-1.5 transition-opacity",
                task.deferred_until ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground"
              )}>
                <Clock className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-1.5" side="left">
              <p className="text-xs font-medium text-muted-foreground px-2 py-1">Отложить до</p>
              {[
                { label: "Завтра", days: 1 },
                { label: "Через 3 дня", days: 3 },
                { label: "Через неделю", days: 7 },
                { label: "Через месяц", days: 30 },
              ].map(opt => {
                const d = new Date();
                d.setDate(d.getDate() + opt.days);
                const val = format(d, "yyyy-MM-dd");
                return (
                  <button
                    key={opt.days}
                    onClick={() => updateTask.mutate({ id: task.id, deferred_until: val } as any)}
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors"
                  >
                    {opt.label}
                  </button>
                );
              })}
              <div className="border-t border-border mt-1 pt-1">
                <input
                  type="date"
                  value={task.deferred_until ? format(parseISO(task.deferred_until), "yyyy-MM-dd") : ""}
                  onChange={(e) => updateTask.mutate({ id: task.id, deferred_until: e.target.value || null } as any)}
                  className="w-full text-xs bg-muted/50 outline-none border border-border rounded-lg px-2 py-1.5 transition-all"
                />
              </div>
              {task.deferred_until && (
                <button
                  onClick={() => updateTask.mutate({ id: task.id, deferred_until: null } as any)}
                  className="mt-1 text-xs text-destructive hover:underline w-full text-left px-2 py-1"
                >
                  Убрать откладывание
                </button>
              )}
            </PopoverContent>
          </Popover>
          </div>

          {/* Quick add tag - hidden on mobile */}
          <div className="hidden sm:block">
          <Popover>
            <PopoverTrigger asChild>
              <button className="p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-opacity">
                <Tag className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" side="left">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground px-2 py-1">Добавить тэг</p>
                {availableTags.length === 0 && (
                  <p className="text-xs text-muted-foreground px-2 py-1">Нет доступных тэгов</p>
                )}
                {availableTags.map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => addTaskTag.mutate({ task_id: task.id, tag_id: tag.id })}
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors"
                  >
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color || undefined }} />
                    {tag.name}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          </div>

          {/* Star - hidden on mobile, visible if important */}
          <button
            onClick={() => toggleImportant.mutate({ id: task.id, is_important: !task.is_important })}
            className={cn(
              "p-1.5 transition-all",
              task.is_important
                ? "text-warning"
                : "hidden sm:block text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-warning"
            )}
          >
            <Star className={cn("h-4 w-4", task.is_important && "fill-current")} />
          </button>

          {/* Delete - hidden on mobile */}
          <div className="hidden sm:block">
          <ConfirmDelete title="Удалить задачу?" description="Задача и все шаги будут удалены." onConfirm={() => deleteTask.mutate(task.id)}>
            <button className="p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </ConfirmDelete>
          </div>
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

          {/* Assignee & Participants */}
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
                <Popover open={userPickerOpen === "assignee"} onOpenChange={(open) => { setUserPickerOpen(open ? "assignee" : null); setUserSearch(""); }}>
                  <PopoverTrigger asChild>
                    <button className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
                      <Plus className="h-2.5 w-2.5" /> Назначить
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2" side="bottom">
                    <Input
                      autoFocus
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Поиск по имени..."
                      className="h-7 text-xs mb-2"
                    />
                    <div className="max-h-40 overflow-y-auto space-y-0.5">
                      {filteredUsers.length === 0 && (
                        <p className="text-xs text-muted-foreground px-2 py-1">Не найдено</p>
                      )}
                      {filteredUsers.map(u => (
                        <button
                          key={u.id}
                          onClick={() => { addParticipant.mutate({ task_id: task.id, user_id: u.id, role: "assignee" }); setUserPickerOpen(null); setUserSearch(""); }}
                          className="flex flex-col w-full px-2 py-1.5 rounded text-left hover:bg-muted transition-colors"
                        >
                          <span className="text-sm font-medium">{u.display_name || "Без имени"}</span>
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
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
              <Popover open={userPickerOpen === "participant"} onOpenChange={(open) => { setUserPickerOpen(open ? "participant" : null); setUserSearch(""); }}>
                <PopoverTrigger asChild>
                  <button className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
                    <Plus className="h-2.5 w-2.5" /> Участник
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" side="bottom">
                  <Input
                    autoFocus
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Поиск по имени..."
                    className="h-7 text-xs mb-2"
                  />
                  <div className="max-h-40 overflow-y-auto space-y-0.5">
                    {filteredUsers.length === 0 && (
                      <p className="text-xs text-muted-foreground px-2 py-1">Не найдено</p>
                    )}
                    {filteredUsers.map(u => (
                      <button
                        key={u.id}
                        onClick={() => { addParticipant.mutate({ task_id: task.id, user_id: u.id, role: "participant" }); setUserPickerOpen(null); setUserSearch(""); }}
                        className="flex flex-col w-full px-2 py-1.5 rounded text-left hover:bg-muted transition-colors"
                      >
                        <span className="text-sm font-medium">{u.display_name || "Без имени"}</span>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
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
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
                      <Plus className="h-2.5 w-2.5" /> Тэг
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-40 p-2" side="bottom">
                    {availableTags.map(tag => (
                      <button
                        key={tag.id}
                        onClick={() => addTaskTag.mutate({ task_id: task.id, tag_id: tag.id })}
                        className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors"
                      >
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color || undefined }} />
                        {tag.name}
                      </button>
                    ))}
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
              <Popover>
                <PopoverTrigger asChild>
                  <button className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
                    <Plus className="h-2.5 w-2.5" /> {task.group_id ? "Изменить" : "Назначить"}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2" side="bottom">
                  <div className="space-y-0.5 max-h-40 overflow-y-auto">
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

          {/* Dates: Deadline + Deferred */}
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
                  onChange={(e) => updateTask.mutate({ id: task.id, deferred_until: e.target.value || null } as any)}
                  className="text-xs bg-muted/50 outline-none border border-border rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                />
                {task.deferred_until && (
                  <button onClick={() => updateTask.mutate({ id: task.id, deferred_until: null } as any)} className="text-muted-foreground hover:text-destructive transition-colors">
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
                value={(task as any).recurrence || ""}
                onChange={(e) => updateTask.mutate({ id: task.id, recurrence: e.target.value || null } as any)}
                className="text-xs bg-muted/50 outline-none border border-border rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
              >
                <option value="">Без повтора</option>
                <option value="daily">Ежедневно</option>
                <option value="weekly">Еженедельно</option>
                <option value="monthly">Ежемесячно</option>
                <option value="yearly">Ежегодно</option>
              </select>
              {(task as any).recurrence && (
                <button onClick={() => updateTask.mutate({ id: task.id, recurrence: null } as any)} className="text-muted-foreground hover:text-destructive transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Priority + Important star */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Flag className="h-3 w-3" /> Приоритет
            </p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {PRIORITIES.map(p => {
                const isActive = (task as any).priority === p.value;
                return (
                  <button
                    key={p.value}
                    onClick={() => updateTask.mutate({ id: task.id, priority: isActive ? null : p.value } as any)}
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
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Check className="h-3 w-3" /> Шаги
            </p>
            {subtasks.map((sub) => (
              <div key={sub.id} className="flex items-center gap-2.5 group/sub py-0.5">
                <button
                  onClick={() => toggleSubtask.mutate({ id: sub.id, is_completed: !sub.is_completed })}
                  className={cn(
                    "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-all",
                    sub.is_completed ? "bg-primary border-primary" : "border-muted-foreground/40 hover:border-primary"
                  )}
                >
                  {sub.is_completed && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                </button>
                <span className={cn("text-sm flex-1", sub.is_completed && "line-through text-muted-foreground")}>{sub.title}</span>
                <button onClick={() => deleteSubtask.mutate(sub.id)} className="text-muted-foreground opacity-0 group-hover/sub:opacity-100 hover:text-destructive">
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
                className="h-5 w-5 rounded-full border border-primary/30 flex items-center justify-center shrink-0 transition-all hover:border-primary hover:bg-primary/10 disabled:opacity-20"
              >
                <Plus className="h-3 w-3 text-primary" />
              </button>
            </form>
          </div>

          {/* Chat */}
          <TaskChat taskId={task.id} taskTitle={task.title} availableUsers={availableUsers} />

          {/* Created at + creator */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60 pt-1 flex-wrap">
            <Clock className="h-3 w-3" />
            Создано {format(parseISO(task.created_at), "d MMM yyyy, HH:mm", { locale: ru })}
            <span>· создал: {getProfileName(task.user_id)}</span>
          </div>
        </div>
      )}

      {/* Subtasks (compact, when not using details panel) */}
      {!detailsOpen && expanded && (
        <div className="px-3.5 pb-3 ml-8 space-y-1">
          {subtasks.map((sub) => (
            <div key={sub.id} className="flex items-center gap-2.5 group/sub py-1">
              <button
                onClick={() => toggleSubtask.mutate({ id: sub.id, is_completed: !sub.is_completed })}
                className={cn(
                  "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-all",
                  sub.is_completed ? "bg-primary border-primary" : "border-muted-foreground/40 hover:border-primary"
                )}
              >
                {sub.is_completed && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
              </button>
              <span className={cn("text-sm flex-1", sub.is_completed && "line-through text-muted-foreground")}>{sub.title}</span>
              <button onClick={() => deleteSubtask.mutate(sub.id)} className="text-muted-foreground opacity-0 group-hover/sub:opacity-100 hover:text-destructive">
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
                onBlur={() => { setTimeout(() => { if (!newSubtask.trim()) setShowAddSubtask(false); }, 150); }}
                placeholder="Шаг..."
                className="flex-1 text-sm bg-transparent outline-none border-b border-border py-1"
              />
              <button
                type="submit"
                disabled={!newSubtask.trim()}
                className="h-5 w-5 rounded-full border border-primary/30 flex items-center justify-center shrink-0 transition-all hover:border-primary hover:bg-primary/10 disabled:opacity-20"
              >
                <Plus className="h-3 w-3 text-primary" />
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
