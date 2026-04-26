-- =====================================================
-- 1. Иерархия отделов: parent_department_id
-- =====================================================
ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS parent_department_id uuid
  REFERENCES public.departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_departments_parent ON public.departments(parent_department_id);

-- Функция: глубина отдела (1 = корень)
CREATE OR REPLACE FUNCTION public.department_depth(_dept_id uuid)
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d int := 1;
  cur uuid := _dept_id;
  parent uuid;
BEGIN
  LOOP
    SELECT parent_department_id INTO parent FROM public.departments WHERE id = cur;
    EXIT WHEN parent IS NULL;
    d := d + 1;
    cur := parent;
    IF d > 10 THEN
      RAISE EXCEPTION 'Department hierarchy cycle or too deep';
    END IF;
  END LOOP;
  RETURN d;
END;
$$;

-- Триггер: глубина <= 3 и без циклов
CREATE OR REPLACE FUNCTION public.check_department_hierarchy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d int := 1;
  cur uuid;
BEGIN
  IF NEW.parent_department_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_department_id = NEW.id THEN
    RAISE EXCEPTION 'Department cannot be its own parent';
  END IF;

  -- Проверка глубины и циклов
  cur := NEW.parent_department_id;
  WHILE cur IS NOT NULL LOOP
    IF cur = NEW.id THEN
      RAISE EXCEPTION 'Cycle detected in department hierarchy';
    END IF;
    d := d + 1;
    IF d > 3 THEN
      RAISE EXCEPTION 'Department hierarchy depth cannot exceed 3 levels (Дирекция → Отдел → Подотдел)';
    END IF;
    SELECT parent_department_id INTO cur FROM public.departments WHERE id = cur;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS departments_check_hierarchy ON public.departments;
CREATE TRIGGER departments_check_hierarchy
  BEFORE INSERT OR UPDATE OF parent_department_id ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.check_department_hierarchy();

-- =====================================================
-- 2. Роль director
-- =====================================================
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'director';

-- =====================================================
-- 3. user_departments (M2M)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.user_departments (
  user_id uuid NOT NULL,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_user_departments_user ON public.user_departments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_departments_dept ON public.user_departments(department_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_departments_one_primary
  ON public.user_departments(user_id) WHERE is_primary = true;

ALTER TABLE public.user_departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage user_departments"
  ON public.user_departments FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users view own departments"
  ON public.user_departments FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Non-consultants view all user_departments"
  ON public.user_departments FOR SELECT
  TO authenticated
  USING (NOT is_consultant(auth.uid()));

-- Бэкфил из profiles.department_id
INSERT INTO public.user_departments (user_id, department_id, is_primary)
SELECT id, department_id, true
FROM public.profiles
WHERE department_id IS NOT NULL
ON CONFLICT (user_id, department_id) DO NOTHING;

-- =====================================================
-- 4. department_directors (явные кураторы)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.department_directors (
  director_user_id uuid NOT NULL,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  PRIMARY KEY (director_user_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_department_directors_dept ON public.department_directors(department_id);
CREATE INDEX IF NOT EXISTS idx_department_directors_user ON public.department_directors(director_user_id);

ALTER TABLE public.department_directors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage department_directors"
  ON public.department_directors FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Non-consultants view department_directors"
  ON public.department_directors FOR SELECT
  TO authenticated
  USING (NOT is_consultant(auth.uid()));

-- =====================================================
-- 5. Функции
-- =====================================================

-- Все отделы пользователя (для эмодзи)
CREATE OR REPLACE FUNCTION public.get_user_departments(_user_id uuid)
RETURNS TABLE(department_id uuid, is_primary boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT department_id, is_primary
  FROM public.user_departments
  WHERE user_id = _user_id
$$;

-- Потомки отдела (рекурсивно, включая сам отдел)
CREATE OR REPLACE FUNCTION public.get_department_descendants(_dept_id uuid)
RETURNS TABLE(id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE tree AS (
    SELECT d.id FROM public.departments d WHERE d.id = _dept_id
    UNION ALL
    SELECT d.id FROM public.departments d
    JOIN tree t ON d.parent_department_id = t.id
  )
  SELECT id FROM tree
$$;

-- Является ли user директором отдела (head родителя ИЛИ явный куратор)
CREATE OR REPLACE FUNCTION public.is_director_of_department(_user_id uuid, _dept_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Явный куратор
    SELECT 1 FROM public.department_directors
    WHERE director_user_id = _user_id AND department_id = _dept_id
  ) OR EXISTS (
    -- Head родительского/прародительского отдела
    SELECT 1
    FROM public.departments child
    JOIN public.departments ancestor ON ancestor.id IN (
      SELECT id FROM (
        WITH RECURSIVE up AS (
          SELECT d.id, d.parent_department_id FROM public.departments d WHERE d.id = _dept_id
          UNION ALL
          SELECT d.id, d.parent_department_id
          FROM public.departments d
          JOIN up u ON d.id = u.parent_department_id
        )
        SELECT id FROM up WHERE id <> _dept_id
      ) ancestors
    )
    WHERE child.id = _dept_id
      AND ancestor.head_user_id = _user_id
  )
$$;

-- Все отделы, которые видит director/head (своё поддерево + явные кураторства)
CREATE OR REPLACE FUNCTION public.get_user_visible_departments(_user_id uuid)
RETURNS TABLE(department_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Отделы, где user — head: всё поддерево
  SELECT desc_id FROM public.departments d
  CROSS JOIN LATERAL public.get_department_descendants(d.id) AS sub(desc_id)
  WHERE d.head_user_id = _user_id

  UNION

  -- Отделы, где user — явный куратор: всё поддерево
  SELECT desc_id FROM public.department_directors dd
  CROSS JOIN LATERAL public.get_department_descendants(dd.department_id) AS sub(desc_id)
  WHERE dd.director_user_id = _user_id

  UNION

  -- Свои основные/доп отделы (для всех)
  SELECT department_id FROM public.user_departments WHERE user_id = _user_id
$$;

-- Триггер: синхронизация profiles.department_id с user_departments.is_primary
CREATE OR REPLACE FUNCTION public.sync_primary_department_to_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_primary THEN
      UPDATE public.profiles SET department_id = NULL WHERE id = OLD.user_id;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.is_primary THEN
    UPDATE public.profiles SET department_id = NEW.department_id WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_primary_dept ON public.user_departments;
CREATE TRIGGER sync_primary_dept
  AFTER INSERT OR UPDATE OR DELETE ON public.user_departments
  FOR EACH ROW EXECUTE FUNCTION public.sync_primary_department_to_profile();