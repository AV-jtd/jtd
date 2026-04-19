import ProtocolInternalSection from "./ProtocolInternalSection";
import type { Task } from "@/hooks/useTasks";

type Props = {
  task: Task;
};

/**
 * Внутренний слой ВНЕ внешней строки протокола.
 *
 * Реализован как ProtocolInternalSection с привязкой `parent_external_task_id`,
 * чтобы внутренние задачи, созданные «по итогам этой строки», группировались
 * именно под этой внешней задачей, но при этом оставались полноценными
 * `tasks` с `protocol_scope='internal'` (та же модель, что и в основной
 * секции под таблицей).
 *
 * Партнёр такие задачи не видит (фильтр по protocol_scope при экспорте).
 * Тумблер не нужен: слой включается фактом добавления первой задачи.
 */
export default function ExternalRowInternalLayer({ task }: Props) {
  if (!task.group_id) return null;
  return (
    <ProtocolInternalSection
      protocolId={task.group_id}
      parentExternalTaskId={task.id}
      subtitle="Привязать задачу — то, что нужно сделать команде по итогам этого пункта. Партнёр этого не видит."
    />
  );
}
