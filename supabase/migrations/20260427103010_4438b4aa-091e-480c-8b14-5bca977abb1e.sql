-- 1) Поле "приписка" задачи к проекту-получателю (для поручений из протокола)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS attributed_group_id uuid NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_attributed_group_id
  ON public.tasks (attributed_group_id)
  WHERE attributed_group_id IS NOT NULL;

COMMENT ON COLUMN public.tasks.attributed_group_id IS
  'Опциональная "приписка" к проекту-получателю. Используется для задач из протоколов: первичная группа task.group_id остаётся протоколом, а attributed_group_id указывает на проект, в чьих метриках/списках задача должна учитываться.';

-- 2) RLS: участники проекта-получателя видят такие задачи
CREATE POLICY "Attributed project members can view task"
  ON public.tasks
  FOR SELECT
  TO authenticated
  USING (
    attributed_group_id IS NOT NULL
    AND (
      is_group_member(attributed_group_id, auth.uid())
      OR is_group_owner(attributed_group_id, auth.uid())
    )
  );

-- 3) RLS: участники проекта-получателя могут менять статус/срок/ответственного
--    (нужно, чтобы проект мог "забрать" поручение в работу). user_id и group_id защищены WITH CHECK.
CREATE POLICY "Attributed project members can update task"
  ON public.tasks
  FOR UPDATE
  TO authenticated
  USING (
    attributed_group_id IS NOT NULL
    AND (
      is_group_member(attributed_group_id, auth.uid())
      OR is_group_owner(attributed_group_id, auth.uid())
    )
  )
  WITH CHECK (
    attributed_group_id IS NOT NULL
    AND (
      is_group_member(attributed_group_id, auth.uid())
      OR is_group_owner(attributed_group_id, auth.uid())
    )
  );