import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Trash2, Link2, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { Milestone } from "@/hooks/useMilestones";
import { useMilestones } from "@/hooks/useMilestones";
import { useDependencies } from "@/hooks/useDependencies";
import { NPD_GATES } from "@/modules/npd/components/matrix/types";
import type { TaskGroup, Task } from "@/hooks/useTasks";
import { useTasks } from "@/hooks/useTasks";

interface MilestoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  milestone?: Milestone | null;
  projects: TaskGroup[];
  defaultProjectId?: string | null;
  defaultDate?: string | null;
  onSave: (data: {
    name: string;
    group_id: string;
    planned_date?: string;
    description?: string;
    color?: string;
    status?: string;
    gate_key?: string | null;
    predecessor?: { id: string; entity_type: string } | null;
  }) => void;
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
  const [predecessorId, setPredecessorId] = useState<string | null>(null);
  const [predecessorType, setPredecessorType] = useState<string>("task");
  const [predSearchOpen, setPredSearchOpen] = useState(false);
  const [predSearch, setPredSearch] = useState("");

  const { data: allTasks } = useTasks();
  const { data: allMilestones } = useMilestones();
  const { data: allDeps } = useDependencies();

  // Find existing predecessor for this milestone
  useEffect(() => {
    if (milestone && allDeps) {
      const dep = allDeps.find(d => d.successor_id === milestone.id && d.successor_entity_type === "milestone");
      if (dep) {
        setPredecessorId(dep.predecessor_id);
        setPredecessorType(dep.predecessor_entity_type);
      } else {
        setPredecessorId(null);
        setPredecessorType("task");
      }
    }
  }, [milestone, allDeps]);

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
      setPredecessorId(null);
      setPredecessorType("task");
    }
  }, [milestone, open, defaultProjectId, defaultDate]);

  const handleSave = () => {
    if (!name.trim() || !groupId) return;
    onSave({
      name: name.trim(),
      group_id: groupId,
      planned_date: date ? date.toISOString() : undefined,
      description: description.trim() || undefined,
      color,
      status,
      gate_key: gateKey || null,
      predecessor: predecessorId ? { id: predecessorId, entity_type: predecessorType } : null,
    });
    onOpenChange(false);
  };

  const rootProjects = projects.filter(p => !p.parent_id);

  // Build predecessor options: tasks and milestones from the same project tree
  const predecessorOptions = useMemo(() => {
    if (!groupId) return [];
    const items: { id: string; label: string; type: string }[] = [];

    // Get all group IDs in this project tree (root + children)
    const groupIds = new Set<string>();
    groupIds.add(groupId);
    projects.forEach(p => {
      if (p.parent_id === groupId) groupIds.add(p.id);
    });

    // Tasks from this project
    const tasks = (allTasks || []).filter(t => t.group_id && groupIds.has(t.group_id));
    tasks.forEach(t => {
      if (milestone && t.id === milestone.id) return;
      items.push({ id: t.id, label: `📋 ${t.title}`, type: "task" });
    });

    // Milestones from this project (exclude self)
    (allMilestones || []).forEach(m => {
      if (milestone && m.id === milestone.id) return;
      if (groupIds.has(m.group_id)) {
        items.push({ id: m.id, label: `◆ ${m.name}`, type: "milestone" });
      }
    });

    return items;
  }, [groupId, allTasks, allMilestones, projects, milestone]);

  const filteredPredecessors = useMemo(() => {
    if (!predSearch) return predecessorOptions.slice(0, 30);
    const q = predSearch.toLowerCase();
    return predecessorOptions.filter(p => p.label.toLowerCase().includes(q)).slice(0, 30);
  }, [predecessorOptions, predSearch]);

  const selectedPredLabel = useMemo(() => {
    if (!predecessorId) return null;
    const found = predecessorOptions.find(p => p.id === predecessorId);
    return found?.label || "Неизвестный элемент";
  }, [predecessorId, predecessorOptions]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
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
            <Label className="text-xs">Плановая дата <span className="text-muted-foreground">(необязательно)</span></Label>
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("flex-1 justify-start text-left font-normal", !date && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "d MMMM yyyy", { locale: ru }) : "Без даты"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={date} onSelect={setDate} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              {date && (
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setDate(undefined)}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Predecessor picker */}
          <div>
            <Label className="text-xs flex items-center gap-1">
              <Link2 className="h-3 w-3" /> Предшественник
            </Label>
            {selectedPredLabel ? (
              <div className="flex items-center gap-2 mt-1 p-2 rounded-md border bg-muted/50 text-sm">
                <span className="truncate flex-1">{selectedPredLabel}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => { setPredecessorId(null); setPredecessorType("task"); }}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <Popover open={predSearchOpen} onOpenChange={setPredSearchOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-muted-foreground font-normal text-sm">
                    Выберите предшественника...
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start">
                  <div className="p-2 border-b">
                    <Input
                      value={predSearch}
                      onChange={e => setPredSearch(e.target.value)}
                      placeholder="Поиск задачи или вехи..."
                      className="h-8 text-sm"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {filteredPredecessors.length === 0 && (
                      <p className="text-xs text-muted-foreground p-3 text-center">
                        {groupId ? "Нет элементов" : "Сначала выберите проект"}
                      </p>
                    )}
                    {filteredPredecessors.map(p => (
                      <button
                        key={p.id}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent truncate"
                        onClick={() => {
                          setPredecessorId(p.id);
                          setPredecessorType(p.type);
                          setPredSearchOpen(false);
                          setPredSearch("");
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
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
            <Button onClick={handleSave} disabled={!name.trim() || !groupId}>Сохранить</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
