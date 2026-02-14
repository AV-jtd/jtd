import { useState } from "react";
import { useTasks, useTaskMutations, useTaskGroups } from "@/hooks/useTasks";
import TaskItem from "./TaskItem";
import { Plus, List, Star, CalendarDays, Users, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { isToday, parseISO } from "date-fns";
import { pluralizeRu } from "@/lib/pluralize";

interface TaskListProps {
  activeView: string;
  activeGroupId: string | null;
  activeTagFilter: string | null;
}

export default function TaskList({ activeView, activeGroupId, activeTagFilter }: TaskListProps) {
  const { data: tasks = [], isLoading } = useTasks(
    activeView === "group" ? activeGroupId : undefined,
    activeTagFilter
  );
  const { data: groups = [] } = useTaskGroups();
  const { addTask } = useTaskMutations();
  const [newTitle, setNewTitle] = useState("");
  const [newDeadline, setNewDeadline] = useState("");

  const activeGroup = groups.find(g => g.id === activeGroupId);

  const viewTitles: Record<string, { title: string; icon: React.ElementType }> = {
    all: { title: "Все задачи", icon: List },
    important: { title: "Важные", icon: Star },
    today: { title: "На сегодня", icon: CalendarDays },
    assigned: { title: "Делегированные", icon: Users },
    group: { title: activeGroup?.name || "Проект", icon: List },
  };

  const view = viewTitles[activeView] || viewTitles.all;
  const Icon = view.icon;

  let filteredTasks = tasks;
  if (activeView === "important") {
    filteredTasks = tasks.filter(t => t.is_important);
  } else if (activeView === "today") {
    filteredTasks = tasks.filter(t => t.deadline && isToday(parseISO(t.deadline)));
  } else if (activeView === "assigned") {
    filteredTasks = tasks.filter(t => t.assigned_to);
  }

  const handleAddTask = () => {
    if (newTitle.trim()) {
      addTask.mutate({
        title: newTitle.trim(),
        group_id: activeView === "group" ? activeGroupId : null,
        deadline: newDeadline || null,
      });
      setNewTitle("");
      setNewDeadline("");
    }
  };

  return (
    <main className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Icon className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-semibold text-foreground">{view.title}</h1>
          <span className="text-sm text-muted-foreground ml-auto">
            {pluralizeRu(filteredTasks.filter(t => !t.is_completed).length, "задача", "задачи", "задач")}
          </span>
        </div>

        {/* Add task */}
        <form
          onSubmit={(e) => { e.preventDefault(); handleAddTask(); }}
          className="flex items-center gap-3 mb-6 bg-card rounded-lg border border-border p-3 shadow-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/40 transition-all"
        >
          <button
            type="submit"
            disabled={!newTitle.trim()}
            className="mt-0.5 h-5 w-5 rounded-full border-2 border-primary/40 flex items-center justify-center shrink-0 transition-all hover:border-primary hover:bg-primary/10 disabled:opacity-30 disabled:hover:border-primary/40 disabled:hover:bg-transparent"
          >
            <Plus className="h-3 w-3 text-primary" />
          </button>
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Добавить задачу... (Enter для добавления)"
            className="border-0 shadow-none p-0 h-auto focus-visible:ring-0 text-sm"
          />
          <input
            type="date"
            value={newDeadline}
            onChange={(e) => setNewDeadline(e.target.value)}
            className="text-xs text-muted-foreground bg-transparent outline-none border border-border rounded px-2 py-1 shrink-0"
          />
        </form>

        {/* Task list */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-16">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Icon className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">Нет задач</p>
            <p className="text-sm text-muted-foreground/60 mt-1">Добавьте первую задачу выше</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTasks.map(task => (
              <TaskItem key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
