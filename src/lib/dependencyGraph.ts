import { parseISO, addDays } from "date-fns";
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
