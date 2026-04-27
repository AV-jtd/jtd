import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useEventTopicTags, useCreateEventTopic } from "@/hooks/useEventTopicTags";
import { useTaskGroups } from "@/hooks/useTasks";
import { Plus, Tag as TagIcon, X, Search, Loader2, Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import type { Task } from "@/hooks/useTasks";
import { invalidateTasksScoped, invalidateTaskGroups } from "@/lib/queryInvalidation";

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
  const assignInFlightRef = useRef<string | null>(null);
  const { topicTags, categoryId } = useEventTopicTags();
  const { data: taskGroups = [] } = useTaskGroups();
  const createTopic = useCreateEventTopic();

  /** tagId → linked project (task_group) — для индикации «тема = проект». */
  const tagToProject = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const g of taskGroups) {
      if (g.linked_tag_id) map.set(g.linked_tag_id, { id: g.id, name: g.name });
    }
    return map;
  }, [taskGroups]);

  const topicTagIds = useMemo(() => new Set(topicTags.map((t) => t.id)), [topicTags]);
  const taskTagIds = useMemo(
    () => new Set((task.task_tags ?? []).map((tt) => tt.tag_id)),
    [task.task_tags],
  );
  const currentTopic = useMemo(
    () => topicTags.find((t) => taskTagIds.has(t.id)) ?? null,
    [topicTags, taskTagIds],
  );
  const currentTopicProject = currentTopic ? tagToProject.get(currentTopic.id) ?? null : null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return topicTags;
    return topicTags.filter((t) => t.name.toLowerCase().includes(q));
  }, [topicTags, search]);

  const normalizedSearch = search.trim().toLowerCase();
  const matchedTopic = useMemo(
    () => topicTags.find((t) => t.name.toLowerCase() === normalizedSearch) ?? null,
    [topicTags, normalizedSearch],
  );
  const exactMatch = !!matchedTopic;

  const setTopic = async (newTagId: string | null) => {
    const requestKey = `${task.id}:${newTagId ?? "none"}`;
    if (assignInFlightRef.current === requestKey) return;
    assignInFlightRef.current = requestKey;

    try {
      const existingTopicIds = (task.task_tags ?? [])
        .map((tt) => tt.tag_id)
        .filter((id) => topicTagIds.has(id));

      if (newTagId && existingTopicIds.includes(newTagId) && existingTopicIds.length === 1) {
        setOpen(false);
        setSearch("");
        return;
      }

      const toRemove = existingTopicIds.filter((id) => id !== newTagId);

      if (toRemove.length > 0) {
        const { error } = await supabase
          .from("task_tags")
          .delete()
          .eq("task_id", task.id)
          .in("tag_id", toRemove);
        if (error) throw error;
      }

      if (newTagId && !existingTopicIds.includes(newTagId)) {
        const { error } = await supabase.from("task_tags").upsert(
          { task_id: task.id, tag_id: newTagId },
          { onConflict: "task_id,tag_id", ignoreDuplicates: true }
        );
        if (error) throw error;
      }

      // Tag change touches a single protocol row → only refresh global + this group.
      invalidateTasksScoped(qc, task.group_id);
      qc.invalidateQueries({ queryKey: ["tags"] });
      setOpen(false);
      setSearch("");
    } finally {
      assignInFlightRef.current = null;
    }
  };

  const handleCreateAndAssign = async () => {
    try {
      if (matchedTopic?.id) {
        await setTopic(matchedTopic.id);
        return;
      }

      const created = await createTopic.mutateAsync(search.trim());
      if (created?.id) {
        await setTopic(created.id);
        if (created.linkedGroupId) {
          toast({
            title: "Тема привязана к проекту",
            description: `«${created.name}» — это существующий проект, контекст подхватится автоматически.`,
          });
          invalidateTaskGroups(qc);
        } else {
          toast({
            title: "Тема создана",
            description: `«${created.name}» добавлена. Если создашь одноимённый проект — привяжется автоматически.`,
          });
        }
      } else {
        toast({
          title: "Не удалось создать тему",
          description: "Тема не была создана. Попробуйте ещё раз.",
          variant: "destructive",
        });
      }
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
          title={
            currentTopicProject
              ? `${currentTopic?.name} • Проект`
              : currentTopic?.name ?? "Назначить тему"
          }
        >
          {currentTopic ? (
            <>
              {currentTopicProject ? (
                <Folder className="h-3 w-3 shrink-0 text-primary" />
              ) : (
                <span
                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: currentTopic.color ?? "hsl(var(--primary))" }}
                />
              )}
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
                if (e.key === "Enter" && search.trim()) {
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
              onClick={async () => {
                try {
                  await setTopic(null);
                } catch (e: any) {
                  toast({
                    title: "Не удалось снять тему",
                    description: e?.message ?? "Неизвестная ошибка",
                    variant: "destructive",
                  });
                }
              }}
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
            const linkedProject = tagToProject.get(t.id);
            return (
              <button
                key={t.id}
                onClick={async () => {
                  try {
                    await setTopic(isCurrent ? null : t.id);
                  } catch (e: any) {
                    toast({
                      title: "Не удалось назначить тему",
                      description: e?.message ?? "Неизвестная ошибка",
                      variant: "destructive",
                    });
                  }
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted",
                  isCurrent && "bg-muted/50 font-medium",
                )}
                title={linkedProject ? `${t.name} • Проект` : t.name}
              >
                {linkedProject ? (
                  <Folder className="h-3 w-3 shrink-0 text-primary" />
                ) : (
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: t.color ?? "hsl(var(--primary))" }}
                  />
                )}
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
