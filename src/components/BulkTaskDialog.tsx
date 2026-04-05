import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, ListPlus, Loader2, Check, Plus, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useTaskGroups, useTaskMutations, useTasks, useAvailableUsers } from "@/hooks/useTasks";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { addDays, format } from "date-fns";

interface GeneratedTask {
  title: string;
  deadline_offset_days?: number;
  priority?: number;
  subtasks?: string[];
  selected?: boolean;
}

interface GeneratedGroup {
  name: string;
  tasks: GeneratedTask[];
  expanded?: boolean;
}

interface BulkTaskDialogProps {
  /** Pre-selected project id */
  projectId?: string | null;
  /** Pre-selected project name */
  projectName?: string | null;
  children: React.ReactNode;
}

export default function BulkTaskDialog({ projectId, projectName, children }: BulkTaskDialogProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"ai" | "text">("ai");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            Пакетное создание задач
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={v => setTab(v as any)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-4 w-fit">
            <TabsTrigger value="ai" className="gap-1.5 text-xs">
              <Sparkles className="h-3 w-3" /> ИИ-генерация
            </TabsTrigger>
            <TabsTrigger value="text" className="gap-1.5 text-xs">
              <ListPlus className="h-3 w-3" /> Текстовый список
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ai" className="flex-1 min-h-0 mt-0">
            <AiTab projectId={projectId} projectName={projectName} onDone={() => setOpen(false)} />
          </TabsContent>
          <TabsContent value="text" className="flex-1 min-h-0 mt-0">
            <TextTab projectId={projectId} projectName={projectName} onDone={() => setOpen(false)} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/* ============ AI TAB ============ */
function AiTab({ projectId, projectName, onDone }: { projectId?: string | null; projectName?: string | null; onDone: () => void }) {
  const { user } = useAuth();
  const { data: groups = [] } = useTaskGroups();
  const { data: allTasks = [] } = useTasks();
  const { data: users = [] } = useAvailableUsers();
  const { addTask } = useTaskMutations();

  const [prompt, setPrompt] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string>(projectId || "__none__");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<GeneratedGroup[] | null>(null);
  const [creating, setCreating] = useState(false);

  const rootProjects = groups.filter(g => !g.parent_id);
  const selectedProject = groups.find(g => g.id === selectedGroupId);

  const generate = useCallback(async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setSuggestions(null);

    try {
      const existingTasks = allTasks
        .filter(t => t.group_id === selectedGroupId || (selectedProject && groups.some(g => g.parent_id === selectedGroupId && g.id === t.group_id)))
        .map(t => t.title)
        .slice(0, 30);

      const subprojects = groups
        .filter(g => g.parent_id === selectedGroupId)
        .map(g => g.name);

      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          message: prompt,
          action: "bulk_generate_tasks",
          context: {
            projectName: selectedProject?.name || projectName || prompt,
            projectDescription: (selectedProject as any)?.description,
            existingTasks,
            subprojects,
            users: users.map(u => ({ id: u.id, name: u.display_name || u.email })),
          },
        },
      });

      if (error) throw error;
      if (data?.error === "rate_limited") { toast.error("Слишком много запросов"); return; }
      if (data?.error === "payment_required") { toast.error("ИИ временно недоступен"); return; }

      if (data?.groups?.length) {
        setSuggestions(
          data.groups.map((g: any) => ({
            name: g.name,
            tasks: g.tasks.map((t: any) => ({ ...t, selected: true })),
            expanded: true,
          }))
        );
      } else {
        toast.error("ИИ не сгенерировал задачи");
      }
    } catch (e) {
      console.error("Bulk AI error:", e);
      toast.error("Ошибка генерации");
    } finally {
      setLoading(false);
    }
  }, [prompt, selectedGroupId, selectedProject, allTasks, groups, users, projectName]);

  const toggleTask = (gi: number, ti: number) => {
    setSuggestions(prev => prev?.map((g, i) => i === gi ? { ...g, tasks: g.tasks.map((t, j) => j === ti ? { ...t, selected: !t.selected } : t) } : g) || null);
  };

  const toggleGroup = (gi: number) => {
    setSuggestions(prev => prev?.map((g, i) => i === gi ? { ...g, expanded: !g.expanded } : g) || null);
  };

  const selectAll = (val: boolean) => {
    setSuggestions(prev => prev?.map(g => ({ ...g, tasks: g.tasks.map(t => ({ ...t, selected: val })) })) || null);
  };

  const selectedCount = suggestions?.reduce((a, g) => a + g.tasks.filter(t => t.selected).length, 0) || 0;
  const totalCount = suggestions?.reduce((a, g) => a + g.tasks.length, 0) || 0;

  const handleApply = async () => {
    if (!suggestions || !user || selectedCount === 0) return;
    setCreating(true);

    try {
      let created = 0;
      for (const group of suggestions) {
        // Find or use root project
        let targetGroupId = selectedGroupId !== "__none__" ? selectedGroupId : null;

        // If there's a subgroup name matching, use it
        if (targetGroupId && group.name !== "Общие") {
          const sub = groups.find(g => g.parent_id === targetGroupId && g.name.toLowerCase() === group.name.toLowerCase());
          if (sub) targetGroupId = sub.id;
        }

        for (const task of group.tasks) {
          if (!task.selected) continue;
          await addTask.mutateAsync({
            title: task.title,
            group_id: targetGroupId,
            deadline: task.deadline_offset_days ? addDays(new Date(), task.deadline_offset_days).toISOString() : null,
            task_type: "standard",
          });
          created++;
        }
      }

      toast.success(`Создано ${created} задач!`);
      onDone();
    } catch (e: any) {
      toast.error("Ошибка создания: " + e.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col min-h-0 px-4 pb-4">
      {/* Project selector + prompt */}
      <div className="space-y-2 py-3">
        <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Без проекта (inbox)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__" className="text-xs">📥 Inbox (без проекта)</SelectItem>
            {rootProjects.map(g => (
              <SelectItem key={g.id} value={g.id} className="text-xs">
                {(g as any).icon || "📁"} {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex gap-2">
          <Textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Опишите, какие задачи нужны...&#10;Например: «Задачи для запуска рекламной кампании на 2 недели»"
            className="text-xs min-h-[60px] max-h-[100px] resize-none flex-1"
          />
          <Button
            onClick={generate}
            disabled={loading || !prompt.trim()}
            size="sm"
            className="shrink-0 h-auto self-end"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Results */}
      {loading && (
        <div className="flex flex-col items-center py-8 gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-xs text-muted-foreground">Генерирую план задач...</span>
        </div>
      )}

      {suggestions && (
        <>
          <div className="flex items-center justify-between pb-2 border-b border-border mb-1">
            <span className="text-[10px] text-muted-foreground">
              Выбрано {selectedCount} из {totalCount}
            </span>
            <div className="flex gap-1.5">
              <button onClick={() => selectAll(true)} className="text-[10px] text-primary hover:underline">Все</button>
              <span className="text-[10px] text-muted-foreground">|</span>
              <button onClick={() => selectAll(false)} className="text-[10px] text-muted-foreground hover:text-foreground">Ничего</button>
            </div>
          </div>

          <ScrollArea className="flex-1 max-h-[280px]">
            {suggestions.map((group, gi) => (
              <div key={group.name} className="mb-1">
                <button
                  onClick={() => toggleGroup(gi)}
                  className="flex items-center gap-1.5 w-full px-1 py-1.5 text-left hover:bg-muted/50 rounded transition-colors"
                >
                  {group.expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                  <span className="text-[11px] font-semibold text-foreground">{group.name}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {group.tasks.filter(t => t.selected).length}/{group.tasks.length}
                  </span>
                </button>
                {group.expanded && (
                  <div className="pl-4 space-y-0.5 pb-1">
                    {group.tasks.map((task, ti) => (
                      <label
                        key={ti}
                        className={cn(
                          "flex items-start gap-2 px-1.5 py-1 rounded cursor-pointer transition-colors",
                          task.selected ? "bg-primary/5" : "hover:bg-muted/30"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={task.selected}
                          onChange={() => toggleTask(gi, ti)}
                          className="mt-0.5 rounded border-border accent-primary"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-[11px] text-foreground leading-tight">{task.title}</span>
                          {task.deadline_offset_days && (
                            <span className="text-[9px] text-muted-foreground ml-1.5">
                              ({task.deadline_offset_days}д)
                            </span>
                          )}
                          {task.priority && task.priority <= 2 && (
                            <span className={cn("text-[9px] ml-1", task.priority === 1 ? "text-red-500" : "text-amber-500")}>
                              P{task.priority}
                            </span>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </ScrollArea>

          <div className="flex items-center gap-2 pt-3 border-t border-border mt-2">
            <button
              onClick={generate}
              disabled={loading}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Перегенерировать
            </button>
            <Button
              onClick={handleApply}
              disabled={selectedCount === 0 || creating}
              size="sm"
              className="ml-auto gap-1"
            >
              {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Добавить {selectedCount}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/* ============ TEXT TAB ============ */
function TextTab({ projectId, projectName, onDone }: { projectId?: string | null; projectName?: string | null; onDone: () => void }) {
  const { user } = useAuth();
  const { data: groups = [] } = useTaskGroups();
  const { addTask } = useTaskMutations();

  const [text, setText] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string>(projectId || "__none__");
  const [creating, setCreating] = useState(false);

  const rootProjects = groups.filter(g => !g.parent_id);

  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  const handleCreate = async () => {
    if (!user || lines.length === 0) return;
    setCreating(true);

    try {
      const targetGroupId = selectedGroupId !== "__none__" ? selectedGroupId : null;
      let created = 0;

      for (const line of lines) {
        // Strip leading markers like "- ", "* ", "1. ", "• "
        const title = line.replace(/^[-*•]\s*/, "").replace(/^\d+\.\s*/, "").trim();
        if (!title) continue;

        await addTask.mutateAsync({
          title,
          group_id: targetGroupId,
          task_type: "standard",
        });
        created++;
      }

      toast.success(`Создано ${created} задач!`);
      onDone();
    } catch (e: any) {
      toast.error("Ошибка создания: " + e.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col min-h-0 px-4 pb-4">
      <div className="space-y-2 py-3">
        <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Без проекта (inbox)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__" className="text-xs">📥 Inbox (без проекта)</SelectItem>
            {rootProjects.map(g => (
              <SelectItem key={g.id} value={g.id} className="text-xs">
                {(g as any).icon || "📁"} {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={"Вставьте список задач (по одной на строку):\n\nПодготовить презентацию\nОтправить КП клиенту\nПровести встречу с командой\nСобрать обратную связь"}
          className="text-xs min-h-[160px] max-h-[260px] resize-none font-mono"
        />

        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {lines.length > 0 ? `${lines.length} задач для создания` : "Введите задачи"}
          </span>
          <Button
            onClick={handleCreate}
            disabled={lines.length === 0 || creating}
            size="sm"
            className="gap-1"
          >
            {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Создать {lines.length > 0 ? lines.length : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}
