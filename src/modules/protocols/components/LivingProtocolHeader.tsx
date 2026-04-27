import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAvailableUsers, useTaskGroups } from "@/hooks/useTasks";
import MultiAssigneePicker from "@/components/MultiAssigneePicker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon, Plus, Users, FolderOpen, X, Pencil } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getInitials } from "@/lib/initials";
import { Input } from "@/components/ui/input";

/**
 * Минималистичная шапка для протокола типа "Живой документ" (living).
 * Стиль — Google Doc: только название, дата, участники, опц. бейдж проекта.
 * Никаких логотипов, сторон, внешних участников и формата встречи.
 * Использовать вместо ProtocolHeader, когда template_system_key === "living".
 */

interface LivingMeta {
  meeting_date?: string;
  internal_attendees?: string[];
  internal_excluded?: string[];
  context_project_id?: string | null;
  // ... остальные поля meta мы намеренно не трогаем — будут проброшены как есть
  [k: string]: any;
}

interface Props {
  protocol: {
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
    protocol_meta?: LivingMeta | null;
    user_id: string;
  };
  isDraft: boolean;
  /** ID пользователей, которые автоматически выводятся как участники (исполнители задач протокола) */
  internalAttendeeIds?: string[];
}

export default function LivingProtocolHeader({ protocol, isDraft, internalAttendeeIds = [] }: Props) {
  const qc = useQueryClient();
  const { data: profiles = [] } = useAvailableUsers();
  const { data: groups = [] } = useTaskGroups();
  const meta: LivingMeta = (protocol.protocol_meta ?? {}) as LivingMeta;

  // ---- title editing ----
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(protocol.name);
  useEffect(() => setTitleVal(protocol.name), [protocol.name]);

  const update = useMutation({
    mutationFn: async (
      patch: Partial<{ name: string; protocol_meta: LivingMeta }>,
    ) => {
      const { error } = await supabase
        .from("task_groups")
        .update(patch as any)
        .eq("id", protocol.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task_groups"] });
    },
    onError: (e: Error) => toast.error("Не удалось сохранить: " + e.message),
  });

  const commitTitle = () => {
    setEditingTitle(false);
    const v = titleVal.trim();
    if (!v || v === protocol.name) {
      setTitleVal(protocol.name);
      return;
    }
    update.mutate({ name: v });
  };

  // ---- date editing ----
  const [dateOpen, setDateOpen] = useState(false);
  const meetingDate = meta.meeting_date ?? null;
  const dateLabel = meetingDate
    ? format(parseISO(meetingDate), "d MMMM yyyy", { locale: ru })
    : "Указать дату";

  // ---- attendees: union(auto + manual) - excluded ----
  const manualAttendees = meta.internal_attendees ?? [];
  const excluded = meta.internal_excluded ?? [];
  const attendeeIds = useMemo(() => {
    const set = new Set<string>([...internalAttendeeIds, ...manualAttendees]);
    excluded.forEach((id) => set.delete(id));
    return Array.from(set);
  }, [internalAttendeeIds, manualAttendees, excluded]);

  const attendees = useMemo(
    () => attendeeIds.map((id) => profiles.find((p) => p.id === id)).filter(Boolean) as any[],
    [attendeeIds, profiles],
  );

  const [attendeePickerOpen, setAttendeePickerOpen] = useState(false);

  const addAttendee = (userId: string) => {
    if (attendeeIds.includes(userId)) return;
    const newManual = Array.from(new Set([...manualAttendees, userId]));
    const newExcluded = excluded.filter((id) => id !== userId);
    update.mutate({
      protocol_meta: {
        ...meta,
        internal_attendees: newManual,
        internal_excluded: newExcluded,
      },
    });
  };

  const removeAttendee = (userId: string) => {
    const isAuto = internalAttendeeIds.includes(userId);
    const newManual = manualAttendees.filter((id) => id !== userId);
    const newExcluded = isAuto
      ? Array.from(new Set([...excluded, userId]))
      : excluded;
    update.mutate({
      protocol_meta: {
        ...meta,
        internal_attendees: newManual,
        internal_excluded: newExcluded,
      },
    });
  };

  // ---- context project (single) ----
  const contextProjectId = meta.context_project_id ?? null;
  const contextProject = useMemo(
    () => groups.find((g) => g.id === contextProjectId && g.project_type !== "protocol"),
    [groups, contextProjectId],
  );

  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [projectQuery, setProjectQuery] = useState("");
  const projectOptions = useMemo(() => {
    const q = projectQuery.trim().toLowerCase();
    return groups
      .filter((g) => g.project_type !== "protocol")
      .filter((g) => !q || g.name.toLowerCase().includes(q))
      .slice(0, 30);
  }, [groups, projectQuery]);

  const setContextProject = (id: string | null) => {
    update.mutate({ protocol_meta: { ...meta, context_project_id: id } });
    setProjectPickerOpen(false);
    setProjectQuery("");
  };

  return (
    <header className="mb-5 rounded-xl border border-border/60 bg-card px-4 py-4 md:px-6 md:py-5">
      {/* Title */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {editingTitle ? (
            <Input
              autoFocus
              value={titleVal}
              onChange={(e) => setTitleVal(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTitle();
                if (e.key === "Escape") {
                  setTitleVal(protocol.name);
                  setEditingTitle(false);
                }
              }}
              className="h-auto border-0 bg-transparent p-0 text-2xl font-semibold focus-visible:ring-0 md:text-3xl"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingTitle(true)}
              className="group flex items-start gap-2 text-left"
              title="Изменить название"
            >
              <h1 className="text-2xl font-semibold leading-tight text-foreground md:text-3xl">
                {protocol.name}
              </h1>
              <Pencil className="mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )}
        </div>

        {isDraft && (
          <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
            Черновик
          </span>
        )}
      </div>

      {/* Meta line: date · project · attendees */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        {/* Date */}
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-muted hover:text-foreground",
                !meetingDate && "italic",
              )}
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              {dateLabel}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-2">
            <Input
              type="date"
              defaultValue={meetingDate ?? ""}
              onChange={(e) => {
                const v = e.target.value || null;
                update.mutate({ protocol_meta: { ...meta, meeting_date: v ?? undefined } });
                setDateOpen(false);
              }}
              className="h-8"
            />
          </PopoverContent>
        </Popover>

        <span className="text-border">·</span>

        {/* Context project */}
        <Popover open={projectPickerOpen} onOpenChange={setProjectPickerOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-muted hover:text-foreground",
                !contextProject && "italic",
              )}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              {contextProject ? (
                <span className="font-medium text-foreground">{contextProject.name}</span>
              ) : (
                "Контекст: проект"
              )}
              {contextProject && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setContextProject(null);
                  }}
                  className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-0">
            <div className="border-b border-border p-2">
              <Input
                autoFocus
                placeholder="Найти проект…"
                value={projectQuery}
                onChange={(e) => setProjectQuery(e.target.value)}
                className="h-8"
              />
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {projectOptions.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                  Ничего не найдено
                </p>
              ) : (
                projectOptions.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setContextProject(g.id)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <span className="text-base">{g.icon ?? "📁"}</span>
                    <span className="truncate">{g.name}</span>
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>

        <span className="text-border">·</span>

        {/* Attendees */}
        <div className="inline-flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">
            Участники {attendees.length > 0 && `(${attendees.length})`}:
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {attendees.length === 0 && (
            <span className="italic text-muted-foreground/70">пока никого</span>
          )}
          {attendees.map((p) => (
            <span
              key={p.id}
              className="group inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
              title={p.display_name ?? "Участник"}
            >
              {p.avatar_url ? (
                <img
                  src={p.avatar_url}
                  alt=""
                  className="h-4 w-4 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[9px] font-semibold text-primary">
                  {getInitials(p.display_name ?? "?")}
                </span>
              )}
              <span className="text-foreground">
                {p.display_name ?? "—"}
              </span>
              <button
                type="button"
                onClick={() => removeAttendee(p.id)}
                className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                aria-label="Убрать"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}

          {/* Add attendee */}
          <MultiAssigneePicker
            users={profiles}
            excludeIds={attendeeIds}
            open={attendeePickerOpen}
            onOpenChange={setAttendeePickerOpen}
            onSelectUsers={(ids) => ids.forEach((uid) => addAttendee(uid))}
            trigger={
              <button
                type="button"
                className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-border px-1.5 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary"
                aria-label="Добавить участника"
                onClick={() => setAttendeePickerOpen(true)}
              >
                <Plus className="h-3 w-3" />
                <span>Добавить</span>
              </button>
            }
          />
        </div>
      </div>
    </header>
  );
}