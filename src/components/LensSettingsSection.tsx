import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, Plus, X, Check, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useVisibleTags, useTagCategories, type TaskGroup, type Tag } from "@/hooks/useTasks";
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
  const { data: categories = [] } = useTagCategories();
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

  // Preview: сколько задач попадёт в линзу (OR по тегам)
  const { data: matchCount = 0, isFetching: countLoading } = useQuery({
    queryKey: ["lens-match-count", group.id, [...linkedTagIds].sort().join(",")],
    enabled: linkedTagIds.length > 0,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_tags")
        .select("task_id")
        .in("tag_id", linkedTagIds);
      if (error) throw error;
      return new Set((data ?? []).map((r: any) => r.task_id)).size;
    },
  });

  const linkedTags = useMemo(
    () => allTags.filter((t) => linkedTagIds.includes(t.id)),
    [allTags, linkedTagIds]
  );
  const linkedSet = useMemo(() => new Set(linkedTagIds), [linkedTagIds]);

  // Группировка тэгов по категориям, с путём «Родитель › Категория»
  const grouped = useMemo(() => {
    const catById = new Map(categories.map((c) => [c.id, c] as const));
    const pathOf = (catId: string | null | undefined): string => {
      if (!catId) return "Без категории";
      const c = catById.get(catId);
      if (!c) return "Без категории";
      const parent = c.parent_id ? catById.get(c.parent_id) : null;
      return parent ? `${parent.name} › ${c.name}` : c.name;
    };
    const q = tagSearch.trim().toLowerCase();
    const filtered = allTags.filter(
      (t) => !q || t.name.toLowerCase().includes(q) || pathOf(t.category_id).toLowerCase().includes(q)
    );
    const map = new Map<string, { path: string; tags: Tag[] }>();
    for (const t of filtered) {
      const path = pathOf(t.category_id);
      if (!map.has(path)) map.set(path, { path, tags: [] });
      map.get(path)!.tags.push(t);
    }
    return Array.from(map.values()).sort((a, b) => a.path.localeCompare(b.path, "ru"));
  }, [allTags, categories, tagSearch]);

  const setViewMode = useMutation({
    mutationFn: async (mode: "lens" | "container") => {
      const { error } = await supabase
        .from("task_groups")
        .update({ view_mode: mode } as any)
        .eq("id", group.id);
      if (error) throw error;
    },
    onSuccess: (_d, mode) => {
      qc.invalidateQueries({ queryKey: ["task_groups"] });
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

  const toggleTag = (tagId: string) => {
    if (linkedSet.has(tagId)) removeTag.mutate(tagId);
    else addTag.mutate(tagId);
  };

  if (forbidden) return null;
  if (group.parent_id) return null; // линзы только верхнего уровня

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Eye className="h-3 w-3" /> Линза
          <span
            className="text-muted-foreground/70 font-normal"
            title="Линза собирает задачи по тегам из любых проектов. Контейнер у задач не меняется."
          >
            — собирает задачи по тегам
          </span>
        </div>
        <Switch
          checked={isLens}
          onCheckedChange={(v) => setViewMode.mutate(v ? "lens" : "container")}
          disabled={setViewMode.isPending}
        />
      </div>

      {isLens && (
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
                  <Plus className="h-2.5 w-2.5" /> {linkedTags.length === 0 ? "Привязать тэги" : "Ещё тэг"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0" side="bottom" align="start">
                <div className="p-2 border-b border-border">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    <Input
                      autoFocus
                      value={tagSearch}
                      onChange={(e) => setTagSearch(e.target.value)}
                      placeholder="Поиск тэга или категории..."
                      className="h-7 pl-7 text-xs"
                    />
                  </div>
                </div>
                <div className="max-h-72 overflow-y-auto p-1">
                  {grouped.length === 0 && (
                    <p className="text-xs text-muted-foreground px-2 py-3 text-center">Ничего не найдено</p>
                  )}
                  {grouped.map((g) => (
                    <div key={g.path} className="mb-1.5 last:mb-0">
                      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                        {g.path}
                      </div>
                      {g.tags.map((tag) => {
                        const checked = linkedSet.has(tag.id);
                        return (
                          <button
                            key={tag.id}
                            onClick={() => toggleTag(tag.id)}
                            className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors text-left"
                          >
                            <span
                              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                checked ? "bg-primary border-primary text-primary-foreground" : "border-border"
                              }`}
                            >
                              {checked && <Check className="h-3 w-3" />}
                            </span>
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: tag.color || "#6366f1" }}
                            />
                            <span className="truncate">{tag.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
                {linkedTagIds.length > 0 && (
                  <div className="border-t border-border px-2 py-1.5 text-[11px] text-muted-foreground flex items-center justify-between">
                    <span>Выбрано: {linkedTagIds.length}</span>
                    <span>{countLoading ? "…" : `${matchCount} задач`}</span>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>

          <p className="text-[11px] text-muted-foreground">
            {linkedTagIds.length === 0
              ? "Привяжите хотя бы один тег — иначе линза пуста."
              : countLoading
              ? "Считаем задачи…"
              : `Найдено задач: ${matchCount} (OR по ${linkedTagIds.length} тэгам)`}
          </p>
        </div>
      )}
    </div>
  );
}