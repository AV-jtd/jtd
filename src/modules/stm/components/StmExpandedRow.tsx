import React, { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { GanttChart, ChevronDown, ChevronRight, MessageSquare, MessagesSquare } from "lucide-react";
import TaskItem from "@/components/TaskItem";
import ProjectChat from "@/components/ProjectChat";
import type { Task } from "@/hooks/useTasks";
import { REWORK_RISK_THRESHOLD, type StmStage } from "../lib/stages";
import type { StmProject } from "../hooks/useStmProjects";
import { StmOpsTasks } from "./StmOpsTasks";
import { patchGroupInCache, restoreGroupSnapshots } from "../lib/stmCache";
import { stmTimeInStage, isStmProjectBlocked, isStmProjectStuck } from "../lib/stmAnalytics";

/**
 * Inline-editable STM meta chip (Сеть / Бренд / Проект / Дроп).
 * Click to edit → updates task_groups.stm_meta[field] with optimistic cache patch,
 * so existing SKUs can be (re)grouped without recreating them.
 */
function StmMetaChip({
  group,
  meta,
  field,
  label,
  placeholder,
}: {
  group: StmProject["group"];
  meta: StmProject["meta"];
  field: "retailer" | "brand" | "project" | "drop";
  label: string;
  placeholder: string;
}) {
  const qc = useQueryClient();
  const current = (meta?.[field] as string | undefined) ?? "";
  const [draft, setDraft] = useState(current);
  const [editing, setEditing] = useState(false);
  useEffect(() => { setDraft(current); }, [group.id, current]);

  const save = useMutation({
    mutationFn: async (text: string) => {
      const nextMeta: any = { ...(meta || {}) };
      if (text) nextMeta[field] = text; else delete nextMeta[field];
      const { error } = await supabase
        .from("task_groups")
        .update({ stm_meta: nextMeta })
        .eq("id", group.id);
      if (error) throw error;
      return nextMeta;
    },
    onMutate: async (text: string) => {
      const nextMeta: any = { ...(meta || {}) };
      if (text) nextMeta[field] = text; else delete nextMeta[field];
      const snapshots = patchGroupInCache(qc, group.id, { stm_meta: nextMeta } as any);
      return { snapshots };
    },
    onError: (_e, _v, ctx: any) => {
      if (ctx?.snapshots) restoreGroupSnapshots(qc, ctx.snapshots);
    },
  });

  const commit = () => {
    setEditing(false);
    if (draft.trim() !== current) save.mutate(draft.trim());
  };

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-mono uppercase tracking-widest text-stm-fg/40">{label}</span>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setDraft(current); setEditing(false); }
            if (e.key === "Enter") commit();
          }}
          placeholder={placeholder}
          className="h-6 bg-stm-glass/30 border border-stm-accent/40 rounded px-2 text-xs text-stm-fg placeholder:text-stm-fg/30 focus:outline-none focus:ring-1 focus:ring-stm-accent/60 w-40"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={cn(
            "text-xs px-2 py-0.5 rounded border transition-colors",
            current
              ? "text-stm-accent border-stm-accent/30 bg-stm-accent/10 hover:bg-stm-accent/20"
              : "text-stm-fg/40 border-stm-border/40 hover:text-stm-accent hover:border-stm-accent/30 italic",
          )}
        >
          {current || "не задан"}
        </button>
      )}
    </div>
  );
}

interface Props {
  project: StmProject;
  stages: StmStage[];
  onOpenGantt?: (groupId: string) => void;
  activeStageKey?: string | null;
  onActiveStageChange?: (stageKey: string | null) => void;
}

const RU_DATE = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) : null;

const RU_DATE_LONG = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "2-digit" }) : "—";

/** Drift in days between original_deadline and current deadline. */
function calcDrift(task: Task | null): number | null {
  if (!task?.deadline || !(task as any).original_deadline) return null;
  const cur = new Date(task.deadline).getTime();
  const orig = new Date((task as any).original_deadline).getTime();
  if (isNaN(cur) || isNaN(orig)) return null;
  return Math.round((cur - orig) / 86_400_000);
}

function initialsFromName(name?: string | null): string {
  if (!name) return "—";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() ?? "")
    .join("") || name.slice(0, 2).toUpperCase();
}

/**
 * Chronograph-style expanded SKU row. Shows:
 * - top header: total timeline (start → finish + days remaining + global drift)
 * - top progress strip (PMO Stripe roadmap)
 * - 12-column grid: each stage with index, status dot, title, assignee initials, due date
 * - clicking a stage cell expands its TaskItem inline (full edit: steps, comments, deadline, assignee)
 */
function StmExpandedRowInner({ project, stages, onOpenGantt, activeStageKey: controlledStageKey, onActiveStageChange }: Props) {
  const { group, meta, stageTasks, currentStageKey, progress } = project;
  // Active stage is controlled via URL (?stage=...). Fall back to current stage when nothing is set.
  const activeStageKey = controlledStageKey ?? currentStageKey;
  const setActiveStageKey = (next: string | null) => onActiveStageChange?.(next);

  // ---- Per-SKU chat toggle (group_messages backed via ProjectChat) ----
  const [showChat, setShowChat] = useState(false);

  // ---- Auto-advance: when the active stage gets completed, jump to the next open stage. ----
  useEffect(() => {
    if (!activeStageKey) return;
    const active = stageTasks.find(t => (t as any).stage_key === activeStageKey);
    if (!active?.is_completed) return;
    const idx = stages.findIndex(s => s.key === activeStageKey);
    for (let i = idx + 1; i < stages.length; i++) {
      const next = stageTasks.find(t => (t as any).stage_key === stages[i].key);
      if (next && !next.is_completed) {
        // Defer to next tick to avoid setState-during-render warnings.
        const id = window.setTimeout(() => onActiveStageChange?.(stages[i].key), 0);
        return () => window.clearTimeout(id);
      }
    }
  }, [activeStageKey, stageTasks, stages, onActiveStageChange]);

  // ---- Inline-editable SKU comment (stored in task_groups.description) ----
  const qc = useQueryClient();
  const [commentDraft, setCommentDraft] = useState<string>(group.description ?? "");
  const [editingComment, setEditingComment] = useState(false);
  useEffect(() => { setCommentDraft(group.description ?? ""); }, [group.id, group.description]);
  const saveComment = useMutation({
    mutationFn: async (text: string) => {
      const { error } = await supabase
        .from("task_groups")
        .update({ description: text || null })
        .eq("id", group.id);
      if (error) throw error;
    },
    // Invalidation is handled by the optimistic patch in StmMatrixRow already;
    // expanded-row mirror just patches its own snapshot for consistency.
    onMutate: async (text: string) => {
      const snapshots = patchGroupInCache(qc, group.id, { description: text || null } as any);
      return { snapshots };
    },
    onError: (_e, _v, ctx: any) => {
      if (ctx?.snapshots) restoreGroupSnapshots(qc, ctx.snapshots);
    },
  });
  const commitComment = () => {
    setEditingComment(false);
    if ((commentDraft || "") !== (group.description || "")) {
      saveComment.mutate(commentDraft.trim());
    }
  };

  // ---- Profiles cache for assignee initials ----
  const assigneeIds = useMemo(() => {
    const set = new Set<string>();
    stageTasks.forEach(t => { if (t.assigned_to) set.add(t.assigned_to); });
    return Array.from(set);
  }, [stageTasks]);

  const { data: profileMap = new Map<string, string>() } = useQuery({
    queryKey: ["stm-profiles", assigneeIds.sort().join(",")],
    queryFn: async () => {
      if (!assigneeIds.length) return new Map<string, string>();
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", assigneeIds);
      return new Map((data ?? []).map(p => [p.id, p.display_name || p.email || "?"]));
    },
    enabled: assigneeIds.length > 0,
    staleTime: 60_000,
  });

  // ---- Total timeline (min start, max deadline) ----
  const { startIso, finishIso, daysLeft, globalDrift } = useMemo(() => {
    const starts = stageTasks
      .map(t => t.start_at ? new Date(t.start_at).getTime() : null)
      .filter((v): v is number => v != null);
    const ends = stageTasks
      .map(t => t.deadline ? new Date(t.deadline).getTime() : null)
      .filter((v): v is number => v != null);
    const minStart = starts.length ? Math.min(...starts) : null;
    const maxEnd = ends.length ? Math.max(...ends) : null;
    const today = Date.now();
    const left = maxEnd ? Math.ceil((maxEnd - today) / 86_400_000) : null;
    const drifts = stageTasks.map(t => calcDrift(t)).filter((v): v is number => v != null && v > 0);
    const drift = drifts.length ? drifts.reduce((s, v) => s + v, 0) : 0;
    return {
      startIso: minStart ? new Date(minStart).toISOString() : null,
      finishIso: maxEnd ? new Date(maxEnd).toISOString() : null,
      daysLeft: left,
      globalDrift: drift,
    };
  }, [stageTasks]);

  // ---- Active task for inline TaskItem ----
  const activeTask = activeStageKey
    ? stageTasks.find(t => (t as any).stage_key === activeStageKey) ?? null
    : null;

  // ---- Stage-level risk telemetry (time-in-stage / blocked) ----
  const timeInStage = stmTimeInStage(project);
  const blocked = isStmProjectBlocked(project);
  const stuck = isStmProjectStuck(project);

  return (
    <div className="bg-stm-bg/95 border-b border-stm-border/40 px-4 py-4 space-y-4">
      {/* HEADER — Total telemetry */}
      <header className="flex flex-wrap items-end justify-between gap-4 px-1">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono tracking-[0.2em] text-stm-fg/40 uppercase">
              SKU // {group.name}
            </span>
            <span className="px-1.5 py-0.5 rounded-sm bg-stm-accent/10 text-stm-accent text-[9px] font-bold tracking-widest border border-stm-accent/20">
              {project.flow === "in" ? "ВВОД" : "ВЫВОД"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1">
            <StmMetaChip group={group} meta={meta} field="retailer" label="Сеть" placeholder="X5, Лента…" />
            <StmMetaChip group={group} meta={meta} field="brand" label="Бренд" placeholder="Бережное томление…" />
            <StmMetaChip group={group} meta={meta} field="project" label="Проект" placeholder="Чистые составы…" />
            <StmMetaChip group={group} meta={meta} field="drop" label="Дроп" placeholder="Q2 2026…" />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
          <div className="text-right">
            <div className="text-[10px] font-mono uppercase tracking-widest text-stm-fg/40">ИТОГО</div>
            <div className="text-sm font-mono text-stm-fg tabular-nums">
              {RU_DATE_LONG(startIso)} <span className="text-stm-fg/30">→</span> {RU_DATE_LONG(finishIso)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-mono uppercase tracking-widest text-stm-fg/40">Осталось</div>
            <div className={cn(
              "text-sm font-mono tabular-nums",
              daysLeft == null ? "text-stm-fg/40" :
              daysLeft < 0 ? "text-stm-danger" :
              daysLeft < 7 ? "text-stm-warn" : "text-stm-accent",
            )}>
              {daysLeft == null ? "—" : daysLeft < 0 ? `просрочено на ${-daysLeft} дн` : `${daysLeft} дн`}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-mono uppercase tracking-widest text-stm-fg/40">Прогресс</div>
            <div className="text-sm font-mono text-stm-fg tabular-nums">{progress}%</div>
          </div>
          {progress < 100 && timeInStage != null && (
            <div className="text-right">
              <div className="text-[10px] font-mono uppercase tracking-widest text-stm-fg/40">На этапе</div>
              <div className={cn(
                "text-sm font-mono tabular-nums",
                blocked || stuck ? "text-stm-warn" : "text-stm-fg/70",
              )}>
                {blocked ? `⛔ ${timeInStage} дн` : stuck ? `⏳ ${timeInStage} дн` : `${timeInStage} дн`}
              </div>
            </div>
          )}
          {globalDrift > 0 && (
            <div className="text-right">
              <div className="text-[10px] font-mono uppercase tracking-widest text-stm-fg/40">Дрифт</div>
              <div className="text-sm font-mono text-stm-danger tabular-nums">↗ +{globalDrift} дн</div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowChat(v => !v)}
            className={cn(
              "inline-flex items-center gap-1 text-[11px] transition-colors px-2 py-1 rounded border",
              showChat
                ? "text-stm-accent border-stm-accent/50 bg-stm-accent/10"
                : "text-stm-fg/60 border-stm-border/40 hover:text-stm-accent hover:border-stm-accent/40",
            )}
            aria-pressed={showChat}
          >
            <MessagesSquare className="h-3 w-3" /> Чат
          </button>
          <button
            type="button"
            onClick={() => onOpenGantt?.(group.id)}
            className="inline-flex items-center gap-1 text-[11px] text-stm-fg/60 hover:text-stm-accent transition-colors px-2 py-1 rounded border border-stm-border/40 hover:border-stm-accent/40"
          >
            <GanttChart className="h-3 w-3" /> Гантт
          </button>
        </div>
      </header>

      {/* SKU COMMENT — inline editable description (ТЗ, нюансы, контекст запуска) */}
      <div className="px-1">
        {editingComment ? (
          <div className="flex items-start gap-2">
            <MessageSquare className="h-3.5 w-3.5 text-stm-accent shrink-0 mt-1.5" />
            <textarea
              autoFocus
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              onBlur={commitComment}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setCommentDraft(group.description ?? ""); setEditingComment(false); }
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commitComment();
              }}
              placeholder="Комментарий по SKU: ТЗ, нюансы запуска, договорённости… (Esc — отмена, ⌘/Ctrl+Enter — сохранить)"
              rows={2}
              className="flex-1 bg-stm-glass/30 border border-stm-accent/40 rounded-md px-2.5 py-1.5 text-xs text-stm-fg placeholder:text-stm-fg/30 focus:outline-none focus:ring-1 focus:ring-stm-accent/60 resize-y min-h-[44px]"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditingComment(true)}
            className="w-full flex items-start gap-2 text-left px-2.5 py-1.5 rounded-md border border-stm-border/30 bg-stm-glass/20 hover:bg-stm-glass/40 hover:border-stm-accent/30 transition-colors group/cmt"
          >
            <MessageSquare className={cn(
              "h-3.5 w-3.5 shrink-0 mt-0.5 transition-colors",
              group.description ? "text-stm-accent" : "text-stm-fg/30 group-hover/cmt:text-stm-accent",
            )} />
            <span className={cn(
              "text-xs flex-1 whitespace-pre-wrap break-words",
              group.description ? "text-stm-fg/80" : "text-stm-fg/40 italic",
            )}>
              {group.description || "Добавить комментарий по SKU…"}
            </span>
          </button>
        )}
      </div>

      {/* MAIN PANEL — roadmap strip + 12 stage cards */}
      <div className="bg-stm-glass/30 backdrop-blur-md border border-stm-border/40 rounded-xl overflow-hidden shadow-2xl">
        {/* Roadmap progress strip (PMO Stripe style) */}
        <div className="h-1.5 w-full bg-stm-fg/5 flex gap-0.5 p-0.5 border-b border-stm-border/30">
          {stages.map(stage => {
            const task = stageTasks.find(t => (t as any).stage_key === stage.key);
            const isDone = task?.is_completed;
            const isCurrent = stage.key === currentStageKey;
            const overdue = !isDone && task?.deadline && new Date(task.deadline) < new Date();
            return (
              <div
                key={stage.key}
                className={cn(
                  "h-full flex-1 transition-all",
                  isDone && "bg-stm-fg/40",
                  isCurrent && "bg-stm-accent shadow-[0_0_10px_hsl(var(--stm-accent)/0.6)] flex-[1.4]",
                  overdue && "bg-stm-danger",
                  !isDone && !isCurrent && !overdue && "bg-stm-fg/5",
                )}
              />
            );
          })}
        </div>

        {/* 12-stage grid */}
        <div
          className="grid divide-x divide-stm-border/20"
          style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}
        >
          {stages.map((stage, idx) => {
            const task = stageTasks.find(t => (t as any).stage_key === stage.key) ?? null;
            const isDone = task?.is_completed;
            const isCurrent = stage.key === currentStageKey;
            const isActive = stage.key === activeStageKey;
            const overdue = !isDone && task?.deadline && new Date(task.deadline) < new Date();
            const stageStatus = (task as any)?.stage_status as string | null | undefined;
            const isBlocked = !isDone && stageStatus === "blocked";
            const isInProgress = !isDone && !overdue && !isBlocked && stageStatus === "in_progress";
            const drift = calcDrift(task);
            const assigneeName = task?.assigned_to ? profileMap.get(task.assigned_to) : null;
            const dueLabel = RU_DATE(task?.deadline);

            return (
              <button
                key={stage.key}
                type="button"
                onClick={() => task && setActiveStageKey(activeStageKey === stage.key ? null : stage.key)}
                disabled={!task}
                className={cn(
                  "group relative p-3 text-left space-y-2.5 transition-all min-h-[112px]",
                  isDone && !isActive && "opacity-50",
                  isCurrent && !isActive && "bg-stm-accent/5 ring-1 ring-inset ring-stm-accent/20",
                  isActive && "bg-stm-accent/10 ring-1 ring-inset ring-stm-accent/40",
                  overdue && !isActive && "bg-stm-danger/5",
                  task && "hover:bg-stm-glass/40 cursor-pointer",
                  !task && "opacity-30 cursor-not-allowed",
                )}
                aria-pressed={isActive}
              >
                {(isCurrent || isActive) && (
                  <div className="absolute top-0 left-0 w-full h-[2px] bg-stm-accent" />
                )}
                <div className="flex justify-between items-start">
                  <span className={cn(
                    "text-[10px] font-mono",
                    isCurrent || isActive ? "text-stm-accent" : "text-stm-fg/40",
                  )}>
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <div className="flex items-center gap-1">
                    {drift != null && drift > 0 && (
                      <span className="text-[9px] font-mono text-stm-danger tracking-tighter" title="Сдвиг от исходного дедлайна">
                        ↗+{drift}д
                      </span>
                    )}
                    <div className={cn(
                      "size-1.5 rounded-full",
                      isDone ? "bg-stm-success" :
                      overdue ? "bg-stm-danger animate-pulse" :
                      isBlocked ? "bg-stm-warn animate-pulse" :
                      isInProgress ? "bg-stm-accent animate-pulse" :
                      isCurrent ? "bg-stm-accent animate-pulse" : "bg-stm-fg/20",
                    )} />
                  </div>
                </div>

                <div className="space-y-1">
                  <p className={cn(
                    "text-xs font-medium truncate",
                    isCurrent || isActive ? "text-stm-fg" : "text-stm-fg/70",
                  )}>
                    {stage.short}
                  </p>
                  <p className="text-[10px] font-mono text-stm-fg/50 uppercase truncate" title={assigneeName ?? undefined}>
                    {assigneeName ? initialsFromName(assigneeName) : "—"}
                  </p>
                  <p className={cn(
                    "text-[10px] font-mono tabular-nums",
                    overdue ? "text-stm-danger" : "text-stm-fg/40",
                  )}>
                    {dueLabel ?? "—"}
                  </p>
                  {stage.key === "rework" && task && (((task as any).rework_count as number) ?? 0) > 0 && (
                    <p className={cn(
                      "text-[10px] font-mono tabular-nums",
                      (((task as any).rework_count as number) ?? 0) >= REWORK_RISK_THRESHOLD ? "text-stm-warn" : "text-stm-fg/50",
                    )}>
                      🔁 доработок: {(task as any).rework_count}
                    </p>
                  )}
                </div>

                {!task && (
                  <p className="text-[9px] text-stm-fg/30 italic">не создана</p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Inline TaskItem for the active stage — full editing */}
      {activeTask && (
        <div className="bg-background/40 rounded-lg border border-stm-border/30 p-2 max-w-5xl">
          <div className="flex items-center gap-2 px-2 py-1 mb-1 text-[10px] font-mono uppercase tracking-widest text-stm-fg/50">
            <ChevronDown className="h-3 w-3 text-stm-accent" />
            <span>Детали этапа · шаги, комментарии, ответственный</span>
          </div>
          <TaskItem task={activeTask} sortable={false} />
        </div>
      )}
      {!activeTask && (
        <div className="text-[11px] text-stm-fg/40 px-2 italic flex items-center gap-2">
          <ChevronRight className="h-3 w-3" />
          Выберите этап, чтобы открыть детали (шаги, дедлайн, ответственный)
        </div>
      )}

      {/* Per-SKU chat (group_messages) */}
      {showChat && (
        <div className="rounded-xl border border-stm-border/40 bg-stm-glass/20 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-stm-border/30 text-[10px] font-mono uppercase tracking-widest text-stm-fg/50">
            <MessagesSquare className="h-3 w-3 text-stm-accent" />
            <span>Чат SKU · {group.name}</span>
          </div>
          <div className="h-[380px]">
            <ProjectChat groupId={group.id} groupName={group.name} embedded />
          </div>
        </div>
      )}

      {/* Operational tasks + tasks coming from protocols */}
      <StmOpsTasks groupId={group.id} />
    </div>
  );
}

export const StmExpandedRow = React.memo(StmExpandedRowInner);