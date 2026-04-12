
CREATE TABLE public.report_pages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id uuid REFERENCES public.task_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Новый отчёт',
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  cover_color text DEFAULT '#3b82f6',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.report_pages ENABLE ROW LEVEL SECURITY;

-- Author manages own reports
CREATE POLICY "Users manage own reports"
ON public.report_pages FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Group members can view
CREATE POLICY "Group members can view reports"
ON public.report_pages FOR SELECT
TO authenticated
USING (group_id IS NOT NULL AND is_group_member(group_id, auth.uid()));

-- Group owners can view
CREATE POLICY "Group owners can view reports"
ON public.report_pages FOR SELECT
TO authenticated
USING (group_id IS NOT NULL AND is_group_owner(group_id, auth.uid()));

-- Group owners can update/delete
CREATE POLICY "Group owners can update reports"
ON public.report_pages FOR UPDATE
TO authenticated
USING (group_id IS NOT NULL AND is_group_owner(group_id, auth.uid()));

CREATE POLICY "Group owners can delete reports"
ON public.report_pages FOR DELETE
TO authenticated
USING (group_id IS NOT NULL AND is_group_owner(group_id, auth.uid()));

-- Timestamp trigger
CREATE TRIGGER update_report_pages_updated_at
BEFORE UPDATE ON public.report_pages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
