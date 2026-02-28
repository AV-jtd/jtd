import { useMemo, useState, type ComponentProps } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTaskMutations, type Task } from "@/hooks/useTasks";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import TaskItem from "@/components/TaskItem";
import {
  Loader2,
  User,
  Phone,
  Mail,
  Calendar,
  CheckCircle2,
  GripVertical,
  Star,
  Check,
  Briefcase,
  FolderOpen,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { useDroppable, useDraggable } from "@dnd-kit/core";

const CRM_STAGES = [
  { key: "kp", title: "Отправить КП", color: "bg-blue-500", textColor: "text-blue-600", bgLight: "bg-blue-500/10" },
  { key: "os", title: "Получить ОС", color: "bg-amber-500", textColor: "text-amber-600", bgLight: "bg-amber-500/10" },
  { key: "negotiation", title: "Переговоры", color: "bg-purple-500", textColor: "text-purple-600", bgLight: "bg-purple-500/10" },
  { key: "shipping", title: "Старт отгрузок", color: "bg-emerald-500", textColor: "text-emerald-600", bgLight: "bg-emerald-500/10" },
];

const STAGE_ORDER = ["kp", "os", "negotiation", "shipping"];

const SUBTASK_STAGE_MAP: Record<string, string> = {
  "Отправить презентацию и КП": "kp",
  "Получить ОС": "os",
  "Получить обратную связь": "os",
  "Проведены переговоры": "negotiation",
  "Старт отгрузок": "shipping",
};

const CRM_STAGE_TEMPLATE = [
  "Отправить презентацию и КП",
  "Получить обратную связь",
  "Проведены переговоры",
  "Старт отгрузок",
];

type CrmTask = {
  id: string;
  title: string;
  created_at: string;
  deadline: string | null;
  is_completed: boolean;
  is_important: boolean;
  assigned_to: string | null;
  client_id: string | null;
  group_id: string | null;
  task_type: string;
  task_tags?: { tag_id: string }[];
  subtasks: { id: string; title: string; is_completed: boolean; position: number }[];
  client?: { name: string; contact_name: string | null; phone: string | null; email: string | null } | null;
  assignee?: { display_name: string | null; email: string | null } | null;
};

type CrmTag = { id: string; name: string; color: string | null };
type CrmGroup = { id: string; name: string; icon: string | null; color: string | null };

function getTaskStage(subtasks: CrmTask["subtasks"]): string {
  if (!subtasks || subtasks.length === 0) return "kp";
  const sorted = [...subtasks].sort((a, b) => a.position - b.position);
  const mapped = sorted.filter((s) => SUBTASK_STAGE_MAP[s.title]);
  if (mapped.length === 0) return "kp";

  const allDone = mapped.every((s) => s.is_completed);
  if (allDone) return "done";

  const firstIncomplete = mapped.find((s) => !s.is_completed);
  if (!firstIncomplete) return "kp";
  return SUBTASK_STAGE_MAP[firstIncomplete.title] || "kp";
}

export default function CrmBoard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toggleTask, toggleImportant } = useTaskMutations();

  const [activeTask, setActiveTask] = useState<CrmTask | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const { data: selectedTask } = useQuery({
    queryKey: ["crm-task-detail", selectedTaskId],
    queryFn: async () => {
      if (!selectedTaskId) return null;
      const { data, error } = await supabase
        .from("tasks")
        .select("*, subtasks(*), task_tags(tag_id)")
        .eq("id", selectedTaskId)
        .single();
      if (error) throw error;
      return data as Task;
    },
    enabled: !!selectedTaskId,
  });

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } })
  );

  const { data: crmGroup } = useQuery({
    queryKey: ["crm-group", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("task_groups")
        .select("id, name")
        .ilike("name", "%новые клиенты%")
        .limit(1)
        .single();
      return data;
    },
    enabled: !!user,
  });

  const crmGroupId = crmGroup?.id;

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["crm-tasks", user?.id, crmGroupId],
    queryFn: async () => {
      if (!user || !crmGroupId) return [];

      const { data: crmTasks, error } = await supabase
        .from("tasks")
        .select("id, title, created_at, deadline, is_completed, is_important, assigned_to, client_id, group_id, task_type, task_tags(tag_id)")
        .or(`group_id.eq.${crmGroupId},task_type.eq.crm`)
        .eq("is_completed", false)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!crmTasks || crmTasks.length === 0) return [];

      const taskIds = crmTasks.map((t) => t.id);
      const { data: subtasks } = await supabase
        .from("subtasks")
        .select("id, title, is_completed, position, task_id")
        .in("task_id", taskIds)
        .order("position");

      const clientIds = crmTasks.map((t) => t.client_id).filter(Boolean) as string[];
      const { data: clients } = clientIds.length > 0
        ? await supabase.from("clients").select("id, name, contact_name, phone, email").in("id", clientIds)
        : { data: [] };

      const assigneeIds = crmTasks.map((t) => t.assigned_to).filter(Boolean) as string[];
      const { data: profiles } = assigneeIds.length > 0
        ? await supabase.from("profiles").select("id, display_name, email").in("id", assigneeIds)
        : { data: [] };

      return crmTasks.map((t) => ({
        ...t,
        subtasks: (subtasks || []).filter((s) => s.task_id === t.id),
        client: (clients || []).find((c) => c.id === t.client_id) || null,
        assignee: (profiles || []).find((p) => p.id === t.assigned_to) || null,
      })) as CrmTask[];
    },
    enabled: !!user && !!crmGroupId,
  });

  const { data: doneTasks = [] } = useQuery({
    queryKey: ["crm-tasks-done", user?.id, crmGroupId],
    queryFn: async () => {
      if (!user || !crmGroupId) return [];
      const { data, error } = await supabase
        .from("tasks")
        .select("id")
        .or(`group_id.eq.${crmGroupId},task_type.eq.crm`)
        .eq("is_completed", true)
        .order("completed_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!crmGroupId,
  });

  const { data: allTags = [] } = useQuery({
    queryKey: ["crm-tags", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from("tags").select("id, name, color");
      if (error) throw error;
      return (data || []) as CrmTag[];
    },
    enabled: !!user,
  });

  const { data: allGroups = [] } = useQuery({
    queryKey: ["crm-groups", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from("task_groups").select("id, name, icon, color");
      if (error) throw error;
      return (data || []) as CrmGroup[];
    },
    enabled: !!user,
  });

  const tagById = useMemo(() => new Map(allTags.map((t) => [t.id, t])), [allTags]);
  const groupById = useMemo(() => new Map(allGroups.map((g) => [g.id, g])), [allGroups]);

  const moveMutation = useMutation({
    mutationFn: async ({ task, targetStage }: { task: CrmTask; targetStage: string }) => {
      const targetIdx = STAGE_ORDER.indexOf(targetStage);
      if (targetIdx === -1) return;

      const sorted = [...task.subtasks].sort((a, b) => a.position - b.position);
      const mappedSubtasks = sorted.filter((sub) => SUBTASK_STAGE_MAP[sub.title]);

      // If task has no CRM steps, create them automatically and place to target stage.
      if (mappedSubtasks.length === 0) {
        const inserts = CRM_STAGE_TEMPLATE.map((title, index) => ({
          task_id: task.id,
          title,
          position: index,
          is_completed: index < targetIdx,
        }));

        const { error } = await supabase.from("subtasks").insert(inserts);
        if (error) throw error;
        return;
      }

      const updates = mappedSubtasks
        .map((sub) => {
          const subStage = SUBTASK_STAGE_MAP[sub.title];
          const subIdx = STAGE_ORDER.indexOf(subStage);
          const shouldBeCompleted = subIdx < targetIdx;
          return { id: sub.id, shouldBeCompleted, current: sub.is_completed };
        })
        .filter((u) => u.current !== u.shouldBeCompleted);

      if (updates.length === 0) return;

      const results = await Promise.all(
        updates.map((u) =>
          supabase.from("subtasks").update({ is_completed: u.shouldBeCompleted }).eq("id", u.id)
        )
      );

      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["crm-tasks-done"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const columns = useMemo(() => {
    const grouped: Record<string, CrmTask[]> = { kp: [], os: [], negotiation: [], shipping: [] };
    for (const task of tasks) {
      const stage = getTaskStage(task.subtasks);
      if (stage === "done") continue;
      if (grouped[stage]) grouped[stage].push(task);
    }
    return grouped;
  }, [tasks]);

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    setActiveTask(task || null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const overId = event.over?.id as string | undefined;
    if (overId && STAGE_ORDER.includes(overId)) {
      setOverColumn(overId);
    } else {
      setOverColumn(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);
    setOverColumn(null);

    if (!over) return;
    const targetStage = over.id as string;
    if (!STAGE_ORDER.includes(targetStage)) return;

    const task = tasks.find((t) => t.id === active.id);
    if (!task) return;

    const currentStage = getTaskStage(task.subtasks);
    if (currentStage === targetStage) return;

    moveMutation.mutate({ task, targetStage });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const totalActive = tasks.length;
  const totalDone = doneTasks.length;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-full">
        <div className="px-4 py-3 border-b border-border bg-card/50 shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted">
              <span className="text-xs text-muted-foreground">Активных</span>
              <span className="text-sm font-bold text-foreground">{totalActive}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs text-muted-foreground">Завершено</span>
              <span className="text-sm font-bold text-foreground">{totalDone}</span>
            </div>
            <div className="h-4 w-px bg-border" />
            {CRM_STAGES.map((stage) => (
              <div key={stage.key} className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg", stage.bgLight)}>
                <div className={cn("h-2 w-2 rounded-full", stage.color)} />
                <span className={cn("text-xs font-medium", stage.textColor)}>{stage.title}</span>
                <span className="text-sm font-bold text-foreground">{columns[stage.key]?.length || 0}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex h-full min-w-max gap-0">
            {CRM_STAGES.map((stage) => (
              <DroppableColumn
                key={stage.key}
                stage={stage}
                tasks={columns[stage.key] || []}
                isOver={overColumn === stage.key}
                isMoving={moveMutation.isPending}
                tagById={tagById}
                groupById={groupById}
                onToggleComplete={(task) => toggleTask.mutate({ id: task.id, is_completed: !task.is_completed })}
                onToggleImportant={(task) => toggleImportant.mutate({ id: task.id, is_important: !task.is_important })}
                onCardClick={(taskId) => setSelectedTaskId(taskId)}
              />
            ))}
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTask && (
          <div className="w-72 md:w-80 opacity-90">
            <CrmCard
              task={activeTask}
              tags={(activeTask.task_tags || []).map((tt) => tagById.get(tt.tag_id)).filter(Boolean) as CrmTag[]}
              group={activeTask.group_id ? groupById.get(activeTask.group_id) || null : null}
              isDragging
              onToggleComplete={() => {}}
              onToggleImportant={() => {}}
            />
          </div>
        )}
      </DragOverlay>

      <Sheet open={!!selectedTaskId} onOpenChange={(open) => { if (!open) setSelectedTaskId(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0 overflow-y-auto">
          {selectedTask && (
            <div className="p-4">
              <TaskItem task={selectedTask} initialOpen />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </DndContext>
  );
}

function DroppableColumn({
  stage,
  tasks,
  isOver,
  isMoving,
  tagById,
  groupById,
  onToggleComplete,
  onToggleImportant,
}: {
  stage: (typeof CRM_STAGES)[number];
  tasks: CrmTask[];
  isOver: boolean;
  isMoving: boolean;
  tagById: Map<string, CrmTag>;
  groupById: Map<string, CrmGroup>;
  onToggleComplete: (task: CrmTask) => void;
  onToggleImportant: (task: CrmTask) => void;
}) {
  const { setNodeRef } = useDroppable({ id: stage.key });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col h-full w-72 md:w-80 shrink-0 border-r border-border last:border-r-0 transition-colors",
        isOver && "bg-primary/5"
      )}
    >
      <div className="flex items-center gap-2 px-4 py-3 shrink-0">
        <div className={cn("h-2.5 w-2.5 rounded-full", stage.color)} />
        <span className="text-sm font-semibold text-foreground">{stage.title}</span>
        <span className="text-xs text-muted-foreground ml-auto">{tasks.length}</span>
      </div>
      <ScrollArea className="flex-1 px-2 pb-2">
        <div className="flex flex-col gap-2">
          {tasks.map((task) => (
            <DraggableCard
              key={task.id}
              task={task}
              isMoving={isMoving}
              tags={(task.task_tags || []).map((tt) => tagById.get(tt.tag_id)).filter(Boolean) as CrmTag[]}
              group={task.group_id ? groupById.get(task.group_id) || null : null}
              onToggleComplete={() => onToggleComplete(task)}
              onToggleImportant={() => onToggleImportant(task)}
            />
          ))}
          {tasks.length === 0 && (
            <div className="text-center py-8 text-xs text-muted-foreground/50">
              Нет клиентов
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function DraggableCard({
  task,
  tags,
  group,
  isMoving,
  onToggleComplete,
  onToggleImportant,
}: {
  task: CrmTask;
  tags: CrmTag[];
  group: CrmGroup | null;
  isMoving: boolean;
  onToggleComplete: () => void;
  onToggleImportant: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    disabled: isMoving,
  });

  return (
    <div ref={setNodeRef} className={cn(isDragging && "opacity-30")}> 
      <CrmCard
        task={task}
        tags={tags}
        group={group}
        isDragging={isDragging}
        dragHandleProps={{ ...attributes, ...listeners }}
        onToggleComplete={onToggleComplete}
        onToggleImportant={onToggleImportant}
      />
    </div>
  );
}

function CrmCard({
  task,
  tags,
  group,
  isDragging,
  dragHandleProps,
  onToggleComplete,
  onToggleImportant,
}: {
  task: CrmTask;
  tags: CrmTag[];
  group: CrmGroup | null;
  isDragging?: boolean;
  dragHandleProps?: ComponentProps<"button">;
  onToggleComplete: () => void;
  onToggleImportant: () => void;
}) {
  const completedSteps = task.subtasks.filter((s) => s.is_completed).length;
  const totalSteps = task.subtasks.length;

  return (
    <div className={cn(
      "rounded-lg border border-border bg-card p-3 shadow-sm transition-shadow",
      isDragging ? "shadow-lg" : "hover:shadow-md"
    )}>
      <div className="flex items-start gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleComplete();
          }}
          className={cn(
            "h-5 w-5 mt-0.5 rounded-full border-2 flex items-center justify-center transition-colors",
            task.is_completed ? "bg-primary border-primary" : "border-muted-foreground/40 hover:border-primary"
          )}
          title="Завершить"
        >
          {task.is_completed && <Check className="h-3 w-3 text-primary-foreground" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <h4 className="text-sm font-medium text-foreground leading-tight line-clamp-2">
              {task.client?.name || task.title}
            </h4>
          </div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleImportant();
          }}
          className={cn(
            "p-1 rounded transition-colors",
            task.is_important ? "text-warning" : "text-muted-foreground hover:text-warning"
          )}
          title="Важная"
        >
          <Star className={cn("h-3.5 w-3.5", task.is_important && "fill-current")} />
        </button>

        <button
          {...dragHandleProps}
          onClick={(e) => e.stopPropagation()}
          className="p-1 rounded text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
          title="Перетащить"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>

      {group && (
        <div className="mt-2 inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-muted text-foreground">
          <FolderOpen className="h-3 w-3" />
          <span className="truncate">{group.icon ? `${group.icon} ` : ""}{group.name}</span>
        </div>
      )}

      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: tag.color ? `${tag.color}20` : undefined,
                color: tag.color || undefined,
              }}
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}

      {task.client && (
        <div className="flex flex-col gap-1 mt-2">
          {task.client.contact_name && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <User className="h-3 w-3 shrink-0" />
              <span className="truncate">{task.client.contact_name}</span>
            </div>
          )}
          {task.client.phone && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Phone className="h-3 w-3 shrink-0" />
              <span className="truncate">{task.client.phone}</span>
            </div>
          )}
          {task.client.email && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{task.client.email}</span>
            </div>
          )}
        </div>
      )}

      {totalSteps > 0 && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground">{completedSteps}/{totalSteps} шагов</span>
          </div>
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${(completedSteps / totalSteps) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-2">
        {task.deadline && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {format(parseISO(task.deadline), "d MMM", { locale: ru })}
          </div>
        )}
        {task.assignee && (
          <div className="flex items-center gap-1 ml-auto">
            <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-medium text-primary">
              {(task.assignee.display_name || task.assignee.email || "?").charAt(0).toUpperCase()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
