import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useEventTopicTags, useCreateEventTopic } from "@/hooks/useEventTopicTags";
import { Plus, Tag as TagIcon, X, Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import type { Task } from "@/hooks/useTasks";

type Props = {
  task: Task;
  /** Не разворачивать строку при клике на ячейку */
  compact?: boolean;
};

/**
 * Ячейка «Тема» в строке протокола.
 * Тема = тег из системной категории `event_topic`.
 * У строки может быть максимум один тег этой категории (для UX-простоты группировки).
 */
export default function TopicCell({ task, compact }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { topicTags, categoryId } = useEventTopicTags();
  const createTopic = useCreateEventTopic();

  const topicTagIds = useMemo(() => new Set(topicTags.map((t) => t.id)), [topicTags]);
  const taskTagIds = useMemo(
    () => new Set((task.task_tags ?? []).map((tt) => tt.tag_id)),
    [task.task_tags],
  );
  const currentTopic = useMemo(
    () => topicTags.find((t) => taskTagIds.has(t.id)) ?? null,
    [topicTags, taskTagIds],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return topicTags;
    return topicTags.filter((t) => t.name.toLowerCase().includes(q));
  }, [topicTags, search]);

  const exactMatch = useMemo(
    () => topicTags.some((t) => t.name.toLowerCase() === search.trim().toLowerCase()),
    [topicTags, search],
  );

  const setTopic = async (newTagId: string | null) => {
    // Снять все текущие топик-теги у задачи
    const toRemove = (task.task_tags ?? [])
      .map((tt) => tt.tag_id)
      .filter((id) => topicTagIds.has(id));
    if (toRemove.length > 0) {
      await supabase
        .from("task_tags")
        .delete()
        .eq("task_id", task.id)
        .in("tag_id", toRemove);
    }
    if (newTagId) {
      await supabase.from("task_tags").insert({ task_id: task.id, tag_id: newTagId });
    }
    qc.invalidateQueries({ queryKey: ["tasks"] });
    setOpen(false);
    setSearch("");
  };

  const handleCreateAndAssign = async () => {
    if (!categoryId) {
      toast({
        title: "Не удалось создать тему",
        description: "Системная категория «Тема» не найдена для вашего профиля. Обратитесь к администратору.",
        variant: "destructive",
      });
      return;
    }
    try {
      const created = await createTopic.mutateAsync(search.trim());
      if (created?.id) await setTopic(created.id);
    } catch (e: any) {
      toast({
        title: "Не удалось создать тему",
        description: e?.message ?? "Неизвестная ошибка",
        variant: "destructive",
      });
    }
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }}>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => { if (compact) e.stopPropagation(); }}
          className={cn(
            "inline-flex max-w-full items-center gap-1 truncate rounded-md px-2 py-0.5 text-xs transition-colors",
            currentTopic
              ? "font-medium text-foreground hover:bg-muted"
              : "text-muted-foreground/60 italic hover:text-foreground hover:bg-muted",
          )}
          title={currentTopic?.name ?? "Назначить тему"}
        >
          {currentTopic ? (
            <>
              <span
                className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: currentTopic.color ?? "#10b981" }}
              />
              <span className="truncate">{currentTopic.name}</span>
            </>
          ) : (
            <>
              <TagIcon className="h-3 w-3" />
              <span>Тема</span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="border-b border-border p-2">
          <div className="flex items-center gap-1.5 rounded border border-input bg-background px-2">
            <Search className="h-3 w-3 text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && search.trim() && !exactMatch) {
                  e.preventDefault();
                  handleCreateAndAssign();
                }
              }}
              placeholder="Тема (например, Кокосовая линейка)"
              className="w-full bg-transparent py-1.5 text-xs focus:outline-none"
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {currentTopic && (
            <button
              onClick={() => setTopic(null)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
            >
              <X className="h-3 w-3" />
              Снять тему
            </button>
          )}
          {filtered.length === 0 && !search.trim() && (
            <div className="px-3 py-3 text-center text-xs text-muted-foreground">
              Тем пока нет.<br />Введите название и нажмите Enter.
            </div>
          )}
          {filtered.map((t) => {
            const isCurrent = currentTopic?.id === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTopic(isCurrent ? null : t.id)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted",
                  isCurrent && "bg-muted/50 font-medium",
                )}
              >
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: t.color ?? "#10b981" }}
                />
                <span className="truncate">{t.name}</span>
              </button>
            );
          })}
          {search.trim() && !exactMatch && (
            <button
              onClick={handleCreateAndAssign}
              disabled={createTopic.isPending}
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-xs text-foreground hover:bg-muted disabled:opacity-50"
            >
              {createTopic.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
              Создать тему «{search.trim()}»
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
