
-- Make group_id nullable for personal wiki pages
ALTER TABLE public.wiki_pages ALTER COLUMN group_id DROP NOT NULL;

-- RLS: users can create personal wiki pages (no group)
CREATE POLICY "Users can create personal wiki pages"
ON public.wiki_pages FOR INSERT
TO authenticated
WITH CHECK (group_id IS NULL AND auth.uid() = user_id);

-- RLS: users can view their own personal wiki pages
CREATE POLICY "Users can view personal wiki pages"
ON public.wiki_pages FOR SELECT
TO authenticated
USING (group_id IS NULL AND auth.uid() = user_id);

-- RLS: users can update their own personal wiki pages
CREATE POLICY "Users can update personal wiki pages"
ON public.wiki_pages FOR UPDATE
TO authenticated
USING (group_id IS NULL AND auth.uid() = user_id);

-- RLS: users can delete their own personal wiki pages
CREATE POLICY "Users can delete personal wiki pages"
ON public.wiki_pages FOR DELETE
TO authenticated
USING (group_id IS NULL AND auth.uid() = user_id);
