import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useTasks, useTaskMutations, useTaskGroups, useTags, useAvailableUsers } from "@/hooks/useTasks";
import { useAuth } from "@/hooks/useAuth";
import TaskItem from "./TaskItem";
import ProjectDetailPanel from "./ProjectDetailPanel";
import { List, Star, CalendarDays, Users, Inbox, Expand, X, MessageCircle, Clock, Trash2, FolderOpen, Tag, Sparkles } from "lucide-react";
import SubprojectCards from "@/components/SubprojectCards";
import { Skeleton } from "@/components/ui/skeleton";
import { isToday, parseISO } from "date-fns";
import { pluralizeRu } from "@/lib/pluralize";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import ConfirmDelete from "@/components/ConfirmDelete";
import TaskCreateBar from "@/components/task-list/TaskCreateBar";
import TaskFiltersBar from "@/components/task-list/TaskFiltersBar";
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
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";

interface TaskListProps {
  activeView: string;
  activeGroupId: string | null;
  activeTagFilters: string[];
  projectDetailOpen: boolean;
  onToggleProjectDetail: () => void;
  chatOpen?: boolean;
  onToggleChat?: () => void;
  messengerOpen?: boolean;
  onToggleMessenger?: () => void;
  highlightTaskId?: string | null;
  onHighlightClear?: () => void;
  onTagClick?: (tagId: string) => void;
  onProjectClick?: (groupId: string) => void;
  onAiOpen?: () => void;
}

export default function TaskList({ activeView, activeGroupId, activeTagFilters, projectDetailOpen, onToggleProjectDetail, chatOpen, onToggleChat, messengerOpen, onToggleMessenger, highlightTaskId, onHighlightClear, onTagClick, onProjectClick, onAiOpen }: TaskListProps) {
  const { user } = useAuth();
  const { data: tasks = [], isLoading } = useTasks(
    activeView === "group" ? activeGroupId : undefined,
    activeTagFilters.length > 0 ? activeTagFilters : undefined
  );
  const { data: groups = [] } = useTaskGroups();
  const { data: allTags = [] } = useTags();
  const { data: availableUsers = [] } = useAvailableUsers();
  const { addTask, reorderTasks, deleteTask, updateTask, addTaskTag } = useTaskMutations();
  const [priorityFilter, setPriorityFilter] = useState<number | "important" | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [delegationTab, setDelegationTab] = useState<"by_me" | "to_me">("by_me");

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const batchMode = selectedIds.size > 0;

  const inputRef = useRef<HTMLInputElement>(null);

  const activeGroup = groups.find(g => g.id === activeGroupId);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if (e.key === "Escape") {
        if (batchMode) {
          setSelectedIds(new Set());
          e.preventDefault();
          return;
        }
        if (isInput) {
          (target as HTMLInputElement).blur();
          e.preventDefault();
          return;
        }
      }

      if (isInput) return;

      if (e.key === "n" || e.key === "N" || e.key === "т" || e.key === "Т") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [batchMode]);

  // Clear selection when view changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeView, activeGroupId]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(tasks.map(t => t.id)));
  }, [tasks]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleBatchDelete = useCallback(() => {
    selectedIds.forEach(id => deleteTask.mutate(id));
    setSelectedIds(new Set());
  }, [selectedIds, deleteTask]);

  const handleBatchMove = useCallback((groupId: string | null) => {
    selectedIds.forEach(id => updateTask.mutate({ id, group_id: groupId }));
    setSelectedIds(new Set());
  }, [selectedIds, updateTask]);

  const handleBatchTag = useCallback((tagId: string) => {
    selectedIds.forEach(id => addTaskTag.mutate({ task_id: id, tag_id: tagId }));
    setSelectedIds(new Set());
  }, [selectedIds, addTaskTag]);

  const viewConfig: Record<string, { title: string; icon: React.ElementType; emptyTitle: string; emptyDesc: string }> = {
    all: { title: "Все задачи", icon: List, emptyTitle: "Список пуст", emptyDesc: "Создайте первую задачу — просто начните печатать выше" },
    inbox: { title: "Входящие", icon: Inbox, emptyTitle: "Входящие пусты", emptyDesc: "Задачи без проекта попадают сюда" },
    important: { title: "Важные", icon: Star, emptyTitle: "Нет важных задач", emptyDesc: "Отметьте задачу звёздочкой, чтобы она появилась здесь" },
    today: { title: "На сегодня", icon: CalendarDays, emptyTitle: "На сегодня ничего", emptyDesc: "Задачи с сегодняшним дедлайном появятся здесь" },
    assigned: { title: "Делегированные", icon: Users, emptyTitle: delegationTab === "by_me" ? "Вы не поручали задач" : "Вам ничего не поручено", emptyDesc: delegationTab === "by_me" ? "Назначьте задачу другому пользователю" : "Когда вам назначат задачу, она появится здесь" },
    deferred: { title: "Отложенные", icon: Clock, emptyTitle: "Нет отложенных", emptyDesc: "Установите дату начала, чтобы отложить задачу" },
    group: { title: activeGroup?.name || "Проект", icon: List, emptyTitle: "Проект пуст", emptyDesc: "Добавьте задачи в этот проект" },
  };

  const view = viewConfig[activeView] || viewConfig.all;
  const Icon = view.icon;

  const delegationCounts = useMemo(() => {
    const byMe = tasks.filter(t => t.user_id === user?.id && t.assigned_to && t.assigned_to !== user?.id && !t.is_completed).length;
    const toMe = tasks.filter(t => t.assigned_to === user?.id && t.user_id !== user?.id && !t.is_completed).length;
    return { byMe, toMe };
  }, [tasks, user?.id]);

  const filteredTasks = useMemo(() => {
    const now = new Date();
    let nextTasks = tasks;

    if (activeView === "inbox") {
      nextTasks = tasks.filter(t => !t.group_id);
    } else if (activeView === "important") {
      nextTasks = tasks.filter(t => t.is_important);
    } else if (activeView === "today") {
      nextTasks = tasks.filter(t => t.deadline && isToday(parseISO(t.deadline)));
    } else if (activeView === "assigned") {
      if (delegationTab === "by_me") {
        nextTasks = tasks.filter(t => t.user_id === user?.id && t.assigned_to && t.assigned_to !== user?.id);
      } else {
        nextTasks = tasks.filter(t => t.assigned_to === user?.id && t.user_id !== user?.id);
      }
    } else if (activeView === "deferred") {
      nextTasks = tasks.filter(t => t.deferred_until && new Date(t.deferred_until) > now);
    } else {
      nextTasks = tasks.filter(t => !t.deferred_until || new Date(t.deferred_until) <= now);
    }

    if (priorityFilter !== null) {
      if (priorityFilter === "important") {
        nextTasks = nextTasks.filter(t => t.is_important);
      } else {
        nextTasks = nextTasks.filter(t => (t as any).priority === priorityFilter);
      }
    }

    if (assigneeFilter !== null) {
      if (assigneeFilter === "me") {
        nextTasks = nextTasks.filter(t => t.assigned_to === user?.id);
      } else if (assigneeFilter === "unassigned") {
        nextTasks = nextTasks.filter(t => !t.assigned_to);
      } else {
        nextTasks = nextTasks.filter(t => t.assigned_to === assigneeFilter);
      }
    }

    if (projectFilter !== null) {
      if (projectFilter === "none") {
        nextTasks = nextTasks.filter(t => !t.group_id);
      } else {
        nextTasks = nextTasks.filter(t => t.group_id === projectFilter);
      }
    }

    const normalizedSearch = searchFilter.trim().toLowerCase();
    if (normalizedSearch) {
      nextTasks = nextTasks.filter(t => t.title.toLowerCase().includes(normalizedSearch));
    }

    return nextTasks;
  }, [tasks, activeView, priorityFilter, assigneeFilter, projectFilter, searchFilter, user?.id, delegationTab]);

  const activeTasks = useMemo(() => filteredTasks.filter(t => !t.is_completed), [filteredTasks]);
  const completedTasks = useMemo(() => filteredTasks.filter(t => t.is_completed), [filteredTasks]);

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

  const handleCreateTask = useCallback((payload: {
    title: string;
    group_id: string | null;
    deadline: string | null;
    task_type: "standard" | "crm";
    client_name?: string;
  }) => {
    addTask.mutate(payload);
  }, [addTask]);

  return (
    <main className="flex-1 overflow-y-auto scrollbar-thin" style={{ WebkitOverflowScrolling: 'touch' }}>
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
              {!batchMode && (
                <span className="hidden sm:inline text-muted-foreground/40 ml-2">
                  N — новая · ⌘K — поиск · Esc — закрыть
                </span>
              )}
            </p>
          </div>
          {activeView === "group" && activeGroup && (
            <div className="flex items-center gap-1">
              <button
                onClick={onToggleChat}
                className={cn(
                  "p-2 rounded-lg transition-all",
                  chatOpen
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
                title="Чат проекта"
              >
                <MessageCircle className="h-4 w-4" />
              </button>
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
            </div>
          )}
          {(!activeGroup || activeView !== "group") && (
            <>
              <button
                onClick={onAiOpen}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                title="AI-помощник"
              >
                <Sparkles className="h-4 w-4" />
              </button>
              <button
                onClick={onToggleMessenger}
                className={cn(
                  "p-2 rounded-lg transition-all",
                  messengerOpen
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
                title="Сообщения"
              >
                <MessageCircle className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        {/* Delegation tabs */}
        {activeView === "assigned" && (
          <div className="flex items-center gap-1 mb-4 p-1 bg-muted/50 rounded-xl w-fit">
            <button
              onClick={() => setDelegationTab("by_me")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                delegationTab === "by_me"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              📤 Поручил я{delegationCounts.byMe > 0 && ` (${delegationCounts.byMe})`}
            </button>
            <button
              onClick={() => setDelegationTab("to_me")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                delegationTab === "to_me"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              📥 Поручено мне{delegationCounts.toMe > 0 && ` (${delegationCounts.toMe})`}
            </button>
          </div>
        )}

        {batchMode && (
          <div className="flex items-center gap-2 mb-4 p-2.5 bg-primary/5 border border-primary/20 rounded-xl animate-fade-in">
            <button
              onClick={clearSelection}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Снять выделение (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium text-foreground">
              {pluralizeRu(selectedIds.size, "задача", "задачи", "задач")}
            </span>
            <button
              onClick={selectAll}
              className="text-xs text-primary hover:text-primary/80 transition-colors ml-1"
            >
              Выбрать все
            </button>

            <div className="flex-1" />

            {/* Move to group */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors">
                  <FolderOpen className="h-3.5 w-3.5" />
                  Переместить
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2 bg-popover border-border z-50" side="bottom">
                <p className="text-xs font-medium text-muted-foreground px-2 py-1">В проект</p>
                <button
                  onClick={() => handleBatchMove(null)}
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors text-muted-foreground"
                >
                  Без проекта
                </button>
                {groups.map(g => (
                  <button
                    key={g.id}
                    onClick={() => handleBatchMove(g.id)}
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors"
                  >
                    {g.name}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            {/* Add tag */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors">
                  <Tag className="h-3.5 w-3.5" />
                  Тэг
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2 bg-popover border-border z-50" side="bottom">
                <p className="text-xs font-medium text-muted-foreground px-2 py-1">Добавить тэг</p>
                {allTags.length === 0 && (
                  <p className="text-xs text-muted-foreground px-2 py-1">Нет тэгов</p>
                )}
                {allTags.map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => handleBatchTag(tag.id)}
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors"
                  >
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color || undefined }} />
                    {tag.name}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            {/* Batch delete */}
            <ConfirmDelete
              title={`Удалить ${pluralizeRu(selectedIds.size, "задачу", "задачи", "задач")}?`}
              description="Все выбранные задачи и их подзадачи будут удалены безвозвратно."
              onConfirm={handleBatchDelete}
            >
              <button className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
                Удалить
              </button>
            </ConfirmDelete>
          </div>
        )}

        {/* Project detail panel */}
        {activeView === "group" && activeGroup && projectDetailOpen && (
          <ProjectDetailPanel group={activeGroup} />
        )}

        {/* Filters */}
        {!batchMode && (
          <TaskFiltersBar
            searchValue={searchFilter}
            onSearchChange={setSearchFilter}
            priorityFilter={priorityFilter}
            onPriorityFilterChange={setPriorityFilter}
            assigneeFilter={assigneeFilter}
            onAssigneeFilterChange={setAssigneeFilter}
            projectFilter={projectFilter}
            onProjectFilterChange={setProjectFilter}
            availableUsers={availableUsers}
            groups={groups}
            currentUserId={user?.id}
            activeView={activeView}
          />
        )}

        <TaskCreateBar
          inputRef={inputRef}
          activeView={activeView}
          activeGroupId={activeGroupId}
          onCreateTask={handleCreateTask}
        />

        {/* Subprojects dashboard */}
        {activeView === "group" && activeGroupId && (
          <SubprojectCards parentId={activeGroupId} onNavigate={onProjectClick} />
        )}

        {/* Task list */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 bg-card rounded-xl border border-border p-3">
                <Skeleton className="h-5 w-5 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-[70%]" />
                  <div className="flex gap-2">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                </div>
                <Skeleton className="h-6 w-6 rounded-md shrink-0" />
              </div>
            ))}
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
                  <div key={task.id} style={i < 20 ? { animationDelay: `${i * 30}ms` } : undefined} className={i < 20 ? "animate-fade-in" : ""}>
                    <TaskItem
                      task={task}
                      sortable={!batchMode}
                      initialOpen={task.id === highlightTaskId}
                      onOpened={task.id === highlightTaskId ? onHighlightClear : undefined}
                      onTagClick={onTagClick}
                      onProjectClick={onProjectClick}
                      selectable={batchMode}
                      selected={selectedIds.has(task.id)}
                      onToggleSelect={() => toggleSelect(task.id)}
                      onLongPress={() => toggleSelect(task.id)}
                    />
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
                    <TaskItem
                      key={task.id}
                      task={task}
                      initialOpen={task.id === highlightTaskId}
                      onOpened={task.id === highlightTaskId ? onHighlightClear : undefined}
                      onTagClick={onTagClick}
                      onProjectClick={onProjectClick}
                      selectable={batchMode}
                      selected={selectedIds.has(task.id)}
                      onToggleSelect={() => toggleSelect(task.id)}
                      onLongPress={() => toggleSelect(task.id)}
                    />
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
