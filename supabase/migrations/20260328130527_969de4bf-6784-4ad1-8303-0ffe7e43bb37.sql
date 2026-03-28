
-- Wiki pages table for project knowledge base
CREATE TABLE public.wiki_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.task_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_page_id uuid REFERENCES public.wiki_pages(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Новая страница',
  content text DEFAULT '',
  icon text DEFAULT '📄',
  page_type text NOT NULL DEFAULT 'wiki',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Structured overview sections
CREATE TABLE public.wiki_structured_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.task_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section_key text NOT NULL,
  content text DEFAULT '',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, section_key)
);

-- RLS
ALTER TABLE public.wiki_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wiki_structured_sections ENABLE ROW LEVEL SECURITY;

-- Wiki pages: group owners manage all
CREATE POLICY "Group owners manage wiki pages"
  ON public.wiki_pages FOR ALL TO public
  USING (is_group_owner(group_id, auth.uid()))
  WITH CHECK (is_group_owner(group_id, auth.uid()));

-- Wiki pages: group members can view
CREATE POLICY "Group members can view wiki pages"
  ON public.wiki_pages FOR SELECT TO public
  USING (is_group_member(group_id, auth.uid()));

-- Wiki pages: group members can create/update
CREATE POLICY "Group members can create wiki pages"
  ON public.wiki_pages FOR INSERT TO public
  WITH CHECK (is_group_member(group_id, auth.uid()) AND auth.uid() = user_id);

CREATE POLICY "Group members can update wiki pages"
  ON public.wiki_pages FOR UPDATE TO public
  USING (is_group_member(group_id, auth.uid()));

-- Parent group members access
CREATE POLICY "Parent group members can view wiki pages"
  ON public.wiki_pages FOR SELECT TO public
  USING (is_subgroup_of_member_group(group_id, auth.uid()));

-- Structured sections: same pattern
CREATE POLICY "Group owners manage structured sections"
  ON public.wiki_structured_sections FOR ALL TO public
  USING (is_group_owner(group_id, auth.uid()))
  WITH CHECK (is_group_owner(group_id, auth.uid()));

CREATE POLICY "Group members can view structured sections"
  ON public.wiki_structured_sections FOR SELECT TO public
  USING (is_group_member(group_id, auth.uid()));

CREATE POLICY "Group members can create structured sections"
  ON public.wiki_structured_sections FOR INSERT TO public
  WITH CHECK (is_group_member(group_id, auth.uid()) AND auth.uid() = user_id);

CREATE POLICY "Group members can update structured sections"
  ON public.wiki_structured_sections FOR UPDATE TO public
  USING (is_group_member(group_id, auth.uid()));

CREATE POLICY "Parent group members can view structured sections"
  ON public.wiki_structured_sections FOR SELECT TO public
  USING (is_subgroup_of_member_group(group_id, auth.uid()));
