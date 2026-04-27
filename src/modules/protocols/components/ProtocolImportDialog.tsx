import { useState, useRef, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2, Download, FileText, Sparkles, ArrowLeft, ArrowRight,
  CalendarIcon, User as UserIcon, Tag as TagIcon, Trash2, Star, Users,
  ChevronDown, ChevronRight, Plus, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProtocolTemplates, type ProtocolTemplate } from "@/hooks/useProtocolTemplates";
import { useAvailableUsers, type Profile } from "@/hooks/useTasks";
import UserPicker from "@/components/UserPicker";
import { toast } from "sonner";
import { invalidateTasksScoped, invalidateTaskGroups } from "@/lib/queryInvalidation";

// Конвертация File → base64 (для multimodal-передачи в Gemini)
async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  // Безопасная конвертация для больших файлов: чанками, чтобы не упереться в лимит
  // String.fromCharCode.apply при большом массиве.
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)) as any);
  }
  return btoa(binary);
}

interface ParsedRow {
  title: string;
  description?: string | null;
  assignee_hint?: string | null;
  assignee_hints?: string[] | null;
  deadline?: string | null;
  axes?: Record<string, string | null>;
  // UI state
  selected: boolean;
  assignee_id?: string | null;
  participant_ids?: string[];
  is_important?: boolean;
  expanded?: boolean;
}

interface ParsedSection {
  topic: string;
  icon?: string | null;
  summary?: string | null;
  task_indices: number[];
}

interface ParsedProtocol {
  meeting_title?: string | null;
  meeting_date?: string | null;
  participants?: string[];
  summary?: string | null;
  sections?: ParsedSection[];
  rows: ParsedRow[];
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /**
   * Принудительно фиксирует шаблон по system_key (например, "living"). Если задан —
   * пользователь не выбирает шаблон вручную, парсер сразу вызывается в правильном
   * режиме (mode: "living"), а на шаге Template карточки шаблонов скрыты.
   */
  forcedTem
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
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedProtocol | null>(null);
  // Каким режимом был выполнен последний парсинг — нужно, чтобы предложить
  // перепарсить документ, если пользователь сменил шаблон на/с «📖 Живой».
  const [parsedMode, setParsedMode] = useState<"formal" | "living" | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<ProtocolTemplate | null>(null);
  const [protocolName, setProtocolName] = useState("");
  const [meetingDate, setMeetingDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [includeSectionsInDescription, setIncludeSectionsInDescription] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const isLivingTpl = (selectedTemplate as any)?.system_key === "living";

  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep("input");
        setText("");
        setPdfFile(null);
        setParsed(null);
        setParsedMode(null);
        setSelectedTemplate(null);
        setProtocolName("");
        setMeetingDate(format(new Date(), "yyyy-MM-dd"));
        setIncludeSectionsInDescription(true);
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
      // PDF отправляем целиком в Gemini как multimodal — структура (таблицы, эмодзи, цвета) сохраняется.
      setPdfFile(file);
      setText("");
      toast.success(`PDF готов к разбору (${(file.size / 1024).toFixed(0)} КБ)`);
    } else if (file.type.startsWith("text/") || /\.(txt|md)$/i.test(file.name)) {
      const txt = await file.text();
      setText(txt);
      setPdfFile(null);
    } else {
      toast.error("Поддерживаются только PDF и текстовые файлы. Excel — через Smart Import.");
    }
  };

  const parseMutation = useMutation({
    mutationFn: async () => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-protocol-text`;
      let body: any;
      if (pdfFile) {
        const pdf_base64 = await fileToBase64(pdfFile);
        body = { pdf_base64, pdf_mime: pdfFile.type || "application/pdf" };
      } else {
        body = { text };
      }
      // Режим парсера: living-промпт даёт смысловую группировку по темам с тезисами,
      // formal-промпт ищет нумерованные блоки и таблицы поручений. Если шаблон уже
      // выбран — берём из него, иначе formal по умолчанию.
      const mode: "living" | "formal" =
        (selectedTemplate as any)?.system_key === "living" ? "living" : "formal";
      body.mode = mode;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }
      return (await resp.json()) as Omit<ParsedProtocol, "rows"> & { rows: Omit<ParsedRow, "selected">[] };
    },
    onSuccess: (data) => {
      const rows: ParsedRow[] = (data.rows || []).map((r) => ({
        ...r,
        selected: true,
        participant_ids: [],
        is_important: false,
        expanded: false,
      }));
      setParsed({ ...data, rows });
      setParsedMode(
        (selectedTemplate as any)?.system_key === "living" ? "living" : "formal",
      );
      setStep("template");
      const secCount = data.sections?.length || 0;
      toast.success(
        secCount > 0
          ? `ИИ извлёк ${rows.length} задач в ${secCount} секциях`
          : `ИИ извлёк ${rows.length} строк`,
      );
    },
    onError: (e: any) => toast.error(e?.message || "Ошибка разбора"),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user || !selectedTemplate || !parsed) throw new Error("Нет данных");
      const selectedRows = parsed.rows.filter((r) => r.selected);
      if (selectedRows.length === 0) throw new Error("Выберите хотя бы одну строку");

      // Fallback-резолвер: если в строке остались только подсказки (assignee_hint /
      // assignee_hints) и не выбран пользователь — пробуем сматчить по команде
      // прямо при создании. RowCard делает это в useEffect, но автомэтч мог не
      // успеть прорасти в state перед нажатием "Создать черновик".
      const matchByHint = (hint: string | null | undefined): string | null => {
        if (!hint) return null;
        const h = hint.toLowerCase().trim();
        if (!h) return null;
        const parts = h.split(/[\s,()@.]+/).filter((p) => p.length > 2);
        if (parts.length === 0) return null;
        const found = (teamMembers as Profile[]).find((m) => {
          const name = (m.display_name || m.email || "").toLowerCase();
          return parts.some((p) => name.includes(p));
        });
        return found?.id ?? null;
      };
      const resolvedRows = selectedRows.map((r) => {
        let assignee_id = r.assignee_id ?? null;
        let participant_ids = [...(r.participant_ids || [])];

        // Главный ответственный: из hint, если не выбран
        if (!assignee_id) {
          const fromHint =
            matchByHint(r.assignee_hint) ?? matchByHint(r.assignee_hints?.[0]);
          if (fromHint) assignee_id = fromHint;
        }

        // Дополнительные ответственные: hints[1..] → participants (если пусто)
        if (participant_ids.length === 0 && (r.assignee_hints?.length || 0) > 1) {
          for (const h of (r.assignee_hints || []).slice(1)) {
            const id = matchByHint(h);
            if (id && id !== assignee_id && !participant_ids.includes(id)) {
              participant_ids.push(id);
            }
          }
        }

        return { ...r, assignee_id, participant_ids };
      });

      // 1. Создать проект-протокол (черновик)
      const { data: group, error: gErr } = await supabase
        .from("task_groups")
        .insert({
          name: protocolName.trim(),
          user_id: user.id,
          icon: selectedTemplate.icon || "📋",
          color: "#6366f1",
          project_type: "protocol",
          draft_status: "draft",
          description: [
            `Шаблон: ${selectedTemplate.name}`,
            `Дата встречи: ${format(new Date(meetingDate), "dd.MM.yyyy")}`,
            parsed.summary && `\n${parsed.summary}`,
            parsed.participants?.length && `\nУчастники: ${parsed.participants.join(", ")}`,
          ].filter(Boolean).join("\n"),
          // Сохраняем системный ключ выбранного шаблона, иначе ProtocolDetailPage
          // не может отличить cross_functional от client_negotiation и открывает
          // импортированный протокол как переговоры.
          protocol_meta: {
            meeting_date: parsed.meeting_date || meetingDate,
            format: "offline",
            external_attendees: [],
            // Создатель импорта автоматически — внутренний участник, чтобы
            // он мог продолжать редактировать задачи после публикации.
            internal_attendees: [user.id],
            template_system_key: selectedTemplate.system_key || null,
          },
        } as any)
        .select()
        .single();
      if (gErr) throw gErr;

      // Для НЕ-living: выводы секций уходят в общее описание (как раньше).
      // Для living: выводы пойдут блочно в protocol_meta.topic_notes[tag_id] ниже.
      const isLiving = selectedTemplate.system_key === "living";
      if (
        parsed.sections &&
        parsed.sections.length > 0 &&
        includeSectionsInDescription &&
        !isLiving
      ) {
        const sectionBlock = parsed.sections
          .map((s) => {
            const head = `${s.icon ? s.icon + " " : ""}${s.topic}`;
            return s.summary ? `### ${head}\n${s.summary}` : `### ${head}`;
          })
          .join("\n\n");
        const newDesc = (group as any).description
          ? `${(group as any).description}\n\n---\n\n## Темы протокола\n\n${sectionBlock}`
          : `## Темы протокола\n\n${sectionBlock}`;
        await supabase.from("task_groups").update({ description: newDesc }).eq("id", (group as { id: string }).id);
      }

      // 2. Создать задачи (черновик)
      const taskRows = resolvedRows.map((r, idx) => ({
        title: r.title,
        description: buildDescription(r),
        deadline: r.deadline || null,
        assigned_to: r.assignee_id || null,
        is_important: !!r.is_important,
        is_draft: true,
        group_id: group.id,
        user_id: user.id,
        position: idx,
      }));
      const { data: insertedTasks, error: tErr } = await supabase
        .from("tasks")
        .insert(taskRows as any)
        .select("id");
      if (tErr) throw tErr;

      // 3. Темы (event_topic) → теги + авто-линк к одноимённому проекту.
      //    Каждая задача с axes.event_topic получает соответствующий тег;
      //    задачи в таблице протокола сразу группируются по теме.
      try {
        // 3.0 LIVING: гарантируем, что у каждой задачи есть event_topic.
        //     Если AI не проставил axes.event_topic для конкретной задачи —
        //     ищем секцию, в task_indices которой есть её индекс. Это страхует
        //     от ситуации, когда модель забыла продублировать topic в axes.
        if (isLiving && parsed.sections && parsed.sections.length > 0) {
          // Карта: индекс строки в исходном parsed.rows → topic секции
          const idxToTopic = new Map<number, string>();
          parsed.sections.forEach((s) => {
            const t = (s.topic || "").trim();
            if (!t) return;
            (s.task_indices || []).forEach((i) => {
              if (!idxToTopic.has(i)) idxToTopic.set(i, t);
            });
          });
          // Применяем к выбранным строкам (resolvedRows ↔ selectedRows ↔ parsed.rows
          // через индекс в parsed.rows). selectedRows.filter сохраняет порядок,
          // но индексы сместились. Восстановим оригинальные индексы:
          let cursor = 0;
          const origIdxByResolved: number[] = [];
          parsed.rows.forEach((r, origIdx) => {
            if (r.selected) {
              origIdxByResolved[cursor] = origIdx;
              cursor++;
            }
          });
          resolvedRows.forEach((r, i) => {
            const orig = origIdxByResolved[i];
            const fromAxis = (r.axes?.event_topic || "").trim();
            if (!fromAxis) {
              const fromSection = idxToTopic.get(orig);
              if (fromSection) {
                r.axes = { ...(r.axes ?? {}), event_topic: fromSection };
              }
            }
          });
        }

        // 3.1 Уникальные имена тем
        const topicNames = Array.from(
          new Set(
            selectedRows
              .map((r) => (r.axes?.event_topic || "").trim())
              .filter((s) => s.length > 0),
          ),
        );

        if (topicNames.length > 0) {
          // 3.2 Найти/создать системную категорию event_topic пользователя
          let categoryId: string | null = null;
          {
            const { data: existingCat } = await supabase
              .from("tag_categories" as any)
              .select("id")
              .eq("system_key", "event_topic")
              .eq("user_id", user.id)
              .maybeSingle();
            if ((existingCat as any)?.id) {
              categoryId = (existingCat as any).id;
            } else {
              const { data: createdCat } = await supabase
                .from("tag_categories" as any)
                .insert({ name: "Тема", system_key: "event_topic", is_system: true, user_id: user.id })
                .select("id")
                .single();
              categoryId = (createdCat as any)?.id ?? null;
            }
          }

          if (categoryId) {
            // 3.3 Прочитать существующие теги в категории (case-insensitive)
            const { data: existingTags } = await supabase
              .from("tags")
              .select("id, name, category_id, tag_categories!inner(system_key)")
              .eq("tag_categories.system_key", "event_topic");
            const tagByLowerName = new Map<string, { id: string; name: string }>();
            for (const t of ((existingTags ?? []) as unknown as any[])) {
              tagByLowerName.set(String(t.name).trim().toLowerCase(), { id: t.id, name: t.name });
            }

            // 3.4 Создать недостающие теги
            const missing = topicNames.filter(
              (n) => !tagByLowerName.has(n.toLowerCase()),
            );
            if (missing.length > 0) {
              const { data: createdTags } = await supabase
                .from("tags")
                .insert(
                  missing.map((name) => ({
                    name,
                    category_id: categoryId,
                    user_id: user.id,
                    color: "hsl(var(--primary))",
                  })),
                )
                .select("id, name");
              for (const t of (createdTags ?? []) as any[]) {
                tagByLowerName.set(String(t.name).trim().toLowerCase(), { id: t.id, name: t.name });
              }
            }

            // 3.5 Авто-линк: если есть открытый проект с тем же именем —
            //     записываем linked_tag_id (только в свои проекты).
            const { data: matchingGroups } = await supabase
              .from("task_groups")
              .select("id, name, linked_tag_id, user_id")
              .in(
                "name",
                topicNames, // exact match; case-чувствительно достаточно для авто-связи
              )
              .is("closed_at", null);
            const groupsByLowerName = new Map<string, any[]>();
            for (const g of (matchingGroups ?? []) as any[]) {
              const key = String(g.name).trim().toLowerCase();
              if (!groupsByLowerName.has(key)) groupsByLowerName.set(key, []);
              groupsByLowerName.get(key)!.push(g);
            }
            for (const name of topicNames) {
              const lower = name.toLowerCase();
              const tag = tagByLowerName.get(lower);
              const candidates = groupsByLowerName.get(lower) ?? [];
              if (!tag || candidates.length === 0) continue;
              const ownGroup =
                candidates.find((g) => g.linked_tag_id === tag.id) ??
                candidates.find((g) => g.user_id === user.id && !g.linked_tag_id);
              if (ownGroup && !ownGroup.linked_tag_id) {
                await supabase
                  .from("task_groups")
                  .update({ linked_tag_id: tag.id })
                  .eq("id", ownGroup.id);
              }
            }

            // 3.6 Привязать теги к задачам (task_tags)
            const tagInserts: { task_id: string; tag_id: string }[] = [];
            (insertedTasks || []).forEach((t: { id: string }, i: number) => {
              const topic = (resolvedRows[i].axes?.event_topic || "").trim();
              if (!topic) return;
              const tag = tagByLowerName.get(topic.toLowerCase());
              if (tag) tagInserts.push({ task_id: t.id, tag_id: tag.id });
            });
            if (tagInserts.length > 0) {
              await supabase
                .from("task_tags")
                .upsert(tagInserts as any, { onConflict: "task_id,tag_id", ignoreDuplicates: true });
            }

            // 3.7 Living: переносим summary секций → protocol_meta.topic_notes[tag_id].
            //     Для не-living шаблонов выводы уже ушли в общее описание выше.
            if (
              isLiving &&
              parsed.sections &&
              parsed.sections.length > 0
              // Для living чекбокс не показывается — выводы блочно ВСЕГДА.
            ) {
              const topicNotes: Record<string, string> = {};
              for (const sec of parsed.sections) {
                const key = (sec.topic || "").trim().toLowerCase();
                const tag = tagByLowerName.get(key);
                if (!tag || !sec.summary) continue;
                // Нормализуем summary в markdown-буллеты:
                // если уже есть строки с "-" / "*" / "•" — оставляем как есть;
                // иначе разбиваем по переносам/точкам и делаем буллеты, чтобы
                // TopicNotesBlock сразу отрисовал список.
                const raw = sec.summary.trim();
                const hasBullets = /^\s*[-*•]\s+/m.test(raw);
                const md = hasBullets
                  ? raw
                  : raw
                      .split(/\n+|(?<=[.!?])\s+(?=[А-ЯA-Z])/)
                      .map((s) => s.trim())
                      .filter((s) => s.length > 0)
                      .map((s) => `- ${s}`)
                      .join("\n");
                if (md) topicNotes[tag.id] = md;
              }
              if (Object.keys(topicNotes).length > 0) {
                // Перечитываем актуальный protocol_meta, чтобы не затереть
                // поля, которые мог обновить триггер/конкурентный апдейт.
                const { data: fresh } = await supabase
                  .from("task_groups")
                  .select("protocol_meta")
                  .eq("id", (group as { id: string }).id)
                  .single();
                const baseMeta = (fresh as any)?.protocol_meta ?? {};
                const mergedMeta = {
                  ...baseMeta,
                  topic_notes: { ...(baseMeta.topic_notes ?? {}), ...topicNotes },
                };
                await supabase
                  .from("task_groups")
                  .update({ protocol_meta: mergedMeta as any })
                  .eq("id", (group as { id: string }).id);
              }
            }
          }
        }
      } catch (e) {
        // Темы — best-effort: не блокируем создание протокола
        console.error("[protocol-import] topic linking failed", e);
      }

      // 4. Участники (опционально)
      const participantInserts: { task_id: string; user_id: string; role: string }[] = [];
      (insertedTasks || []).forEach((t: { id: string }, i: number) => {
        const row = resolvedRows[i];
        (row.participant_ids || []).forEach((uid) => {
          if (uid && uid !== row.assignee_id) {
            participantInserts.push({ task_id: t.id, user_id: uid, role: "participant" });
          }
        });
      });
      if (participantInserts.length > 0) {
        await supabase.from("task_participants").insert(participantInserts as any);
      }

      return group as { id: string };
    },
    onSuccess: (group) => {
      // Scoped: refresh task_groups list, global tasks (so new protocol appears
      // in global lists), and tasks scoped to the freshly-created group.
      invalidateTaskGroups(qc);
      invalidateTasksScoped(qc, group.id);
      qc.invalidateQueries({ queryKey: ["tags"] });
      qc.invalidateQueries({ queryKey: ["event_topic_tags"] });
      toast.success("Протокол создан как черновик");
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

  const toggleAll = (v: boolean) => {
    setParsed((p) => p ? { ...p, rows: p.rows.map((r) => ({ ...r, selected: v })) } : p);
  };

  const expandAll = (v: boolean) => {
    setParsed((p) => p ? { ...p, rows: p.rows.map((r) => ({ ...r, expanded: v })) } : p);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
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
          <div className="flex flex-col gap-4 overflow-y-auto px-6 py-4">
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
              {pdfFile ? (
                <FileText className="h-8 w-8 text-primary" />
              ) : (
                <Download className="h-8 w-8 text-muted-foreground" />
              )}
              <div className="text-sm font-medium text-foreground">
                {pdfFile
                  ? `📎 ${pdfFile.name}`
                  : "Перетащите PDF или текстовый файл сюда"}
              </div>
              <div className="text-xs text-muted-foreground">
                {pdfFile
                  ? "ИИ разберёт PDF целиком: таблицы, эмодзи, выделения цветом"
                  : "или нажмите, чтобы выбрать файл"}
              </div>
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
                disabled={(!pdfFile && text.trim().length < 20) || parseMutation.isPending}
              >
                {parseMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Sparkles className="mr-2 h-4 w-4" />
                {pdfFile ? "Разобрать PDF через ИИ" : "Разобрать через ИИ"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: TEMPLATE & DETAILS */}
        {step === "template" && parsed && (
          <div className="flex flex-col overflow-hidden">
            <div className="flex flex-col gap-4 overflow-y-auto px-6 py-4">
              {parsed.summary && (
                <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                  <FileText className="mr-1 inline h-4 w-4" />
                  {parsed.summary}
                </div>
              )}

              {parsed.sections && parsed.sections.length > 0 && (
                <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase text-muted-foreground">
                      Найдено секций: {parsed.sections.length}
                    </Label>
                    {/* Для living чекбокс не нужен — выводы блочно ВСЕГДА (живой формат
                        без них теряет смысл). Для остальных — оставляем выбор. */}
                    {!isLivingTpl && (
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                        <Checkbox
                          checked={includeSectionsInDescription}
                          onCheckedChange={(v) => setIncludeSectionsInDescription(!!v)}
                        />
                        Сохранить выводы секций в описание протокола
                      </label>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {parsed.sections.map((s, i) => (
                      <div key={i} className="flex items-start gap-2 rounded bg-background/60 px-2 py-1.5 text-xs">
                        <span className="text-base leading-none">{s.icon || "📌"}</span>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-foreground">{s.topic}</div>
                          {s.summary && (
                            <div className="mt-0.5 line-clamp-2 text-muted-foreground">{s.summary}</div>
                          )}
                        </div>
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {s.task_indices.length} зад.
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {isLivingTpl
                      ? "Темы станут тегами и сгруппируют задачи. Выводы появятся как блок над таблицей внутри каждой темы — потом редактируются inline."
                      : "Каждая задача автоматически получит тег темы — и в таблице протокола они сразу сгруппируются по секциям."}
                  </p>
                </div>
              )}

              {/* Подсказка о mismatch режима парсинга и выбранного шаблона.
                  Living-промпт даёт смысловую группировку с тезисами, formal-промпт —
                  ищет нумерованные блоки. Если расходятся — предлагаем перепарсить. */}
              {parsedMode && (
                (isLivingTpl && parsedMode === "formal") ||
                (!isLivingTpl && parsedMode === "living")
              ) && (
                <div className="flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="flex-1">
                    <div className="font-medium text-foreground">
                      {isLivingTpl
                        ? "Документ был разобран как формальный протокол"
                        : "Документ был разобран как живые заметки"}
                    </div>
                    <div className="mt-0.5 text-muted-foreground">
                      {isLivingTpl
                        ? "Для шаблона «📖 Живой документ» лучше перепарсить — ИИ заново сгруппирует заметки по смысловым темам с тезисами-выводами."
                        : "Для формальных шаблонов лучше перепарсить — ИИ найдёт нумерованные разделы и таблицы поручений."}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => parseMutation.mutate()}
                    disabled={parseMutation.isPending}
                  >
                    {parseMutation.isPending && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                    Перепарсить
                  </Button>
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
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/20 px-6 py-3">
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
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-6 py-2 text-xs">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleAll(selectedCount !== parsed.rows.length)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {selectedCount === parsed.rows.length ? "Снять все" : "Выбрать все"}
                </button>
                <span className="text-muted-foreground">·</span>
                <button
                  onClick={() => expandAll(!parsed.rows.every((r) => r.expanded))}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {parsed.rows.every((r) => r.expanded) ? "Свернуть все" : "Развернуть все"}
                </button>
              </div>
              <div className="text-muted-foreground">
                Кликните по карточке, чтобы добавить участников, тему, важность
              </div>
            </div>

            {/* Scroll list — flex-1 min-h-0 forces proper scroll */}
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-3">
              <div className="space-y-2">
                {parsed.rows.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    ИИ не нашёл задач. Вернитесь и уточните текст.
                  </div>
                )}
                {parsed.rows.map((row, idx) => (
                  <RowCard
                    key={idx}
                    idx={idx}
                    row={row}
                    teamMembers={teamMembers as Profile[]}
                    onChange={(patch) => updateRow(idx, patch)}
                    onRemove={() => removeRow(idx)}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border bg-muted/20 px-6 py-3">
              <div className="text-xs text-muted-foreground">
                {selectedCount} из {parsed.rows.length} строк будут добавлены как черновик
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => setStep("template")}>Назад</Button>
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={selectedCount === 0 || createMutation.isPending}
                >
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Создать черновик с {selectedCount} задачами
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
  idx, row, teamMembers, onChange, onRemove,
}: {
  idx: number;
  row: ParsedRow;
  teamMembers: Profile[];
  onChange: (patch: Partial<ParsedRow>) => void;
  onRemove: () => void;
}) {
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [participantOpen, setParticipantOpen] = useState(false);

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

  // Авто-сопоставление дополнительных ответственных (assignee_hints[1..]) → participant_ids.
  // Срабатывает один раз: только если participant_ids пуст.
  useEffect(() => {
    const hints = row.assignee_hints;
    if (!hints || hints.length <= 1) return;
    if ((row.participant_ids || []).length > 0) return;
    const matched: string[] = [];
    for (const raw of hints) {
      const h = (raw || "").toLowerCase();
      if (!h) continue;
      const m = teamMembers.find((x) => {
        const name = (x.display_name || x.email || "").toLowerCase();
        return h.split(/[\s,()]+/).some((p) => p.length > 2 && name.includes(p));
      });
      if (m && !matched.includes(m.id) && m.id !== row.assignee_id) matched.push(m.id);
    }
    if (matched.length > 0) onChange({ participant_ids: matched });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.assignee_hints, row.assignee_id, teamMembers]);

  const assignee = teamMembers.find((m) => m.id === row.assignee_id);
  const participants = (row.participant_ids || [])
    .map((id) => teamMembers.find((m) => m.id === id))
    .filter(Boolean) as Profile[];

  const topicAxis = row.axes?.event_topic || "";
  const setAxis = (key: string, value: string | null) => {
    // Сохраняем пустую строку вместо null, чтобы инпут не размонтировался
    // во время правки (фильтр для чипов всё равно скроет пустые значения).
    onChange({ axes: { ...(row.axes || {}), [key]: value ?? "" } });
  };

  // Все ключи доп. параметров (в т.ч. с временно пустыми значениями) —
  // нужны для стабильного рендера инпутов при стирании текста.
  const axisKeys = useMemo(() => {
    if (!row.axes) return [] as string[];
    return Object.keys(row.axes).filter((k) => k !== "event_topic");
  }, [row.axes]);

  return (
    <div
      className={cn(
        "rounded-md border bg-card transition-all",
        row.selected ? "border-border" : "border-border/40 opacity-60",
        row.expanded && "ring-1 ring-primary/30",
      )}
    >
      {/* Collapsed header — always visible */}
      <div className="flex items-start gap-2 p-2.5">
        <Checkbox
          checked={row.selected}
          onCheckedChange={(v) => onChange({ selected: !!v })}
          className="mt-1"
          onClick={(e) => e.stopPropagation()}
        />
        <button
          onClick={() => onChange({ expanded: !row.expanded })}
          className="mt-0.5 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={row.expanded ? "Свернуть" : "Развернуть"}
        >
          {row.expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <div
          className="min-w-0 flex-1 cursor-pointer space-y-1"
          onClick={() => onChange({ expanded: !row.expanded })}
        >
          <div className="flex items-start gap-2">
            <span className="shrink-0 text-xs font-mono text-muted-foreground pt-0.5">{idx + 1}.</span>
            <div className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground">
              {row.title}
            </div>
            {row.is_important && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 shrink-0" />}
          </div>
          {/* Compact meta row */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <MetaChip
              icon={<UserIcon className="h-3 w-3" />}
              label={assignee?.display_name || assignee?.email || row.assignee_hint || "Ответственный"}
              empty={!assignee}
              tone="muted"
            />
            <MetaChip
              icon={<CalendarIcon className="h-3 w-3" />}
              label={row.deadline ? format(new Date(row.deadline), "dd.MM.yyyy") : "Без срока"}
              empty={!row.deadline}
              tone="muted"
            />
            {participants.length > 0 && (
              <MetaChip
                icon={<Users className="h-3 w-3" />}
                label={`+${participants.length}`}
                tone="muted"
              />
            )}
            {topicAxis && (
              <MetaChip
                icon={<TagIcon className="h-3 w-3" />}
                label={String(topicAxis)}
                tone="primary"
              />
            )}
            {axes.filter((a) => a.k !== "event_topic").slice(0, 2).map(({ k, v }) => (
              <MetaChip
                key={k}
                icon={<TagIcon className="h-3 w-3" />}
                label={`${AXIS_LABEL[k] || k}: ${v}`}
                tone="primary"
              />
            ))}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title="Удалить строку"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Expanded editor */}
      {row.expanded && (
        <div className="space-y-3 border-t border-border bg-muted/20 p-3">
          {/* Title (editable) */}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Название</Label>
            <Input
              value={row.title}
              onChange={(e) => onChange({ title: e.target.value })}
              className="h-8 text-sm font-medium"
            />
          </div>

          {/* Description */}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Описание</Label>
            <Textarea
              value={row.description || ""}
              onChange={(e) => onChange({ description: e.target.value })}
              rows={2}
              placeholder="Добавьте контекст или решение"
              className="resize-none text-xs"
            />
          </div>

          {/* Grid: assignee + deadline + important */}
          <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto]">
            {/* Assignee picker */}
            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Ответственный</Label>
              <UserPicker
                users={teamMembers}
                open={assigneeOpen}
                onOpenChange={setAssigneeOpen}
                onSelect={(u) => onChange({ assignee_id: u.id })}
                trigger={
                  <button
                    type="button"
                    className="flex h-8 w-full items-center justify-between rounded-md border border-border bg-background px-2 text-xs hover:bg-muted/50"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <UserIcon className="h-3 w-3 text-muted-foreground" />
                      <span className="truncate">
                        {assignee?.display_name || assignee?.email || (
                          <span className="text-muted-foreground">
                            {row.assignee_hint || "Не назначен"}
                          </span>
                        )}
                      </span>
                    </span>
                    {assignee && (
                      <span
                        role="button"
                        onClick={(e) => { e.stopPropagation(); onChange({ assignee_id: null }); }}
                        className="rounded p-0.5 hover:bg-muted"
                      >
                        <X className="h-3 w-3 text-muted-foreground" />
                      </span>
                    )}
                  </button>
                }
              />
            </div>

            {/* Deadline */}
            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Срок</Label>
              <Input
                type="date"
                value={row.deadline || ""}
                onChange={(e) => onChange({ deadline: e.target.value || null })}
                className="h-8 text-xs"
              />
            </div>

            {/* Important */}
            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Важно</Label>
              <button
                type="button"
                onClick={() => onChange({ is_important: !row.is_important })}
                className={cn(
                  "flex h-8 items-center gap-1 rounded-md border px-2 text-xs transition-colors",
                  row.is_important
                    ? "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                    : "border-border bg-background text-muted-foreground hover:bg-muted/50",
                )}
              >
                <Star className={cn("h-3.5 w-3.5", row.is_important && "fill-amber-400")} />
              </button>
            </div>
          </div>

          {/* Participants */}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Участники (информируются)</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {participants.map((p) => (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]"
                >
                  {p.display_name || p.email}
                  <button
                    onClick={() =>
                      onChange({
                        participant_ids: (row.participant_ids || []).filter((id) => id !== p.id),
                      })
                    }
                    className="rounded-full hover:bg-background"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <UserPicker
                users={teamMembers}
                excludeIds={[
                  ...(row.participant_ids || []),
                  ...(row.assignee_id ? [row.assignee_id] : []),
                ]}
                open={participantOpen}
                onOpenChange={setParticipantOpen}
                onSelect={(u) =>
                  onChange({ participant_ids: [...(row.participant_ids || []), u.id] })
                }
                trigger={
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary/50 hover:text-primary"
                  >
                    <Plus className="h-3 w-3" /> Добавить
                  </button>
                }
              />
            </div>
          </div>

          {/* Topic / event_topic */}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Тема</Label>
            <Input
              value={topicAxis}
              onChange={(e) => setAxis("event_topic", e.target.value)}
              placeholder="Например: Шашлык-тур"
              className="h-8 text-xs"
            />
          </div>

          {/* Other axes (read-only chips with edit) */}
          {axisKeys.length > 0 && (
            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Дополнительные параметры</Label>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {axisKeys.map((k) => (
                  <div key={k} className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground w-20 shrink-0">
                      {AXIS_LABEL[k] || k}
                    </span>
                    <Input
                      value={String(row.axes?.[k] ?? "")}
                      onChange={(e) => setAxis(k, e.target.value)}
                      className="h-7 flex-1 text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetaChip({
  icon, label, empty, tone,
}: {
  icon: React.ReactNode;
  label: string;
  empty?: boolean;
  tone: "muted" | "primary";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5",
        tone === "primary" && "bg-primary/10 text-primary",
        tone === "muted" && (empty ? "bg-muted/50 text-muted-foreground/60" : "bg-muted text-muted-foreground"),
      )}
    >
      {icon}
      <span className="truncate max-w-[180px]">{label}</span>
    </span>
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

  if (/переговор|клиент|контрагент|цена|поставк|магнит|пятерочк|дороничи/i.test(text)) {
    const t = templates.find((t) => t.system_key === "client_negotiation");
    if (t) return t;
  }
  if (/гейт|gate|npd|разработк|новый продукт|рецептур/i.test(text)) {
    const t = templates.find((t) => t.system_key === "npd_gate");
    if (t) return t;
  }
  // Эвристика «живого документа»: формальной структуры нет (мало секций, нет таблиц
  // | ... | ... |, нет нумерованных заголовков типа "## 1." / "### 2."), но задачи
  // есть. Это типичные свободные заметки встречи — для них живой формат удобнее.
  const looksFormal =
    /\|\s*[^|]+\s*\|\s*[^|]+\s*\|/.test(text) || // таблица
    /\b#{1,4}\s*\d+[.)]/.test(text) || // нумерованный заголовок
    (parsed.sections?.length ?? 0) >= 3; // 3+ секций = явно структурированный документ
  if (!looksFormal && parsed.rows.length > 0) {
    const t = templates.find((t) => t.system_key === "living");
    if (t) return t;
  }
  return (
    templates.find((t) => t.system_key === "cross_functional") ||
    templates.find((t) => t.system_key === "blank") ||
    templates[0]
  );
}
