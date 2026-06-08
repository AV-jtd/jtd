CREATE TABLE public.client_team (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text,
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_team TO authenticated;
GRANT ALL ON public.client_team TO service_role;

ALTER TABLE public.client_team ENABLE ROW LEVEL SECURITY;

-- Команду видят все сотрудники, кроме внешних консультантов.
CREATE POLICY "Non-consultants view client team"
ON public.client_team
FOR SELECT
TO authenticated
USING (NOT is_consultant(auth.uid()));

-- Прямое управление — только админам; обычные пользователи меняют команду
-- через защищённую функцию manage_client_team (SECURITY DEFINER).
CREATE POLICY "Admins manage client team"
ON public.client_team
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE INDEX client_team_client_id_idx ON public.client_team(client_id);

-- Добавление/удаление участника команды клиента + синхронизация доступа к чат-комнате.
CREATE OR REPLACE FUNCTION public.manage_client_team(
  _client_id uuid,
  _member_id uuid,
  _action text,
  _role text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _group_id uuid;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF is_consultant(_caller) THEN
    RAISE EXCEPTION 'Недостаточно прав для управления командой клиента';
  END IF;

  -- Найти или создать чат-комнату клиента.
  SELECT id INTO _group_id
  FROM public.task_groups
  WHERE project_type = 'crm_client' AND client_id = _client_id
  LIMIT 1;

  IF _group_id IS NULL THEN
    INSERT INTO public.task_groups (name, user_id, project_type, client_id, icon, color)
    SELECT COALESCE(c.name, 'Клиент'), _caller, 'crm_client', _client_id, '🏢', '#3b82f6'
    FROM public.clients c WHERE c.id = _client_id
    RETURNING id INTO _group_id;
  END IF;

  IF _action = 'add' THEN
    INSERT INTO public.client_team (client_id, user_id, role, added_by)
    VALUES (_client_id, _member_id, _role, _caller)
    ON CONFLICT (client_id, user_id) DO UPDATE SET role = EXCLUDED.role;

    INSERT INTO public.group_members (group_id, user_id, invited_by, role)
    VALUES (_group_id, _member_id, _caller, 'participant')
    ON CONFLICT (group_id, user_id) DO NOTHING;
  ELSIF _action = 'remove' THEN
    DELETE FROM public.client_team WHERE client_id = _client_id AND user_id = _member_id;
    DELETE FROM public.group_members WHERE group_id = _group_id AND user_id = _member_id;
  ELSE
    RAISE EXCEPTION 'Unknown action: %', _action;
  END IF;

  RETURN _group_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.manage_client_team(uuid, uuid, text, text) TO authenticated;