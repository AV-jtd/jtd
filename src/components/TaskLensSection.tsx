import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * "Видна также в" — read-only секция в раскрытой детали задачи.
 *
 * Показывает проекты с view_mode='lens', чей linked_tag_id присутствует
 * в task_tags задачи. Это даёт двунаправленную навигацию: задача знает,
 * через какие линзы (Качество, Азиатская линейка и т.п.) её увидят.
 *
 * Не показывается если линз нет или у задачи нет тегов.
 */
export default function TaskLensSection({ taskTagIds }: { taskTagIds: string[] }) {
  const tagIdsKey = useMemo(() => [...taskTagIds].sort().join(","), [taskTagIds]);

  const { data: lenses = [] } = useQuery({
    queryKey: ["task-lens-projects", tagIdsKey],
    enabled: taskTagIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_groups")
        .select("id, name, icon, color, logo_url, linked_tag_id")
        .eq("view_mode", "lens")
        .in("linked_tag_id", taskTagIds);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        name: string;
        icon: string | null;
        color: string | null;
        logo_url: string | null;
        linked_tag_id: string | null;
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