import { useMemo, useState, useRef, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTaskGroups, useTasks, useTaskMutations, useAvailableUsers, type Task, type TaskGroup, type Profile } from "@/hooks/useTasks";
import { useDependencies, useDependencyMutations } from "@/hooks/useDependencies";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import ProjectDetailPanel from "@/components/ProjectDetailPanel";
import UserPicker from "@/components/UserPicker";
import DependencyDialog from "@/modules/pmo/components/DependencyDialog";
import { computeCascadeUpdates } from "@/lib/cascadeDependencies";
import {
  Loader2, ArrowLeft, Plus, X, CalendarIcon, User, CheckCircle2,
  AlertTriangle, Clock, ChevronDown, ChevronRight, Link2, GanttChart,
  Expand, GripVertical, Inbox,
} from "lucide-react";
import { format, isPast, parseISO, differenceInCalendarDays } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";

// ── Gate definitions (same as NpdBoard) ──
const NPD_GATES = [
  { key: "gate0", title: "Gate 0: Идея", tagName: "Gate 0: Идея и Стратегия", color: "bg-slate-500", textColor: "text-slate-600", bgLight: "bg-slate-500/10" },
  { key: "gate1", title: "Gate 1: Концепция", tagName: "Gate 1: Концепция и Экономика", color: "bg-blue-500", textColor: "text-blue-600", bgLight: "bg-blue-500/10" },
  { key: "gate2", title: "Gate 2: Разработка", tagName: "Gate 2: Разработка и Валидация", color: "bg-amber-500", textColor: "text-amber-600", bgLight: "bg-amber-500/10" },
  { key: "gate3", title: "Gate 3: Подготовка", tagName: "Gate 3: Подготовка к запуску", color: "bg-purple-500", textColor: "text-purple-600", bgLight: "bg-purple-500/10" },
  { key: "gate4", title: "Gate 4: Запуск", tagName: "Gate 4: Запуск", color: "bg-emerald-500", textColor: "text-emerald-600", bgLight: "bg-emerald-500/10" },
  { key: "gate5", title: "Gate 5: Анализ", tagName: "Gate 5: Анализ запуска", color: "bg-rose-500", textColor: "text-rose-600", bgLight: "bg-rose-500/10" },
];

const NPD_STREAMS = [
  "Продакт", "Реклама", "RnD", "СКК", "Производство", "Закупки", "Продажи", "Покупка оборудования",
];

export default function NpdSwimlaneMatrix() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: allGroups = [], isLoading: groupsLoading } = useTaskGroups();
  const { data: allTasks = [], isLoading: tasksLoading } = useTasks();
  const { data: users = [] } = useAvailableUsers();
  const { data: allDependencies = [] } = useDependencies();
  const { addDependency, updateDependency, deleteDependency } = useDependencyMutations();
  const { updateTask } = useTaskMutations();

  // Fetch tags
  const { data: npdTagData } = useQuery({
    queryKey: ["npd-tags-init", user?.id],
    queryFn: async () => {
      if (!user) return { gateTags: [], streamTags: [] };
      const { data: cats } = await supabase
        .from("tag_categories")
        .select("id, name, parent_id")
        .eq("user_id", user.id);
      const npdRoot = (cats || []).find(c => !c.parent_id && c.name === "NPD");
      if (!npdRoot) return { gateTags: [], streamTags: [] };
      const subs = (cats || []).filter(c => c.parent_id === npdRoot.id);
      const gatesCatId = subs.find(c => c.name === "Гейты")?.id;
      const streamsCatId = subs.find(c => c.name === "Стримы")?.id;
      const [gRes, sRes] = await Promise.all([
        gatesCatId ? supabase.from("tags").select("id, name").eq("category_id", gatesCatId) : { data: [] },
        streamsCatId ? supabase.from("tags").select("id, name").eq("category_id", streamsCatId) : { data: [] },
      ]);
      return {
        gateTags: (gRes.data || []) as { id: string; name: string }[],
        streamTags: (sRes.data || []) as { id: string; name: string }[],
      };
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 30,
  });

  const gateTags = npdTagData?.gateTags || [];
  const streamTags = npdTagData?.streamTags || [];

  // Tag maps
  const tagNameToGateKey = useMemo(() => {
    const m = new Map<string, string>();
    NPD_GATES.forEach(g => m.set(g.tagName, g.key));
    return m;
  }, []);

  const gateKeyToTagId = useMemo(() => {
    const m = new Map<string, string>();
    gateTags.forEach(t => {
      const k = tagNameToGateKey.get(t.name);
      if (k) m.set(k, t.id);
    });
    return m;
  }, [gateTags, tagNameToGateKey]);

  const streamTagIds = useMemo(() => new Set(streamTags.map(t => t.id)), [streamTags]);
  const streamTagById = useMemo(() => new Map(streamTags.map(t => [t.id, t.name])), [streamTags]);

  // Fetch group_tags
  const { data: allGroupTags = [] } = useQuery({
    queryKey: ["npd-group-tags", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("group_tags" as any)
        .select("group_id, tag_id") as { data: { group_id: string; tag_id: string }[] | null; error: any };
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Project data
  const project = allGroups.find(g => g.id === projectId);
  const subprojects = useMemo(
    () => allGroups.filter(g => g.parent_id === projectId),
    [allGroups, projectId]
  );

  // Map stream subprojects
  const streamSubMap = useMemo(() => {
    const m = new Map<string, TaskGroup>(); // streamName -> subproject
    for (const sub of subprojects) {
      const gTags = allGroupTags.filter(gt => gt.group_id === sub.id);
      const sTagId = gTags.find(gt => streamTagIds.has(gt.tag_id))?.tag_id;
      const sName = sTagId ? streamTagById.get(sTagId) : null;
      if (sName) m.set(sName, sub);
    }
    return m;
  }, [subprojects, allGroupTags, streamTagIds, streamTagById]);

  // Get gate for a subproject
  const getSubprojectGate = useCallback((subId: string): string | null => {
    const gTags = allGroupTags.filter(gt => gt.group_id === subId);
    for (const gt of gTags) {
      for (const tag of gateTags) {
        if (gt.tag_id === tag.id) {
          const k = tagNameToGateKey.get(tag.name);
          if (k) return k;
        }
      }
    }
    return null;
  }, [allGroupTags, gateTags, tagNameToGateKey]);

  // Tasks per subproject
  const tasksByGroup = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const sub of subprojects) {
      m.set(sub.id, allTasks.filter(t => t.group_id === sub.id));
    }
    return m;
  }, [subprojects, allTasks]);

  // Inbox: tasks directly on parent project + unmatched subprojects
  const inboxData = useMemo(() => {
    const matchedSubIds = new Set(Array.from(streamSubMap.values()).map(s => s.id));
    const unmatchedSubs = subprojects.filter(s => !matchedSubIds.has(s.id));
    const parentTasks = allTasks.filter(t => t.group_id === projectId);
    const unmatchedSubTasks = unmatchedSubs.flatMap(s => allTasks.filter(t => t.group_id === s.id));
    return { parentTasks, unmatchedSubs, unmatchedSubTasks, totalCount: parentTasks.length + unmatchedSubTasks.length + unmatchedSubs.length };
  }, [allTasks, projectId, subprojects, streamSubMap]);

  // Move stream subproject to a gate
  const moveStreamToGate = async (subId: string, gateKey: string) => {
    const gateTagId = gateKeyToTagId.get(gateKey);
    if (!gateTagId) return;

    // Remove old gate tags
    const gTags = allGroupTags.filter(gt => gt.group_id === subId);
    for (const gt of gTags) {
      const isGate = gateTags.some(g => g.id === gt.tag_id);
      if (isGate) {
        await supabase.from("group_tags" as any).delete().eq("group_id", subId).eq("tag_id", gt.tag_id);
      }
    }
    // Add new
    await supabase.from("group_tags" as any).insert({ group_id: subId, tag_id: gateTagId });
    queryClient.invalidateQueries({ queryKey: ["npd-group-tags"] });
    toast.success("Стрим перемещён в " + NPD_GATES.find(g => g.key === gateKey)?.title);
  };

  // Create task
  const handleCreateTask = async (title: string, groupId: string, deadline?: Date, assigneeId?: string) => {
    if (!title.trim() || !user) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData?.session?.user?.id;
    if (!uid) { toast.error("Сессия истекла"); return; }

    const insertData: any = {
      title: title.trim(),
      user_id: uid,
      group_id: groupId,
    };
    if (deadline) insertData.deadline = deadline.toISOString();
    if (assigneeId) insertData.assigned_to = assigneeId;

    const { data, error } = await supabase.from("tasks").insert(insertData).select("id").single();
    if (error) { toast.error(error.message); return; }

    // Sync assigned_to -> task_participants
    if (assigneeId && data) {
      await supabase.from("task_participants").upsert({
        task_id: data.id,
        user_id: assigneeId,
        role: "assignee",
      }, { onConflict: "task_id,user_id" });
    }

    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    toast.success("Задача создана");
  };

  // Create subproject (stream) with gate assignment
  const handleCreateSubproject = async (streamName: string, gateKey: string) => {
    if (!user || !projectId) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData?.session?.user?.id;
    if (!uid) { toast.error("Сессия истекла"); return; }

    // Create subproject
    const { data: newSub, error } = await supabase
      .from("task_groups")
      .insert({
        name: `${project?.name || ""} / ${streamName}`,
        user_id: uid,
        project_type: "npd",
        icon: "📋",
        color: "#8b5cf6",
        parent_id: projectId,
        position: subprojects.length,
      })
      .select("id")
      .single();
    if (error || !newSub) { toast.error(error?.message || "Ошибка"); return; }

    // Assign stream tag
    const streamTag = streamTags.find(t => t.name === streamName);
    if (streamTag) {
      await supabase.from("group_tags" as any).insert({ group_id: newSub.id, tag_id: streamTag.id });
    }

    // Assign gate tag
    const gateTagId = gateKeyToTagId.get(gateKey);
    if (gateTagId) {
      await supabase.from("group_tags" as any).insert({ group_id: newSub.id, tag_id: gateTagId });
    }

    queryClient.invalidateQueries({ queryKey: ["task-groups"] });
    queryClient.invalidateQueries({ queryKey: ["npd-group-tags"] });
    toast.success(`Стрим «${streamName}» создан в ${NPD_GATES.find(g => g.key === gateKey)?.title}`);
  };

  // Cascade update on deadline change
  const handleDeadlineChange = async (task: Task, newDeadline: Date) => {
    const oldDeadline = task.deadline ? parseISO(task.deadline) : new Date(task.created_at);
    
    updateTask.mutate({ id: task.id, deadline: newDeadline.toISOString() });

    // Compute cascade
    const entities = new Map<string, { id: string; deadline?: string | null; start_at?: string | null; created_at: string }>();
    allTasks.forEach(t => entities.set(t.id, { id: t.id, deadline: t.deadline, start_at: t.start_at, created_at: t.created_at }));
    
    const cascadeUpdates = computeCascadeUpdates(task.id, newDeadline, oldDeadline, allDependencies, entities);
    
    if (cascadeUpdates.size > 0) {
      for (const [entityId, upd] of cascadeUpdates) {
        const updates: any = {};
        if (upd.deadline) updates.deadline = upd.deadline;
        if (upd.start_at) updates.start_at = upd.start_at;
        updateTask.mutate({ id: entityId, ...updates });
      }
      toast.info(`Каскадно обновлено ${cascadeUpdates.size} задач`);
    }
  };

  // Dependency dialog
  const [depDialogState, setDepDialogState] = useState<{
    predecessorId: string;
    successorId: string;
    predecessorLabel: string;
    successorLabel: string;
    predecessorEntityType: string;
    successorEntityType: string;
  } | null>(null);

  // Detail sheet
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const detailTask = detailTaskId ? allTasks.find(t => t.id === detailTaskId) : null;

  // Collapsed streams
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapse = (stream: string) => {
    setCollapsed(prev => {
      const n = new Set(prev);
      if (n.has(stream)) n.delete(stream); else n.add(stream);
      return n;
    });
  };

  const [inboxOpen, setInboxOpen] = useState(false);

  const isLoading = groupsLoading || tasksLoading || !npdTagData;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background flex-col gap-4">
        <p className="text-muted-foreground">Проект не найден</p>
        <Link to="/npd" className="text-primary text-sm hover:underline">← Назад к NPD</Link>
      </div>
    );
  }

  const projectName = project.name;

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Header */}
      <header className="flex items-center h-12 px-4 border-b border-border bg-card shrink-0 gap-3">
        <button onClick={() => navigate("/npd")} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm leading-none">{project.icon && project.icon !== "list" ? project.icon : "🧪"}</span>
          <h1 className="text-sm font-bold text-foreground truncate">{projectName}</h1>
        </div>
        <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted">Swimlane Matrix</span>
        <div className="flex-1" />
        <Link
          to={`/pmo?project=${projectId}`}
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
        >
          <GanttChart className="h-3 w-3" />
          Гант
        </Link>
      </header>

      {/* Matrix */}
      <div className="flex-1 overflow-auto">
        <div className="min-w-max">
          {/* Column headers */}
          <div className="flex sticky top-0 z-10 bg-card border-b border-border">
            <div className="min-w-[200px] w-[200px] shrink-0 px-3 py-2.5 border-r border-border">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Стрим</span>
            </div>
            {NPD_GATES.map(gate => (
              <div key={gate.key} className={cn("min-w-[280px] w-[280px] shrink-0 px-3 py-2.5 border-r border-border", gate.bgLight)}>
                <div className="flex items-center gap-1.5">
                  <div className={cn("h-2.5 w-2.5 rounded-full", gate.color)} />
                  <span className={cn("text-xs font-bold", gate.textColor)}>{gate.title}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Stream rows */}
          {NPD_STREAMS.map(stream => {
            const sub = streamSubMap.get(stream);
            const isCollapsed = collapsed.has(stream);
            const currentGate = sub ? getSubprojectGate(sub.id) : null;
            const tasks = sub ? (tasksByGroup.get(sub.id) || []) : [];
            const activeTasks = tasks.filter(t => !t.is_completed);
            const completedCount = tasks.filter(t => t.is_completed).length;
            const overdueTasks = activeTasks.filter(t => t.deadline && isPast(parseISO(t.deadline)));

            return (
              <div key={stream} className="border-b border-border">
                <div className="flex">
                  {/* Stream label */}
                  <div className="min-w-[200px] w-[200px] shrink-0 border-r border-border bg-card/50">
                    <button
                      onClick={() => toggleCollapse(stream)}
                      className="flex items-center gap-2 w-full px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
                    >
                      {isCollapsed
                        ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      }
                      <span className="text-xs font-semibold text-foreground truncate">{stream}</span>
                      <div className="flex items-center gap-1 ml-auto shrink-0">
                        {tasks.length > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            {completedCount}/{tasks.length}
                          </span>
                        )}
                        {currentGate && (
                          <div className={cn("h-2 w-2 rounded-full shrink-0", NPD_GATES.find(g => g.key === currentGate)?.color)} />
                        )}
                      </div>
                    </button>
                  </div>

                  {/* Gate cells */}
                  {NPD_GATES.map(gate => {
                    const isCurrentGate = currentGate === gate.key;
                    const cellTasks = isCurrentGate ? tasks : [];

                    return (
                      <div
                        key={gate.key}
                        className={cn(
                          "min-w-[280px] w-[280px] shrink-0 border-r border-border transition-colors",
                          isCurrentGate ? cn(gate.bgLight, "border-l-2", gate.color.replace("bg-", "border-l-")) : "bg-background/50",
                        )}
                      >
                        {!isCollapsed && (
                          <div className="px-2 py-2 min-h-[60px]">
                             {isCurrentGate ? (
                              <div className="space-y-1">
                                {cellTasks.map(task => (
                                  <MatrixTaskRow
                                    key={task.id}
                                    task={task}
                                    users={users}
                                    allDependencies={allDependencies}
                                    allTasks={allTasks}
                                    onDeadlineChange={handleDeadlineChange}
                                    onAssigneeChange={(taskId, userId) => {
                                      updateTask.mutate({ id: taskId, assigned_to: userId });
                                      if (userId) {
                                        supabase.from("task_participants").upsert({
                                          task_id: taskId, user_id: userId, role: "assignee",
                                        }, { onConflict: "task_id,user_id" });
                                      }
                                    }}
                                    onToggle={(taskId) => {
                                      const t = allTasks.find(x => x.id === taskId);
                                      if (!t) return;
                                      updateTask.mutate({
                                        id: taskId,
                                        is_completed: !t.is_completed,
                                        completed_at: !t.is_completed ? new Date().toISOString() : null,
                                      });
                                    }}
                                    onAddDependency={(predId, succId) => {
                                      const pred = allTasks.find(t => t.id === predId);
                                      const succ = allTasks.find(t => t.id === succId);
                                      setDepDialogState({
                                        predecessorId: predId, successorId: succId,
                                        predecessorLabel: pred?.title || predId,
                                        successorLabel: succ?.title || succId,
                                        predecessorEntityType: "task", successorEntityType: "task",
                                      });
                                    }}
                                  />
                                ))}
                                {sub && (
                                  <InlineTaskCreator
                                    groupId={sub.id}
                                    users={users}
                                    onCreate={handleCreateTask}
                                  />
                                )}
                              </div>
                            ) : sub ? (
                              /* Stream exists but is in another gate — allow adding tasks here */
                              <InlineTaskCreator
                                groupId={sub.id}
                                users={users}
                                onCreate={handleCreateTask}
                              />
                            ) : (
                              /* No subproject for this stream — create one */
                              <button
                                onClick={() => handleCreateSubproject(stream, gate.key)}
                                className="w-full min-h-[40px] rounded-lg border-2 border-dashed border-transparent hover:border-primary/30 flex items-center justify-center transition-colors group/create"
                                title={`Создать стрим «${stream}» в ${gate.title}`}
                              >
                                <span className="flex items-center gap-1 text-[10px] text-muted-foreground/30 group-hover/create:text-primary/60 transition-colors">
                                  <Plus className="h-3 w-3" />
                                  Создать стрим
                                </span>
                              </button>
                            )}
                          </div>
                        )}
                        {isCollapsed && isCurrentGate && (
                          <div className="px-2 py-1.5 flex items-center gap-1">
                            <span className="text-[10px] text-muted-foreground">{tasks.length} задач</span>
                            {activeTasks.some(t => t.deadline && isPast(parseISO(t.deadline))) && (
                              <AlertTriangle className="h-3 w-3 text-destructive" />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {/* Inbox row — unmatched tasks & subprojects */}
          {inboxData.totalCount > 0 && (
            <div className="border-b border-border">
              <div className="flex">
                <div className="min-w-[200px] w-[200px] shrink-0 border-r border-border bg-card/50">
                  <button
                    onClick={() => setInboxOpen(prev => !prev)}
                    className="flex items-center gap-2 w-full px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
                  >
                    {inboxOpen
                      ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    }
                    <Inbox className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs font-semibold text-muted-foreground truncate">Входящие</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{inboxData.totalCount}</span>
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  {inboxOpen && (
                    <div className="px-3 py-2 space-y-1.5">
                      {/* Tasks directly on parent project */}
                      {inboxData.parentTasks.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Задачи проекта</span>
                          {inboxData.parentTasks.map(task => (
                            <MatrixTaskRow
                              key={task.id}
                              task={task}
                              users={users}
                              allDependencies={allDependencies}
                              allTasks={allTasks}
                              onDeadlineChange={handleDeadlineChange}
                              onAssigneeChange={(taskId, userId) => {
                                updateTask.mutate({ id: taskId, assigned_to: userId });
                                if (userId) {
                                  supabase.from("task_participants").upsert({
                                    task_id: taskId, user_id: userId, role: "assignee",
                                  }, { onConflict: "task_id,user_id" });
                                }
                              }}
                              onToggle={(taskId) => {
                                const t = allTasks.find(x => x.id === taskId);
                                if (!t) return;
                                updateTask.mutate({
                                  id: taskId,
                                  is_completed: !t.is_completed,
                                  completed_at: !t.is_completed ? new Date().toISOString() : null,
                                });
                              }}
                              onAddDependency={(predId, succId) => {
                                const pred = allTasks.find(t => t.id === predId);
                                const succ = allTasks.find(t => t.id === succId);
                                setDepDialogState({
                                  predecessorId: predId, successorId: succId,
                                  predecessorLabel: pred?.title || predId,
                                  successorLabel: succ?.title || succId,
                                  predecessorEntityType: "task", successorEntityType: "task",
                                });
                              }}
                            />
                          ))}
                        </div>
                      )}
                      {/* Unmatched subprojects */}
                      {inboxData.unmatchedSubs.map(sub => {
                        const subTasks = allTasks.filter(t => t.group_id === sub.id);
                        const displayName = sub.name.includes("/") ? sub.name.split("/").pop()!.trim() : sub.name;
                        return (
                          <div key={sub.id} className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm leading-none">{sub.icon && sub.icon !== "list" ? sub.icon : "📋"}</span>
                              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{displayName}</span>
                              <span className="text-[10px] text-muted-foreground">{subTasks.length} задач</span>
                            </div>
                            {subTasks.map(task => (
                              <MatrixTaskRow
                                key={task.id}
                                task={task}
                                users={users}
                                allDependencies={allDependencies}
                                allTasks={allTasks}
                                onDeadlineChange={handleDeadlineChange}
                                onAssigneeChange={(taskId, userId) => {
                                  updateTask.mutate({ id: taskId, assigned_to: userId });
                                  if (userId) {
                                    supabase.from("task_participants").upsert({
                                      task_id: taskId, user_id: userId, role: "assignee",
                                    }, { onConflict: "task_id,user_id" });
                                  }
                                }}
                                onToggle={(taskId) => {
                                  const t = allTasks.find(x => x.id === taskId);
                                  if (!t) return;
                                  updateTask.mutate({
                                    id: taskId,
                                    is_completed: !t.is_completed,
                                    completed_at: !t.is_completed ? new Date().toISOString() : null,
                                  });
                                }}
                                onAddDependency={(predId, succId) => {
                                  const pred = allTasks.find(t => t.id === predId);
                                  const succ = allTasks.find(t => t.id === succId);
                                  setDepDialogState({
                                    predecessorId: predId, successorId: succId,
                                    predecessorLabel: pred?.title || predId,
                                    successorLabel: succ?.title || succId,
                                    predecessorEntityType: "task", successorEntityType: "task",
                                  });
                                }}
                              />
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {!inboxOpen && (
                    <div className="px-3 py-2.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                      {inboxData.parentTasks.length > 0 && <span>{inboxData.parentTasks.length} задач</span>}
                      {inboxData.unmatchedSubs.length > 0 && <span>{inboxData.unmatchedSubs.length} подпроектов</span>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {/* Summary footer row */}
          <div className="flex border-t-2 border-border bg-card sticky bottom-0 z-10">
            <div className="min-w-[200px] w-[200px] shrink-0 px-3 py-3 border-r border-border">
              <span className="text-xs font-bold text-foreground">Итого</span>
              {(() => {
                const totalTasks = NPD_STREAMS.reduce((acc, s) => {
                  const sub = streamSubMap.get(s);
                  return acc + (sub ? (tasksByGroup.get(sub.id) || []).length : 0);
                }, 0);
                const totalCompleted = NPD_STREAMS.reduce((acc, s) => {
                  const sub = streamSubMap.get(s);
                  return acc + (sub ? (tasksByGroup.get(sub.id) || []).filter(t => t.is_completed).length : 0);
                }, 0);
                const pct = totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;
                return (
                  <div className="mt-1.5 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground">{pct}%</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{totalCompleted}/{totalTasks} задач</span>
                  </div>
                );
              })()}
            </div>
            {NPD_GATES.map(gate => {
              // Streams in this gate
              const streamsInGate = NPD_STREAMS.filter(s => {
                const sub = streamSubMap.get(s);
                return sub && getSubprojectGate(sub.id) === gate.key;
              });
              const gateTotalTasks = streamsInGate.reduce((acc, s) => {
                const sub = streamSubMap.get(s)!;
                return acc + (tasksByGroup.get(sub.id) || []).length;
              }, 0);
              const gateCompletedTasks = streamsInGate.reduce((acc, s) => {
                const sub = streamSubMap.get(s)!;
                return acc + (tasksByGroup.get(sub.id) || []).filter(t => t.is_completed).length;
              }, 0);
              const gateOverdue = streamsInGate.reduce((acc, s) => {
                const sub = streamSubMap.get(s)!;
                return acc + (tasksByGroup.get(sub.id) || []).filter(t => !t.is_completed && t.deadline && isPast(parseISO(t.deadline))).length;
              }, 0);
              const gatePct = gateTotalTasks > 0 ? Math.round((gateCompletedTasks / gateTotalTasks) * 100) : 0;

              return (
                <div key={gate.key} className={cn("min-w-[280px] w-[280px] shrink-0 border-r border-border px-3 py-3", streamsInGate.length > 0 ? gate.bgLight : "")}>
                  {streamsInGate.length > 0 ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {streamsInGate.map(s => (
                          <span key={s} className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-medium", gate.bgLight, gate.textColor)}>
                            {s}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className={cn("h-full rounded-full transition-all", gate.color)} style={{ width: `${gatePct}%` }} />
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground">{gatePct}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">{gateCompletedTasks}/{gateTotalTasks}</span>
                        {gateOverdue > 0 && (
                          <span className="text-[10px] text-destructive flex items-center gap-0.5">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            {gateOverdue}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/40">—</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Dependency dialog */}
      {depDialogState && (
        <DependencyDialog
          open
          onOpenChange={(open) => { if (!open) setDepDialogState(null); }}
          predecessorLabel={depDialogState.predecessorLabel}
          successorLabel={depDialogState.successorLabel}
          onConfirm={(type, lag) => {
            addDependency.mutate({
              predecessor_id: depDialogState.predecessorId,
              successor_id: depDialogState.successorId,
              dependency_type: type,
              lag_days: lag,
              predecessor_entity_type: depDialogState.predecessorEntityType,
              successor_entity_type: depDialogState.successorEntityType,
            });
            setDepDialogState(null);
          }}
        />
      )}
    </div>
  );
}

// ── Matrix Task Row ──
function MatrixTaskRow({
  task, users, allDependencies, allTasks,
  onDeadlineChange, onAssigneeChange, onToggle, onAddDependency,
}: {
  task: Task;
  users: Profile[];
  allDependencies: any[];
  allTasks: Task[];
  onDeadlineChange: (task: Task, date: Date) => void;
  onAssigneeChange: (taskId: string, userId: string | null) => void;
  onToggle: (taskId: string) => void;
  onAddDependency: (predId: string, succId: string) => void;
}) {
  const isOverdue = !task.is_completed && task.deadline && isPast(parseISO(task.deadline));
  const hasDrift = task.original_deadline && task.deadline && task.original_deadline !== task.deadline;
  const driftDays = hasDrift
    ? differenceInCalendarDays(parseISO(task.deadline!), parseISO(task.original_deadline!))
    : 0;

  const assignee = users.find(u => u.id === task.assigned_to);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [depPickerOpen, setDepPickerOpen] = useState(false);

  // Deps for this task
  const taskDeps = allDependencies.filter(
    d => d.predecessor_id === task.id || d.successor_id === task.id
  );

  return (
    <div className={cn(
      "group flex items-center gap-1 px-1.5 py-1 rounded-md transition-colors min-w-0",
      task.is_completed ? "bg-muted/30" : isOverdue ? "bg-destructive/5" : "hover:bg-muted/40",
    )}>
      {/* Checkbox */}
      <button
        onClick={() => onToggle(task.id)}
        className="shrink-0"
      >
        <CheckCircle2 className={cn(
          "h-3.5 w-3.5",
          task.is_completed ? "text-emerald-500" : "text-muted-foreground/40 hover:text-muted-foreground"
        )} />
      </button>

      {/* Title */}
      <span className={cn(
        "text-[11px] truncate flex-1 min-w-0",
        task.is_completed && "line-through text-muted-foreground",
        isOverdue && "text-destructive",
      )}>
        {task.title}
      </span>

      {/* Drift badge */}
      {hasDrift && driftDays !== 0 && (
        <span className={cn(
          "text-[8px] font-mono font-bold shrink-0 px-1 rounded",
          driftDays > 0 ? "text-destructive bg-destructive/10" : "text-emerald-600 bg-emerald-500/10"
        )}>
          {driftDays > 0 ? `+${driftDays}д` : `${driftDays}д`}
        </span>
      )}

      {/* Dependencies indicator */}
      {taskDeps.length > 0 && (
        <span className="text-[8px] text-primary shrink-0">
          <Link2 className="h-3 w-3" />
        </span>
      )}

      {/* Deadline picker */}
      <Popover open={calOpen} onOpenChange={setCalOpen}>
        <PopoverTrigger asChild>
          <button className={cn(
            "shrink-0 text-[10px] px-1.5 py-0.5 rounded transition-colors",
            task.deadline
              ? isOverdue
                ? "text-destructive bg-destructive/10 font-medium"
                : "text-muted-foreground hover:text-foreground"
              : "text-muted-foreground/40 hover:text-muted-foreground opacity-0 group-hover:opacity-100"
          )}>
            {task.deadline
              ? format(parseISO(task.deadline), "d MMM", { locale: ru })
              : <CalendarIcon className="h-3 w-3" />
            }
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={task.deadline ? parseISO(task.deadline) : undefined}
            onSelect={(date) => {
              if (date) {
                onDeadlineChange(task, date);
                setCalOpen(false);
              }
            }}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>

      {/* Assignee */}
      <UserPicker
        users={users}
        onSelect={(u) => onAssigneeChange(task.id, u.id)}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Ответственный"
        trigger={
          <button className={cn(
            "shrink-0 text-[10px] px-1.5 py-0.5 rounded transition-colors max-w-[60px] truncate",
            assignee
              ? "text-foreground bg-muted font-medium"
              : "text-muted-foreground/40 hover:text-muted-foreground opacity-0 group-hover:opacity-100"
          )}>
            {assignee
              ? (assignee.display_name || "").split(" ")[0] || "👤"
              : <User className="h-3 w-3" />
            }
          </button>
        }
      />

      {/* Add dependency button */}
      <Popover open={depPickerOpen} onOpenChange={setDepPickerOpen}>
        <PopoverTrigger asChild>
          <button className="shrink-0 text-muted-foreground/30 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-all p-0.5 rounded">
            <Link2 className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="end">
          <p className="text-xs font-medium text-muted-foreground px-2 py-1 mb-1">Выбрать преемника</p>
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {allTasks
              .filter(t => t.id !== task.id && !t.is_completed && t.group_id)
              .slice(0, 30)
              .map(t => (
                <button
                  key={t.id}
                  onClick={() => {
                    onAddDependency(task.id, t.id);
                    setDepPickerOpen(false);
                  }}
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors text-left"
                >
                  <span className="truncate">{t.title}</span>
                </button>
              ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ── Inline Task Creator ──
function InlineTaskCreator({
  groupId, users, onCreate,
}: {
  groupId: string;
  users: Profile[];
  onCreate: (title: string, groupId: string, deadline?: Date, assigneeId?: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState<Date | undefined>();
  const [assigneeId, setAssigneeId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [userPickerOpen, setUserPickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    await onCreate(title, groupId, deadline, assigneeId);
    setTitle("");
    setDeadline(undefined);
    setAssigneeId(undefined);
    setSaving(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const assignee = users.find(u => u.id === assigneeId);

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors w-full justify-center mt-1"
      >
        <Plus className="h-3 w-3" /> Добавить задачу
      </button>
    );
  }

  return (
    <div className="rounded-md border border-primary/30 bg-card p-2 space-y-1.5 mt-1">
      <Input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Название задачи..."
        className="h-7 text-xs"
        disabled={saving}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
          if (e.key === "Escape") { setOpen(false); setTitle(""); setDeadline(undefined); setAssigneeId(undefined); }
        }}
      />
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Deadline */}
        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <button className={cn(
              "text-[10px] px-2 py-0.5 rounded-md border transition-colors",
              deadline ? "border-primary/30 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
            )}>
              {deadline ? format(deadline, "d MMM", { locale: ru }) : "Срок"}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={deadline}
              onSelect={(d) => { setDeadline(d || undefined); setCalOpen(false); }}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>

        {/* Assignee */}
        <UserPicker
          users={users}
          onSelect={(u) => setAssigneeId(u.id)}
          open={userPickerOpen}
          onOpenChange={setUserPickerOpen}
          title="Ответственный"
          trigger={
            <button className={cn(
              "text-[10px] px-2 py-0.5 rounded-md border transition-colors",
              assigneeId ? "border-primary/30 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
            )}>
              {assignee ? (assignee.display_name || "").split(" ")[0] : "Ответственный"}
            </button>
          }
        />

        <div className="flex-1" />
        <button
          onClick={handleSubmit}
          disabled={saving || !title.trim()}
          className="text-[10px] px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "..." : "Добавить"}
        </button>
        <button
          onClick={() => { setOpen(false); setTitle(""); setDeadline(undefined); setAssigneeId(undefined); }}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
