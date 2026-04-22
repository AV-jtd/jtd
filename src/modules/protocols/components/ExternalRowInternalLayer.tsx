import { useMemo, useState } from "react";
import { FolderOpen, Layers, Users, X, Check } from "lucide-react";
import { useTaskMutations, useAvailableUsers, useTaskGroups, type Task, type Profile } from "@/hooks/useTasks";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import ProtocolInternalSection from "./ProtocolInternalSection";
import { filterRealProjects } from "@/lib/projectFilters";

const NPD_STREAMS = ["Продакт", "Реклама", "RnD", "СКК", "Производство", "Закупки", "Продажи", "Покупка оборудования"] as const;
const NPD_STREAM_NAMES = new Set<string>(NPD_STREAMS as readonly string[]);

type Props = { task: Task };

/**
 * Внутренний слой для внешней строки протокола.
 *
 * Содержит:
 *  1. Мини-секцию «Внутренний контекст этой строки» — двухсторонняя привязка
 *     самой внешней задачи к внутреннему проекту (NPD/PMO/CRM):
 *       - chip «Проект» → status_meta.linked_project_id
 *       - chip «Стрим» (только если linked-проект имеет project_type='npd')
 *         → status_meta.linked_stream_key (имя стрима)
 *       - chip «Участники» → task_participants
 *     Триггер БД sync_linked_project_participants при появлении linked_project_id
 *     автоматически добавляет владельца проекта и создателя задачи в участники.
 *
 *  2. Существующая секция «Привязать задачу» — для дочерних подзадач
 *     (protocol_scope='internal' + parent_external_task_id).
 *
 * Партнёр в экспорте видит только title/deadline/assignee внешней задачи —
 * linked_* поля и расширенный список участников отфильтрованы.
 */
export default function ExternalRowInternalLayer({ task }: Props) {
  const { updateTask } = useTaskMutations();
  const { data: groups = [] } = useTaskGroups();
  const { data: users = [] } = useAvailableUsers();

  const meta = (task.status_meta as any) ?? {};
  const linkedProjectId: string | undefined = meta.linked_project_id;
  const linkedStreamKey: string | undefined = meta.linked_stream_key;
  const linkedProject = useMemo(
    () => (groups as any[]).find((g) => g.id === linkedProjectId) ?? null,
    [groups, linkedProjectId],
  );
  const isNpd = linkedProject?.project_type === "npd";

  // Cross-functional protocols don't have an "external partner" — render subtasks
  // as neutral team todos instead of the red "internal / not visible to partner" zone.
  const protocolGroup = useMemo(
    () => (groups as any[]).find((g) => g.id === task.group_id) ?? null,
    [groups, task.group_id],
  );
  const isCrossFunctional =
    (protocolGroup?.protocol_meta as any)?.template_system_key === "cross_functional";

  const setLinkedProject = (pid: string | null) => {
    const next = { ...meta };
    if (pid) next.linked_project_id = pid;
    else {
      delete next.linked_project_id;
      delete next.linked_stream_key;
    }
    updateTask.mutate({ id: task.id, status_meta: next as any });
  };

  const setLinkedStream = (key: string | null) => {
    const next = { ...meta };
    if (key) next.linked_stream_key = key;
    else delete next.linked_stream_key;
    updateTask.mutate({ id: task.id, status_meta: next as any });
  };

  // --- Participants ---
  const { data: participants = [] } = useQuery({
    queryKey: ["task-participants", task.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_participants")
        .select("user_id, role")
        .eq("task_id", task.id);
      if (error) throw error;
      return (data ?? []) as { user_id: string; role: string }[];
    },
    staleTime: 10_000,
  });

  if (!task.group_id) return null;

  return (
    <div className="space-y-3">
      {/* ---------- Контекст ---------- */}
      <section className="rounded-lg border border-border/60 bg-muted/30 p-3">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-xs font-semibold text-foreground">
            Контекст
          </h3>
        </div>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Привязка к внутреннему проекту: задача появится на доске NPD/CRM,
          участники проекта получат к ней доступ.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <ProjectChip
            groups={groups as any[]}
            value={linkedProjectId ?? null}
            onChange={setLinkedProject}
          />
          {isNpd && (
            <StreamChip
              value={linkedStreamKey ?? null}
              onChange={setLinkedStream}
            />
          )}
          <ParticipantsChip
            taskId={task.id}
            users={users}
            current={participants}
          />
        </div>
      </section>

      {/* ---------- Подзадачи с автопривязкой к контексту ---------- */}
      <ProtocolInternalSection
        protocolId={task.group_id}
        parentExternalTaskId={task.id}
        defaultProjectId={linkedProjectId ?? null}
        defaultStreamKey={linkedStreamKey ?? null}
        defaultParticipantIds={participants.map((p) => p.user_id)}
        variant={isCrossFunctional ? "neutral" : "internal"}
        subtitle="Подзадачи — что нужно сделать команде по этому пункту. Автоматически наследуют выбранный выше контекст."
      />
    </div>
  );
}

/* -------------------------- Chips -------------------------- */

function ProjectChip({
  groups, value, onChange,
}: { groups: any[]; value: string | null; onChange: (pid: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const projects = (groups || []).filter((g: any) => {
    if (g.project_type === "protocol") return false;
    if (g.closed_at) return false;
    // Hide auto-generated NPD stream subprojects (Продакт, Реклама, …) — they're service rows.
    if (g.project_type === "npd" && g.parent_id && NPD_STREAM_NAMES.has(g.name)) return false;
    return true;
  });
  const filtered = projects.filter((g: any) =>
    !search.trim() || g.name.toLowerCase().includes(search.toLowerCase()),
  );
  const current = projects.find((g: any) => g.id === value);
  const label = current ? `${current.icon ? current.icon + " " : ""}${current.name}` : "Привязать к проекту";

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
            current
              ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
              : "border-border bg-background text-foreground hover:bg-muted",
          )}
        >
          <FolderOpen className="h-3 w-3" />
          <span className="max-w-[14rem] truncate">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск проекта…"
          className="mb-2 h-7 text-xs"
        />
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {value && (
            <button
              onClick={() => { onChange(null); setOpen(false); }}
              className="block w-full rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted"
            >
              Снять привязку
            </button>
          )}
          {filtered.map((g: any) => (
            <button
              key={g.id}
              onClick={() => { onChange(g.id); setOpen(false); }}
              className={cn(
                "flex w-full items-center gap-1.5 truncate rounded px-2 py-1 text-left text-xs hover:bg-muted",
                g.id === value && "bg-primary/10 text-primary",
              )}
            >
              <span className="shrink-0">{g.icon || "📁"}</span>
              <span className="flex-1 truncate">{g.name}</span>
              {g.project_type === "npd" && (
                <span className="rounded bg-purple-500/15 px-1 text-[9px] uppercase text-purple-700 dark:text-purple-300">NPD</span>
              )}
              {g.project_type === "crm" && (
                <span className="rounded bg-blue-500/15 px-1 text-[9px] uppercase text-blue-700 dark:text-blue-300">CRM</span>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-2 py-1 text-xs text-muted-foreground">Не найдено</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function StreamChip({
  value, onChange,
}: { value: string | null; onChange: (key: string | null) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
            value
              ? "border-purple-500/40 bg-purple-500/10 text-purple-700 hover:bg-purple-500/15 dark:text-purple-300"
              : "border-border bg-background text-foreground hover:bg-muted",
          )}
        >
          <Layers className="h-3 w-3" />
          <span>{value || "Стрим"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {value && (
            <button
              onClick={() => { onChange(null); setOpen(false); }}
              className="block w-full rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted"
            >
              Снять стрим
            </button>
          )}
          {NPD_STREAMS.map((s) => (
            <button
              key={s}
              onClick={() => { onChange(s); setOpen(false); }}
              className={cn(
                "block w-full rounded px-2 py-1 text-left text-xs hover:bg-muted",
                s === value && "bg-purple-500/10 text-purple-700 dark:text-purple-300",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ParticipantsChip({
  taskId, users, current,
}: {
  taskId: string;
  users: Profile[];
  current: { user_id: string; role: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const currentIds = useMemo(() => new Set(current.map((p) => p.user_id)), [current]);
  const currentUsers = users.filter((u) => currentIds.has(u.id));
  const filtered = users.filter((u) =>
    !search.trim() || (u.display_name || "").toLowerCase().includes(search.toLowerCase()),
  );

  const toggle = async (uid: string) => {
    if (currentIds.has(uid)) {
      await supabase.from("task_participants").delete()
        .eq("task_id", taskId).eq("user_id", uid);
    } else {
      await supabase.from("task_participants").insert({
        task_id: taskId, user_id: uid, role: "participant",
      });
    }
    // Invalidate query
    window.dispatchEvent(new CustomEvent("task-participants-changed", { detail: { taskId } }));
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
            currentUsers.length > 0
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300"
              : "border-border bg-background text-foreground hover:bg-muted",
          )}
        >
          <Users className="h-3 w-3" />
          <span>
            {currentUsers.length > 0
              ? `Участники · ${currentUsers.length}`
              : "Участники"}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        {currentUsers.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1 border-b border-border pb-2">
            {currentUsers.map((u) => (
              <button
                key={u.id}
                onClick={() => toggle(u.id)}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
                title="Убрать"
              >
                {u.display_name || "?"}
                <X className="h-2.5 w-2.5" />
              </button>
            ))}
          </div>
        )}
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск…"
          className="mb-2 h-7 text-xs"
        />
        <div className="max-h-56 space-y-0.5 overflow-y-auto">
          {filtered.map((u) => {
            const active = currentIds.has(u.id);
            return (
              <button
                key={u.id}
                onClick={() => toggle(u.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted",
                  active && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                )}
              >
                <span className="flex-1 truncate">{u.display_name || "Без имени"}</span>
                {active && <Check className="h-3 w-3" />}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="px-2 py-1 text-xs text-muted-foreground">Не найдено</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
