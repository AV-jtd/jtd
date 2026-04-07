
-- Add position column for manual reordering within a group
ALTER TABLE public.project_milestones ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;

-- Set initial positions based on planned_date order within each group
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY group_id ORDER BY planned_date, created_at) AS rn
  FROM public.project_milestones
)
UPDATE public.project_milestones SET position = ranked.rn
FROM ranked WHERE project_milestones.id = ranked.id;
