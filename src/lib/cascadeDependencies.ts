import { addDays, parseISO, differenceInCalendarDays } from "date-fns";
import type { TaskDependency } from "@/hooks/useDependencies";

interface DateEntity {
  id: string;
  deadline?: string | null;
  created_at: string;
}

/**
 * Calculate cascading date shifts for dependent tasks.
 * Returns a map of entity_id -> new deadline ISO string.
 * 
 * Only processes FS (Finish-to-Start) dependencies for now.
 * Other types (SS, FF, SF) are also handled.
 */
export function computeCascadeUpdates(
  changedEntityId: string,
  newDeadline: Date,
  oldDeadline: Date,
  dependencies: TaskDependency[],
  entities: Map<string, DateEntity>,
): Map<string, string> {
  const updates = new Map<string, string>();
  const daysDelta = differenceInCalendarDays(newDeadline, oldDeadline);
  
  if (daysDelta === 0) return updates;

  // Only push forward (positive delta). Don't pull back.
  if (daysDelta < 0) return updates;

  // Build successor adjacency from changedEntityId
  const successorMap = new Map<string, { successor_id: string; dependency_type: string; lag_days: number }[]>();
  dependencies.forEach(d => {
    if (!successorMap.has(d.predecessor_id)) successorMap.set(d.predecessor_id, []);
    successorMap.get(d.predecessor_id)!.push({
      successor_id: d.successor_id,
      dependency_type: d.dependency_type,
      lag_days: d.lag_days,
    });
  });

  // BFS to propagate
  const visited = new Set<string>();
  const queue: { entityId: string; pushDays: number }[] = [{ entityId: changedEntityId, pushDays: daysDelta }];

  while (queue.length > 0) {
    const { entityId, pushDays } = queue.shift()!;
    const succs = successorMap.get(entityId) || [];

    for (const succ of succs) {
      if (visited.has(succ.successor_id)) continue;
      visited.add(succ.successor_id);

      const entity = entities.get(succ.successor_id);
      if (!entity || !entity.deadline) continue;

      const currentDeadline = parseISO(entity.deadline);
      const predecessor = entities.get(entityId);
      const predEnd = predecessor?.deadline ? parseISO(predecessor.deadline) : newDeadline;

      // For FS: successor should start after predecessor ends + lag
      // We push the successor's deadline by the same delta
      const effectivePush = pushDays + succ.lag_days;
      if (effectivePush <= 0) continue;

      const newSuccDeadline = addDays(currentDeadline, effectivePush);
      updates.set(succ.successor_id, newSuccDeadline.toISOString());

      queue.push({ entityId: succ.successor_id, pushDays: effectivePush });
    }
  }

  return updates;
}
