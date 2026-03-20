
-- Drop the vulnerable "First user can self-assign admin" policy
DROP POLICY IF EXISTS "First user can self-assign admin" ON public.user_roles;

-- Recreate it using admin_exists() SECURITY DEFINER function to bypass RLS
CREATE POLICY "First user can self-assign admin"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND role = 'admin'::app_role
  AND NOT admin_exists()
);
