
-- 1. Create tag_categories table
CREATE TABLE public.tag_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  color text DEFAULT '#6366f1',
  position integer NOT NULL DEFAULT 0,
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.tag_categories ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view categories
CREATE POLICY "Authenticated users can view tag categories"
  ON public.tag_categories FOR SELECT
  TO authenticated
  USING (true);

-- Any authenticated user can create categories
CREATE POLICY "Authenticated users can create tag categories"
  ON public.tag_categories FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Only creator can update/delete
CREATE POLICY "Creators can update own tag categories"
  ON public.tag_categories FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Creators can delete own tag categories"
  ON public.tag_categories FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 2. Add category_id to tags
ALTER TABLE public.tags
  ADD COLUMN category_id uuid REFERENCES public.tag_categories(id) ON DELETE SET NULL;

-- 3. Update tags RLS: make all tags visible to authenticated users
DROP POLICY IF EXISTS "Users manage own tags" ON public.tags;

CREATE POLICY "Authenticated users can view all tags"
  ON public.tags FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create tags"
  ON public.tags FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Creators can update own tags"
  ON public.tags FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Creators can delete own tags"
  ON public.tags FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
