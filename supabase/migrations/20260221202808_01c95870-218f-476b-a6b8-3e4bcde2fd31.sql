
-- Personal project folders
CREATE TABLE public.project_folders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#6366f1',
  icon text DEFAULT 'folder',
  position integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.project_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own folders"
  ON public.project_folders FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Folder items (project -> folder mapping, per user)
CREATE TABLE public.project_folder_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  folder_id uuid NOT NULL REFERENCES public.project_folders(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.task_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, group_id)
);

ALTER TABLE public.project_folder_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own folder items"
  ON public.project_folder_items FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_project_folders_user ON public.project_folders(user_id);
CREATE INDEX idx_project_folder_items_user ON public.project_folder_items(user_id);
CREATE INDEX idx_project_folder_items_folder ON public.project_folder_items(folder_id);
