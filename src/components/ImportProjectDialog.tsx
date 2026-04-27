import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Loader2, CheckCircle2 } from "lucide-react";
import { parseExcelForPreview, importRowsToProject, ImportPreview } from "@/lib/projectExcel";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invalidateTasksScoped, invalidateTaskGroups } from "@/lib/queryInvalidation";

interface ImportProjectDialogProps {
  trigger?: React.ReactNode;
  targetGroupId?: string;
  onSuccess?: (groupId: string) => void;
}

export default function ImportProjectDialog({ trigger, targetGroupId, onSuccess }: ImportProjectDialogProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    try {
      const p = await parseExcelForPreview(file);
      setPreview(p);
    } catch (e: any) {
      toast.error("Ошибка чтения файла: " + e.message);
    }
  };

  const handleImport = async () => {
    if (!preview || !user) return;
    setImporting(true);
    try {
      const result = await importRowsToProject(user.id, preview.rows, targetGroupId);
      setDone(true);
      toast.success(`Импортировано ${result.taskCount} задач`);
      invalidateTasksScoped(qc, result.groupId);
      invalidateTaskGroups(qc);
      qc.invalidateQueries({ queryKey: ["tags"] });
      setTimeout(() => {
        setOpen(false);
        setPreview(null);
        setDone(false);
        onSuccess?.(result.groupId);
      }, 1000);
    } catch (e: any) {
      toast.error("Ошибка импорта: " + e.message);
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setPreview(null);
    setDone(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setPreview(null); setDone(false); } }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-1.5">
            <Upload className="h-3.5 w-3.5" />
            Импорт CSV
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Импорт проекта из Excel</DialogTitle>
        </DialogHeader>

        {!preview && !done && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Загрузите Excel-файл (.xlsx) с проектом. Колонки: Тип, Проект, Подпроект, Задача, Описание, Дедлайн, Приоритет, Статус, Теги, Подзадачи.
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
            <Button variant="outline" className="w-full gap-2" onClick={() => fileRef.current?.click()}>
              <FileText className="h-4 w-4" />
              Выбрать файл
            </Button>
          </div>
        )}

        {preview && !done && (
          <div className="space-y-3">
            <div className="bg-muted rounded-lg p-3 space-y-1.5">
              <p className="text-sm font-medium">{preview.projectName}</p>
              {preview.subprojects.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Подпроекты: {preview.subprojects.join(", ")}
                </p>
              )}
              <p className="text-xs text-muted-foreground">{preview.taskCount} задач</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleReset} className="flex-1">
                Другой файл
              </Button>
              <Button size="sm" onClick={handleImport} disabled={importing} className="flex-1 gap-1.5">
                {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Импортировать
              </Button>
            </div>
          </div>
        )}

        {done && (
          <div className="flex flex-col items-center gap-2 py-4">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <p className="text-sm font-medium">Готово!</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
