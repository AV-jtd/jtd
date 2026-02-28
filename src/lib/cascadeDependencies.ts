import { addDays, parseISO, differenceInCalendarDays } from "date-fns";
import type { TaskDependency } from "@/hooks/useDependencies";

interface DateEntity {
  id: string;
  deadline?: string | null;
  start_at?: string | null;
  created_at: string;
}

export interface CascadeUpdate {
  deadline?: string;
  start_at?: string;
}

/**
 * Calculate cascading date shifts for dependent tasks.
 * Returns a map of entity_id -> { deadline?, start_at? }.
 * Both start_at and deadline are pushed forward by the same delta.
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
  
  if (daysDelta === 0 || daysDelta < 0) return updates;

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

      const update: CascadeUpdate = {};

      // Shift deadline if present
      if (entity.deadline) {
        update.deadline = addDays(parseISO(entity.deadline), effectivePush).toISOString();
      }

      // Shift start_at if present
      if (entity.start_at) {
        update.start_at = addDays(parseISO(entity.start_at), effectivePush).toISOString();
      }

      if (update.deadline || update.start_at) {
        updates.set(succ.successor_id, update);
      }

      queue.push({ entityId: succ.successor_id, pushDays: effectivePush });
    }
  }

  return updates;
}
