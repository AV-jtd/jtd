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
import { toast } from "sonner";

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
  const [carryOver, setCarryOver] = useState(true);

  const isCrossFunctional = selected?.system_key === "cross_functional";

  // Reset on close
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep("template");
        setSelected(null);
        setName("");
        setMeetingDate(format(new Date(), "yyyy-MM-dd"));
        setDescription("");
        setCarryOver(true);
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
  // and count its open (uncompleted) tasks. Used both for the checkbox label and the carry-over action.
  const prevProtocolQuery = useQuery({
    queryKey: ["prev-cross-functional", user?.id],
    enabled: !!user && isCrossFunctional && step === "details",
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!user) return null;
      // Find most recent published cross_functional protocol of this user
      const { data: groups, error: gErr } = await supabase
        .from("task_groups")
        .select("id, name, created_at, protocol_meta")
        .eq("user_id", user.id)
        .eq("project_type", "protocol")
        .order("created_at", { ascending: false })
        .limit(20);
      if (gErr) throw gErr;
      // Filter on client side: cross_functional templates use icon 🔀 + name marker.
      // More robust: check protocol_meta for template_key if present, otherwise fall back to name prefix.
      const candidates = (groups || []).filter((g: any) => {
        const meta = g.protocol_meta || {};
        if (meta.template_system_key === "cross_functional") return true;
        return typeof g.name === "string" && g.name.startsWith("Кросс-функциональный");
      });
      const prev = candidates[0];
      if (!prev) return null;
      const { data: openTasks, error: tErr } = await supabase
        .from("tasks")
        .select("id, title, assigned_to, deadline, description, priority, is_important")
        .eq("group_id", prev.id)
        .eq("is_completed", false);
      if (tErr) throw tErr;
      return {
        id: prev.id as string,
        name: prev.name as string,
        openTasks: openTasks || [],
      };
    },
  });

  const openCount = prevProtocolQuery.data?.openTasks.length ?? 0;

  const createProtocol = useMutation({
    mutationFn: async () => {
      if (!user || !selected) throw new Error("Нет данных");
      if (!name.trim()) throw new Error("Введите название протокола");

      const isCF = selected.system_key === "cross_functional";
      // Build description: for cross_functional keep it clean (user-only), for others keep auto-hint
      const finalDescription = isCF
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
            template_system_key: selected.system_key || null,
          },
        } as any)
        .select()
        .single();
      if (gErr) throw gErr;

      // 2. For cross_functional — optionally clone open tasks from last protocol as drafts
      if (isCF && carryOver && prevProtocolQuery.data?.openTasks.length) {
        const tasksToInsert = prevProtocolQuery.data.openTasks.map((t: any, idx: number) => ({
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
          source_protocol_id: prevProtocolQuery.data.id,
        }));
        const { error: insErr } = await supabase.from("tasks").insert(tasksToInsert as any);
        if (insErr) {
          // Don't fail the whole creation — just warn
          console.error("[NewProtocolDialog] carry-over insert failed", insErr);
          toast.warning("Протокол создан, но не удалось перенести часть поручений");
        }
      }

      return group as { id: string };
    },
    onSuccess: (group) => {
      qc.invalidateQueries({ queryKey: ["task_groups"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Протокол создан");
      onOpenChange(false);
      navigate(`/protocols/${group.id}`);
    },
    onError: (e: any) => {
      toast.error(e?.message || "Не удалось создать протокол");
    },
  });

  const showAxes = useMemo(() => {
    // Cross-functional is an internal ritual — partner-style axes are noise here.
    if (!selected || selected.system_key === "cross_functional") return [] as string[];
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

              {isCrossFunctional && (
                <label
                  htmlFor="carry-over"
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
                    openCount > 0
                      ? "border-primary/30 bg-primary/5 hover:bg-primary/10"
                      : "border-border bg-muted/20",
                  )}
                >
                  <Checkbox
                    id="carry-over"
                    checked={carryOver && openCount > 0}
                    disabled={openCount === 0}
                    onCheckedChange={(v) => setCarryOver(!!v)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <Repeat className="h-3.5 w-3.5 text-primary" />
                      Подтянуть открытые поручения с прошлой встречи
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {prevProtocolQuery.isLoading
                        ? "Ищем последний кросс-функциональный протокол…"
                        : openCount > 0
                          ? `Найдено ${openCount} ${
                              openCount === 1 ? "незакрытая задача" : openCount < 5 ? "незакрытые задачи" : "незакрытых задач"
                            } из «${prevProtocolQuery.data?.name}». Они будут добавлены как черновики.`
                          : "Открытых поручений с прошлой встречи не найдено."}
                    </div>
                  </div>
                </label>
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
