import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, FileText, Loader2, CheckCircle2, Sparkles, Download, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { importRowsToProject, type ImportPreview } from "@/lib/projectExcel";
import { toast } from "sonner";
import ExcelJS from "exceljs";

interface ColumnMapping {
  excel_column: string;
  field: string;
  confidence: number;
}

const FIELD_OPTIONS = [
  { value: "title", label: "Задача" },
  { value: "description", label: "Описание / примечание" },
  { value: "external_ref", label: "№ п/п (внешний номер)" },
  { value: "topic", label: "Тема / блок (→ тег)" },
  { value: "start_at", label: "Старт / постановка" },
  { value: "deadline", label: "Плановый дедлайн" },
  { value: "completed_at", label: "Дата факт. исполнения" },
  { value: "is_completed", label: "Статус выполнения" },
  { value: "priority", label: "Приоритет" },
  { value: "status", label: "Статус (текст)" },
  { value: "assigned_to", label: "Ответственный (один)" },
  { value: "participants_informed", label: "Информируемые (мульти)" },
  { value: "participants_support", label: "Поддержка (мульти)" },
  { value: "tags", label: "Теги" },
  { value: "subtasks", label: "Подзадачи / шаги" },
  { value: "project", label: "Проект" },
  { value: "subproject", label: "Подпроект" },
  { value: "type", label: "Тип строки" },
  { value: "skip", label: "— Пропустить —" },
];

interface SmartImportDialogProps {
  trigger?: React.ReactNode;
  targetGroupId?: string;
  onSuccess?: (groupId: string) => void;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  asDraft?: boolean;
  projectType?: string;
}

export default function SmartImportDialog({ trigger, targetGroupId, onSuccess, open: controlledOpen, onOpenChange: controlledOnOpenChange, asDraft, projectType }: SmartImportDialogProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (controlledOnOpenChange) controlledOnOpenChange(v);
    else setInternalOpen(v);
  };
  const [step, setStep] = useState<"upload" | "mapping" | "preview" | "done">("upload");
  const [loading, setLoading] = useState(false);
  const [mapping, setMapping] = useState<ColumnMapping[]>([]);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<any[][]>([]);
  const [allRows, setAllRows] = useState<any[][]>([]);
  const [fileName, setFileName] = useState("");
  const [importResult, setImportResult] = useState<{ taskCount: number; groupId: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setLoading(true);

    try {
      const buffer = await file.arrayBuffer();
      let headers: string[] = [];
      let rows: any[][] = [];

      // Попытка 1: ExcelJS (нативно для .xlsx)
      let parsedOk = false;
      try {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buffer);
        const ws = wb.worksheets[0];
        if (ws) {
          ws.eachRow((row, rowNumber) => {
            const vals = (row.values as any[]).slice(1);
            if (rowNumber === 1) {
              vals.forEach(v => headers.push(String(v ?? "").trim()));
            } else {
              rows.push(vals.map(v => {
                if (v instanceof Date) return v.toISOString().split("T")[0];
                if (v && typeof v === "object" && v.text) return v.text;
                if (v && typeof v === "object" && v.result !== undefined) return String(v.result);
                return v != null ? String(v) : "";
              }));
            }
          });
          if (headers.length > 0) parsedOk = true;
        }
      } catch (e) {
        console.warn("ExcelJS parsing failed, will try SheetJS:", e);
      }

      // Попытка 2: SheetJS — поддерживает .xls, .xlsx из Google/Numbers/etc
      if (!parsedOk) {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(buffer, { type: "array", cellDates: true });
        const sheetName = wb.SheetNames[0];
        if (!sheetName) throw new Error("Файл не содержит листов или повреждён");
        const sheet = wb.Sheets[sheetName];
        const aoa = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "", raw: false });
        if (aoa.length === 0) throw new Error("Файл пустой");
        headers = (aoa[0] || []).map((v: any) => String(v ?? "").trim());
        rows = aoa.slice(1).map((row: any[]) =>
          row.map((v) => {
            if (v instanceof Date) return v.toISOString().split("T")[0];
            return v != null ? String(v) : "";
          })
        );
      }

      // Удаляем полностью пустые строки
      rows = rows.filter(r => r.some(v => v && String(v).trim()));

      if (headers.length === 0) {
        throw new Error("Не удалось определить заголовки колонок. Убедитесь, что в первой строке есть названия столбцов.");
      }
      if (rows.length === 0) {
        throw new Error("Файл не содержит данных, только заголовки");
      }

      setRawHeaders(headers);
      setAllRows(rows);
      setRawRows(rows.slice(0, 3));

      // Call AI to map columns
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          message: "",
          action: "map_columns",
          context: { headers, sampleRows: rows.slice(0, 5) },
        },
      });

      if (error) throw error;

      if (data.mapping) {
        setMapping(data.mapping);
        setStep("mapping");
      } else {
        // Fallback: manual mapping
        setMapping(headers.map(h => ({ excel_column: h, field: "skip", confidence: 0 })));
        setStep("mapping");
      }
    } catch (e: any) {
      toast.error("Ошибка: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const updateMapping = (index: number, field: string) => {
    setMapping(prev => prev.map((m, i) => i === index ? { ...m, field, confidence: 1 } : m));
  };

  const handleImport = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Convert raw data using mapping
      const fieldMap = new Map(mapping.filter(m => m.field !== "skip").map(m => [m.field, rawHeaders.indexOf(m.excel_column)]));

      const normalizeType = (t: string): string => {
        const lower = t.toLowerCase().trim();
        if (["проект", "project"].includes(lower)) return "project";
        if (["подпроект", "subproject", "этап"].includes(lower)) return "subproject";
        return "task";
      };

      const rows = allRows.map(row => {
        const get = (field: string) => {
          const idx = fieldMap.get(field);
          return idx !== undefined ? String(row[idx] || "") : "";
        };

        const rawType = get("type");
        return {
          type: rawType ? normalizeType(rawType) : "task",
          project: get("project") || fileName.replace(/\.(xlsx|xls)$/i, ""),
          subproject: get("subproject") || "",
          title: get("title") || "",
          description: get("description") || "",
          start_at: get("start_at") || "",
          deadline: get("deadline") || "",
          original_deadline: "",
          completed_at: get("completed_at") || "",
          is_completed_text: get("is_completed") || "",
          priority: get("priority") || "",
          status: get("status") || "",
          assigned_to: get("assigned_to") || "",
          participants_informed: get("participants_informed") || "",
          participants_support: get("participants_support") || "",
          topic: get("topic") || "",
          external_ref: get("external_ref") || "",
          tags: get("tags") || "",
          subtasks: get("subtasks") || "",
          recurrence: "",
        };
      }).filter(r => r.title.trim());

      if (rows.length === 0) {
        toast.error("Нет задач для импорта. Проверьте маппинг колонки «Задача»");
        setLoading(false);
        return;
      }

      const result = await importRowsToProject(user.id, rows, targetGroupId, { asDraft, projectType });
      setImportResult(result);
      setStep("done");
      toast.success(`Импортировано ${result.taskCount} задач`);
      // Scoped: refresh global tasks + just-imported group; leave other groups intact.
      invalidateTasksScoped(qc, result.groupId);
      invalidateTaskGroups(qc);
      qc.invalidateQueries({ queryKey: ["tags"] });
      setTimeout(() => {
        setOpen(false);
        resetState();
        onSuccess?.(result.groupId);
      }, 1500);
    } catch (e: any) {
      toast.error("Ошибка импорта: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Шаблон");
    
    const templateHeaders = ["Задача", "Описание", "Старт", "Дедлайн", "Приоритет", "Ответственный", "Теги"];
    const headerRow = ws.addRow(templateHeaders);
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
    });

    ws.columns = [
      { width: 36 }, { width: 40 }, { width: 14 },
      { width: 14 }, { width: 12 }, { width: 20 }, { width: 24 },
    ];

    // Sample rows
    ws.addRow(["Подготовить презентацию", "Для ежемесячного отчёта", "2026-03-01", "2026-03-15", "Высокий", "Иванов", "маркетинг"]);
    ws.addRow(["Позвонить клиенту", "", "", "2026-03-10", "Средний", "", "продажи"]);
    ws.addRow(["Обновить документацию", "Раздел API", "2026-03-05", "", "Низкий", "Петров", ""]);

    wb.xlsx.writeBuffer().then(buf => {
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "JustTODOit_Шаблон.xlsx";
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
  };

  const hasTitleMapping = mapping.some(m => m.field === "title");

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetState(); }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-1.5">
            <Upload className="h-3.5 w-3.5" />
            Импорт
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] !flex flex-col overflow-hidden p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle className="text-base flex items-center gap-2">
            {step === "mapping" && <Sparkles className="h-4 w-4 text-primary" />}
            {step === "upload" ? "Умный импорт из Excel" : step === "mapping" ? "Маппинг колонок" : step === "done" ? "Готово!" : "Импорт"}
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && !loading && (
          <div className="px-6 py-5 space-y-4">
            <p className="text-xs text-muted-foreground">
              Загрузите любой Excel-файл — AI автоматически определит колонки и предложит маппинг.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 gap-2" onClick={() => fileRef.current?.click()}>
                <FileText className="h-4 w-4" />
                Загрузить Excel
              </Button>
              <Button variant="ghost" className="gap-2" onClick={downloadTemplate}>
                <Download className="h-4 w-4" />
                Шаблон
              </Button>
            </div>
          </div>
        )}

        {step === "upload" && loading && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">AI анализирует колонки...</p>
          </div>
        )}

        {step === "mapping" && (
          <>
            <div className="px-6 py-3 border-b bg-muted/30">
              <p className="text-xs text-muted-foreground">
                AI определил колонки автоматически. Проверьте и поправьте при необходимости.
              </p>
              <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  Распознано: {mapping.filter(m => m.field !== "skip").length}
                </span>
                <span>Пропущено: {mapping.filter(m => m.field === "skip").length}</span>
                <span>Строк: {allRows.length}</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-3">
              <div className="space-y-1.5">
                {mapping.map((m, i) => {
                  const isMapped = m.field !== "skip";
                  const lowConfidence = isMapped && m.confidence < 0.7;
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-3 rounded-md border px-3 py-2 transition-colors ${
                        lowConfidence
                          ? "border-amber-400/60 bg-amber-50/40 dark:bg-amber-950/20"
                          : isMapped
                            ? "border-border bg-card"
                            : "border-dashed border-border/60 bg-muted/20"
                      }`}
                      title={lowConfidence ? "AI не уверен в маппинге — проверьте вручную" : undefined}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate" title={m.excel_column}>
                          {m.excel_column || <span className="text-muted-foreground italic">(без имени)</span>}
                        </div>
                        {rawRows[0]?.[i] && (
                          <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                            пример: {String(rawRows[0][i]).slice(0, 60)}
                          </div>
                        )}
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <Select value={m.field} onValueChange={(v) => updateMapping(i, v)}>
                        <SelectTrigger className={`h-8 text-xs w-[200px] shrink-0 ${lowConfidence ? "border-amber-400/70" : ""}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FIELD_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value} className="text-xs">
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {isMapped && m.confidence >= 0.8 && (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      )}
                      {lowConfidence && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 shrink-0 font-medium">проверить</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="px-6 py-3 border-t bg-background">
              {!hasTitleMapping && (
                <p className="text-[11px] text-destructive mb-2">
                  ⚠ Укажите колонку для поля «Задача» — это обязательно
                </p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { resetState(); }} className="flex-1">
                  Другой файл
                </Button>
                <Button
                  size="sm"
                  onClick={handleImport}
                  disabled={loading || !hasTitleMapping}
                  className="flex-1 gap-1.5"
                >
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {asDraft ? `Создать черновик (${allRows.length})` : `Импортировать ${allRows.length} строк`}
                </Button>
              </div>
              {asDraft && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  💡 Задачи будут импортированы как <b>черновик</b>. Никто не получит уведомлений, пока вы не нажмёте «Опубликовать» на странице протокола.
                </p>
              )}
            </div>
          </>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-2 py-8">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <p className="text-sm font-medium">
              {asDraft ? `Черновик создан: ${importResult?.taskCount} задач` : `Импортировано ${importResult?.taskCount} задач!`}
            </p>
            {asDraft && (
              <p className="text-xs text-muted-foreground">Открываю редактор протокола…</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
