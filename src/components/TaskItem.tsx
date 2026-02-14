import { useState } from "react";
import { Task, Subtask, useTaskMutations, useTags } from "@/hooks/useTasks";
import {
  Check, Star, ChevronDown, ChevronRight, Plus, Trash2, Calendar, Tag, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, isToday, isTomorrow, isPast, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface TaskItemProps {
  task: Task;
}

export default function TaskItem({ task }: TaskItemProps) {
  const { toggleTask, toggleImportant, deleteTask, updateTask, addSubtask, toggleSubtask, deleteSubtask, addTaskTag, removeTaskTag } = useTaskMutations();
  const { data: allTags = [] } = useTags();
  const [expanded, setExpanded] = useState(false);
  const [newSubtask, setNewSubtask] = useState("");
  const [showAddSubtask, setShowAddSubtask] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);

  const subtasks = task.subtasks || [];
  const completedSubs = subtasks.filter(s => s.is_completed).length;
  const taskTagIds = task.task_tags?.map(tt => tt.tag_id) || [];
  const taskTags = allTags.filter(t => taskTagIds.includes(t.id));
  const availableTags = allTags.filter(t => !taskTagIds.includes(t.id));

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

  return (
    <div className={cn(
      "group bg-card rounded-lg border border-border shadow-sm transition-all hover:shadow-md animate-fade-in",
      task.is_completed && "opacity-60"
    )}>
      <div className="flex items-start gap-3 p-3.5">
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
                onKeyDown={(e) => e.key === "Enter" && handleSaveTitle()}
                className="flex-1 bg-transparent outline-none text-sm font-medium"
              />
            ) : (
              <span
                onDoubleClick={() => { setEditing(true); setEditTitle(task.title); }}
                className={cn("text-sm font-medium", task.is_completed && "line-through text-muted-foreground")}
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
            {task.deadline && (
              <span className={cn(
                "text-xs flex items-center gap-1",
                deadlineOverdue ? "text-destructive" : "text-muted-foreground"
              )}>
                <Calendar className="h-3 w-3" />
                {formatDeadline(task.deadline)}
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

          <button
            onClick={() => deleteTask.mutate(task.id)}
            className="p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Subtasks */}
      {expanded && (
        <div className="px-3.5 pb-3 ml-8 space-y-1">
          {subtasks.map((sub) => (
            <div key={sub.id} className="flex items-center gap-2.5 group/sub py-1">
              <button
                onClick={() => toggleSubtask.mutate({ id: sub.id, is_completed: !sub.is_completed })}
                className={cn(
                  "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-all",
                  sub.is_completed
                    ? "bg-primary border-primary"
                    : "border-muted-foreground/40 hover:border-primary"
                )}
              >
                {sub.is_completed && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
              </button>
              <span className={cn("text-sm flex-1", sub.is_completed && "line-through text-muted-foreground")}>
                {sub.title}
              </span>
              <button
                onClick={() => deleteSubtask.mutate(sub.id)}
                className="text-muted-foreground opacity-0 group-hover/sub:opacity-100 hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          {showAddSubtask ? (
            <form
              onSubmit={(e) => { e.preventDefault(); handleAddSubtask(); }}
              className="flex items-center gap-2"
            >
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
            <button
              onClick={() => setShowAddSubtask(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary py-1"
            >
              <Plus className="h-3 w-3" /> Подзадача
            </button>
          )}
        </div>
      )}
    </div>
  );
}
