CREATE POLICY "Team can update clients"
ON public.clients
FOR UPDATE
TO authenticated
USING (NOT is_consultant(auth.uid()))
WITH CHECK (NOT is_consultant(auth.uid()));