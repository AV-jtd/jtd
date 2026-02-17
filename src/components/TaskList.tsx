import { useState, useCallback } from "react";
import { useTasks, useTaskMutations, useTaskGroups } from "@/hooks/useTasks";
import TaskItem from "./TaskItem";
import ProjectDetailPanel from "./ProjectDetailPanel";
import { Plus, List, Star, CalendarDays, Users, Loader2, CalendarIcon, Inbox, Expand } from "lucide-react";
import { Input } from "@/components/ui/input";
import { isToday, parseISO, format } from "date-fns";
import { ru } from "date-fns/locale";
import { pluralizeRu } from "@/lib/pluralize";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers" ;

interface TaskListProps {
  activeView: string;
  activeGroupId: string | null;
  activeTagFilters: string[];
  projectDetailOpen: boolean;
  onToggleProjectDetail: () => void;
}

export default function TaskList({ activeView, activeGroupId, activeTagFilters, projectDetailOpen, onToggleProjectDetail }: TaskListProps) {
  const { data: tasks = [], isLoading } = useTasks(
    activeView === "group" ? activeGroupId : undefined,
    activeTagFilters.length > 0 ? activeTagFilters : undefined
  );
  const { data: groups = [] } = useTaskGroups();
  const { addTask, reorderTasks } = useTaskMutations();
  const [newTitle, setNewTitle] = useState("");
  const [newDeadline, setNewDeadline] = useState<Date | undefined>();
  const [calendarOpen, setCalendarOpen] = useState(false);

  const activeGroup = groups.find(g => g.id === activeGroupId);

  const viewConfig: Record<string, { title: string; icon: React.ElementType; emptyTitle: string; emptyDesc: string }> = {
    all: { title: "Все задачи", icon: List, emptyTitle: "Список пуст", emptyDesc: "Создайте первую задачу — просто начните печатать выше" },
    important: { title: "Важные", icon: Star, emptyTitle: "Нет важных задач", emptyDesc: "Отметьте задачу звёздочкой, чтобы она появилась здесь" },
    today: { title: "На сегодня", icon: CalendarDays, emptyTitle: "На сегодня ничего", emptyDesc: "Задачи с сегодняшним дедлайном появятся здесь" },
    assigned: { title: "Делегированные", icon: Users, emptyTitle: "Нет делегированных", emptyDesc: "Назначьте задачу другому пользователю" },
    group: { title: activeGroup?.name || "Проект", icon: List, emptyTitle: "Проект пуст", emptyDesc: "Добавьте задачи в этот проект" },
  };

  const view = viewConfig[activeView] || viewConfig.all;
  const Icon = view.icon;

  let filteredTasks = tasks;
  if (activeView === "important") {
    filteredTasks = tasks.filter(t => t.is_important);
  } else if (activeView === "today") {
    filteredTasks = tasks.filter(t => t.deadline && isToday(parseISO(t.deadline)));
  } else if (activeView === "assigned") {
    filteredTasks = tasks.filter(t => t.assigned_to);
  }

  const activeTasks = filteredTasks.filter(t => !t.is_completed);
  const completedTasks = filteredTasks.filter(t => t.is_completed);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = activeTasks.findIndex(t => t.id === active.id);
    const newIndex = activeTasks.findIndex(t => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(activeTasks, oldIndex, newIndex);
    reorderTasks.mutate(reordered.map((t, i) => ({ id: t.id, position: i })));
  }, [activeTasks, reorderTasks]);

  const handleAddTask = () => {
    if (newTitle.trim()) {
      addTask.mutate({
        title: newTitle.trim(),
        group_id: activeView === "group" ? activeGroupId : null,
        deadline: newDeadline ? format(newDeadline, "yyyy-MM-dd") : null,
      });
      setNewTitle("");
      setNewDeadline(undefined);
    }
  };

  return (
    <main className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-foreground leading-tight">{view.title}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {pluralizeRu(activeTasks.length, "задача", "задачи", "задач")}
            </p>
          </div>
          {activeView === "group" && activeGroup && (
            <button
              onClick={onToggleProjectDetail}
              className={cn(
                "p-2 rounded-lg transition-all",
                projectDetailOpen
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
              title="Карточка проекта"
            >
              <Expand className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Project detail panel */}
        {activeView === "group" && activeGroup && projectDetailOpen && (
          <ProjectDetailPanel group={activeGroup} />
        )}

        {/* Add task */}
        <form
          onSubmit={(e) => { e.preventDefault(); handleAddTask(); }}
          className="flex items-center gap-3 mb-6 bg-card rounded-xl border border-border p-3 shadow-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/40 transition-all"
        >
          <button
            type="submit"
            disabled={!newTitle.trim()}
            className="h-6 w-6 rounded-full border-2 border-primary/30 flex items-center justify-center shrink-0 transition-all hover:border-primary hover:bg-primary/10 disabled:opacity-20"
          >
            <Plus className="h-3.5 w-3.5 text-primary" />
          </button>
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Добавить задачу..."
            enterKeyHint="done"
            className="border-0 shadow-none p-0 h-auto focus-visible:ring-0 text-sm placeholder:text-muted-foreground/60"
          />
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors shrink-0",
                  newDeadline
                    ? "border-primary/30 bg-primary/5 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
                )}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                {newDeadline ? format(newDeadline, "d MMM", { locale: ru }) : "Срок"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={newDeadline}
                onSelect={(date) => { setNewDeadline(date); setCalendarOpen(false); }}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </form>

        {/* Task list */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary/60" />
            <p className="text-sm text-muted-foreground">Загрузка...</p>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-20">
            <div className="h-20 w-20 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-5">
              <Inbox className="h-10 w-10 text-muted-foreground/40" />
            </div>
            <p className="text-base font-medium text-muted-foreground">{view.emptyTitle}</p>
            <p className="text-sm text-muted-foreground/60 mt-1.5 max-w-xs mx-auto">{view.emptyDesc}</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {/* Active tasks */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis]}>
              <SortableContext items={activeTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                {activeTasks.map((task, i) => (
                  <div key={task.id} style={{ animationDelay: `${i * 30}ms` }} className="animate-fade-in">
                    <TaskItem task={task} sortable />
                  </div>
                ))}
              </SortableContext>
            </DndContext>

            {/* Completed tasks */}
            {completedTasks.length > 0 && (
              <div className="pt-4">
                <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider px-1 mb-2">
                  Выполнено · {completedTasks.length}
                </p>
                <div className="space-y-1.5">
                  {completedTasks.map(task => (
                    <TaskItem key={task.id} task={task} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}