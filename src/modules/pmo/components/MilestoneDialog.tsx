import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { Milestone } from "@/hooks/useMilestones";
import { NPD_GATES } from "@/modules/npd/components/matrix/types";
import type { TaskGroup } from "@/hooks/useTasks";

interface MilestoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  milestone?: Milestone | null;
  projects: TaskGroup[];
  defaultProjectId?: string | null;
  defaultDate?: string | null;
  onSave: (data: { name: string; group_id: string; planned_date: string; description?: string; color?: string; status?: string; gate_key?: string | null }) => void;
  onDelete?: (id: string) => void;
}

export default function MilestoneDialog({
  open, onOpenChange, milestone, projects, defaultProjectId, defaultDate, onSave, onDelete,
}: MilestoneDialogProps) {
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState("");
  const [date, setDate] = useState<Date | undefined>();
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [status, setStatus] = useState("pending");
  const [gateKey, setGateKey] = useState<string | null>(null);

  useEffect(() => {
    if (milestone) {
      setName(milestone.name);
      setGroupId(milestone.group_id);
      setDate(parseISO(milestone.planned_date));
      setDescription(milestone.description || "");
      setColor(milestone.color || "#3b82f6");
      setStatus(milestone.status);
      setGateKey((milestone as any).gate_key || null);
    } else {
      setName("");
      setGroupId(defaultProjectId || "");
      setDate(defaultDate ? parseISO(defaultDate) : undefined);
      setDescription("");
      setColor("#3b82f6");
      setStatus("pending");
      setGateKey(null);
    }
  }, [milestone, open, defaultProjectId, defaultDate]);

  const handleSave = () => {
    if (!name.trim() || !groupId || !date) return;
    onSave({
      name: name.trim(),
      group_id: groupId,
      planned_date: date.toISOString(),
      description: description.trim() || undefined,
      color,
      status,
      gate_key: gateKey || null,
    });
    onOpenChange(false);
  };

  const rootProjects = projects.filter(p => !p.parent_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{milestone ? "Редактировать веху" : "Новая веха"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">Название</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Название вехи" autoFocus />
          </div>

          <div>
            <Label className="text-xs">Проект</Label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger><SelectValue placeholder="Выберите проект" /></SelectTrigger>
              <SelectContent>
                {rootProjects.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.icon && p.icon !== "list" ? `${p.icon} ` : ""}{p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Плановая дата</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "d MMMM yyyy", { locale: ru }) : "Выберите дату"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={date} onSelect={setDate} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label className="text-xs">Статус / Результат гейта</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">⏳ Ожидает</SelectItem>
                <SelectItem value="in_progress">🔄 В процессе</SelectItem>
                <SelectItem value="go">✅ Go</SelectItem>
                <SelectItem value="no_go">❌ No-Go</SelectItem>
                <SelectItem value="conditional">⚠️ Условно Go</SelectItem>
                <SelectItem value="completed">✓ Завершена</SelectItem>
                <SelectItem value="missed">✗ Пропущена</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Веха гейта (NPD)</Label>
            <Select value={gateKey || "_none"} onValueChange={v => setGateKey(v === "_none" ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Не привязана к гейту" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— Не привязана к гейту</SelectItem>
                {NPD_GATES.map(g => (
                  <SelectItem key={g.key} value={g.key}>
                    {g.short} — {g.shortTitle}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {gateKey && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Задачи, стартующие после этой вехи, отобразятся в следующем гейте матрицы
              </p>
            )}
          </div>

          <div>
            <Label className="text-xs">Цвет</Label>
            <div className="flex gap-2 mt-1">
              {["#3b82f6", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899"].map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn("w-6 h-6 rounded-full border-2 transition-all", color === c ? "border-foreground scale-110" : "border-transparent")}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">Описание</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Описание (необязательно)" rows={2} />
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          {milestone && onDelete && (
            <Button variant="destructive" size="sm" onClick={() => { onDelete(milestone.id); onOpenChange(false); }}>
              <Trash2 className="h-4 w-4 mr-1" /> Удалить
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button onClick={handleSave} disabled={!name.trim() || !groupId || !date}>Сохранить</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
