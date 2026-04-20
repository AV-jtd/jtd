-- 1. Справочник отделов (привязан к пользователю-владельцу аккаунта)
CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  color text DEFAULT '#6366f1',
  icon text DEFAULT 'building-2',
  head_user_id uuid,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own departments"
  ON public.departments FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can view departments"
  ON public.departments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins full access to departments"
  ON public.departments FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE UNIQUE INDEX departments_user_name_lower_idx
  ON public.departments (user_id, lower(name));

-- 2. Справочник подрядчиков
CREATE TABLE public.contractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  organization text,
  contact_name text,
  email text,
  phone text,
  notes text,
  color text DEFAULT '#f59e0b',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own contractors"
  ON public.contractors FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can view contractors"
  ON public.contractors FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins full access to contractors"
  ON public.contractors FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE UNIQUE INDEX contractors_user_name_lower_idx
  ON public.contractors (user_id, lower(name));

-- 3. Новые поля в tasks: делегирование на отдел или подрядчика
ALTER TABLE public.tasks
  ADD COLUMN department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN contractor_id uuid REFERENCES public.contractors(id) ON DELETE SET NULL;

CREATE INDEX tasks_department_id_idx ON public.tasks(department_id) WHERE department_id IS NOT NULL;
CREATE INDEX tasks_contractor_id_idx ON public.tasks(contractor_id) WHERE contractor_id IS NOT NULL;

-- 4. Триггер обновления updated_at
CREATE TRIGGER update_departments_updated_at
  BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_contractors_updated_at
  BEFORE UPDATE ON public.contractors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();