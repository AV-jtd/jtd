-- STM (Private Label SKU) SKUs are shared team data: multiple non-owner
-- team members legitimately need to edit brand/project/drop/manager info
-- on SKUs they didn't personally create. task_groups only had owner-only
-- (or admin-only) UPDATE policies, so cross-owner edits from the STM
-- "Mission Control" matrix silently no-op'd under RLS (no error thrown,
-- since the update call has no row-count check) and looked like a save
-- that reverted after refresh. Scope narrowly to STM SKUs only — do not
-- broaden access to personal/other task_groups.
CREATE POLICY "Team can update STM SKUs"
ON public.task_groups
FOR UPDATE
TO authenticated
USING (project_subtype = 'npd_stm' AND NOT public.is_consultant(auth.uid()))
WITH CHECK (project_subtype = 'npd_stm' AND NOT public.is_consultant(auth.uid()));
