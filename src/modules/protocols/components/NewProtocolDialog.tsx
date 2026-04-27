import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, Loader2, Sparkles, ArrowLeft, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProtocolTemplates, type ProtocolTemplate } from "@/hooks/useProtocolTemplates";
import { useEventTopicTags } from "@/hooks/useEventTopicTags";
import { toast } from "sonner";
import { invalidateTasksScoped, invalidateTaskGroups } from "@/lib/queryInvalidation";

const AXIS_LABELS: Record<string, string> = {
  clients: "Клиент",
  territory: "Территория",
  site: "Площадка",
  brand: "Бренд",
  product_category: "Категория продукта",
  product_state: "Состояние",
  department: "Отдел",
  event_topic: "Событие / Тема",
  stm: "СТМ",
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function NewProtocolDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: templates = [], isLoading } = useProtocolTemplates();

  const [step, setStep] = useState<"template" | "details">("template");
  const [selected, setSelected] = useState<ProtocolTemplate | null>(null);
  const [name, setName] = useState("");
  const [meetingDate, setMeetingDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [description, setDescription] = useState("");
  const [selectedPrevIds, setSelectedPrevIds] = useState<string[]>([]);
  // Persist last-used "Series" filter across dialog reopens and step switches.
  // Users often run several CF meetings of the same series in a row — re-picking the topic each time is friction.
  const TOPIC_FILTER_STORAGE_KEY = "protocols:newDialog:topicFilter";
  const [topicFilter, setTopicFilter] = useState<string>(() => {
    if (typeof window === "undefined") return "all";
    try {
      return window.localStorage.getItem(TOPIC_FILTER_STORAGE_KEY) || "all";
    } catch {
      return "all";
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(TOPIC_FILTER_STORAGE_KEY, topicFilter);
    } catch {
      // best-effort
    }
  }, [topicFilter]);

  const isCrossFunctional = selected?.system_key === "cross_functional";
  const isLiving = selected?.system_key === "living";
  // Шаблоны, которые поддерживают перенос открытых задач из прошлых встреч.
  const supportsCarryOver = isCrossFunctional || isLiving;
  const { topicTags } = useEventTopicTags();

  // Reset on close
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep("template");
        setSelected(null);
        setName("");
        setMeetingDate(format(new Date(), "yyyy-MM-dd"));
        setDescription("");
        setSelectedPrevIds([]);
      // Intentionally DO NOT reset topicFilter — keep user's chosen series across reopens.
      }, 200);
    }
  }, [open]);

  // Auto-suggest name from template + date
  useEffect(() => {
    if (selected && !name) {
      const dateStr = format(new Date(meetingDate), "dd.MM.yyyy");
      setName(`${selected.name} — ${dateStr}`);
    }
  }, [selected, meetingDate, name]);

  // For cross_functional — find the most recent previous protocol of same template (owned by user)
  // and count its open (uncompleted) tasks per protocol. Used to let the user pick which past
  // meeting(s) to carry open commitments from.
  const prevProtocolsQuery = useQuery({
    queryKey: ["prev-protocol-list", selected?.system_key, user?.id],
    enabled: !!user && supportsCarryOver && step === "details",
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!user) return [] as Array<{ id: string; name: string; created_at: string; openCount: number; topicTagIds: string[]; primaryTopicId: string | null }>;
      // Find recent protocols of the same template for this user
      const { data: groups, error: gErr } = await supabase
        .from("task_groups")
        .select("id, name, created_at, protocol_meta")
        .eq("user_id", user.id)
        .eq("project_type", "protocol")
        .order("created_at", { ascending: false })
        .limit(100);
      if (gErr) throw gErr;
      const targetKey = selected?.system_key;
      const candidates = (groups || []).filter((g: any) => {
        const meta = g.protocol_meta || {};
        if (meta.template_system_key === targetKey) return true;
        // Legacy fallback for cross_functional protocols created before template_system_key existed
        if (targetKey === "cross_functional") {
          return typeof g.name === "string" && g.name.startsWith("Кросс-функциональный");
        }
        return false;
      }).slice(0, 30);
      if (candidates.length === 0) return [];
      const ids = candidates.map((g: any) => g.id);
      // Fetch ALL tasks (including their tags) so we can both count open commitments
      // AND derive each protocol's topic (event_topic tag) for series filtering.
      const { data: allTasks, error: tErr } = await supabase
        .from("tasks")
        .select("id, group_id, is_completed, task_tags(tag_id)")
        .in("group_id", ids);
      if (tErr) throw tErr;

      // Build set of valid event_topic tag ids
      const topicIdSet = new Set(topicTags.map((t) => t.id));

      const openCounts = new Map<string, number>();
      // perGroup: tagId -> count, so we can pick the most-frequent topic per protocol.
      const perGroupTopicHist = new Map<string, Map<string, number>>();

      (allTasks || []).forEach((t: any) => {
        if (!t.is_completed) {
          openCounts.set(t.group_id, (openCounts.get(t.group_id) || 0) + 1);
        }
        const tagIds: string[] = (t.task_tags || []).map((tt: any) => tt.tag_id);
        const topicTagsForTask = tagIds.filter((id) => topicIdSet.has(id));
        if (topicTagsForTask.length === 0) return;
        let hist = perGroupTopicHist.get(t.group_id);
        if (!hist) {
          hist = new Map();
          perGroupTopicHist.set(t.group_id, hist);
        }
        topicTagsForTask.forEach((tid) => hist!.set(tid, (hist!.get(tid) || 0) + 1));
      });

      return candidates.map((g: any) => {
        const hist = perGroupTopicHist.get(g.id);
        let primaryTopicId: string | null = null;
        let topicTagIds: string[] = [];
        if (hist && hist.size > 0) {
          topicTagIds = Array.from(hist.keys());
          primaryTopicId = topicTagIds.reduce((best, cur) =>
            (hist!.get(cur) || 0) > (hist!.get(best) || 0) ? cur : best,
          topicTagIds[0]);
        }
        return {
          id: g.id as string,
          name: g.name as string,
          created_at: g.created_at as string,
          openCount: openCounts.get(g.id) || 0,
          topicTagIds,
          primaryTopicId,
        };
      });
    },
  });

  const prevProtocols = prevProtocolsQuery.data ?? [];

  // Filter prev protocols by selected topic (series). "all" = show everything.
  const filteredPrevProtocols = useMemo(() => {
    if (topicFilter === "all") return prevProtocols;
    return prevProtocols.filter((p) => p.topicTagIds.includes(topicFilter));
  }, [prevProtocols, topicFilter]);

  // If the persisted topic is no longer present in the loaded candidates (e.g. data changed),
  // silently fall back to "all" so the UI doesn't show an empty list with a stale active chip.
  useEffect(() => {
    if (!isCrossFunctional || step !== "details") return;
    if (prevProtocolsQuery.isLoading) return;
    if (topicFilter === "all") return;
    const stillExists = prevProtocols.some((p) => p.topicTagIds.includes(topicFilter));
    if (!stillExists) setTopicFilter("all");
  }, [isCrossFunctional, step, prevProtocolsQuery.isLoading, prevProtocols, topicFilter]);

  // Topics that actually appear in the candidate protocols — only those make sense as filter chips.
  const availableTopics = useMemo(() => {
    const seen = new Map<string, number>(); // tagId -> meeting count
    prevProtocols.forEach((p) => {
      p.topicTagIds.forEach((tid) => seen.set(tid, (seen.get(tid) || 0) + 1));
    });
    return topicTags
      .filter((t) => seen.has(t.id))
      .map((t) => ({ ...t, meetingCount: seen.get(t.id) || 0 }))
      .sort((a, b) => b.meetingCount - a.meetingCount);
  }, [prevProtocols, topicTags]);

  // No auto-selection: meetings often cover different unrelated topics,
  // so the user must explicitly pick which previous protocols to carry over.

  const createProtocol = useMutation({
    mutationFn: async () => {
      if (!user || !selected) throw new Error("Нет данных");
      if (!name.trim()) throw new Error("Введите название протокола");

      const isCF = selected.system_key === "cross_functional";
      const isLivingTpl = selected.system_key === "living";
      const carryOver = isCF || isLivingTpl;
      // Build description: for cross_functional / living keep it clean (user-only), for others keep auto-hint
      const finalDescription = (isCF || isLivingTpl)
        ? description.trim() || null
        : description.trim() || `Шаблон: ${selected.name}\nДата встречи: ${format(new Date(meetingDate), "dd.MM.yyyy")}`;

      // 1. Create the project (protocol) — always as DRAFT
      const { data: group, error: gErr } = await supabase
        .from("task_groups")
        .insert({
          name: name.trim(),
          user_id: user.id,
          icon: selected.icon || "📋",
          color: "#6366f1",
          project_type: "protocol",
          draft_status: "draft",
          description: finalDescription,
          protocol_meta: {
            meeting_date: meetingDate,
            format: "offline",
            external_attendees: [],
            internal_attendees: [user.id],
            template_system_key: selected.system_key || null,
          },
        } as any)
        .select()
        .single();
      if (gErr) throw gErr;

      // 2. For cross_functional / living — optionally clone open tasks from selected past protocols as drafts
      if (carryOver && selectedPrevIds.length > 0) {
        const { data: openTasks, error: tErr } = await supabase
          .from("tasks")
          .select("id, title, description, assigned_to, deadline, priority, is_important, group_id")
          .in("group_id", selectedPrevIds)
          .eq("is_completed", false);
        if (tErr) {
          console.error("[NewProtocolDialog] failed to fetch open tasks", tErr);
          toast.warning("Протокол создан, но не удалось перенести поручения");
        } else if (openTasks && openTasks.length > 0) {
          const tasksToInsert = openTasks.map((t: any, idx: number) => ({
            title: t.title,
            description: t.description || null,
            assigned_to: t.assigned_to || null,
            deadline: t.deadline || null,
            priority: t.priority ?? null,
            is_important: !!t.is_important,
            group_id: (group as any).id,
            user_id: user.id,
            is_draft: true,
            is_completed: false,
            position: idx,
            source_protocol_id: t.group_id,
          }));
          const { error: insErr } = await supabase.from("tasks").insert(tasksToInsert as any);
          if (insErr) {
            console.error("[NewProtocolDialog] carry-over insert failed", insErr);
            toast.warning("Протокол создан, но не удалось перенести часть поручений");
          }
        }
      }

      return group as { id: string };
    },
    onSuccess: (group) => {
      invalidateTaskGroups(qc);
      invalidateTasksScoped(qc, group.id);
      toast.success("Протокол создан");
      onOpenChange(false);
      navigate(`/protocols/${group.id}`);
    },
    onError: (e: any) => {
      toast.error(e?.message || "Не удалось создать протокол");
    },
  });

  const showAxes = useMemo(() => {
    // Cross-functional and living are internal rituals — partner-style axes are noise here.
    if (!selected) return [] as string[];
    if (selected.system_key === "cross_functional" || selected.system_key === "living") return [] as string[];
    return [...selected.required_axes, ...selected.optional_axes];
  }, [selected]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === "details" && (
              <button
                onClick={() => setStep("template")}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Назад"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <Sparkles className="h-5 w-5 text-primary" />
            {step === "template" ? "Новый протокол — выберите шаблон" : "Параметры протокола"}
          </DialogTitle>
        </DialogHeader>

        {step === "template" ? (
          <ScrollArea className="max-h-[60vh] pr-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка шаблонов…
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSelected(t);
                      setStep("details");
                    }}
                    className={cn(
                      "group flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-left transition-all",
                      "hover:border-primary/50 hover:shadow-md",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-2xl">{t.icon || "📋"}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-foreground">{t.name}</div>
                        {t.description && (
                          <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                            {t.description}
                          </div>
                        )}
                      </div>
                    </div>
                    {t.required_axes.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {t.required_axes.map((axis) => (
                          <span
                            key={axis}
                            className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                          >
                            {AXIS_LABELS[axis] || axis}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        ) : (
          selected && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
                <span className="text-2xl">{selected.icon || "📋"}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground">{selected.name}</div>
                  {selected.description && (
                    <div className="text-xs text-muted-foreground">{selected.description}</div>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                <div className="space-y-1.5">
                  <Label htmlFor="protocol-name">Название протокола *</Label>
                  <Input
                    id="protocol-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Например: Кросс-функциональный — 18.04.2026"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="protocol-date">Дата встречи</Label>
                  <div className="relative">
                    <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="protocol-date"
                      type="date"
                      value={meetingDate}
                      onChange={(e) => setMeetingDate(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="protocol-desc">Краткое описание (опционально)</Label>
                <Textarea
                  id="protocol-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Цель встречи, участники, контекст…"
                  rows={3}
                />
              </div>

              {supportsCarryOver && (
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <Repeat className="h-3.5 w-3.5 text-primary" />
                    Подтянуть открытые поручения с прошлых встреч
                  </div>
                  {prevProtocolsQuery.isLoading ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Ищем протоколы того же типа…
                    </div>
                  ) : prevProtocols.length === 0 ? (
                    <div className="text-xs text-muted-foreground">
                      Прошлых протоколов «{selected?.name}» не найдено.
                    </div>
                  ) : (
                    <>
                      {availableTopics.length > 0 && (
                        <div className="mb-2 space-y-1">
                          <div className="text-[11px] font-medium text-muted-foreground">
                            Серия встреч (фильтр по теме)
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              onClick={() => setTopicFilter("all")}
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
                                topicFilter === "all"
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-muted-foreground hover:bg-muted/70",
                              )}
                            >
                              Все темы · {prevProtocols.length}
                            </button>
                            {availableTopics.map((t) => {
                              const active = topicFilter === t.id;
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => {
                                    setTopicFilter(active ? "all" : t.id);
                                    // Sweep selections that no longer match the new filter
                                    if (!active) {
                                      setSelectedPrevIds((prev) =>
                                        prev.filter((id) => {
                                          const p = prevProtocols.find((x) => x.id === id);
                                          return p?.topicTagIds.includes(t.id);
                                        }),
                                      );
                                    }
                                  }}
                                  className={cn(
                                    "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
                                    active
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted text-muted-foreground hover:bg-muted/70",
                                  )}
                                  title={`${t.meetingCount} встреч в серии`}
                                >
                                  📁 {t.name} · {t.meetingCount}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>
                          {topicFilter === "all"
                            ? "Выберите встречи, из которых перенести незакрытые задачи (как черновики)"
                            : `История серии — ${filteredPrevProtocols.length} встреч`}
                        </span>
                        {selectedPrevIds.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setSelectedPrevIds([])}
                            className="text-primary hover:underline"
                          >
                            Снять все
                          </button>
                        )}
                      </div>
                      <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
                        {filteredPrevProtocols.length === 0 ? (
                          <div className="rounded border border-dashed border-border px-2 py-3 text-center text-[11px] text-muted-foreground">
                            В этой серии пока нет других встреч.
                          </div>
                        ) : filteredPrevProtocols.map((p) => {
                          const checked = selectedPrevIds.includes(p.id);
                          const disabled = p.openCount === 0;
                          return (
                            <label
                              key={p.id}
                              htmlFor={`prev-${p.id}`}
                              className={cn(
                                "flex items-center gap-2 rounded border px-2 py-1.5 text-xs transition-colors",
                                disabled
                                  ? "cursor-not-allowed border-transparent text-muted-foreground/60"
                                  : checked
                                    ? "cursor-pointer border-primary/40 bg-primary/5"
                                    : "cursor-pointer border-border hover:bg-muted/40",
                              )}
                            >
                              <Checkbox
                                id={`prev-${p.id}`}
                                checked={checked}
                                disabled={disabled}
                                onCheckedChange={(v) => {
                                  setSelectedPrevIds((prev) =>
                                    v ? [...prev, p.id] : prev.filter((x) => x !== p.id),
                                  );
                                }}
                              />
                              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                                {p.name}
                              </span>
                              <span className="shrink-0 text-[10px] text-muted-foreground">
                                {format(new Date(p.created_at), "dd.MM.yyyy")}
                              </span>
                              <span
                                className={cn(
                                  "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                                  p.openCount > 0
                                    ? "bg-primary/15 text-primary"
                                    : "bg-muted text-muted-foreground",
                                )}
                              >
                                {p.openCount} откр.
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

              {showAxes.length > 0 && (
                <div className="rounded-md border border-dashed border-border p-3">
                  <div className="text-xs font-medium text-muted-foreground">
                    Оси для разметки задач (присвоите при разборе строк)
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selected.required_axes.map((axis) => (
                      <span
                        key={axis}
                        className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary"
                        title="Обязательная ось"
                      >
                        {AXIS_LABELS[axis] || axis} *
                      </span>
                    ))}
                    {selected.optional_axes.map((axis) => (
                      <span
                        key={axis}
                        className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {AXIS_LABELS[axis] || axis}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Отмена
                </Button>
                <Button
                  onClick={() => createProtocol.mutate()}
                  disabled={!name.trim() || createProtocol.isPending}
                >
                  {createProtocol.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Создать протокол
                </Button>
              </div>
            </div>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
