import { useState, useMemo } from "react";
import { Task, Subtask, useTaskMutations, useTags, useAvailableUsers, useTaskParticipants, Profile } from "@/hooks/useTasks";
import {
  Check, Star, ChevronDown, ChevronRight, Plus, Trash2, Calendar, Tag, X, UserPlus, Expand, FileText, GripVertical, Clock, Repeat, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, isToday, isTomorrow, isPast, parseISO } from "date-fns";
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
}

export default function TaskItem({ task, sortable }: TaskItemProps) {
  const { toggleTask, toggleImportant, deleteTask, updateTask, addSubtask, toggleSubtask, deleteSubtask, addTaskTag, removeTaskTag, addParticipant, removeParticipant } = useTaskMutations();
  const { data: allTags = [] } = useTags();
  const { data: availableUsers = [] } = useAvailableUsers();
  const { data: participants = [] } = useTaskParticipants(task.id);
  const [expanded, setExpanded] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [newSubtask, setNewSubtask] = useState("");
  const [showAddSubtask, setShowAddSubtask] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [userSearch, setUserSearch] = useState("");
  const [userPickerOpen, setUserPickerOpen] = useState<"assignee" | "participant" | null>(null);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState(task.description || "");

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
      return (u.display_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
    });
  }, [availableUsers, participants, userSearch]);

  const getProfileName = (userId: string) => {
    const p = availableUsers.find(u => u.id === userId);
    return p?.display_name || p?.email || userId.slice(0, 8);
  };
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
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
              <span className="text-xs text-muted-foreground">{completedSubs}/{subtasks.length} подзадач</span>
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
              </span>
            )}
            {(task as any).recurrence && (
              <span className="text-xs flex items-center gap-1 text-muted-foreground">
                <Repeat className="h-3 w-3" />
                {{ daily: "Ежедневно", weekly: "Еженедельно", monthly: "Ежемесячно", yearly: "Ежегодно" }[(task as any).recurrence] || (task as any).recurrence}
              </span>
            )}
            {participants.length > 0 && (
              <span className="text-xs flex items-center gap-1 text-muted-foreground">
                <Users className="h-3 w-3" />
                {participants.map(p => getProfileName(p.user_id)).join(", ")}
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
        <div className="flex items-center gap-1 shrink-0">
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

          <button
            onClick={() => toggleImportant.mutate({ id: task.id, is_important: !task.is_important })}
            className={cn(
              "p-1.5 transition-all",
              task.is_important
                ? "text-warning"
                : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-warning"
            )}
          >
            <Star className={cn("h-4 w-4", task.is_important && "fill-current")} />
          </button>

          <ConfirmDelete title="Удалить задачу?" description="Задача и все подзадачи будут удалены." onConfirm={() => deleteTask.mutate(task.id)}>
            <button className="p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </ConfirmDelete>
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
                  <span className="text-sm text-foreground">{getProfileName(assignee.user_id)}</span>
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
                          <span className="text-xs text-muted-foreground">{u.email}</span>
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
              {participants.filter(p => p.role === "participant").map(p => (
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
                        <span className="text-xs text-muted-foreground">{u.email}</span>
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

          {/* Deadline */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3 w-3" /> Срок
            </p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={task.deadline ? format(parseISO(task.deadline), "yyyy-MM-dd") : ""}
                onChange={(e) => updateTask.mutate({ id: task.id, deadline: e.target.value || null })}
                className="text-xs bg-muted/50 outline-none border border-border rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
              />
              {task.deadline && (
                <button
                  onClick={() => updateTask.mutate({ id: task.id, deadline: null })}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
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
                <button
                  onClick={() => updateTask.mutate({ id: task.id, recurrence: null } as any)}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Subtasks in detail view */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Check className="h-3 w-3" /> Подзадачи
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
                placeholder="Новая подзадача..."
                className="flex-1 text-sm bg-transparent outline-none border-b border-border py-1"
              />
            </form>
          </div>

          {/* Created at */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60 pt-1">
            <Clock className="h-3 w-3" />
            Создано {format(parseISO(task.created_at), "d MMM yyyy, HH:mm", { locale: ru })}
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
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                onBlur={() => { if (!newSubtask.trim()) setShowAddSubtask(false); }}
                placeholder="Подзадача..."
                className="flex-1 text-sm bg-transparent outline-none border-b border-border py-1"
              />
            </form>
          ) : (
            <button onClick={() => setShowAddSubtask(true)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary py-1">
              <Plus className="h-3 w-3" /> Подзадача
            </button>
          )}
        </div>
      )}
    </div>
  );
}
