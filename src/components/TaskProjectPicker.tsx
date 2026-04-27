import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTaskGroups } from "@/hooks/useTasks";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FolderOpen, Plus, Loader2, Search, FolderInput } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  /** Currently attributed group (project) id */
  attributedGroupId: string | null | undefined;
  /** Called with new group id (or null to detach). Should persist to DB. */
  onChange: (groupId: string | null) => void;
  /** Hide projects of these types from picker (e.g. ["protocol"]) */
  excludeTypes?: string[];
  /** Optional className for trigger button */
  buttonClassName?: string;
  /** Optional title attribute override */
  title?: string;
  /** Compact label or icon-only */
  variant?: "icon" | "label";
}

/**
 * Picker for attributing a (protocol) task to a destination project.
 * - The task itself stays in its protocol group; this only sets `attributed_group_id`.
 * - Searchable list of existing projects; inline-create when not found.
 * - Skips groups of excluded types (protocols themselves).
 */
export default function TaskProjectPicker({
  attributedGroupId, onChange, excludeTypes = ["protocol"], buttonClassName, title, variant = "label",
}: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: groups = [] } = useTaskGroups();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");

  const candidates = useMemo(
    () => groups.filter((g: any) =>
      !excludeTypes.includes(g.project_type) && !g.closed_at
    ),
    [groups, excludeTypes],
  );

  const linked = useMemo(
    () => (attributedGroupId ? groups.find((g) => g.id === attributedGroupId) ?? null : null),
    [attributedGroupId, groups],
  );

  const trimmedSearch = search.trim();
  const lowered = trimmedSearch.toLowerCase();
  const exactMatch = useMemo(
    () => candidates.find((g) => g.name.trim().toLowerCase() === lowered),
    [candidates, lowered],
  );
  const showCreate = trimmedSearch.length >= 2 && !exactMatch;

  const filtered = useMemo(() => {
    if (!trimmedSearch) return candidates.slice(0, 50);
    return candidates
      .filter((g) => g.name.toLowerCase().includes(lowered))
      .slice(0, 50);
  }, [candidates, trimmedSearch, lowered]);

  const createProject = async () => {
    if (!user || !trimmedSearch || creating) return;
    setCreating(true);
    try {
      // 1) auto-tag, like the standard addGroup flow
      const { data: tagData, error: tagErr } = await supabase
        .from("tags")
        .insert({ name: trimmedSearch, user_id: user.id, color: "#3b82f6" })
        .select()
        .single();
      if (tagErr) throw tagErr;

      const { data: groupData, error: gErr } = await supabase
        .from("task_groups")
        .insert({
          name: trimmedSearch,
          user_id: user.id,
          linked_tag_id: tagData.id,
        } as any)
        .select()
        .single();
      if (gErr) throw gErr;

      // 2) creator becomes owner-member
      await supabase.from("group_members").insert({
        group_id: groupData.id,
        user_id: user.id,
        invited_by: user.id,
        role: "owner",
      });

      await qc.invalidateQueries({ queryKey: ["task_groups"] });
      onChange(groupData.id);
      toast.success(`Проект «${trimmedSearch}» создан`);
      setOpen(false);
      setSearch("");
    } catch (e: any) {
      toast.error(e?.message || "Не удалось создать проект");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }}>
      <PopoverTrigger asChild>
        {variant === "icon" ? (
          <button
            className={cn(
              "p-1.5 rounded transition-colors",
              linked ? "text-primary" : "text-muted-foreground hover:text-primary",
              buttonClassName,
            )}
            title={title ?? (linked ? `Проект: ${linked.name}` : "Привязать к проекту")}
          >
            <FolderInput className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            className={cn(
              "block w-full text-left text-sm transition-colors hover:underline truncate",
              linked ? "text-foreground" : "text-muted-foreground italic",
              buttonClassName,
            )}
            title={title ?? (linked ? `Проект: ${linked.name}` : "Привязать к проекту")}
          >
            {linked ? (
              <span className="inline-flex items-center gap-1">
                <span className="text-base leading-none">{(linked as any).icon || "📁"}</span>
                <span className="truncate">{linked.name}</span>
              </span>
            ) : (
              "—"
            )}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2 bg-popover border-border z-50" align="start">
        {linked && (
          <div className="mb-2 px-2 py-1.5 rounded bg-primary/5 border border-primary/20">
            <div className="text-xs font-medium text-primary truncate flex items-center gap-1">
              <FolderOpen className="h-3 w-3" />
              {linked.name}
            </div>
          </div>
        )}
        <div className="relative mb-1.5">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Найти или создать проект…"
            className="w-full pl-7 pr-2 py-1.5 text-xs bg-muted/50 border border-border rounded outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-56 overflow-y-auto space-y-0.5 overscroll-contain">
          {filtered.length === 0 && !showCreate && (
            <p className="text-xs text-muted-foreground px-2 py-1">Не найдено</p>
          )}
          {filtered.map((g) => (
            <button
              key={g.id}
              onClick={() => {
                onChange(g.id);
                setOpen(false);
              }}
              className={cn(
                "flex items-center gap-1.5 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors text-left",
                attributedGroupId === g.id && "bg-primary/10 text-primary",
              )}
            >
              <span className="text-base leading-none">{(g as any).icon || "📁"}</span>
              <span className="truncate flex-1">{g.name}</span>
            </button>
          ))}
        </div>
        {showCreate && (
          <button
            onClick={createProject}
            disabled={creating}
            className="mt-1 flex items-center gap-1.5 w-full px-2 py-1.5 rounded text-xs text-primary hover:bg-primary/10 transition-colors border-t border-border pt-1.5"
          >
            {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Создать проект «{trimmedSearch}»
          </button>
        )}
        {linked && (
          <button
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="mt-1 text-xs text-destructive hover:underline w-full text-left px-2 py-1 border-t border-border pt-1.5"
          >
            Отвязать проект
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}