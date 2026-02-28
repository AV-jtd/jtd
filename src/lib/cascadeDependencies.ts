import { addDays, parseISO, differenceInCalendarDays } from "date-fns";
import type { TaskDependency } from "@/hooks/useDependencies";

interface DateEntity {
  id: string;
  deadline?: string | null;
  created_at: string;
}

export interface CascadeUpdate {
  deadline: string;
  created_at: string;
}

/**
 * Calculate cascading date shifts for dependent tasks.
 * Returns a map of entity_id -> { deadline, created_at }.
 * Both start (created_at) and end (deadline) dates are pushed forward.
 */
export function computeCascadeUpdates(
  changedEntityId: string,
  newDeadline: Date,
  oldDeadline: Date,
  dependencies: TaskDependency[],
  entities: Map<string, DateEntity>,
): Map<string, CascadeUpdate> {
  const updates = new Map<string, CascadeUpdate>();
  const daysDelta = differenceInCalendarDays(newDeadline, oldDeadline);
  
  if (daysDelta === 0) return updates;

  // Only push forward (positive delta). Don't pull back.
  if (daysDelta < 0) return updates;

  // Build successor adjacency
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
      if (!entity) continue;

      const effectivePush = pushDays + succ.lag_days;
      if (effectivePush <= 0) continue;

      // Shift both created_at (start) and deadline (end)
      const newCreatedAt = addDays(parseISO(entity.created_at), effectivePush);
      const newSuccDeadline = entity.deadline
        ? addDays(parseISO(entity.deadline), effectivePush)
        : newCreatedAt;

      updates.set(succ.successor_id, {
        deadline: newSuccDeadline.toISOString(),
        created_at: newCreatedAt.toISOString(),
      });

      queue.push({ entityId: succ.successor_id, pushDays: effectivePush });
    }
  }

  return updates;
}
