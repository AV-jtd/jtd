import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FileText } from "lucide-react";
import { isPast, parseISO, format } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useTasks, useTaskGroups, useAvailableUsers } from "@/hooks/useTasks";

/**
 * Секция «Из протоколов» — задачи, физически живущие в группах protocol,
 * но привязанные к данному проекту (или его подпроектам) через
 * status_meta.linked_project_id.
 *
 * Используется на странице проекта (PMO/NPD) — независимо от вида
 * (Dashboard/Gantt/Matrix), компонент сам подгружает данные.
 *
 * variant="card" — оформлена в виде самостоятельной карточки (для дашборда).
 * variant="inline" — без рамки (для встраивания в Gantt-сайдбар).
 */
export default function LinkedProtocolTasksSection({
  projectId,
  variant = "card",
  limit = 10,
}: {
  projectId: string;
  variant?: "card" | "inline";
  limit?: number;
}) {
  const navigate = useNavigate();
  const { data: groups = [] } = useTaskGroups();
  const { data: allTasks = [] } = useTasks();
  const { data: users = [] } = useAvailableUsers();

  const allIds = useMemo(() => {
    const childIds = groups.filter(g => g.parent_id === projectId).map(g => g.id);
    return new Set<string>([projectId, ...childIds]);
  }, [groups, projectId]);

  const protocolGroupById = useMemo(() => {
    const m = new Map<string, any>();
    groups.forEach(g => { if ((g as any).project_type === "protocol") m.set(g.id, g); });
    return m;
  }, [groups]);

  const linked = useMemo(() => {
    return allTasks.filter(t => {
      const lp = (t as any).status_meta?.linked_project_id as string | undefined;
      if (!lp || !allIds.has(lp)) return false;
      return t.group_id ? protocolGroupById.has(t.group_id) : false;
    });
  }, [allTasks, allIds, protocolGroupById]);

  if (linked.length === 0) return null;

  const userName = (uid: string | null) => uid ? (users.find(u => u.id === uid)?.display_name || null) : null;
  const initials = (uid: string | null) => uid ? (users.find(u => u.id === uid)?.display_name || "?").slice(0, 2).toUpperCase() : "";

  const rows = linked.slice(0, limit).map(t => {
    const proto = t.group_id ? protocolGroupById.get(t.group_id) : null;
    const isOver = !t.is_completed && t.deadline && isPast(parseISO(t.deadline));
    return (
      <button
        key={t.id}
        onClick={() => proto && navigate(`/protocols/${proto.id}`)}
        className="w-full flex items-center gap-2.5 py-1.5 px-2 -mx-2 rounded-md hover:bg-secondary/50 transition-colors text-left"
        title={proto ? `Открыть протокол: ${proto.name}` : undefined}
      >
        <FileText className="h-3 w-3 shrink-0 text-primary/60" />
        <span className={cn("text-[13px] truncate flex-1", isOver ? "text-destructive" : t.is_completed ? "text-muted-foreground line-through" : "text-foreground")}>
          {t.title}
        </span>
        {proto && (
          <span className="text-[10px] text-muted-foreground truncate max-w-[140px] shrink-0">{proto.name}</span>
        )}
        {initials(t.assigned_to) && (
          <div className="w-[18px] h-[18px] rounded-full bg-muted flex items-center justify-center shrink-0" title={userName(t.assigned_to) || ""}>
            <span className="text-[7px] font-medium text-muted-foreground leading-none">{initials(t.assigned_to)}</span>
          </div>
        )}
        {t.deadline && (
          <span className={cn("text-[10px] tabular-nums shrink-0", isOver ? "text-destructive" : "text-muted-foreground")}>
            {format(parseISO(t.deadline), "d MMM", { locale: ru })}
          </span>
        )}
      </button>
    );
  });

  const moreCount = linked.length - rows.length;

  if (variant === "inline") {
    return (
      <div className="space-y-px">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-primary">Из протоколов</span>
          <span className="text-[10px] text-muted-foreground tabular-nums">{linked.length}</span>
        </div>
        {rows}
        {moreCount > 0 && <div className="text-[10px] text-muted-foreground pl-7 pt-1">ещё +{moreCount}</div>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/50 bg-card px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-primary">Из протоколов</span>
        <span className="text-[10px] text-muted-foreground tabular-nums">{linked.length}</span>
      </div>
      <div className="space-y-px">{rows}</div>
      {moreCount > 0 && <div className="text-[10px] text-muted-foreground pl-7 pt-1">ещё +{moreCount}</div>}
    </div>
  );
}