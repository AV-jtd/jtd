-- Таблица для хранения "режима User" для админов
CREATE TABLE IF NOT EXISTS public.admin_mode_state (
  user_id uuid PRIMARY KEY,
  admin_disabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_mode_state ENABLE ROW LEVEL SECURITY;

-- Пользователь может видеть и менять только свой флаг
CREATE POLICY "Users manage own admin mode"
  ON public.admin_mode_state
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Обновляем has_role: для роли 'admin' учитываем флаг отключения
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND (
        _role <> 'admin'
        OR NOT COALESCE(
          (SELECT ams.admin_disabled
             FROM public.admin_mode_state ams
            WHERE ams.user_id = _user_id),
          false
        )
      )
  )
$function$;