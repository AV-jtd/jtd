import type { StmProject } from "../hooks/useStmProjects";
import { getStmStages, type StmFlow, type StmStage } from "./stages";

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
  stageBuckets: StmStageBucket[];
  byRetailer: StmGroupStat[];
  byBrand: StmGroupStat[];
}

/** True if the SKU has any not-completed, past-deadline stage task. */
export function isStmProjectOverdue(p: StmProject): boolean {
  const now = Date.now();
  return p.stageTasks.some(
    t => !t.is_completed && t.deadline && new Date(t.deadline).getTime() < now,
  );
}

export type StmRowState = "archived" | "overdue" | "done" | "active" | "idle";

/** High-level row state used for the left status strip / coloring. */
export function stmRowState(p: StmProject): StmRowState {
  if (p.archivedAt) return "archived";
  if (isStmProjectOverdue(p)) return "overdue";
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
  const stageCount = new Map<string, number>();

  projects.forEach(p => {
    const od = p.stageTasks.filter(
      t => !t.is_completed && t.deadline && new Date(t.deadline).getTime() < now,
    );
    overdueTasks += od.length;
    if (od.length) overdueSkus++;
    if (p.progress >= 100) completed++;
    if (p.progress === 0) notStarted++;
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
    stageBuckets,
    byRetailer: groupBy(p => p.meta.retailer || ""),
    byBrand: groupBy(p => p.meta.brand || ""),
  };
}