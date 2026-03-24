import { useState, useCallback } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Loader2, Check, Plus, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, addDays } from "date-fns";

interface StreamTask {
  title: string;
  deadline_offset_days?: number;
  selected?: boolean;
}

interface StreamSuggestion {
  stream_name: string;
  tasks: StreamTask[];
  expanded?: boolean;
}

interface NpdAiTasksPopoverProps {
  projectName: string;
  projectDescription?: string | null;
  projectId: string;
  gateName?: string;
  streams?: string[];
  existingTasks?: string[];
  /** Called when user applies selected tasks. Returns { stream_name, title, deadline }[] */
  onApply: (tasks: { stream_name: string; title: string; deadline: string | null }[]) => void;
  children: React.ReactNode;
}

export default function NpdAiTasksPopover({
  projectName, projectDescription, projectId, gateName, streams, existingTasks = [],
  onApply, children,
}: NpdAiTasksPopoverProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<StreamSuggestion[] | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setSuggestions(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          message: projectName,
          action: "npd_generate_tasks",
          context: {
            projectName,
            projectDescription,
            gateName,
            streams: streams && streams.length > 0 ? streams : undefined,
            existingTasks,
          },
        },
      });

      if (error) throw error;
      if (data?.error === "rate_limited") {
        toast.error("Слишком много запросов, попробуйте позже");
        return;
      }
      if (data?.error === "payment_required") {
        toast.error("Недостаточно кредитов AI");
        return;
      }

      if (data?.streams?.length) {
        setSuggestions(
          data.streams.map((s: any) => ({
            stream_name: s.stream_name,
            tasks: s.tasks.map((t: any) => ({ ...t, selected: true })),
            expanded: true,
          }))
        );
      } else {
        toast.error("ИИ не сгенерировал задачи");
      }
    } catch (e) {
      console.error("NPD AI generate error:", e);
      toast.error("Ошибка генерации задач");
    } finally {
      setLoading(false);
    }
  }, [projectName, projectDescription, gateName, streams, existingTasks]);

  const toggleTask = (streamIdx: number, taskIdx: number) => {
    setSuggestions(prev => {
      if (!prev) return prev;
      return prev.map((s, si) =>
        si === streamIdx
          ? { ...s, tasks: s.tasks.map((t, ti) => ti === taskIdx ? { ...t, selected: !t.selected } : t) }
          : s
      );
    });
  };

  const toggleStream = (streamIdx: number) => {
    setSuggestions(prev => {
      if (!prev) return prev;
      return prev.map((s, si) =>
        si === streamIdx ? { ...s, expanded: !s.expanded } : s
      );
    });
  };

  const selectAll = (value: boolean) => {
    setSuggestions(prev => {
      if (!prev) return prev;
      return prev.map(s => ({ ...s, tasks: s.tasks.map(t => ({ ...t, selected: value })) }));
    });
  };

  const selectedCount = suggestions?.reduce((acc, s) => acc + s.tasks.filter(t => t.selected).length, 0) || 0;
  const totalCount = suggestions?.reduce((acc, s) => acc + s.tasks.length, 0) || 0;

  const handleApply = () => {
    if (!suggestions) return;
    const tasks: { stream_name: string; title: string; deadline: string | null }[] = [];
    for (const stream of suggestions) {
      for (const task of stream.tasks) {
        if (!task.selected) continue;
        const deadline = task.deadline_offset_days
          ? format(addDays(new Date(), task.deadline_offset_days), "yyyy-MM-dd")
          : null;
        tasks.push({ stream_name: stream.stream_name, title: task.title, deadline });
      }
    }
    onApply(tasks);
    setOpen(false);
    setSuggestions(null);
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v && !suggestions && !loading) generate(); }}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 bg-popover border-border z-[60]"
        side="left"
        align="start"
        onClick={(e) => e.stopPropagation()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-xs font-medium flex items-center gap-1.5 text-foreground">
            <Sparkles className="h-3 w-3 text-primary" /> ИИ-задачи по стримам
          </span>
          {gateName && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
              {gateName}
            </span>
          )}
        </div>

        {/* Content */}
        <ScrollArea className="max-h-72">
          {loading && (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">Генерирую задачи...</span>
            </div>
          )}

          {!loading && !suggestions && (
            <div className="text-center py-6 px-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                ИИ предложит задачи для каждого стрима на основе текущего гейта проекта
              </p>
              <button
                onClick={generate}
                className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Сгенерировать
              </button>
            </div>
          )}

          {suggestions && (
            <div className="py-2">
              {/* Select all / none */}
              <div className="flex items-center justify-between px-3 pb-2 border-b border-border mb-1">
                <span className="text-[10px] text-muted-foreground">
                  Выбрано {selectedCount} из {totalCount}
                </span>
                <div className="flex gap-1.5">
                  <button onClick={() => selectAll(true)} className="text-[10px] text-primary hover:underline">Все</button>
                  <span className="text-[10px] text-muted-foreground">|</span>
                  <button onClick={() => selectAll(false)} className="text-[10px] text-muted-foreground hover:text-foreground">Ничего</button>
                </div>
              </div>

              {suggestions.map((stream, si) => (
                <div key={stream.stream_name} className="px-2">
                  <button
                    onClick={() => toggleStream(si)}
                    className="flex items-center gap-1.5 w-full px-1 py-1.5 text-left hover:bg-muted/50 rounded transition-colors"
                  >
                    {stream.expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                    <span className="text-[11px] font-semibold text-foreground">{stream.stream_name}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {stream.tasks.filter(t => t.selected).length}/{stream.tasks.length}
                    </span>
                  </button>
                  {stream.expanded && (
                    <div className="pl-4 space-y-0.5 pb-1">
                      {stream.tasks.map((task, ti) => (
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
                            onChange={() => toggleTask(si, ti)}
                            className="mt-0.5 rounded border-border accent-primary"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-[11px] text-foreground leading-tight">{task.title}</span>
                            {task.deadline_offset_days && (
                              <span className="text-[9px] text-muted-foreground ml-1.5">
                                ({task.deadline_offset_days}д)
                              </span>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {suggestions && (
          <div className="flex items-center gap-2 px-3 py-2 border-t border-border">
            <button
              onClick={generate}
              disabled={loading}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Перегенерировать
            </button>
            <button
              onClick={handleApply}
              disabled={selectedCount === 0}
              className="ml-auto flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors font-medium"
            >
              <Plus className="h-3 w-3" />
              Добавить {selectedCount}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
