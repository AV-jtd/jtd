import { useMemo, useState } from "react";
import { Lock, FolderOpen, Users2, X, Plus } from "lucide-react";
import { useTaskMutations, useAvailableUsers, useTaskGroups, type Task, type Profile } from "@/hooks/useTasks";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Props = {
  task: Task;
};

/**
 * "Внутренние задачи" — слой внутреннего контура НА существующей внешней строке.
 *
 * Хранится в `tasks.status_meta`:
 *  - also_internal: boolean             — флаг наличия слоя
 *  - also_internal_project_id: string   — внутренний проект (PMO/NPD), куда строка падает дублем
 *  - also_internal_user_ids: string[]   — внутренние участники (наша команда), скрытые от партнёра
 *  - also_internal_notes: string        — внутренние заметки (НЕ описание задачи)
 *
 * Партнёр видит только publicly-задачу: title / assigned_to / external_assignee / deadline / status / description / closure_result.
 * Эти also_internal_* поля обязаны фильтроваться при экспорте партнёру.
 */
export default function ExternalRowInternalLayer({ task }: Props) {
  const { updateTask } = useTaskMutations();
  const { data: users = [] } = useAvailableUsers();
  const { data: groups = [] } = useTaskGroups();

  const meta: any = task.status_meta ?? {};
  const enabled = !!meta.also_internal;
  const projectId: string | null = meta.also_internal_project_id ?? null;
  const userIds: string[] = Array.isArray(meta.also_internal_user_ids) ? meta.also_internal_user_ids : [];
  const notes: string = meta.also_internal_notes ?? "";

  const projects = useMemo(
    () => (groups || []).filter((g: any) => g.project_type !== "protocol" && !g.closed_at),
    [groups],
  );
  const linkedProject = projects.find((g) => g.id === projectId);
  const participants = users.filter((u) => userIds.includes(u.id));

  const patchMeta = (patch: Record<string, any>) => {
    const next = { ...meta, ...patch };
    // Cleanup nulls/empties to keep meta tidy
    if (next.also_internal === false) {
      delete next.also_internal_project_id;
      delete next.also_internal_user_ids;
      delete next.also_internal_notes;
      delete next.also_internal;
    }
    updateTask.mutate({ id: task.id, status_meta: next as any });
  };

  return (
    <section
      className={cn(
        "rounded-lg border-l-4 border-red-500/60 bg-red-500/5 p-4 dark:bg-red-500/[0.07] sm:p-5",
      )}
    >
      {/* Toggle header */}
      <div className="flex items-center gap-2">
        <Lock className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
        <h3 className="text-sm font-semibold text-red-700 dark:text-red-300">
          Внутренние задачи
        </h3>
        <span className="ml-auto rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-700 dark:text-red-300">
          не уходит партнёру
        </span>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => patchMeta({ also_internal: v })}
          aria-label="Сделать также внутренней задачей"
        />
      </div>

      {!enabled ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Включите, чтобы добавить к этой строке внутренний проект, участников нашей команды и заметки — невидимые партнёру.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {/* Project + participants on one row */}
          <div className="flex flex-wrap items-center gap-2">
            <ProjectChip
              groups={projects}
              value={projectId}
              currentLabel={linkedProject?.name}
              onChange={(pid) => patchMeta({ also_internal_project_id: pid ?? undefined })}
            />
            <ParticipantsChip
              users={users}
              value={userIds}
              participants={participants}
              onChange={(ids) => patchMeta({ also_internal_user_ids: ids })}
            />
          </div>

          {/* Selected participants pills */}
          {participants.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {participants.map((u) => (
                <span
                  key={u.id}
                  className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] text-red-700 dark:text-red-300"
                >
                  {u.display_name || "Без имени"}
                  <button
                    onClick={() =>
                      patchMeta({ also_internal_user_ids: userIds.filter((id) => id !== u.id) })
                    }
                    className="opacity-60 hover:opacity-100"
                    aria-label="Убрать"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Internal notes */}
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-red-700/70 dark:text-red-300/70">
              Внутренние заметки
            </div>
            <textarea
              defaultValue={notes}
              placeholder="То, что знает только наша команда (контекст, риски, договорённости внутри)…"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== notes) patchMeta({ also_internal_notes: v || undefined });
              }}
              className="min-h-[64px] w-full rounded-md border border-red-500/20 bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/40"
            />
          </div>
        </div>
      )}
    </section>
  );
}

/* -------------------------- Chips -------------------------- */

function ProjectChip({
  groups, value, onChange, currentLabel,
}: {
  groups: any[];
  value: string | null;
  onChange: (pid: string | null) => void;
  currentLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = (groups || []).filter((g: any) =>
    !search.trim() || g.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-red-500/20 bg-card px-2 py-1 text-xs transition-colors hover:bg-muted",
            currentLabel ? "text-foreground" : "text-muted-foreground",
          )}
          title={currentLabel ? `Внутренний проект: ${currentLabel}` : "Привязать внутренний проект"}
        >
          <FolderOpen className="h-3 w-3" />
          <span className="max-w-[10rem] truncate">{currentLabel || "Внутренний проект"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск проекта…" className="mb-2 h-7 text-xs" />
        <div className="max-h-56 space-y-0.5 overflow-y-auto">
          {value && (
            <button
              onClick={() => { onChange(null); setOpen(false); }}
              className="block w-full rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted"
            >
              Без привязки
            </button>
          )}
          {filtered.map((g: any) => (
            <button
              key={g.id}
              onClick={() => { onChange(g.id); setOpen(false); }}
              className={cn(
                "block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-muted",
                g.id === value && "bg-primary/10 text-primary",
              )}
            >
              {g.icon ? `${g.icon} ` : ""}{g.name}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-2 py-1 text-xs text-muted-foreground">Нет проектов</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ParticipantsChip({
  users, value, participants, onChange,
}: {
  users: Profile[];
  value: string[];
  participants: Profile[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = users.filter((u) =>
    !search.trim() || (u.display_name || "").toLowerCase().includes(search.toLowerCase()),
  );
  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((x) => x !== id));
    else onChange([...value, id]);
  };
  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-red-500/20 bg-card px-2 py-1 text-xs transition-colors hover:bg-muted",
            participants.length > 0 ? "text-foreground" : "text-muted-foreground",
          )}
          title="Внутренние участники"
        >
          <Users2 className="h-3 w-3" />
          <span>
            {participants.length > 0 ? `Участники: ${participants.length}` : "Внутренние участники"}
          </span>
          <Plus className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск…" className="mb-2 h-7 text-xs" />
        <div className="max-h-56 space-y-0.5 overflow-y-auto">
          {filtered.map((u) => {
            const checked = value.includes(u.id);
            return (
              <button
                key={u.id}
                onClick={() => toggle(u.id)}
                className={cn(
                  "flex w-full items-center gap-2 truncate rounded px-2 py-1 text-left text-xs hover:bg-muted",
                  checked && "bg-red-500/10 text-red-700 dark:text-red-300",
                )}
              >
                <span className={cn(
                  "h-3 w-3 shrink-0 rounded-sm border",
                  checked ? "border-red-500 bg-red-500" : "border-border",
                )} />
                <span className="truncate">{u.display_name || "Без имени"}</span>
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
