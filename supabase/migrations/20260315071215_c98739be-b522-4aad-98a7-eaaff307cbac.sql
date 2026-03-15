
-- Allow first user to self-assign admin if no admins exist
CREATE POLICY "First user can self-assign admin"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND role = 'admin'
  AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin')
);
