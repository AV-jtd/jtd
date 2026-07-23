import React from "react";
import { cn } from "@/lib/utils";
import { Check, Clock, AlertTriangle, Minus, Flag, Medal, Plus, Ban, Loader } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
  ContextMenuLabel, ContextMenuSeparator,
} from "@/components/ui/context-menu";
import type { Task } from "@/hooks/useTasks";
import { useToggleKmStage, useCreateKmStage, useShiftKmStageDate, useSetKmStageStatus } from "../hooks/useKmProjects";
import KmStageDatePopover from "./KmStageDatePopover";
import type { KmStageStatus } from "../lib/stages";

type CellStatus = "done" | "overdue" | "blocked" | "in_progress" | "current" | "open";

/** Derive the visual status of a stage cell from completion + stage_status. */
function deriveCellStatus(task: Task, isCurrent: boolean): CellStatus {
  const overdue = !task.is_completed && !!task.deadline && new Date(task.deadline) < new Date();
  const ss = (task as any).stage_status as KmStageStatus | null | undefined;
  if (task.is_completed) return "done";
  if (overdue) return "overdue";
  if (ss === "blocked") return "blocked";
  if (ss === "in_progress") return "in_progress";
  if (isCurrent) return "current";
  return "open";
}

const STATUS_LABEL: Record<CellStatus, string> = {
  done: "Готово",
  overdue: "Просрочено",
  blocked: "Заблокирован",
  in_progress: "В работе",
  current: "Текущий этап",
  open: "Ожидает",
};

/** Right-click menu to set a stage's workflow status. */
function StageStatusMenu({ task, children }: { task: Task; children: React.ReactNode }) {
  const setStatus = useSetKmStageStatus();
  const cur = (task as any).stage_status as KmStageStatus | null | undefined;
  const pick = (status: KmStageStatus) => setStatus.mutate({ taskId: task.id, status });
  const Item = ({ status, icon: Icon, label, tone }: { status: KmStageStatus; icon: React.ElementType; label: string; tone?: string }) => (
    <ContextMenuItem
      onClick={() => pick(status)}
      className={cn("gap-2 text-xs", tone)}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      {(cur === status || (status === "done" && task.is_completed)) && (
        <Check className="h-3 w-3 ml-auto text-primary" />
      )}
    </ContextMenuItem>
  );
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Статус этапа
        </ContextMenuLabel>
        <ContextMenuSeparator />
        <Item status="pending" icon={Minus} label="Ожидает" />
        <Item status="in_progress" icon={Loader} label="В работе" tone="text-primary" />
        <Item status="blocked" icon={Ban} label="Заблокирован" tone="text-warning" />
        <Item status="done" icon={Check} label="Готово" tone="text-success" />
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Small icon for a milestone marker: flag for regular gates, medal for the final one. */
function MilestoneIcon({ milestone, className }: { milestone: "flag" | "medal"; className?: string }) {
  return milestone === "medal" ? <Medal className={className} /> : <Flag className={className} />;
}

interface Props {
  task: Task | null;
  isCurrent: boolean;
  milestone?: "flag" | "medal";
  milestoneLabel?: string;
  /** Required for the "create stage" popover when task is null. */
  groupId?: string;
  stageKey?: string;
  stageTitle?: string;
  /** Compact mode: render a small status dot instead of the full tile. */
  compact?: boolean;
}

/**
 * Single matrix cell for one SKU × one stage.
 * Milestone stages ("flag" or the final "medal") additionally render the
 * deadline date and a drift indicator (↗+Nд) so the user can immediately see
 * the shift of key dates.
 *
 * Interaction model:
 * - Empty cell  → click opens "create stage" popover (date picker).
 * - Filled cell → click on date label opens "shift date" popover (cascades).
 *               → click on icon area toggles completion.
 */
function KmMatrixCellInner({ task, isCurrent, milestone, milestoneLabel, groupId, stageKey, stageTitle, compact }: Props) {
  const toggle = useToggleKmStage();
  const createStage = useCreateKmStage();
  const shiftDate = useShiftKmStageDate();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [shiftOpen, setShiftOpen] = React.useState(false);

  // ---- Compact (dense) rendering: a single status dot, click toggles ----
  if (compact) {
    if (!task) {
      const canCreate = !!groupId && !!stageKey;
      return (
        <KmStageDatePopover
          open={createOpen}
          onOpenChange={(o) => canCreate && setCreateOpen(o)}
          title={stageTitle ? `Создать этап «${stageTitle}»` : "Создать этап"}
          submitLabel="Создать"
          onSubmit={(date) => {
            if (canCreate) createStage.mutate({ groupId: groupId!, stageKey: stageKey!, deadline: date });
          }}
          anchor={
            <button
              type="button"
              disabled={!canCreate}
              title={stageTitle}
              className={cn(
                "h-full w-full flex items-center justify-center group",
              )}
              aria-label="Создать этап"
            >
              <span className={cn(
                "h-2 w-2 rounded-full border border-dashed transition-colors",
                milestone ? "border-primary/60" : "border-border group-hover:border-primary/60",
              )} />
            </button>
          }
        />
      );
    }
    const cStatus = deriveCellStatus(task, isCurrent);
    const dotClass =
      cStatus === "done" ? "bg-success"
      : cStatus === "overdue" ? "bg-destructive"
      : cStatus === "blocked" ? "bg-warning"
      : cStatus === "in_progress" ? "bg-primary"
      : cStatus === "current" ? "bg-primary"
      : "bg-muted-foreground/30";
    const cTip = STATUS_LABEL[cStatus];
    return (
      <StageStatusMenu task={task}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggle.mutate({ taskId: task.id, isCompleted: !task.is_completed }); }}
              className="relative h-full w-full flex items-center justify-center"
              aria-label={`${task.title}: ${cTip}`}
            >
              <span className={cn(
                "h-2.5 w-2.5 rounded-full transition-transform hover:scale-125",
                dotClass,
                (cStatus === "current" || cStatus === "in_progress" || cStatus === "blocked") && "ring-2 ring-primary/30",
                (cStatus === "in_progress" || cStatus === "blocked") && "animate-pulse",
                milestone && "rounded-[2px] rotate-45",
              )} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            <div className="font-medium">{milestone === "medal" ? "🏅 " : milestone === "flag" ? "🚩 " : ""}{task.title}</div>
            <div className="text-muted-foreground">
              {cTip}{task.deadline ? ` · до ${new Date(task.deadline).toLocaleDateString("ru-RU")}` : ""}
            </div>
            <div className="text-[10px] text-muted-foreground/70 mt-0.5 italic">ПКМ — статус</div>
          </TooltipContent>
        </Tooltip>
      </StageStatusMenu>
    );
  }

  if (!task) {
    // Empty cell — click opens create-stage popover.
    const canCreate = !!groupId && !!stageKey;
    return (
      <KmStageDatePopover
        open={createOpen}
        onOpenChange={(o) => canCreate && setCreateOpen(o)}
        title={stageTitle ? `Создать этап «${stageTitle}»` : "Создать этап"}
        submitLabel="Создать"
        onSubmit={(date) => {
          if (canCreate) {
            createStage.mutate({ groupId: groupId!, stageKey: stageKey!, deadline: date });
          }
        }}
        anchor={
          <button
            type="button"
            disabled={!canCreate}
            className={cn(
              "group h-full w-full flex flex-col items-center justify-center gap-0.5 rounded-md transition-all px-1 py-1",
              "border border-dashed border-border/60 hover:border-primary/50 hover:bg-primary/5",
              milestone ? "text-primary/70" : "text-muted-foreground/40 hover:text-primary",
            )}
            aria-label="Создать этап"
          >
            {milestone && <MilestoneIcon milestone={milestone} className="h-3 w-3 text-primary" />}
            {!milestone && (
              <>
                <Plus className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                <Minus className="h-3 w-3 group-hover:hidden" />
              </>
            )}
            {milestone && (
              <div className="text-[9px] tabular-nums font-mono italic text-primary/60 leading-none">
                нет даты
              </div>
            )}
            {milestone && milestoneLabel && (
              <div className="text-[9px] uppercase tracking-wider text-primary font-semibold leading-none">
                {milestoneLabel}
              </div>
            )}
          </button>
        }
      />
    );
  }

  const status = deriveCellStatus(task, isCurrent);
  const tipLabel = STATUS_LABEL[status];

  // Drift: positive shift in days from original_deadline
  const driftDays = task.deadline && (task as any).original_deadline
    ? Math.round(
        (new Date(task.deadline).getTime() - new Date((task as any).original_deadline).getTime()) /
          86400000,
      )
    : 0;

  const dateLabel = task.deadline
    ? new Date(task.deadline).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" })
    : null;

  return (
    <>
      <StageStatusMenu task={task}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "group h-full w-full flex flex-col items-center justify-center gap-0.5 rounded-md transition-all px-1 py-1 cursor-pointer",
              "border",
              status === "done" && "bg-success/10 border-success/30 text-success",
              status === "overdue" && "bg-destructive/10 border-destructive/30 text-destructive",
              status === "blocked" && "bg-warning/10 border-warning/40 text-warning",
              status === "in_progress" && "bg-primary/10 border-primary/50 text-primary ring-1 ring-primary/20",
              status === "current" && "bg-primary/10 border-primary/40 text-primary",
              status === "open" && "bg-card border-border hover:bg-muted/50 text-muted-foreground",
              milestone && "ring-1 ring-primary/30",
            )}
            aria-label={`${task.title}: ${tipLabel}`}
          >
            {/* Icon area — click toggles completion */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggle.mutate({ taskId: task.id, isCompleted: !task.is_completed });
              }}
              className="flex items-center gap-1 leading-none"
              aria-label={status === "done" ? "Снять отметку" : "Отметить как выполнено"}
            >
              {milestone && <MilestoneIcon milestone={milestone} className="h-2.5 w-2.5 text-primary" />}
              {status === "done" && <Check className="h-3.5 w-3.5" />}
              {status === "overdue" && <AlertTriangle className="h-3.5 w-3.5" />}
              {status === "blocked" && <Ban className="h-3.5 w-3.5" />}
              {status === "in_progress" && <Loader className="h-3.5 w-3.5 animate-pulse" />}
              {status === "current" && <Clock className="h-3.5 w-3.5" />}
              {status === "open" && !milestone && <Minus className="h-3 w-3 opacity-50" />}
            </button>
            {/* Date label — click opens shift popover */}
            {dateLabel && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShiftOpen(true); }}
                className={cn(
                  "text-[10px] tabular-nums leading-none px-1 py-0.5 rounded hover:ring-1 hover:ring-primary/40",
                  milestone && "text-primary font-semibold bg-primary/10",
                  !milestone && status === "done" && "text-success font-medium",
                  !milestone && status === "overdue" && "text-destructive font-semibold",
                  !milestone && status === "blocked" && "text-warning font-semibold",
                  !milestone && status === "in_progress" && "text-primary font-medium",
                  !milestone && status === "current" && "text-primary font-medium",
                  !milestone && status === "open" && "text-muted-foreground font-medium",
                )}
              >
                {dateLabel}
              </button>
            )}
            {driftDays > 0 && (
              <div className="text-[8px] font-mono text-warning leading-none border-b border-dashed border-warning/60">
                ↗+{driftDays}д
              </div>
            )}
            {milestone && milestoneLabel && (
              <div className="text-[8px] uppercase tracking-wider text-primary/80 font-semibold leading-none">
                {milestoneLabel}
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <div className="font-medium">
            {milestone === "medal" ? "🏅 " : milestone === "flag" ? "🚩 " : ""}{task.title}
          </div>
          <div className="text-muted-foreground">
            {tipLabel}{task.deadline ? ` · до ${new Date(task.deadline).toLocaleDateString("ru-RU")}` : ""}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1 italic">
            Клик — готово · ПКМ — статус · дата — перенос
          </div>
          {driftDays > 0 && (
            <div className="text-warning">Смещение: +{driftDays} дн от плана</div>
          )}
        </TooltipContent>
      </Tooltip>
      </StageStatusMenu>
      {/* Shift-date popover; uses an invisible anchor positioned over the cell. */}
      <KmStageDatePopover
        open={shiftOpen}
        onOpenChange={setShiftOpen}
        title={`Перенести «${task.title}»`}
        submitLabel="Перенести"
        initialDate={task.deadline ? new Date(task.deadline) : undefined}
        onSubmit={(date) => shiftDate.mutate({ taskId: task.id, newDeadline: date, cascade: true })}
        anchor={<span className="sr-only" aria-hidden />}
      />
    </>
  );
}

export const KmMatrixCell = React.memo(KmMatrixCellInner);
