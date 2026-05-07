import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, Plus, X, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { useVisibleTags, type TaskGroup } from "@/hooks/useTasks";
import { toast } from "sonner";

const FORBIDDEN_LENS_TYPES = new Set(["npd", "crm", "stm", "protocol"]);

interface Props {
  group: TaskGroup;
}

/**
 * Секция «Линза» в настройках проекта.
 * - Если view_mode='container': кнопка «Превратить в линзу» с превью.
 * - Если view_mode='lens': мульти-выбор тегов (OR) + счётчик задач + кнопка «Вернуть в обычный».
 * Запрещено для project_type ∈ {npd, crm, stm, protocol}.
 */
export default function LensSettingsSection({ group }: Props) {
  const qc = useQueryClient();
  const { data: allTags = [] } = useVisibleTags();
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");

  const projectType = (group as any).project_type as string;
  const viewMode = ((group as any).view_mode as string) ?? "container";
  const isLens = viewMode === "lens";
  const forbidden = FORBIDDEN_LENS_TYPES.has(projectType);

  // Linked tags (m:n)
  const { data: linkedTagIds = [] } = useQuery({
    queryKey: ["lens-linked-tags", group.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_group_linked_tags")
        .select("tag_id")
        .eq("group_id", group.id);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.tag_id as string);
    },
  });

  // Preview: how many tasks match
  const { data: matchCount = 0 } = useQuery({
    queryKey: ["lens-match-count", group.id, [...linkedTagIds].sort().join(",")],
    enabled: linkedTagIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_tags")
        .select("task_id", { count: "exact", head: false })
        .in("tag_id", linkedTagIds);
      if (error) throw error;
      return new Set((data ?? []).map((r: any) => r.task_id)).size;
    },
  });

  const linkedTags = useMemo(
    () => allTags.filter((t) => linkedTagIds.includes(t.id)),
    [allTags, linkedTagIds]
  );
  const availableTags = useMemo(
    () =>
      allTags
        .filter((t) => !linkedTagIds.includes(t.id))
        .filter((t) => !tagSearch.trim() || t.name.toLowerCase().includes(tagSearch.toLowerCase())),
    [allTags, linkedTagIds, tagSearch]
  );

  const setViewMode = useMutation({
    mutationFn: async (mode: "lens" | "container") => {
      const { error } = await supabase
        .from("task_groups")
        .update({ view_mode: mode } as any)
        .eq("id", group.id);
      if (error) throw error;
    },
    onSuccess: (_d, mode) => {
      qc.invalidateQueries({ queryKey: ["task-groups"] });
      qc.invalidateQueries({ queryKey: ["taskGroups"] });
      toast.success(mode === "lens" ? "Проект превращён в линзу" : "Линза снова обычный проект");
    },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось обновить режим"),
  });

  const addTag = useMutation({
    mutationFn: async (tagId: string) => {
      const { error } = await supabase
        .from("task_group_linked_tags")
        .insert({ group_id: group.id, tag_id: tagId } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lens-linked-tags", group.id] });
      qc.invalidateQueries({ queryKey: ["task-lens-projects"] });
    },
  });

  const removeTag = useMutation({
    mutationFn: async (tagId: string) => {
      const { error } = await supabase
        .from("task_group_linked_tags")
        .delete()
        .eq("group_id", group.id)
        .eq("tag_id", tagId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lens-linked-tags", group.id] });
      qc.invalidateQueries({ queryKey: ["task-lens-projects"] });
    },
  });

  if (forbidden) return null;
  if (group.parent_id) return null; // линзы только верхнего уровня

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <Eye className="h-3 w-3" /> Линза
        {isLens && (
          <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-medium">
            <Sparkles className="h-2.5 w-2.5" /> активна
          </span>
        )}
      </p>

      {!isLens ? (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            Линза собирает задачи по тегам из любых проектов. Контейнер у задач не меняется.
          </p>
          <button
            onClick={() => setViewMode.mutate("lens")}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            <Plus className="h-3 w-3" /> Превратить в линзу
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {linkedTags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                style={{ backgroundColor: (tag.color || "#6366f1") + "22", color: tag.color || "#6366f1" }}
              >
                {tag.name}
                <button
                  onClick={() => removeTag.mutate(tag.id)}
                  className="hover:opacity-70 transition-opacity"
                  title="Отвязать тег"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
            <Popover open={tagPickerOpen} onOpenChange={(open) => { setTagPickerOpen(open); setTagSearch(""); }}>
              <PopoverTrigger asChild>
                <button className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
                  <Plus className="h-2.5 w-2.5" /> Привязать тег
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" side="bottom">
                <Input
                  autoFocus
                  value={tagSearch}
                  onChange={(e) => setTagSearch(e.target.value)}
                  placeholder="Поиск тэга..."
                  className="h-7 text-xs mb-2"
                />
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {availableTags.length === 0 && (
                    <p className="text-xs text-muted-foreground px-2 py-1">Нет доступных тэгов</p>
                  )}
                  {availableTags.slice(0, 50).map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => {
                        addTag.mutate(tag.id);
                        setTagPickerOpen(false);
                        setTagSearch("");
                      }}
                      className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: tag.color || "#6366f1" }}
                      />
                      {tag.name}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-[11px] text-muted-foreground">
              {linkedTagIds.length === 0
                ? "Привяжите хотя бы один тег — иначе линза пуста."
                : `Найдено задач: ${matchCount} (объединение по тегам, OR)`}
            </p>
            <button
              onClick={() => setViewMode.mutate("container")}
              className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
            >
              Вернуть в обычный
            </button>
          </div>
        </div>
      )}
    </div>
  );
}