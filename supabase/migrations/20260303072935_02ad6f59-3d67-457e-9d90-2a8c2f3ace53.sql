
-- Drop the restrictive SELECT policy
DROP POLICY "Users can view accessible tags" ON public.tags;

-- Create a new policy allowing all authenticated users to view all tags
CREATE POLICY "Authenticated users can view all tags"
ON public.tags
FOR SELECT
TO authenticated
USING (true);
