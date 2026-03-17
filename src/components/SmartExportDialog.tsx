import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, Loader2, Filter, Download } from "lucide-react";
import { exportProjectToExcel, downloadExcel } from "@/lib/projectExcel";
import { toast } from "sonner";

export interface ExportOptions {
  columns: string[];
  statusFilter: "all" | "active" | "done";
  priorityFilter: "all" | "1" | "2" | "3";
  includeSubtasks: boolean;
}

const ALL_COLUMNS = [
  { key: "type", label: "Тип", default: true },
  { key: "project", label: "Проект", default: true },
  { key: "subproject", label: "Подпроект", default: true },
  { key: "title", label: "Задача", default: true },
  { key: "description", label: "Описание", default: true },
  { key: "start_at", label: "Старт", default: true },
  { key: "deadline", label: "Дедлайн", default: true },
  { key: "original_deadline", label: "Исх. дедлайн", default: false },
  { key: "priority", label: "Приоритет", default: true },
  { key: "status", label: "Статус", default: true },
  { key: "assigned_to", label: "Ответственный", default: true },
  { key: "tags", label: "Теги", default: true },
  { key: "subtasks", label: "Подзадачи", default: true },
  { key: "recurrence", label: "Повтор", default: false },
];

interface SmartExportDialogProps {
  groupId: string;
  groupName: string;
  trigger?: React.ReactNode;
}

export default function SmartExportDialog({ groupId, groupName, trigger }: SmartExportDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [columns, setColumns] = useState<string[]>(ALL_COLUMNS.filter(c => c.default).map(c => c.key));
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "done">("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | "1" | "2" | "3">("all");
  const [includeSubtasks, setIncludeSubtasks] = useState(true);

  const toggleColumn = (key: string) => {
    setColumns(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const selectAll = () => setColumns(ALL_COLUMNS.map(c => c.key));
  const selectNone = () => setColumns(["title"]); // title is always required

  const handleExport = async () => {
    setLoading(true);
    try {
      const options: ExportOptions = { columns, statusFilter, priorityFilter, includeSubtasks };
      const blob = await exportProjectToExcel(groupId, options);
      downloadExcel(blob, `${groupName}.xlsx`);
      toast.success("Excel экспортирован");
      setOpen(false);
    } catch (err: any) {
      toast.error("Ошибка экспорта: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <button className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
            <Upload className="h-3 w-3" /> Экспорт Excel
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            Настройки экспорта
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Column selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Колонки</p>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-[10px] text-primary hover:underline">Все</button>
                <button onClick={selectNone} className="text-[10px] text-muted-foreground hover:underline">Минимум</button>
              </div>
            </div>
            <ScrollArea className="max-h-[200px]">
              <div className="grid grid-cols-2 gap-1.5">
                {ALL_COLUMNS.map(col => (
                  <label
                    key={col.key}
                    className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-muted cursor-pointer transition-colors"
                  >
                    <Checkbox
                      checked={columns.includes(col.key)}
                      onCheckedChange={() => toggleColumn(col.key)}
                      disabled={col.key === "title"}
                      className="h-3.5 w-3.5"
                    />
                    <span className={col.key === "title" ? "font-medium" : ""}>{col.label}</span>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Filters */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Фильтры</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Статус</p>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">Все</SelectItem>
                    <SelectItem value="active" className="text-xs">Только активные</SelectItem>
                    <SelectItem value="done" className="text-xs">Только завершённые</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Приоритет</p>
                <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as any)}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">Все</SelectItem>
                    <SelectItem value="1" className="text-xs">🔴 Высокий</SelectItem>
                    <SelectItem value="2" className="text-xs">🟡 Средний</SelectItem>
                    <SelectItem value="3" className="text-xs">🔵 Низкий</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Include subtasks toggle */}
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox
              checked={includeSubtasks}
              onCheckedChange={(v) => setIncludeSubtasks(!!v)}
              className="h-3.5 w-3.5"
            />
            Включить подзадачи в колонку
          </label>

          {/* Export button */}
          <Button onClick={handleExport} disabled={loading || columns.length === 0} className="w-full gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Экспортировать ({columns.length} колонок)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
