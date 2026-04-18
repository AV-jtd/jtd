import { useState, useRef, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2, Upload, FileText, Sparkles, ArrowLeft, ArrowRight,
  CalendarIcon, User as UserIcon, Tag as TagIcon, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProtocolTemplates, type ProtocolTemplate } from "@/hooks/useProtocolTemplates";
import { useAvailableUsers, type Profile } from "@/hooks/useTasks";
import { toast } from "sonner";

// pdfjs lazy import (избегаем тяжёлой загрузки)
async function extractPdfText(file: File): Promise<string> {
  const pdfjsLib: any = await import("pdfjs-dist");
  // Worker через CDN — без локальной настройки vite
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it: any) => it.str).join(" ") + "\n\n";
  }
  return text.trim();
}

interface ParsedRow {
  title: string;
  description?: string | null;
  assignee_hint?: string | null;
  deadline?: string | null;
  axes?: Record<string, string | null>;
  // UI state
  selected: boolean;
  assignee_id?: string | null;
}

interface ParsedProtocol {
  meeting_title?: string | null;
  meeting_date?: string | null;
  participants?: string[];
  summary?: string | null;
  rows: ParsedRow[];
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Step = "input" | "template" | "review";

export default function ProtocolImportDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: templates = [] } = useProtocolTemplates();
  const { data: teamMembers = [] } = useAvailableUsers();

  const [step, setStep] = useState<Step>("input");
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [extractingPdf, setExtractingPdf] = useState(false);
  const [parsed, setParsed] = useState<ParsedProtocol | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<ProtocolTemplate | null>(null);
  const [protocolName, setProtocolName] = useState("");
  const [meetingDate, setMeetingDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep("input");
        setText("");
        setParsed(null);
        setSelectedTemplate(null);
        setProtocolName("");
        setMeetingDate(format(new Date(), "yyyy-MM-dd"));
      }, 200);
    }
  }, [open]);

  // Авто-выбор шаблона по эвристике
  useEffect(() => {
    if (parsed && !selectedTemplate && templates.length > 0) {
      const t = guessTemplate(parsed, templates);
      setSelectedTemplate(t);
      if (parsed.meeting_title) setProtocolName(parsed.meeting_title);
      else setProtocolName(`${t.name} — ${format(new Date(parsed.meeting_date || meetingDate), "dd.MM.yyyy")}`);
      if (parsed.meeting_date) setMeetingDate(parsed.meeting_date);
    }
  }, [parsed, templates]);

  const handleFile = async (file: File) => {
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      setExtractingPdf(true);
      try {
        const txt = await extractPdfText(file);
        if (!txt || txt.length < 20) {
          toast.error("Не удалось извлечь текст из PDF (возможно, скан без OCR)");
          return;
        }
        setText(txt);
        toast.success(`Извлечено ${txt.length.toLocaleString("ru")} символов`);
      } catch (e: any) {
        toast.error("Ошибка чтения PDF: " + (e?.message || ""));
      } finally {
        setExtractingPdf(false);
      }
    } else if (file.type.startsWith("text/") || /\.(txt|md)$/i.test(file.name)) {
      const txt = await file.text();
      setText(txt);
    } else {
      toast.error("Поддерживаются только PDF и текстовые файлы. Excel — через Smart Import.");
    }
  };

  const parseMutation = useMutation({
    mutationFn: async () => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-protocol-text`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ text }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }
      return (await resp.json()) as Omit<ParsedProtocol, "rows"> & { rows: Omit<ParsedRow, "selected">[] };
    },
    onSuccess: (data) => {
      const rows: ParsedRow[] = (data.rows || []).map((r) => ({ ...r, selected: true }));
      setParsed({ ...data, rows });
      setStep("template");
      toast.success(`ИИ извлёк ${rows.length} строк`);
    },
    onError: (e: any) => toast.error(e?.message || "Ошибка разбора"),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user || !selectedTemplate || !parsed) throw new Error("Нет данных");
      const selectedRows = parsed.rows.filter((r) => r.selected);
      if (selectedRows.length === 0) throw new Error("Выберите хотя бы одну строку");

      // 1. Создать проект-протокол
      const { data: group, error: gErr } = await supabase
        .from("task_groups")
        .insert({
          name: protocolName.trim(),
          user_id: user.id,
          icon: selectedTemplate.icon || "📋",
          color: "#6366f1",
          project_type: "protocol",
          description: [
            `Шаблон: ${selectedTemplate.name}`,
            `Дата встречи: ${format(new Date(meetingDate), "dd.MM.yyyy")}`,
            parsed.summary && `\n${parsed.summary}`,
            parsed.participants?.length && `\nУчастники: ${parsed.participants.join(", ")}`,
          ].filter(Boolean).join("\n"),
        } as any)
        .select()
        .single();
      if (gErr) throw gErr;

      // 2. Создать задачи
      const taskRows = selectedRows.map((r, idx) => ({
        title: r.title,
        description: buildDescription(r),
        deadline: r.deadline || null,
        assigned_to: r.assignee_id || null,
        group_id: group.id,
        user_id: user.id,
        position: idx,
      }));
      const { error: tErr } = await supabase.from("tasks").insert(taskRows as any);
      if (tErr) throw tErr;

      return group as { id: string };
    },
    onSuccess: (group) => {
      qc.invalidateQueries({ queryKey: ["task_groups"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Протокол создан и задачи добавлены");
      onOpenChange(false);
      navigate(`/protocols/${group.id}`);
    },
    onError: (e: any) => toast.error(e?.message || "Не удалось создать"),
  });

  const selectedCount = parsed?.rows.filter((r) => r.selected).length || 0;

  const updateRow = (idx: number, patch: Partial<ParsedRow>) => {
    setParsed((p) => p ? { ...p, rows: p.rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)) } : p);
  };

  const removeRow = (idx: number) => {
    setParsed((p) => p ? { ...p, rows: p.rows.filter((_, i) => i !== idx) } : p);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step !== "input" && (
              <button
                onClick={() => setStep(step === "review" ? "template" : "input")}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Назад"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <Sparkles className="h-5 w-5 text-primary" />
            {step === "input" && "Импорт протокола из PDF / текста"}
            {step === "template" && "Подтвердите шаблон и параметры"}
            {step === "review" && `Проверьте задачи (${selectedCount} из ${parsed?.rows.length || 0} выбрано)`}
          </DialogTitle>
        </DialogHeader>

        {/* STEP 1: INPUT */}
        {step === "input" && (
          <div className="space-y-4">
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) handleFile(f);
              }}
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/20 p-8 transition-colors hover:border-primary/50 hover:bg-muted/40"
            >
              {extractingPdf ? (
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              ) : (
                <Upload className="h-8 w-8 text-muted-foreground" />
              )}
              <div className="text-sm font-medium text-foreground">
                {extractingPdf ? "Извлекаем текст из PDF…" : "Перетащите PDF или текстовый файл сюда"}
              </div>
              <div className="text-xs text-muted-foreground">или нажмите, чтобы выбрать файл</div>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.txt,.md,application/pdf,text/plain"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center"><span className="bg-background px-2 text-xs uppercase text-muted-foreground">или вставьте текст</span></div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="protocol-text">Текст протокола</Label>
              <Textarea
                id="protocol-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Вставьте сюда расшифровку встречи, заметки или таблицу с поручениями..."
                rows={10}
                className="font-mono text-xs"
              />
              <div className="text-right text-xs text-muted-foreground">
                {text.length.toLocaleString("ru")} символов
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Отмена</Button>
              <Button
                onClick={() => parseMutation.mutate()}
                disabled={text.trim().length < 20 || parseMutation.isPending}
              >
                {parseMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Sparkles className="mr-2 h-4 w-4" />
                Разобрать через ИИ
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: TEMPLATE & DETAILS */}
        {step === "template" && parsed && (
          <div className="space-y-4">
            {parsed.summary && (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                <FileText className="mr-1 inline h-4 w-4" />
                {parsed.summary}
              </div>
            )}

            <div>
              <Label className="mb-2 block text-xs uppercase text-muted-foreground">Шаблон</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTemplate(t)}
                    className={cn(
                      "flex items-start gap-2 rounded-md border p-3 text-left transition-all",
                      selectedTemplate?.id === t.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40",
                    )}
                  >
                    <span className="text-xl">{t.icon || "📋"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground">{t.name}</div>
                      {t.description && (
                        <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.description}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
              <div className="space-y-1.5">
                <Label htmlFor="imp-name">Название протокола *</Label>
                <Input id="imp-name" value={protocolName} onChange={(e) => setProtocolName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="imp-date">Дата встречи</Label>
                <Input id="imp-date" type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
              </div>
            </div>

            {parsed.participants && parsed.participants.length > 0 && (
              <div className="text-xs text-muted-foreground">
                <UserIcon className="mr-1 inline h-3 w-3" />
                Участники: {parsed.participants.join(", ")}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
              <Button variant="ghost" onClick={() => setStep("input")}>Назад</Button>
              <Button
                onClick={() => setStep("review")}
                disabled={!selectedTemplate || !protocolName.trim()}
              >
                Далее: проверка задач
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: REVIEW ROWS */}
        {step === "review" && parsed && (
          <div className="space-y-4">
            <ScrollArea className="max-h-[55vh] pr-2">
              <div className="space-y-2">
                {parsed.rows.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    ИИ не нашёл задач. Вернитесь и уточните текст.
                  </div>
                )}
                {parsed.rows.map((row, idx) => (
                  <RowCard
                    key={idx}
                    row={row}
                    teamMembers={teamMembers as Profile[]}
                    onChange={(patch) => updateRow(idx, patch)}
                    onRemove={() => removeRow(idx)}
                  />
                ))}
              </div>
            </ScrollArea>

            <div className="flex items-center justify-between border-t border-border pt-4">
              <div className="text-xs text-muted-foreground">
                {selectedCount} из {parsed.rows.length} строк будут добавлены
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => setStep("template")}>Назад</Button>
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={selectedCount === 0 || createMutation.isPending}
                >
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Создать протокол с {selectedCount} задачами
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============= Row Card =============
function RowCard({
  row, teamMembers, onChange, onRemove,
}: {
  row: ParsedRow;
  teamMembers: Profile[];
  onChange: (patch: Partial<ParsedRow>) => void;
  onRemove: () => void;
}) {
  const axes = useMemo(() => {
    if (!row.axes) return [] as { k: string; v: string }[];
    return Object.entries(row.axes)
      .filter(([, v]) => v && String(v).trim())
      .map(([k, v]) => ({ k, v: String(v) }));
  }, [row.axes]);

  // Авто-сопоставление assignee_hint с командой (по фамилии/имени)
  const suggestedAssignee = useMemo(() => {
    if (!row.assignee_hint || row.assignee_id) return null;
    const hint = row.assignee_hint.toLowerCase();
    return teamMembers.find((m) => {
      const name = (m.display_name || m.email || "").toLowerCase();
      return hint.split(/\s+/).some((part) => part.length > 2 && name.includes(part));
    });
  }, [row.assignee_hint, row.assignee_id, teamMembers]);

  useEffect(() => {
    if (suggestedAssignee && !row.assignee_id) {
      onChange({ assignee_id: suggestedAssignee.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedAssignee?.id]);

  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card p-3 transition-opacity",
        !row.selected && "opacity-50",
      )}
    >
      <div className="flex items-start gap-2">
        <Checkbox
          checked={row.selected}
          onCheckedChange={(v) => onChange({ selected: !!v })}
          className="mt-1"
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Input
            value={row.title}
            onChange={(e) => onChange({ title: e.target.value })}
            className="h-8 border-0 px-1 text-sm font-medium shadow-none focus-visible:bg-muted/50"
          />
          {row.description && (
            <Textarea
              value={row.description}
              onChange={(e) => onChange({ description: e.target.value })}
              rows={2}
              className="resize-none border-0 px-1 text-xs text-muted-foreground shadow-none focus-visible:bg-muted/50"
            />
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {row.assignee_hint && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                <UserIcon className="h-3 w-3" />
                <select
                  value={row.assignee_id || ""}
                  onChange={(e) => onChange({ assignee_id: e.target.value || null })}
                  className="border-0 bg-transparent text-[11px] focus:outline-none"
                  title="Назначить ответственного"
                >
                  <option value="">{row.assignee_hint}</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.display_name || m.email}
                    </option>
                  ))}
                </select>
              </span>
            )}
            {row.deadline && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                <CalendarIcon className="h-3 w-3" />
                <input
                  type="date"
                  value={row.deadline}
                  onChange={(e) => onChange({ deadline: e.target.value })}
                  className="border-0 bg-transparent text-[11px] focus:outline-none"
                />
              </span>
            )}
            {axes.map(({ k, v }) => (
              <span key={k} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                <TagIcon className="h-3 w-3" />
                {AXIS_LABEL[k] || k}: {v}
              </span>
            ))}
          </div>
        </div>
        <button
          onClick={onRemove}
          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title="Удалить строку"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

const AXIS_LABEL: Record<string, string> = {
  clients: "Клиент",
  territory: "Территория",
  site: "Площадка",
  brand: "Бренд",
  product_category: "Категория",
  department: "Отдел",
  event_topic: "Тема",
};

// ============= Helpers =============
function buildDescription(r: ParsedRow): string {
  const parts: string[] = [];
  if (r.description) parts.push(r.description);
  const axes = r.axes || {};
  const axisRows = Object.entries(axes)
    .filter(([, v]) => v && String(v).trim())
    .map(([k, v]) => `| ${AXIS_LABEL[k] || k} | ${v} |`);
  if (axisRows.length > 0) {
    parts.push("\n| Параметр | Значение |\n|---|---|\n" + axisRows.join("\n"));
  }
  if (r.assignee_hint && !r.assignee_id) {
    parts.push(`\n_Из протокола: ${r.assignee_hint}_`);
  }
  return parts.join("\n").trim();
}

function guessTemplate(parsed: ParsedProtocol, templates: ProtocolTemplate[]): ProtocolTemplate {
  const text = [
    parsed.meeting_title,
    parsed.summary,
    ...parsed.rows.map((r) => r.title + " " + (r.description || "")),
  ].join(" ").toLowerCase();

  // Эвристика: переговоры
  if (/переговор|клиент|контрагент|цена|поставк|магнит|пятерочк|дороничи/i.test(text)) {
    const t = templates.find((t) => t.system_key === "client_negotiation");
    if (t) return t;
  }
  // NPD gate
  if (/гейт|gate|npd|разработк|новый продукт|рецептур/i.test(text)) {
    const t = templates.find((t) => t.system_key === "npd_gate");
    if (t) return t;
  }
  // Кросс-функциональный по умолчанию
  return (
    templates.find((t) => t.system_key === "cross_functional") ||
    templates.find((t) => t.system_key === "blank") ||
    templates[0]
  );
}
