import React, { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ChevronRight, Plus, Briefcase, FileText, Link as LinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import TaskItem from "@/components/TaskItem";
import TaskCreateBar from "@/components/task-list/TaskCreateBar";
import { useAvailableUsers, useTaskMutations, type Task } from "@/hooks/useTasks";
import { Link } from "react-router-dom";

interface Props {
  groupId: string;
}

/**
 * Operational tasks block for a KM Brand Control SKU card.
 * Two sections:
 *  - "Операционные" — tasks with task_type='standard' (no source_protocol_id)
 *  - "Из протоколов" — tasks with source_protocol_id (links back to the protocol)
 *
 * Stage-tasks (task_type='km_stage') are excluded — they live in the Chronograph above.
 * Inline create bar uses the same TaskCreateBar / TaskItem as the global "Все задачи" view
 * for a single, consistent workflow.
 */
function KmOpsTasksInner({ groupId }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: users = [] } = useAvailableUsers();
  const { addTask } = useTaskMutations();

  const [opsOpen, setOpsOpen] = useState(true);
  const [protoOpen, setProtoOpen] = useState(true);

  // Local query: all NON-stage tasks of this SKU group, including drafts/protocol tasks.
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["km-ops-tasks", groupId],
    enabled: !!groupId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, task_tags(tag_id), subtasks(*)")
        .eq("group_id", groupId)
        .neq("task_type", "km_stage")
        .order("position", { ascending: true });
      if (error) throw error;
      return (data || []) as Task[];
    },
  });

  const opsTasks = useMemo(() => tasks.filter(t => !(t as any).source_protocol_id), [tasks]);
  const protoTasks = useMemo(() => tasks.filter(t => !!(t as any).source_protocol_id), [tasks]);

  // Resolve protocol names for badges
  const protocolIds = useMemo(
    () => Array.from(new Set(protoTasks.map(t => (t as any).source_protocol_id).filter(Boolean))),
    [protoTasks],
  );
  const { data: protocolMap = new Map<string, { name: string; icon: string | null }>() } = useQuery({
    queryKey: ["km-ops-protocol-names", protocolIds.sort().join(",")],
    enabled: protocolIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("task_groups")
        .select("id, name, icon")
        .in("id", protocolIds);
      return new Map((data ?? []).map(p => [p.id, { name: p.name, icon: p.icon }]));
    },
  });

  const handleCreate = (payload: {
    title: string;
    group_id: string | null;
    deadline: string | null;
    assigned_to?: string | null;
    department_id?: string | null;
    contractor_id?: string | null;
    task_type: "standard" | "crm";
    client_name?: string;
  }) => {
    addTask.mutate({
      ...payload,
      group_id: groupId,
      task_type: "standard",
    });
  };

  const Section = ({
    title,
    icon,
    count,
    open,
    onToggle,
    children,
    accent,
  }: {
    title: string;
    icon: React.ReactNode;
    count: number;
    open: boolean;
    onToggle: () => void;
    children: React.ReactNode;
    accent?: boolean;
  }) => (
    <div className="rounded-lg border border-stm-border/30 bg-background/40 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-left transition-colors",
          accent ? "bg-stm-accent/5 hover:bg-stm-accent/10" : "bg-stm-glass/20 hover:bg-stm-glass/40",
        )}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 text-stm-fg/60" /> : <ChevronRight className="h-3.5 w-3.5 text-stm-fg/40" />}
        <span className="text-stm-fg/70">{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-stm-fg/80">{title}</span>
        <span className="ml-1 text-[10px] font-mono tabular-nums text-stm-fg/40">{count}</span>
      </button>
      {open && <div className="p-2">{children}</div>}
    </div>
  );

  return (
    <div className="space-y-3 px-1">
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-stm-fg/50 px-2">
        <Briefcase className="h-3 w-3 text-stm-accent" />
        Операционные задачи и поручения по SKU
      </div>

      {/* Inline create — same UX as global "Все задачи" */}
      <div className="rounded-lg border border-stm-border/30 bg-background/40 px-2 py-2">
        <TaskCreateBar
          inputRef={inputRef}
          activeView="project"
          activeGroupId={groupId}
          availableUsers={users}
          onCreateTask={handleCreate}
        />
      </div>

      {/* Operational tasks */}
      <Section
        title="Операционные"
        icon={<Briefcase className="h-3.5 w-3.5" />}
        count={opsTasks.length}
        open={opsOpen}
        onToggle={() => setOpsOpen(o => !o)}
      >
        {isLoading && <p className="text-[11px] text-stm-fg/40 italic px-2 py-1">Загрузка…</p>}
        {!isLoading && opsTasks.length === 0 && (
          <p className="text-[11px] text-stm-fg/40 italic px-2 py-1">
            Нет операционных задач. Добавьте первую в строке выше.
          </p>
        )}
        <div className="space-y-1">
          {opsTasks.map(t => (
            <TaskItem key={t.id} task={t} sortable={false} />
          ))}
        </div>
      </Section>

      {/* Tasks coming from protocols */}
      {protoTasks.length > 0 && (
        <Section
          title="Из протоколов"
          icon={<FileText className="h-3.5 w-3.5" />}
          count={protoTasks.length}
          open={protoOpen}
          onToggle={() => setProtoOpen(o => !o)}
          accent
        >
          <div className="space-y-2">
            {protoTasks.map(t => {
              const pid = (t as any).source_protocol_id as string | null;
              const proto = pid ? protocolMap.get(pid) : null;
              return (
                <div key={t.id} className="space-y-1">
                  {proto && pid && (
                    <Link
                      to={`/protocols/${pid}`}
                      className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-stm-accent/80 hover:text-stm-accent px-2"
                      title="Перейти к протоколу-источнику"
                    >
                      <LinkIcon className="h-2.5 w-2.5" />
                      <span>{proto.icon || "📋"}</span>
                      <span className="truncate max-w-[280px]">{proto.name}</span>
                    </Link>
                  )}
                  <TaskItem task={t} sortable={false} />
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}

export const KmOpsTasks = React.memo(KmOpsTasksInner);
export default KmOpsTasks;
