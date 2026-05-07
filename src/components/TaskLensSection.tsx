import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * "Видна также в" — read-only секция в раскрытой детали задачи.
 *
 * Линза — проект с view_mode='lens' и набором привязанных тегов
 * (task_group_linked_tags, OR-логика). Если хотя бы один тег задачи
 * входит в этот набор — линза показывается.
 *
 * Также учитываем legacy task_groups.linked_tag_id (single-tag),
 * чтобы не сломать ранее созданные линзы во время миграции.
 */
export default function TaskLensSection({ taskTagIds }: { taskTagIds: string[] }) {
  const tagIdsKey = useMemo(() => [...taskTagIds].sort().join(","), [taskTagIds]);

  const { data: lenses = [] } = useQuery({
    queryKey: ["task-lens-projects", tagIdsKey],
    enabled: taskTagIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      // 1) m:n linked tags
      const { data: links, error: linksErr } = await supabase
        .from("task_group_linked_tags")
        .select("group_id")
        .in("tag_id", taskTagIds);
      if (linksErr) throw linksErr;
      const idsFromLinks = Array.from(new Set((links ?? []).map((r: any) => r.group_id)));

      // 2) legacy single linked_tag_id
      const { data: legacy, error: legacyErr } = await supabase
        .from("task_groups")
        .select("id")
        .eq("view_mode", "lens")
        .in("linked_tag_id", taskTagIds);
      if (legacyErr) throw legacyErr;
      const idsFromLegacy = (legacy ?? []).map((r: any) => r.id);

      const allIds = Array.from(new Set([...idsFromLinks, ...idsFromLegacy]));
      if (allIds.length === 0) return [];

      const { data, error } = await supabase
        .from("task_groups")
        .select("id, name, icon, color, logo_url")
        .eq("view_mode", "lens")
        .in("id", allIds);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        name: string;
        icon: string | null;
        color: string | null;
        logo_url: string | null;
      }>;
    },
  });

  if (lenses.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        <Eye className="h-3 w-3" />
        Видна также в
      </div>
      <div className="flex flex-wrap gap-1.5">
        {lenses.map((l) => (
          <Link
            key={l.id}
            to={`/?group=${l.id}`}
            className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border border-border bg-muted/30 hover:bg-muted hover:border-foreground/20 transition-colors"
            title="Линза-проект (виртуальная проекция по тегу)"
          >
            {l.logo_url ? (
              <img src={l.logo_url} alt="" className="h-3.5 w-3.5 rounded object-cover" />
            ) : (
              <span className="text-[12px] leading-none">{l.icon && l.icon !== "list" ? l.icon : "👁"}</span>
            )}
            <span className="truncate max-w-[160px]">{l.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}