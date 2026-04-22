DROP POLICY IF EXISTS "Department members can view department tasks" ON public.tasks;
DROP POLICY IF EXISTS "Department members can take department tasks" ON public.tasks;

CREATE OR REPLACE FUNCTION public.user_belongs_to_department(_user_id uuid, _department_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id
      AND p.department_id = _department_id
  );
$$;

CREATE POLICY "Department members can view department tasks"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (
    department_id IS NOT NULL
    AND public.user_belongs_to_department(auth.uid(), department_id)
  );

CREATE POLICY "Department members can take department tasks"
  ON public.tasks FOR UPDATE
  TO authenticated
  USING (
    department_id IS NOT NULL
    AND public.user_belongs_to_department(auth.uid(), department_id)
  )
  WITH CHECK (
    public.user_belongs_to_department(auth.uid(), department_id)
    OR assigned_to = auth.uid()
  );