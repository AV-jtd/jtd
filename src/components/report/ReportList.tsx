import { useState, useEffect, useRef, useCallback } from "react";
import { Plus, FileBarChart, Trash2, Loader2, Check, Download, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useReportPages, useReportMutations, ReportBlock } from "@/hooks/useReports";
import ReportEditor from "./ReportEditor";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import ConfirmDelete from "@/components/ConfirmDelete";

interface ReportListProps {
  groupId: string | null;
  compact?: boolean;
}

export default function ReportList({ groupId, compact }: ReportListProps) {
  const { data: reports = [], isLoading } = useReportPages(groupId);
  const { createReport, updateReport, deleteReport } = useReportMutations(groupId);
  const [openReportId, setOpenReportId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  const openReport = reports.find(r => r.id === openReportId);

  const handleBlocksChange = useCallback((blocks: ReportBlock[]) => {
    if (!openReportId) return;
    setSaveStatus("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateReport.mutate({ id: openReportId, blocks }, {
        onSuccess: () => {
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 2000);
        },
      });
    }, 600); // debounce 600ms
  }, [openReportId, updateReport]);

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const handleExportJson = () => {
    if (!openReport) return;
    const blob = new Blob([JSON.stringify(openReport.blocks, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${openReport.title}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary/50" />
      </div>
    );
  }

  if (openReport) {
    return (
      <div className="space-y-3">
        {/* Report header */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpenReportId(null)}>
            ← Назад
          </Button>
          <div className="flex-1">
            {editingTitle === openReport.id ? (
              <Input
                autoFocus
                value={openReport.title}
                className="h-7 text-sm font-medium"
                onChange={e => updateReport.mutate({ id: openReport.id, title: e.target.value })}
                onBlur={() => setEditingTitle(null)}
                onKeyDown={e => e.key === "Enter" && setEditingTitle(null)}
              />
            ) : (
              <button
                className="text-sm font-medium text-foreground hover:text-primary transition-colors"
                onClick={() => setEditingTitle(openReport.id)}
              >
                {openReport.title}
              </button>
            )}
          </div>

          {/* Save status */}
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
            {saveStatus === "saving" && <><Loader2 className="h-3 w-3 animate-spin" /> Сохранение...</>}
            {saveStatus === "saved" && <><Check className="h-3 w-3 text-emerald-500" /> Сохранено</>}
          </div>

          {/* Export JSON */}
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1 shrink-0" onClick={handleExportJson}>
            <Download className="h-3 w-3" /> JSON
          </Button>
        </div>

        <ReportEditor
          blocks={openReport.blocks}
          onChange={handleBlocksChange}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reports.length === 0 ? (
        <div className="text-center py-8">
          <FileBarChart className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Нет отчётов</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Создайте отчёт или импортируйте JSON-данные</p>
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map(report => {
            const kpiCount = report.blocks.filter(b => b.type === "kpi").length;
            const chartCount = report.blocks.filter(b => b.type === "chart").length;
            return (
              <button
                key={report.id}
                onClick={() => setOpenReportId(report.id)}
                className="w-full flex items-center gap-3 p-3 bg-card rounded-lg border border-border/50 hover:border-primary/30 hover:shadow-sm transition-all text-left group"
              >
                <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${report.cover_color}18` }}>
                  <FileBarChart className="h-4 w-4" style={{ color: report.cover_color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-foreground truncate block">{report.title}</span>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                    <span>{report.blocks.length} блоков</span>
                    {kpiCount > 0 && <span>· {kpiCount} KPI</span>}
                    {chartCount > 0 && <span>· {chartCount} граф.</span>}
                    <span>· {format(parseISO(report.updated_at), "d MMM yyyy", { locale: ru })}</span>
                  </div>
                </div>
                <ConfirmDelete onConfirm={() => deleteReport.mutate(report.id)}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
                    onClick={e => e.stopPropagation()}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </ConfirmDelete>
              </button>
            );
          })}
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        className="w-full border-dashed h-8 text-xs gap-1.5"
        onClick={() => createReport.mutateAsync("Новый отчёт").then(r => r && setOpenReportId((r as any).id))}
        disabled={createReport.isPending}
      >
        {createReport.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        Создать отчёт
      </Button>
    </div>
  );
}
