-- KM Brand Control: новая доска в NPD, клон STM Mission Control с другим
-- списком гейтов (18 этапов, один линейный поток вместо in/out).

-- 1. Мета-поле SKU, аналог task_groups.stm_meta.
ALTER TABLE public.task_groups ADD COLUMN IF NOT EXISTS km_meta jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Пустые группы-заготовки (Бренд/Проект/Дроп/Сеть), аналог stm_structure_nodes.
-- Без поля flow — у KM нет деления на ввод/вывод.
CREATE TABLE IF NOT EXISTS public.km_structure_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  field text NOT NULL CHECK (field = ANY (ARRAY['retailer','brand','drop','project'])),
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS km_structure_nodes_unique ON public.km_structure_nodes (field, lower(value));

ALTER TABLE public.km_structure_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view km structure nodes"
  ON public.km_structure_nodes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create km structure nodes"
  ON public.km_structure_nodes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Authenticated can update km structure nodes"
  ON public.km_structure_nodes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete km structure nodes"
  ON public.km_structure_nodes FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_km_structure_nodes_updated_at
  BEFORE UPDATE ON public.km_structure_nodes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. RLS: правки шапки/статуса KM SKU командой, не только владельцем.
-- Тот же паттерн, что "Team can update STM SKUs" (см. migration-stream
-- PROGRESS.md, 2026-07-15) — не ждём повторного обнаружения этого же бага.
CREATE POLICY "Team can update KM SKUs" ON public.task_groups
  FOR UPDATE TO authenticated
  USING (project_subtype = 'npd_km' AND NOT is_consultant(auth.uid()))
  WITH CHECK (project_subtype = 'npd_km' AND NOT is_consultant(auth.uid()));

-- 4. RLS: участники KM SKU (task_participants), тот же паттерн что для STM.
CREATE POLICY "Team can manage KM SKU participants" ON public.task_participants
  FOR ALL TO authenticated
  USING (
    NOT is_consultant(auth.uid()) AND EXISTS (
      SELECT 1 FROM public.tasks t JOIN public.task_groups tg ON tg.id = t.group_id
      WHERE t.id = task_participants.task_id AND t.task_type = 'km_stage' AND tg.project_subtype = 'npd_km'
    )
  )
  WITH CHECK (
    NOT is_consultant(auth.uid()) AND EXISTS (
      SELECT 1 FROM public.tasks t JOIN public.task_groups tg ON tg.id = t.group_id
      WHERE t.id = task_participants.task_id AND t.task_type = 'km_stage' AND tg.project_subtype = 'npd_km'
    )
  );
