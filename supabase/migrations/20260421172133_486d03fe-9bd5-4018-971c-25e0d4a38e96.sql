-- STM (Private Label) module support
-- Marks task_groups as STM SKU projects and tasks as workflow stages

ALTER TABLE public.task_groups
  ADD COLUMN IF NOT EXISTS project_subtype text,
  ADD COLUMN IF NOT EXISTS stm_meta jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.task_groups.project_subtype IS
  'Optional sub-classification within project_type. Known values: npd_stm (Private Label SKU project)';

COMMENT ON COLUMN public.task_groups.stm_meta IS
  'STM SKU metadata: { retailer, retailer_id, brand, contract_id, drop, weight_kg, package_type, barcode, sku_code_1c, plu, manager_id, target_price, shelf_life, purpose }';

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS stage_key text,
  ADD COLUMN IF NOT EXISTS stm_flow text;

COMMENT ON COLUMN public.tasks.stage_key IS
  'Workflow stage key for STM stage tasks. Known values for stm_flow=in: brief, sample_request, sample_send, tasting_1, calc_initial, rework, approval, branch_open, production_run, calc_final, label_design, order_release. For stm_flow=out: notify, sell_off, close';

COMMENT ON COLUMN public.tasks.stm_flow IS
  'STM workflow type for stage tasks: in (new SKU intro) or out (SKU withdrawal). NULL for non-STM tasks.';

CREATE INDEX IF NOT EXISTS idx_task_groups_subtype
  ON public.task_groups(project_subtype)
  WHERE project_subtype IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_stage
  ON public.tasks(group_id, stage_key)
  WHERE stage_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_stm_flow
  ON public.tasks(stm_flow)
  WHERE stm_flow IS NOT NULL;