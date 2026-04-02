import { useState, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Upload, FileText, Loader2, CheckCircle2, Sparkles, ArrowRight, ClipboardPaste, Download } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTaskGroups, useTaskMutations, useAvailableUsers, useVisibleTags } from "@/hooks/useTasks";
import { toast } from "sonner";
import ExcelJS from "exceljs";

interface ColumnMapping {
  excel_column: string;
  field: string;
  confidence: number;
}

const CRM_FIELD_OPTIONS = [
  { value: "client_name", label: "Клиент" },
  { value: "contact_name", label: "Контактное лицо" },
  { value: "phone", label: "Телефон" },
  { value: "email", label: "Email" },
  { value: "city", label: "Город" },
  { value: "territory", label: "Территория" },
  { value: "retail_type", label: "Тип розницы" },
  { value: "rank", label: "Ранг" },
  { value: "manager", label: "Менеджер" },
  { value: "project", label: "Проект" },
  { value: "deadline", label: "Дедлайн" },
  { value: "tags", label: "Теги" },
  { value: "notes", label: "Заметки" },
  { value: "skip", label: "— Пропустить —" },
];

const CRM_STAGE_TEMPLATE = [
  "Отправить презентацию и КП",
  "Отправить образцы",
  "Получить обратную связь",
  "Проведены переговоры",
  "Старт отгрузок",
];

interface CrmSmartImportDialogProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function CrmSmartImportDialog({ trigger, open: controlledOpen, onOpenChange: controlledOnOpenChange }: CrmSmartImportDialogProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: groups = [] } = useTaskGroups();
  const { data: allUsers = [] } = useAvailableUsers();
  const { data: allTags = [] } = useVisibleTags();
  const { addTask } = useTaskMutations();

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (isControlled) controlledOnOpenChange?.(v);
    else setInternalOpen(v);
  };
  const [step, setStep] = useState<"upload" | "mapping" | "importing" | "done">("upload");
  const [loading, setLoading] = useState(false);
  const [mapping, setMapping] = useState<ColumnMapping[]>([]);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<any[][]>([]);
  const [allRows, setAllRows] = useState<any[][]>([]);
  const [fileName, setFileName] = useState("");
  const [importResult, setImportResult] = useState<{ clientCount: number; taskCount: number } | null>(null);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const parseHeaders = (headers: string[], rows: any[][]) => {
    setRawHeaders(headers);
    setAllRows(rows);
    setRawRows(rows.slice(0, 3));
  };

  const callAiMapping = async (headers: string[], rows: any[][]) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          message: "",
          action: "map_crm_columns",
          context: { headers, sampleRows: rows.slice(0, 5) },
        },
      });

      if (error) throw error;

      if (data.mapping) {
        setMapping(data.mapping);
      } else {
        setMapping(headers.map(h => ({ excel_column: h, field: "skip", confidence: 0 })));
      }
      setStep("mapping");
    } catch (e: any) {
      toast.error("Ошибка AI: " + e.message);
      setMapping(rawHeaders.map(h => ({ excel_column: h, field: "skip", confidence: 0 })));
      setStep("mapping");
    } finally {
      setLoading(false);
    }
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setLoading(true);

    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      if (!ws) throw new Error("Нет листов в файле");

      const headers: string[] = [];
      const rows: any[][] = [];

      ws.eachRow((row, rowNumber) => {
        const vals = (row.values as any[]).slice(1);
        if (rowNumber === 1) {
          vals.forEach(v => headers.push(String(v || "").trim()));
        } else {
          rows.push(vals.map(v => {
            if (v instanceof Date) return v.toISOString().split("T")[0];
            if (v && typeof v === "object" && v.text) return v.text;
            return v != null ? String(v) : "";
          }));
        }
      });

      parseHeaders(headers, rows);
      await callAiMapping(headers, rows);
    } catch (e: any) {
      toast.error("Ошибка: " + e.message);
      setLoading(false);
    }
  };

  const handlePaste = async () => {
    if (!pasteText.trim()) return;

    const lines = pasteText.trim().split("\n").map(l => l.split("\t"));
    if (lines.length < 2) {
      toast.error("Нужно минимум 2 строки (заголовок + данные)");
      return;
    }

    const headers = lines[0].map(h => h.trim());
    const rows = lines.slice(1).map(r => r.map(c => c.trim()));

    parseHeaders(headers, rows);
    setFileName("Вставка из буфера");
    await callAiMapping(headers, rows);
  };

  const updateMapping = (index: number, field: string) => {
    setMapping(prev => prev.map((m, i) => i === index ? { ...m, field, confidence: 1 } : m));
  };

  const findOrCreateTag = async (name: string, userId: string, color?: string): Promise<string> => {
    const existing = allTags.find(t => t.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;

    const { data, error } = await supabase.from("tags").insert({
      name, user_id: userId, color: color || "#3b82f6",
    }).select().single();
    if (error) throw error;
    return data.id;
  };

  const findUserByName = (name: string): string | null => {
    if (!name.trim()) return null;
    const q = name.toLowerCase().trim();
    const found = allUsers.find(u =>
      u.display_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    );
    return found?.id || null;
  };

  const handleImport = async () => {
    if (!user) return;
    setLoading(true);
    setStep("importing");

    try {
      const fieldMap = new Map(mapping.filter(m => m.field !== "skip").map(m => [m.field, rawHeaders.indexOf(m.excel_column)]));
      const get = (row: any[], field: string) => {
        const idx = fieldMap.get(field);
        return idx !== undefined ? String(row[idx] || "").trim() : "";
      };

      let clientCount = 0;
      let taskCount = 0;

      // Find or create a CRM project for import
      let crmProject = groups.find(g => (g as any).project_type === "crm" && !g.parent_id);
      let targetGroupId = crmProject?.id || null;

      if (!targetGroupId) {
        const { data: newProject } = await supabase.from("task_groups").insert({
          name: "CRM Импорт",
          user_id: user.id,
          project_type: "crm",
          icon: "📥",
          color: "#ef4444",
        } as any).select().single();
        targetGroupId = newProject?.id || null;

        if (targetGroupId) {
          await supabase.from("group_members").insert({
            group_id: targetGroupId,
            user_id: user.id,
            invited_by: user.id,
            role: "owner",
          });
        }
      }

      for (const row of allRows) {
        const clientName = get(row, "client_name");
        if (!clientName) continue;

        // Create client tag
        const tagId = await findOrCreateTag(clientName, user.id, "#ef4444");

        // Find manager
        const managerName = get(row, "manager");
        const assignedTo = managerName ? findUserByName(managerName) : null;

        // Resolve project
        const projectName = get(row, "project");
        let groupId = targetGroupId;
        if (projectName) {
          const found = groups.find(g => g.name.toLowerCase() === projectName.toLowerCase());
          if (found) groupId = found.id;
        }

        // Create territory tag
        let territoryTagId: string | null = null;
        const territory = get(row, "territory");
        if (territory) {
          territoryTagId = await findOrCreateTag(territory, user.id, "#8b5cf6");
        }

        // Create retail type tag
        let retailTypeTagId: string | null = null;
        const retailType = get(row, "retail_type");
        if (retailType) {
          retailTypeTagId = await findOrCreateTag(retailType, user.id, "#f59e0b");
        }

        // Create rank tag
        let rankTagId: string | null = null;
        const rank = get(row, "rank");
        if (rank) {
          rankTagId = await findOrCreateTag(rank, user.id, "#10b981");
        }

        // Create client record
        const { data: clientData } = await supabase.from("clients").insert({
          name: clientName,
          user_id: user.id,
          group_id: groupId,
          tag_id: tagId,
          contact_name: get(row, "contact_name") || null,
          phone: get(row, "phone") || null,
          email: get(row, "email") || null,
          city: get(row, "city") || null,
          manager_id: assignedTo,
          territory_tag_id: territoryTagId,
          retail_type_tag_id: retailTypeTagId,
          rank_tag_id: rankTagId,
        } as any).select().single();
        clientCount++;

        // Parse deadline
        let deadline: string | null = null;
        const deadlineStr = get(row, "deadline");
        if (deadlineStr) {
          const d = new Date(deadlineStr);
          if (!isNaN(d.getTime())) {
            deadline = d.toISOString().split("T")[0] + "T23:59:59";
          }
        }

        // Create CRM task with subtask steps
        const { data: taskData, error: taskError } = await supabase.from("tasks").insert({
          title: clientName,
          user_id: user.id,
          group_id: groupId,
          client_id: clientData?.id || null,
          task_type: "crm",
          assigned_to: assignedTo,
          deadline,
          description: get(row, "notes") || null,
        }).select().single();

        if (taskError) {
          console.error("Task creation error:", taskError);
          continue;
        }

        taskCount++;

        // Add client tag to task
        await supabase.from("task_tags").insert({ task_id: taskData.id, tag_id: tagId }).maybeSingle();

        // Add extra tags
        const extraTags = get(row, "tags");
        if (extraTags) {
          for (const tagName of extraTags.split(",").map(t => t.trim()).filter(Boolean)) {
            const tid = await findOrCreateTag(tagName, user.id);
            await supabase.from("task_tags").insert({ task_id: taskData.id, tag_id: tid }).maybeSingle();
          }
        }

        // Create CRM funnel subtasks
        for (let i = 0; i < CRM_STAGE_TEMPLATE.length; i++) {
          await supabase.from("subtasks").insert({
            task_id: taskData.id,
            title: CRM_STAGE_TEMPLATE[i],
            position: i,
            is_completed: false,
          });
        }

        // Add creator as participant
        await supabase.from("task_participants").insert({
          task_id: taskData.id,
          user_id: user.id,
          role: "creator",
        }).maybeSingle();

        // Add assignee as participant
        if (assignedTo && assignedTo !== user.id) {
          await supabase.from("task_participants").insert({
            task_id: taskData.id,
            user_id: assignedTo,
            role: "assignee",
          }).maybeSingle();
        }
      }

      setImportResult({ clientCount, taskCount });
      setStep("done");
      toast.success(`Импортировано ${clientCount} клиентов, создано ${taskCount} задач`);
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["task_groups"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
      qc.invalidateQueries({ queryKey: ["clients"] });

      setTimeout(() => {
        setOpen(false);
        resetState();
      }, 2000);
    } catch (e: any) {
      toast.error("Ошибка импорта: " + e.message);
      setStep("mapping");
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("CRM Шаблон");

    const templateHeaders = ["Клиент", "Контактное лицо", "Телефон", "Email", "Город", "Территория", "Тип розницы", "Ранг", "Менеджер", "Дедлайн", "Теги"];
    const headerRow = ws.addRow(templateHeaders);
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEF4444" } };
    });

    ws.columns = [
      { width: 24 }, { width: 20 }, { width: 16 }, { width: 24 },
      { width: 16 }, { width: 16 }, { width: 16 }, { width: 10 },
      { width: 20 }, { width: 14 }, { width: 20 },
    ];

    ws.addRow(["ООО Ромашка", "Иванов Иван", "+7 900 123 4567", "ivanov@romashka.ru", "Москва", "ЦФО", "Гипермаркет", "A", "Петров", "2026-04-01", "приоритет"]);
    ws.addRow(["ИП Сидоров", "Сидоров Петр", "+7 901 234 5678", "", "СПб", "СЗФО", "Магазин", "B", "", "", "новый"]);

    wb.xlsx.writeBuffer().then(buf => {
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "CRM_Шаблон.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  const resetState = () => {
    setStep("upload");
    setMapping([]);
    setRawHeaders([]);
    setRawRows([]);
    setAllRows([]);
    setFileName("");
    setImportResult(null);
    setPasteMode(false);
    setPasteText("");
  };

  const hasClientNameMapping = mapping.some(m => m.field === "client_name");

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetState(); }}>
      {trigger && (
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
      )}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            {step === "mapping" && <Sparkles className="h-4 w-4 text-primary" />}
            {step === "upload" ? "Импорт клиентов в CRM" : step === "mapping" ? "Маппинг колонок" : step === "done" ? "Готово!" : "Импорт..."}
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && !loading && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Загрузите Excel или вставьте данные из таблицы — AI определит колонки и создаст клиентов с карточками в воронке.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />

            {!pasteMode ? (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 gap-2" onClick={() => fileRef.current?.click()}>
                    <FileText className="h-4 w-4" />
                    Загрузить Excel
                  </Button>
                  <Button variant="outline" className="flex-1 gap-2" onClick={() => setPasteMode(true)}>
                    <ClipboardPaste className="h-4 w-4" />
                    Вставить из таблицы
                  </Button>
                </div>
                <Button variant="ghost" size="sm" className="gap-2 self-start" onClick={downloadTemplate}>
                  <Download className="h-3.5 w-3.5" />
                  Скачать шаблон
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[10px] text-muted-foreground">
                  Скопируйте данные из Excel/Google Sheets и вставьте сюда (Ctrl+V). Первая строка — заголовки.
                </p>
                <Textarea
                  autoFocus
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={"Клиент\tТелефон\tГород\nООО Ромашка\t+7 900 123 45 67\tМосква"}
                  className="min-h-[120px] font-mono text-xs"
                />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPasteMode(false)}>
                    Назад
                  </Button>
                  <Button size="sm" onClick={handlePaste} disabled={!pasteText.trim()} className="gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    Анализировать
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {step === "upload" && loading && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">AI анализирует колонки...</p>
          </div>
        )}

        {step === "mapping" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Проверьте маппинг. AI определил колонки автоматически — поправьте при необходимости.
            </p>
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-2">
                {mapping.map((m, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-28 truncate font-medium text-foreground" title={m.excel_column}>
                      {m.excel_column}
                    </span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    <Select value={m.field} onValueChange={(v) => updateMapping(i, v)}>
                      <SelectTrigger className="h-7 text-xs flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CRM_FIELD_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value} className="text-xs">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {m.confidence >= 0.8 && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>

            {rawRows.length > 0 && (
              <div className="bg-muted rounded-lg p-2 overflow-x-auto">
                <p className="text-[10px] text-muted-foreground mb-1 font-medium">Превью данных:</p>
                <table className="text-[10px] w-full">
                  <thead>
                    <tr>
                      {rawHeaders.map((h, i) => (
                        <th key={i} className="px-1 text-left font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rawRows.map((row, ri) => (
                      <tr key={ri}>
                        {rawHeaders.map((_, ci) => (
                          <td key={ci} className="px-1 py-0.5 text-foreground truncate max-w-[120px]">
                            {String(row[ci] || "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={resetState} className="flex-1">
                Другой файл
              </Button>
              <Button
                size="sm"
                onClick={handleImport}
                disabled={loading || !hasClientNameMapping}
                className="flex-1 gap-1.5"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Импортировать ({allRows.length} клиентов)
              </Button>
            </div>
            {!hasClientNameMapping && (
              <p className="text-[10px] text-destructive">Укажите колонку для поля «Клиент»</p>
            )}
          </div>
        )}

        {step === "importing" && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Создаём клиентов и задачи...</p>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-2 py-4">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <p className="text-sm font-medium">
              Импортировано {importResult?.clientCount} клиентов
            </p>
            <p className="text-xs text-muted-foreground">
              Создано {importResult?.taskCount} задач в воронке
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
