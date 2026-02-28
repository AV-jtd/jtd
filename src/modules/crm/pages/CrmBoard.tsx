import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, User, Phone, Mail, Calendar, CheckCircle2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

const CRM_STAGES = [
  { key: "kp", title: "Отправить КП", color: "bg-blue-500", textColor: "text-blue-600", bgLight: "bg-blue-500/10" },
  { key: "os", title: "Получить ОС", color: "bg-amber-500", textColor: "text-amber-600", bgLight: "bg-amber-500/10" },
  { key: "negotiation", title: "Переговоры", color: "bg-purple-500", textColor: "text-purple-600", bgLight: "bg-purple-500/10" },
  { key: "shipping", title: "Старт отгрузок", color: "bg-emerald-500", textColor: "text-emerald-600", bgLight: "bg-emerald-500/10" },
];

const SUBTASK_STAGE_MAP: Record<string, string> = {
  "Отправить презентацию и КП": "kp",
  "Получить ОС": "os",
  "Получить обратную связь": "os",
  "Проведены переговоры": "negotiation",
  "Старт отгрузок": "shipping",
};

type CrmTask = {
  id: string;
  title: string;
  created_at: string;
  deadline: string | null;
  is_completed: boolean;
  assigned_to: string | null;
  client_id: string | null;
  subtasks: { id: string; title: string; is_completed: boolean; position: number }[];
  client?: { name: string; contact_name: string | null; phone: string | null; email: string | null } | null;
  assignee?: { display_name: string | null; email: string | null } | null;
};

function getTaskStage(subtasks: CrmTask["subtasks"]): string {
  if (!subtasks || subtasks.length === 0) return "kp";
  const sorted = [...subtasks].sort((a, b) => a.position - b.position);
  const allDone = sorted.every((s) => s.is_completed);
  if (allDone) return "done";
  const firstIncomplete = sorted.find((s) => !s.is_completed);
  if (!firstIncomplete) return "kp";
  return SUBTASK_STAGE_MAP[firstIncomplete.title] || "kp";
}

export default function CrmBoard() {
  const { user } = useAuth();

  // Find the "НОВЫЕ КЛИЕНТЫ" project group
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
        .select("id, title, created_at, deadline, is_completed, assigned_to, client_id, task_type, group_id")
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
        .select("id, title, created_at, client_id")
        .or(`group_id.eq.${crmGroupId},task_type.eq.crm`)
        .eq("is_completed", true)
        .order("completed_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!crmGroupId,
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
    <div className="flex flex-col h-full">
      {/* Summary stats */}
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

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex h-full min-w-max gap-0">
          {CRM_STAGES.map((stage) => (
            <div key={stage.key} className="flex flex-col w-72 md:w-80 shrink-0 border-r border-border last:border-r-0">
              <div className="flex items-center gap-2 px-4 py-3 shrink-0">
                <div className={cn("h-2.5 w-2.5 rounded-full", stage.color)} />
                <span className="text-sm font-semibold text-foreground">{stage.title}</span>
                <span className="text-xs text-muted-foreground ml-auto">{columns[stage.key]?.length || 0}</span>
              </div>
              <ScrollArea className="flex-1 px-2 pb-2">
                <div className="flex flex-col gap-2">
                  {(columns[stage.key] || []).map((task) => (
                    <CrmCard key={task.id} task={task} />
                  ))}
                  {(!columns[stage.key] || columns[stage.key].length === 0) && (
                    <div className="text-center py-8 text-xs text-muted-foreground/50">
                      Нет клиентов
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CrmCard({ task }: { task: CrmTask }) {
  const completedSteps = task.subtasks.filter((s) => s.is_completed).length;
  const totalSteps = task.subtasks.length;

  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
      <h4 className="text-sm font-medium text-foreground leading-tight mb-2 line-clamp-2">
        {task.client?.name || task.title}
      </h4>

      {task.client && (
        <div className="flex flex-col gap-1 mb-2">
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
        <div className="mb-2">
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

      <div className="flex items-center justify-between gap-2">
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
