import type { StmProject } from "../hooks/useStmProjects";
import { getStmStages, STM_STUCK_THRESHOLD_DAYS, type StmFlow, type StmStage } from "./stages";

/** Bucket: how many SKUs currently sit at a given stage. */
export interface StmStageBucket {
  stage: StmStage;
  index: number;
  count: number;
}

export interface StmGroupStat {
  key: string;
  count: number;
  avgProgress: number;
}

export interface StmAnalytics {
  total: number;
  avgProgress: number;
  /** SKUs that have at least one overdue (not completed, past deadline) stage task. */
  overdueSkus: number;
  /** Total count of overdue stage tasks across all SKUs. */
  overdueTasks: number;
  /** SKUs where the "approval" milestone is reached but the SKU is not fully done. */
  readyToLaunch: number;
  /** SKUs at 100% progress. */
  completed: number;
  /** SKUs that have no completed stage yet (not started). */
  notStarted: number;
  /** SKUs whose current stage is explicitly marked blocked. */
  blockedSkus: number;
  /** SKUs stuck on the current stage beyond the threshold (not overdue/blocked). */
  stuckSkus: number;
  stageBuckets: StmStageBucket[];
  byRetailer: StmGroupStat[];
  byBrand: StmGroupStat[];
}

/**
 * True if the SKU has any not-completed, past-deadline stage task.
 * For archived SKUs the "now" reference is frozen at the archive timestamp,
 * so overdue state stops growing once a SKU is sent to the archive.
 */
export function isStmProjectOverdue(p: StmProject): boolean {
  const ref = p.archivedAt ? new Date(p.archivedAt).getTime() : Date.now();
  return p.stageTasks.some(
    t => !t.is_completed && t.deadline && new Date(t.deadline).getTime() < ref,
  );
}

/** True if the current (first not-done) stage task is explicitly blocked. */
export function isStmProjectBlocked(p: StmProject): boolean {
  if (!p.currentStageKey) return false;
  const cur = p.stageTasks.find(t => (t as any).stage_key === p.currentStageKey);
  return !!cur && !cur.is_completed && (cur as any).stage_status === "blocked";
}

/**
 * Days the SKU has been sitting on its current (first not-done) stage.
 * Measured from the previous stage's completion (or the current stage's
 * start_at when there is no completed predecessor). Returns null when the
 * SKU is finished or has no current stage / anchor date.
 */
export function stmTimeInStage(p: StmProject): number | null {
  if (!p.currentStageKey) return null;
  const stages = getStmStages(p.flow);
  const idx = stages.findIndex(s => s.key === p.currentStageKey);
  if (idx < 0) return null;
  // Anchor: latest completed predecessor's completed_at, else current start_at.
  let anchor: number | null = null;
  for (let i = idx - 1; i >= 0; i--) {
    const prev = p.stageTasks.find(t => (t as any).stage_key === stages[i].key);
    if (prev?.is_completed && prev.completed_at) {
      anchor = new Date(prev.completed_at).getTime();
      break;
    }
  }
  if (anchor == null) {
    const cur = p.stageTasks.find(t => (t as any).stage_key === p.currentStageKey);
    if (cur?.start_at) anchor = new Date(cur.start_at).getTime();
  }
  if (anchor == null) return null;
  // Freeze the clock at archive time for archived SKUs.
  const ref = p.archivedAt ? new Date(p.archivedAt).getTime() : Date.now();
  const days = Math.floor((ref - anchor) / 86_400_000);
  return days >= 0 ? days : null;
}

/** True if the SKU is stuck on the current stage beyond the flow threshold. */
export function isStmProjectStuck(p: StmProject): boolean {
  if (p.progress >= 100) return false;
  const t = stmTimeInStage(p);
  if (t == null) return false;
  return t > STM_STUCK_THRESHOLD_DAYS[p.flow];
}

export type StmRowState = "archived" | "overdue" | "blocked" | "stuck" | "done" | "active" | "idle";

/** High-level row state used for the left status strip / coloring. */
export function stmRowState(p: StmProject): StmRowState {
  if (p.archivedAt) return "archived";
  if (isStmProjectOverdue(p)) return "overdue";
  if (isStmProjectBlocked(p)) return "blocked";
  if (isStmProjectStuck(p)) return "stuck";
  if (p.progress >= 100) return "done";
  if (p.progress > 0) return "active";
  return "idle";
}

/** Aggregate dashboard metrics for the currently visible SKUs of a flow. */
export function computeStmAnalytics(projects: StmProject[], flow: StmFlow): StmAnalytics {
  const stages = getStmStages(flow);
  const now = Date.now();
  const total = projects.length;
  const avgProgress = total
    ? Math.round(projects.reduce((s, p) => s + p.progress, 0) / total)
    : 0;

  let overdueSkus = 0;
  let overdueTasks = 0;
  let readyToLaunch = 0;
  let completed = 0;
  let notStarted = 0;
  let blockedSkus = 0;
  let stuckSkus = 0;
  const stageCount = new Map<string, number>();

  projects.forEach(p => {
    // Freeze the clock at archive time — otherwise archived SKUs keep
    // accumulating "overdue" as real time passes, even though the row is
    // no longer being worked on.
    const ref = p.archivedAt ? new Date(p.archivedAt).getTime() : now;
    const od = p.stageTasks.filter(
      t => !t.is_completed && t.deadline && new Date(t.deadline).getTime() < ref,
    );
    overdueTasks += od.length;
    if (od.length) overdueSkus++;
    if (p.progress >= 100) completed++;
    if (p.progress === 0) notStarted++;
    // Risk buckets are mutually exclusive in priority order, mirroring stmRowState.
    if (!p.archivedAt && !od.length && p.progress < 100) {
      if (isStmProjectBlocked(p)) blockedSkus++;
      else if (isStmProjectStuck(p)) stuckSkus++;
    }
    const approvalDone = p.stageTasks.some(
      t => (t as any).stage_key === "approval" && t.is_completed,
    );
    if (approvalDone && p.progress < 100) readyToLaunch++;
    if (p.currentStageKey) {
      stageCount.set(p.currentStageKey, (stageCount.get(p.currentStageKey) || 0) + 1);
    }
  });

  const stageBuckets: StmStageBucket[] = stages.map((stage, index) => ({
    stage,
    index,
    count: stageCount.get(stage.key) || 0,
  }));

  const groupBy = (keyFn: (p: StmProject) => string): StmGroupStat[] => {
    const m = new Map<string, StmProject[]>();
    projects.forEach(p => {
      const k = keyFn(p) || "Без группы";
      const arr = m.get(k) ?? [];
      arr.push(p);
      m.set(k, arr);
    });
    return Array.from(m.entries())
      .map(([key, items]) => ({
        key,
        count: items.length,
        avgProgress: Math.round(items.reduce((s, p) => s + p.progress, 0) / items.length),
      }))
      .sort((a, b) => b.count - a.count);
  };

  return {
    total,
    avgProgress,
    overdueSkus,
    overdueTasks,
    readyToLaunch,
    completed,
    notStarted,
    blockedSkus,
    stuckSkus,
    stageBuckets,
    byRetailer: groupBy(p => p.meta.retailer || ""),
    byBrand: groupBy(p => p.meta.brand || ""),
  };
}