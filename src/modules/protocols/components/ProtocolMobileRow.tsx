import { format, isPast, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { AlertTriangle, Calendar, Circle, User2, ChevronRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { Task, Profile } from "@/hooks/useTasks";
import type { ProtocolStatusTag } from "@/hooks/useProtocolStatuses";

type Props = {
  task: Task;
  index: number;
  users: Profile[];
  statuses: ProtocolStatusTag[];
  onToggleComplete: () => void;
  onOpen: () => void;
};

/**
 * Мобильная карточка строки протокола.
 * Тап по карточке открывает Bottom Sheet с полным редактором (TaskItem).
 * Чекбокс не пробрасывает клик дальше — отметка «Закрыто» работает локально.
 */
export default function ProtocolMobileRow({
  task, index, users, statuses, onToggleComplete, onOpen,
}: Props) {
  const overdue = !task.is_completed && task.deadline && isPast(parseISO(task.deadline));
  const assignee = task.assigned_to ? users.find((u) => u.id === task.assigned_to) : null;
  const externalRef = (task.external_assignee as any) as
    | { name?: string; organization?: string; role?: string }
    | null;
  const taskTagIds = new Set((task.task_tags ?? []).map((tt) => tt.tag_id));
  const currentStatus = statuses.find((s) => taskTagIds.has(s.id)) ?? null;

  const assigneeLabel = assignee
    ? assignee.display_name || "Без имени"
    : externalRef?.name
      ? externalRef.organization && externalRef.organization !== externalRef.name
        ? `${externalRef.organization} · ${externalRef.name}`
        : externalRef.name
      : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group flex w-full items-start gap-2 border-b border-border/60 bg-card px-3 py-2.5 text-left transition-colors active:bg-muted/40",
        task.is_completed && "opacity-60",
      )}
    >
      {/* Index */}
      <span className="mt-0.5 w-5 shrink-0 text-center text-[11px] tabular-nums text-muted-foreground">
        {index}
      </span>

      {/* Checkbox */}
      <span
        className="mt-0.5 shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          onToggleComplete();
        }}
      >
        <Checkbox checked={task.is_completed} aria-label="Закрыто" />
      </span>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "text-sm leading-snug text-foreground",
            task.is_completed && "line-through text-muted-foreground",
          )}
        >
          {task.title}
        </div>

        {/* Meta chips: assignee · deadline · status */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span
            className={cn(
              "inline-flex max-w-[55%] items-center gap-1 rounded-md px-1.5 py-0.5",
              assigneeLabel ? "bg-muted text-foreground" : "text-muted-foreground/70 italic",
            )}
          >
            <User2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{assigneeLabel ?? "Назначить"}</span>
          </span>

          {task.deadline && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5",
                overdue
                  ? "bg-destructive/10 font-medium text-destructive"
                  : "bg-muted text-foreground",
              )}
            >
              {overdue ? <AlertTriangle className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
              {format(parseISO(task.deadline), "d MMM", { locale: ru })}
            </span>
          )}

          {currentStatus && (
            <span
              className="inline-flex max-w-[40%] items-center gap-1 rounded-md border px-1.5 py-0.5"
              style={{
                backgroundColor: `${currentStatus.color}1f`,
                color: currentStatus.color ?? undefined,
                borderColor: `${currentStatus.color}40`,
              }}
            >
              <Circle className="h-2.5 w-2.5 fill-current" />
              <span className="truncate">{currentStatus.name}</span>
            </span>
          )}
        </div>
      </div>

      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/50 group-active:text-foreground" />
    </button>
  );
}
