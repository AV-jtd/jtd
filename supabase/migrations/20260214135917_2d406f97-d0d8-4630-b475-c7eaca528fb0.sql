
-- Profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  display_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)), NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Task groups
CREATE TABLE public.task_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  icon TEXT DEFAULT 'list',
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.task_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own groups" ON public.task_groups FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Tags
CREATE TABLE public.tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tags" ON public.tags FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Tasks
CREATE TABLE public.tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.task_groups(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  deadline TIMESTAMPTZ,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  is_important BOOLEAN NOT NULL DEFAULT false,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  position INT NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage tasks" ON public.tasks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Delegatees can view tasks" ON public.tasks FOR SELECT USING (auth.uid() = assigned_to);
CREATE POLICY "Delegatees can update tasks" ON public.tasks FOR UPDATE USING (auth.uid() = assigned_to);

-- Now add cross-referencing profile policy
CREATE POLICY "Users can view delegatee profiles" ON public.profiles FOR SELECT
  USING (
    id IN (SELECT assigned_to FROM public.tasks WHERE user_id = auth.uid())
    OR id IN (SELECT user_id FROM public.tasks WHERE assigned_to = auth.uid())
  );

-- Subtasks
CREATE TABLE public.subtasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.subtasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage subtasks of own tasks" ON public.subtasks FOR ALL
  USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = subtasks.task_id AND (t.user_id = auth.uid() OR t.assigned_to = auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = subtasks.task_id AND (t.user_id = auth.uid() OR t.assigned_to = auth.uid())));

-- Task-Tag junction
CREATE TABLE public.task_tags (
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);
ALTER TABLE public.task_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage task_tags of own tasks" ON public.task_tags FOR ALL
  USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_tags.task_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_tags.task_id AND t.user_id = auth.uid()));

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
