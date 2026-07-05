import { useState, useRef, useMemo } from "react";
import * as ExcelJS from "exceljs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, FileSpreadsheet, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { getStmStages, type StmFlow, type StmMeta } from "../lib/stages";
import { invalidateStmCaches } from "../lib/stmCache";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultFlow?: StmFlow;
}

interface SheetSnapshot {
  name: string;
  rows: any[][];
  headerRow: number; // 0-indexed
  headers: string[];
  dataRows: any[][];
}

interface ColumnMapping {
  excel_column: string;
  field: string;
  confidence: number;
}

const META_FIELDS = new Set([
  "title","sku_code_1c","brand","project","purpose","weight_kg","package_type",
  "target_price","shelf_life","barcode","plu","comment","external_ref","skip"
]);

/** Heuristic: pick the row that looks like a header (≥4 non-empty cells + contains a known label). */
function detectHeaderRow(rows: any[][]): number {
  const KEYWORDS = /№\s*п\/?п|наименован|бренд|тм|продукт|ассортимент|sku|артикул/i;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = rows[i] || [];
    const nonEmpty = r.filter(v => String(v ?? "").trim()).length;
    if (nonEmpty < 4) continue;
    const joined = r.map(v => String(v ?? "")).join(" ");
    if (KEYWORDS.test(joined)) return i;
  }
  // fallback: first row with ≥6 non-empty
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = rows[i] || [];
    if (r.filter(v => String(v ?? "").trim()).length >= 6) return i;
  }
  return 0;
}

function valueToString(v: any): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && "result" in v) return valueToString((v as any).result);
  if (typeof v === "object" && "text" in v) return String((v as any).text);
  return String(v).trim();
}

function parseDateMaybe(v: any): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString();
  const s = valueToString(v);
  if (!s) return null;
  // dd.mm.yyyy / dd/mm/yyyy
  const m = s.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
  if (m) {
    const d = parseInt(m[1]); const mo = parseInt(m[2]) - 1;
    let y = parseInt(m[3]); if (y < 100) y += 2000;
    const dt = new Date(Date.UTC(y, mo, d));
    if (!isNaN(dt.getTime())) return dt.toISOString();
  }
  // ISO
  const dt = new Date(s);
  if (!isNaN(dt.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(s)) return dt.toISOString();
  return null;
}

function parseNumber(v: any): number | null {
  if (v == null || v === "") return null;
  const n = parseFloat(String(v).replace(",", ".").replace(/[^\d.\-]/g, ""));
  return isNaN(n) ? null : n;
}

export default function StmExcelImportDialog({ open, onOpenChange, defaultFlow = "in" }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<SheetSnapshot[]>([]);
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const [flow, setFlow] = useState<StmFlow>(defaultFlow);
  const [mapping, setMapping] = useState<ColumnMapping[]>([]);
  const [parsing, setParsing] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [retailer, setRetailer] = useState("");
  const [drop, setDrop] = useState("");
  const [skipRows, setSkipRows] = useState<Set<number>>(new Set());

  const stages = useMemo(() => getStmStages(flow), [flow]);
  const sheet = sheets.find(s => s.name === activeSheet);

  const handleFile = async (f: File) => {
    setParsing(true);
    setFile(f);
    setSheets([]); setActiveSheet(null); setMapping([]); setSkipRows(new Set());
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await f.arrayBuffer());
      const snaps: SheetSnapshot[] = [];
      wb.worksheets.forEach(ws => {
        const rows: any[][] = [];
        ws.eachRow({ includeEmpty: true }, (row) => {
          const arr: any[] = [];
          row.eachCell({ includeEmpty: true }, (cell) => arr.push(cell.value));
          rows.push(arr);
        });
        if (rows.length === 0) return;
        const hr = detectHeaderRow(rows);
        const headers = (rows[hr] || []).map(v => valueToString(v));
        const dataRows = rows.slice(hr + 1).filter(r => r.some(v => String(v ?? "").trim()));
        snaps.push({ name: ws.name, rows, headerRow: hr, headers, dataRows });
      });
      setSheets(snaps);
      // pick the largest sheet by data rows
      const best = [...snaps].sort((a, b) => b.dataRows.length - a.dataRows.length)[0];
      if (best) {
        setActiveSheet(best.name);
        // try to guess retailer from sheet name
        setRetailer(best.name.replace(/^СТМ[_\s-]*/i, "").replace(/[_]/g, " ").trim());
        // detect flow from name
        if (/вывод|выведен|закрытие|удалить/i.test(best.name)) setFlow("out");
      } else {
        toast.error("Не нашёл данных в файле");
      }
    } catch (e: any) {
      toast.error("Не удалось прочитать файл: " + e.message);
    } finally {
      setParsing(false);
    }
  };

  const runAiMapping = async () => {
    if (!sheet) return;
    setAiLoading(true);
    try {
      const sampleRows = sheet.dataRows.slice(0, 3).map(r =>
        sheet.headers.map((_, i) => valueToString(r[i]))
      );
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          action: "map_stm_columns",
          context: {
            headers: sheet.headers,
            sampleRows,
            flow,
            stages: stages.map(s => ({ key: s.key, title: s.title, description: s.description })),
          },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const map: ColumnMapping[] = data?.mapping || [];
      // ensure every header is present
      const present = new Set(map.map(m => m.excel_column));
      sheet.headers.forEach(h => {
        if (h && !present.has(h)) map.push({ excel_column: h, field: "skip", confidence: 0 });
      });
      setMapping(map);
      toast.success("AI разметил колонки");
    } catch (e: any) {
      toast.error("AI-маппинг не удался: " + (e?.message || "ошибка"));
      // fallback: empty manual mapping
      setMapping(sheet.headers.map(h => ({ excel_column: h, field: "skip", confidence: 0 })));
    } finally {
      setAiLoading(false);
    }
  };

  const updateMapping = (col: string, field: string) => {
    setMapping(prev => prev.map(m => m.excel_column === col ? { ...m, field, confidence: 1 } : m));
  };

  const previewSkus = useMemo(() => {
    if (!sheet || mapping.length === 0) return [];
    const titleCol = mapping.find(m => m.field === "title")?.excel_column;
    if (!titleCol) return [];
    const idx = (col: string) => sheet.headers.indexOf(col);
    return sheet.dataRows.slice(0, 50).map((row, i) => {
      const get = (field: string) => {
        const m = mapping.find(mm => mm.field === field);
        return m ? row[idx(m.excel_column)] : null;
      };
      const title = valueToString(get("title"));
      const meta: StmMeta = { flow };
      if (get("brand")) meta.brand = valueToString(get("brand"));
      if (get("project")) meta.project = valueToString(get("project"));
      if (get("purpose")) meta.purpose = valueToString(get("purpose"));
      if (get("weight_kg")) { const n = parseNumber(get("weight_kg")); if (n != null) meta.weight_kg = n; }
      if (get("package_type")) meta.package_type = valueToString(get("package_type"));
      if (get("target_price")) { const n = parseNumber(get("target_price")); if (n != null) meta.target_price = n; }
      if (get("shelf_life")) meta.shelf_life = valueToString(get("shelf_life"));
      if (get("barcode")) meta.barcode = valueToString(get("barcode"));
      if (get("plu")) meta.plu = valueToString(get("plu"));
      if (get("sku_code_1c")) meta.sku_code_1c = valueToString(get("sku_code_1c"));
      if (retailer) meta.retailer = retailer;
      if (drop) meta.drop = drop;
      const stageDates: Record<string, string | null> = {};
      stages.forEach(s => {
        const m = mapping.find(mm => mm.field === s.key);
        if (m) stageDates[s.key] = parseDateMaybe(row[idx(m.excel_column)]);
      });
      const externalRef = (() => {
        const m = mapping.find(mm => mm.field === "external_ref");
        return m ? valueToString(row[idx(m.excel_column)]) : "";
      })();
      const comment = (() => {
        const m = mapping.find(mm => mm.field === "comment");
        return m ? valueToString(row[idx(m.excel_column)]) : "";
      })();
      return { rowIndex: i, title, meta, stageDates, externalRef, comment };
    }).filter(s => s.title);
  }, [sheet, mapping, stages, flow, retailer, drop]);

  const validCount = previewSkus.filter(s => !skipRows.has(s.rowIndex)).length;

  const handleImport = async () => {
    if (!user) return;
    if (validCount === 0) { toast.error("Нет SKU для импорта"); return; }
    setImporting(true);
    let okCount = 0;
    let failCount = 0;
    try {
      for (const sku of previewSkus) {
        if (skipRows.has(sku.rowIndex)) continue;
        try {
          const { data: group, error: gErr } = await supabase.from("task_groups").insert({
            name: sku.title.slice(0, 200),
            user_id: user.id,
            project_type: "npd",
            project_subtype: "npd_stm",
            stm_meta: sku.meta as any,
            icon: "🏷️",
            description: sku.comment || null,
          } as any).select().single();
          if (gErr) throw gErr;

          const tasksToInsert = stages.map((s, idx) => {
            const completedAt = sku.stageDates[s.key];
            return {
              title: s.title,
              user_id: user.id,
              group_id: group.id,
              stage_key: s.key,
              stm_flow: flow,
              task_type: "stm_stage",
              position: idx,
              is_completed: !!completedAt,
              completed_at: completedAt,
              deadline: completedAt,
              external_ref: sku.externalRef || null,
            } as any;
          });
          const { error: tErr } = await supabase.from("tasks").insert(tasksToInsert);
          if (tErr) throw tErr;
          okCount++;
        } catch (e) {
          console.error("STM import row failed", sku.title, e);
          failCount++;
        }
      }
      // Bulk import touches groups, tasks, deps, milestones — refresh in one place.
      invalidateStmCaches(qc);
      if (failCount === 0) {
        toast.success(`Импортировано ${okCount} SKU`);
      } else {
        toast.warning(`Импортировано ${okCount} из ${okCount + failCount} (ошибки: ${failCount})`);
      }
      onOpenChange(false);
      // reset
      setFile(null); setSheets([]); setActiveSheet(null); setMapping([]); setSkipRows(new Set());
    } finally {
      setImporting(false);
    }
  };

  const allFieldOptions = useMemo(() => {
    const meta = [
      { value: "title", label: "Название SKU *" },
      { value: "external_ref", label: "№ п/п" },
      { value: "sku_code_1c", label: "Код 1С" },
      { value: "brand", label: "ТМ / Бренд" },
      { value: "project", label: "Проект" },
      { value: "purpose", label: "Цель ввода" },
      { value: "weight_kg", label: "Вес, кг" },
      { value: "package_type", label: "Тип упаковки" },
      { value: "target_price", label: "Цена" },
      { value: "shelf_life", label: "Сроки годности" },
      { value: "barcode", label: "Штрихкод" },
      { value: "plu", label: "PLU / тарный ШК" },
      { value: "comment", label: "Комментарий" },
      { value: "skip", label: "— Не использовать —" },
    ];
    const stageOpts = stages.map(s => ({ value: s.key, label: `Этап: ${s.title}` }));
    return { meta, stageOpts };
  }, [stages]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Импорт SKU из Excel
          </DialogTitle>
          <DialogDescription>
            Загрузите файл со списком SKU. ИИ автоматически распознает колонки и этапы воркфлоу.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4">
          {/* Step 1: File */}
          {!file && (
            <div
              className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:bg-muted/50 transition"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <div className="font-medium mb-1">Перетащите файл или нажмите для выбора</div>
              <div className="text-xs text-muted-foreground">.xlsx — листы Excel со списками SKU по сетям</div>
              <input
                ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
          )}

          {parsing && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Читаю файл...
            </div>
          )}

          {/* Step 2: Pick sheet & flow */}
          {file && sheets.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                <span className="font-medium">{file.name}</span>
                <Badge variant="secondary">{sheets.length} листов</Badge>
                <Button size="sm" variant="ghost" onClick={() => { setFile(null); setSheets([]); fileRef.current && (fileRef.current.value = ""); }}>
                  Сменить
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Лист (= одна сеть/кампания)</Label>
                  <Select value={activeSheet || ""} onValueChange={(v) => { setActiveSheet(v); setMapping([]); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {sheets.map(s => (
                        <SelectItem key={s.name} value={s.name}>
                          {s.name} <span className="text-muted-foreground ml-2 text-xs">{s.dataRows.length} строк</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Поток</Label>
                  <Tabs value={flow} onValueChange={(v) => { setFlow(v as StmFlow); setMapping([]); }}>
                    <TabsList className="grid grid-cols-2 w-full">
                      <TabsTrigger value="in">Ввод SKU</TabsTrigger>
                      <TabsTrigger value="out">Вывод SKU</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Сеть (применится ко всем SKU)</Label>
                  <input
                    value={retailer} onChange={e => setRetailer(e.target.value)}
                    placeholder="X5, ВкусВилл, Лента..."
                    className="w-full h-9 px-3 rounded-md border bg-background text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Дроп / контракт (опц.)</Label>
                  <input
                    value={drop} onChange={e => setDrop(e.target.value)}
                    placeholder="Q2 2026"
                    className="w-full h-9 px-3 rounded-md border bg-background text-sm"
                  />
                </div>
              </div>

              {/* Step 3: AI mapping trigger */}
              {sheet && mapping.length === 0 && (
                <div className="border rounded-lg p-4 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">Заголовки распознаны: строка {sheet.headerRow + 1}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Колонок: {sheet.headers.filter(Boolean).length} · Строк данных: {sheet.dataRows.length}
                      </div>
                    </div>
                    <Button onClick={runAiMapping} disabled={aiLoading}>
                      {aiLoading ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Думаю...</> : <><Sparkles className="h-4 w-4 mr-1.5" /> Разметить ИИ</>}
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 4: Mapping editor */}
              {mapping.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Маппинг колонок</Label>
                    <Button size="sm" variant="ghost" onClick={runAiMapping} disabled={aiLoading}>
                      <Sparkles className="h-3.5 w-3.5 mr-1" /> Перезапустить ИИ
                    </Button>
                  </div>
                  <div className="border rounded-lg max-h-64 overflow-auto">
                    {mapping.map((m, i) => {
                      const lowConf = m.confidence < 0.7 && m.field !== "skip";
                      return (
                        <div key={i} className={`flex items-center gap-2 px-3 py-1.5 border-b last:border-b-0 text-sm ${lowConf ? "bg-amber-500/5" : ""}`}>
                          <div className="flex-1 truncate font-mono text-xs">{m.excel_column || <em className="text-muted-foreground">(пустая)</em>}</div>
                          <Select value={m.field} onValueChange={(v) => updateMapping(m.excel_column, v)}>
                            <SelectTrigger className={`h-7 w-64 text-xs ${lowConf ? "border-amber-500/60" : ""}`}><SelectValue /></SelectTrigger>
                            <SelectContent className="max-h-72">
                              {allFieldOptions.meta.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                              <div className="px-2 py-1 text-[10px] uppercase text-muted-foreground border-t mt-1">Этапы</div>
                              {allFieldOptions.stageOpts.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {m.confidence >= 0.8 && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                          {lowConf && <AlertCircle className="h-3.5 w-3.5 text-amber-500" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Step 5: Preview */}
              {previewSkus.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs">Предпросмотр SKU ({validCount}/{previewSkus.length})</Label>
                    <div className="text-[10px] text-muted-foreground">Снимите галочки чтобы пропустить</div>
                  </div>
                  <div className="border rounded-lg max-h-56 overflow-auto">
                    {previewSkus.map(s => {
                      const completed = Object.values(s.stageDates).filter(Boolean).length;
                      return (
                        <label key={s.rowIndex} className="flex items-center gap-2 px-3 py-1.5 border-b last:border-b-0 text-sm cursor-pointer hover:bg-muted/50">
                          <Checkbox
                            checked={!skipRows.has(s.rowIndex)}
                            onCheckedChange={(v) => {
                              setSkipRows(prev => {
                                const next = new Set(prev);
                                if (v) next.delete(s.rowIndex); else next.add(s.rowIndex);
                                return next;
                              });
                            }}
                          />
                          <div className="flex-1 truncate">{s.title}</div>
                          {s.meta.brand && <Badge variant="outline" className="text-[10px]">{s.meta.brand}</Badge>}
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {completed}/{stages.length} этапов
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>Отмена</Button>
          <Button onClick={handleImport} disabled={importing || validCount === 0 || mapping.length === 0}>
            {importing ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Импорт...</> : `Импортировать ${validCount} SKU`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
