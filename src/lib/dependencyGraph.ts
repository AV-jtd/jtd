import { parseISO, addDays, differenceInCalendarDays } from "date-fns";
import type { TaskDependency } from "@/hooks/useDependencies";

export interface GraphEntity {
  id: string;
  deadline?: string | null;
  start_at?: string | null;
}

/**
 * Check if adding a new dependency (predId -> succId) would create a cycle.
 * Uses DFS from succId looking back to predId through existing edges.
 * Returns true if cycle detected.
 */
export function wouldCreateCycle(
  predId: string,
  succId: string,
  existing: TaskDependency[],
): boolean {
  if (predId === succId) return true;

  // Build adjacency: predecessor -> successors
  const adj = new Map<string, string[]>();
  for (const d of existing) {
    if (!adj.has(d.predecessor_id)) adj.set(d.predecessor_id, []);
    adj.get(d.predecessor_id)!.push(d.successor_id);
  }

  // DFS from succId following edges; if we reach predId, adding pred->succ creates a cycle
  const visited = new Set<string>();
  const stack = [succId];
  while (stack.length) {
    const node = stack.pop()!;
    if (node === predId) return true;
    if (visited.has(node)) continue;
    visited.add(node);
    const next = adj.get(node);
    if (next) stack.push(...next);
  }
  return false;
}

/**
 * Detect violations: a successor's start (or deadline if no start) is earlier
 * than predecessor's deadline + lag.
 * Returns set of entity ids that violate at least one of their predecessor links.
 */
export function detectViolations(
  dependencies: TaskDependency[],
  entities: Map<string, GraphEntity>,
): Set<string> {
  const violators = new Set<string>();
  for (const d of dependencies) {
    const pred = entities.get(d.predecessor_id);
    const succ = entities.get(d.successor_id);
    if (!pred?.deadline || !succ) continue;
    const succAnchor = succ.start_at || succ.deadline;
    if (!succAnchor) continue;

    const predEnd = addDays(parseISO(pred.deadline), d.lag_days || 0);
    const succStart = parseISO(succAnchor);
    if (succStart < predEnd) {
      violators.add(d.successor_id);
    }
  }
  return violators;
}

export interface ResolveUpdate {
  deadline?: string;
  start_at?: string;
}

/**
 * Fill in MISSING deadlines from the dependency chain.
 *
 * For sequential planning the rule is: a successor starts after its predecessor
 * ends (± lag). So when a predecessor has a start but no deadline, we can derive
 * its deadline from the successor's start:
 *
 *   predecessor.deadline = successor.start_at - lag_days
 *
 * (negative lag = the successor starts a few days before the predecessor ends).
 * When a predecessor has several successors we take the EARLIEST successor start
 * so the bar never overruns any of them. The deadline is clamped to be no earlier
 * than the predecessor's own start. Tasks that already have a deadline, or that
 * have no successor with a start date (e.g. the last task in a chain), are left
 * untouched.
 *
 * Returns map of entity_id -> { deadline } with only the deadlines to set.
 */
export function fillMissingDeadlines(
  dependencies: TaskDependency[],
  entities: Map<string, GraphEntity>,
): Map<string, { deadline: string }> {
  const updates = new Map<string, { deadline: string }>();

  for (const d of dependencies) {
    const pred = entities.get(d.predecessor_id);
    const succ = entities.get(d.successor_id);
    if (!pred || !succ) continue;
    if (pred.deadline) continue; // only fill empty deadlines
    if (!succ.start_at) continue; // need a successor start to derive from

    let candidate = addDays(parseISO(succ.start_at), -(d.lag_days || 0));
    // Clamp: deadline must not be earlier than the task's own start
    if (pred.start_at) {
      const ps = parseISO(pred.start_at);
      if (candidate < ps) candidate = ps;
    }

    const existing = updates.get(d.predecessor_id);
    if (!existing || parseISO(existing.deadline) > candidate) {
      updates.set(d.predecessor_id, { deadline: candidate.toISOString() });
    }
  }

  return updates;
}

/**
 * Auto-resolve dependency violations across the whole graph by shifting
 * successors forward to (predecessor.deadline + lag), preserving their original
 * duration (deadline - start_at). Propagates topologically until no violations remain.
 *
 * Returns map of entity_id -> { deadline?, start_at? } with all required updates.
 * Ignores entities not present in the entities map (e.g. from foreign projects).
 */
export function resolveAllViolations(
  dependencies: TaskDependency[],
  entities: Map<string, GraphEntity>,
  options: { maxIterations?: number } = {},
): Map<string, ResolveUpdate> {
  const updates = new Map<string, ResolveUpdate>();
  const maxIter = options.maxIterations ?? 50;

  // Build successor adjacency
  const adj = new Map<string, TaskDependency[]>();
  for (const d of dependencies) {
    if (!adj.has(d.predecessor_id)) adj.set(d.predecessor_id, []);
    adj.get(d.predecessor_id)!.push(d);
  }

  // Working snapshot of entity dates (mutated in place)
  const work = new Map<string, GraphEntity>();
  entities.forEach((e, id) => work.set(id, { ...e }));

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;

    for (const d of dependencies) {
      const pred = work.get(d.predecessor_id);
      const succ = work.get(d.successor_id);
      if (!pred?.deadline || !succ) continue;
      const succAnchor = succ.start_at || succ.deadline;
      if (!succAnchor) continue;

      const predEnd = addDays(parseISO(pred.deadline), d.lag_days || 0);
      const succStart = parseISO(succAnchor);
      if (succStart >= predEnd) continue;

      // Compute new dates preserving duration
      let newStart = predEnd;
      let newDeadline: Date;
      if (succ.start_at && succ.deadline) {
        const duration = differenceInCalendarDays(parseISO(succ.deadline), parseISO(succ.start_at));
        newDeadline = addDays(newStart, Math.max(duration, 0));
      } else if (succ.deadline) {
        // No start: just shift deadline forward by the gap
        const gap = differenceInCalendarDays(predEnd, succStart);
        newDeadline = addDays(parseISO(succ.deadline), gap);
        // Set start = predEnd as anchor for downstream calc
      } else {
        newDeadline = newStart;
      }

      const update: ResolveUpdate = {
        start_at: newStart.toISOString(),
        deadline: newDeadline.toISOString(),
      };
      updates.set(d.successor_id, update);

      // Update working snapshot
      work.set(d.successor_id, {
        id: d.successor_id,
        start_at: update.start_at,
        deadline: update.deadline,
      });
      changed = true;
    }

    if (!changed) break;
  }

  return updates;
}
