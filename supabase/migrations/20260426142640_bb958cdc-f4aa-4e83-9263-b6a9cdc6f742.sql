-- ============================================================
-- Шаг 1. Создаём таблицу персональных назначений по клиенту
-- ============================================================
CREATE TABLE IF NOT EXISTS public.client_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  manager_id uuid,
  group_id uuid REFERENCES public.task_groups(id) ON DELETE SET NULL,
  tag_id uuid REFERENCES public.tags(id) ON DELETE SET NULL,
  territory_tag_id uuid REFERENCES public.tags(id) ON DELETE SET NULL,
  retail_type_tag_id uuid REFERENCES public.tags(id) ON DELETE SET NULL,
  rank_tag_id uuid REFERENCES public.tags(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_assignments_user_client_uniq UNIQUE (user_id, client_id)
);

CREATE INDEX IF NOT EXISTS client_assignments_user_idx ON public.client_assignments(user_id);
CREATE INDEX IF NOT EXISTS client_assignments_client_idx ON public.client_assignments(client_id);

ALTER TABLE public.client_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access to client_assignments"
  ON public.client_assignments FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Consultant block on client_assignments"
  ON public.client_assignments AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT is_consultant(auth.uid()))
  WITH CHECK (NOT is_consultant(auth.uid()));

CREATE POLICY "Users manage own assignments"
  ON public.client_assignments FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Non-consultants view all assignments"
  ON public.client_assignments FOR SELECT TO authenticated
  USING (NOT is_consultant(auth.uid()));

CREATE TRIGGER trg_client_assignments_updated_at
BEFORE UPDATE ON public.client_assignments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Шаг 2. Переносим персональные поля из clients в client_assignments
-- (по одной строке на каждого владельца клиента)
-- ============================================================
INSERT INTO public.client_assignments (user_id, client_id, manager_id, group_id, tag_id, territory_tag_id, retail_type_tag_id, rank_tag_id)
SELECT c.user_id, c.id, c.manager_id, c.group_id, c.tag_id, c.territory_tag_id, c.retail_type_tag_id, c.rank_tag_id
FROM public.clients c
ON CONFLICT (user_id, client_id) DO NOTHING;

-- ============================================================
-- Шаг 3. Объединяем дубли в clients по lower(name)
-- Выбираем canonical = самая ранняя запись (created_at ASC, id ASC)
-- ============================================================
WITH ranked AS (
  SELECT
    id,
    lower(name) AS lname,
    ROW_NUMBER() OVER (PARTITION BY lower(name) ORDER BY created_at ASC, id ASC) AS rn,
    FIRST_VALUE(id) OVER (PARTITION BY lower(name) ORDER BY created_at ASC, id ASC) AS canonical_id
  FROM public.clients
),
mapping AS (
  SELECT id AS dup_id, canonical_id
  FROM ranked
  WHERE rn > 1
)
-- Перебиваем ссылки в tasks
UPDATE public.tasks t
SET client_id = m.canonical_id
FROM mapping m
WHERE t.client_id = m.dup_id;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY lower(name) ORDER BY created_at ASC, id ASC) AS rn,
    FIRST_VALUE(id) OVER (PARTITION BY lower(name) ORDER BY created_at ASC, id ASC) AS canonical_id
  FROM public.clients
),
mapping AS (
  SELECT id AS dup_id, canonical_id FROM ranked WHERE rn > 1
)
-- Перебиваем ссылки в profiles
UPDATE public.profiles p
SET client_id = m.canonical_id
FROM mapping m
WHERE p.client_id = m.dup_id;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY lower(name) ORDER BY created_at ASC, id ASC) AS rn,
    FIRST_VALUE(id) OVER (PARTITION BY lower(name) ORDER BY created_at ASC, id ASC) AS canonical_id
  FROM public.clients
),
mapping AS (
  SELECT id AS dup_id, canonical_id FROM ranked WHERE rn > 1
)
-- Переносим assignments дубля на canonical, если у пользователя нет ещё одного назначения
UPDATE public.client_assignments ca
SET client_id = m.canonical_id
FROM mapping m
WHERE ca.client_id = m.dup_id
  AND NOT EXISTS (
    SELECT 1 FROM public.client_assignments ca2
    WHERE ca2.user_id = ca.user_id AND ca2.client_id = m.canonical_id
  );

-- Удаляем оставшиеся assignments дублей (где у пользователя уже было назначение на canonical)
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY lower(name) ORDER BY created_at ASC, id ASC) AS rn
  FROM public.clients
)
DELETE FROM public.client_assignments
WHERE client_id IN (SELECT id FROM ranked WHERE rn > 1);

-- Удаляем дубли клиентов
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY lower(name) ORDER BY created_at ASC, id ASC) AS rn
  FROM public.clients
)
DELETE FROM public.clients
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ============================================================
-- Шаг 4. Меняем уникальный индекс: общий справочник по lower(name)
-- ============================================================
DROP INDEX IF EXISTS public.clients_user_lower_name_uniq;
CREATE UNIQUE INDEX clients_lower_name_uniq ON public.clients USING btree (lower(name));

-- ============================================================
-- Шаг 5. RLS: clients — общий справочник для не-консультантов
-- Сохраняем существующие политики, добавляем общий SELECT
-- ============================================================
DROP POLICY IF EXISTS "Non-consultants view all clients" ON public.clients;
CREATE POLICY "Non-consultants view all clients"
  ON public.clients FOR SELECT TO authenticated
  USING (NOT is_consultant(auth.uid()));

-- Любой не-консультант может создать клиента (станет общим)
DROP POLICY IF EXISTS "Authenticated users can create clients" ON public.clients;
CREATE POLICY "Authenticated users can create clients"
  ON public.clients FOR INSERT TO authenticated
  WITH CHECK (NOT is_consultant(auth.uid()) AND auth.uid() = user_id);

-- Обновлять/удалять — только владелец-создатель или админ
-- (политика "Users manage own clients" уже это даёт)

-- ============================================================
-- Шаг 6. Триггер защиты от создания дубля по имени
-- (case-insensitive). Если найдено существующее имя — RAISE.
-- Поскольку у нас уникальный индекс — Postgres всё равно вернёт 23505,
-- но триггер даёт более понятную ошибку и хук для логики.
-- ============================================================
CREATE OR REPLACE FUNCTION public.prevent_duplicate_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing_id uuid;
BEGIN
  SELECT id INTO _existing_id
  FROM public.clients
  WHERE lower(name) = lower(NEW.name)
  LIMIT 1;

  IF _existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'Клиент «%» уже существует (id=%). Используйте существующую запись.', NEW.name, _existing_id
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_client ON public.clients;
CREATE TRIGGER trg_prevent_duplicate_client
BEFORE INSERT ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_client();

-- ============================================================
-- Шаг 7. RPC-helper: найти-или-создать клиента по имени
-- Возвращает id canonical-записи. Используется фронтом вместо INSERT.
-- ============================================================
CREATE OR REPLACE FUNCTION public.upsert_client_by_name(_name text, _user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name_trim text := trim(_name);
  _existing_id uuid;
  _new_id uuid;
BEGIN
  IF _name_trim = '' OR _name_trim IS NULL THEN
    RAISE EXCEPTION 'Имя клиента не может быть пустым';
  END IF;

  SELECT id INTO _existing_id
  FROM public.clients
  WHERE lower(name) = lower(_name_trim)
  LIMIT 1;

  IF _existing_id IS NOT NULL THEN
    RETURN _existing_id;
  END IF;

  -- Триггер не сработает, т.к. дубля нет
  INSERT INTO public.clients (name, user_id)
  VALUES (_name_trim, _user_id)
  RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_client_by_name(text, uuid) TO authenticated;