-- ============================================================
-- Performance optimization for RLS-heavy tasks queries
-- Goal: eliminate statement timeouts for users with broad visibility
--       (e.g. directors with 5300+ visible tasks).
-- Strategy: add missing indexes + STABLE function caching markers.
-- No policy logic changes — only physical optimization.
-- ============================================================

-- 1. Critical indexes on tasks (RLS scans these on every row)
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON public.tasks (user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks (assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_group_id ON public.tasks (group_id) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_completion_position ON public.tasks (is_completed, position, created_at DESC);

-- 2. user_roles is hit by every is_consultant() call
CREATE INDEX IF NOT EXISTS idx_user_roles_user_role ON public.user_roles (user_id, role);

-- 3. user_departments is hit by user_belongs_to_department / get_user_visible_departments
CREATE INDEX IF NOT EXISTS idx_user_departments_user ON public.user_departments (user_id);
CREATE INDEX IF NOT EXISTS idx_user_departments_dept ON public.user_departments (department_id);

-- 4. group_members is hit by is_group_member / is_group_owner — already has unique idx, but add by user
CREATE INDEX IF NOT EXISTS idx_group_members_user ON public.group_members (user_id);

-- 5. task_participants — already has uniques, add lone user index for participantTaskIds lookups
CREATE INDEX IF NOT EXISTS idx_task_participants_user ON public.task_participants (user_id);

-- 6. task_groups by user_id (used in owned-group lookups)
CREATE INDEX IF NOT EXISTS idx_task_groups_user_id ON public.task_groups (user_id);

-- 7. ANALYZE the hot tables so the planner knows about new indexes
ANALYZE public.tasks;
ANALYZE public.user_roles;
ANALYZE public.user_departments;
ANALYZE public.group_members;
ANALYZE public.task_participants;
ANALYZE public.task_groups;