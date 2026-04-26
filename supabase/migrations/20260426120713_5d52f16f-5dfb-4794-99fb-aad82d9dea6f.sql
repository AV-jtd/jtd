-- 1. Колонки soft-delete на profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

CREATE INDEX IF NOT EXISTS profiles_deleted_at_idx
  ON public.profiles (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- 2. Хелпер: пользователь активен (не помечен удалённым)
CREATE OR REPLACE FUNCTION public.is_user_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND deleted_at IS NULL
  )
$$;

-- 3. SOFT-delete: пометить пользователя удалённым
CREATE OR REPLACE FUNCTION public.admin_soft_delete_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can delete users';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot delete your own account';
  END IF;

  IF public.has_role(target_user_id, 'admin') THEN
    RAISE EXCEPTION 'Cannot delete another administrator';
  END IF;

  -- Идемпотентность: если уже удалён — выходим тихо
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user_id AND deleted_at IS NOT NULL) THEN
    RETURN;
  END IF;

  -- Аудит
  INSERT INTO public.profile_audit_log(profile_id, changed_by, field_name, old_value, new_value, action)
  VALUES (target_user_id, auth.uid(), 'deleted_at', NULL, now()::text, 'soft_delete');

  -- Помечаем + снимаем одобрение, чтобы на вход его не пустило
  UPDATE public.profiles
     SET deleted_at = now(),
         deleted_by = auth.uid(),
         is_approved = false
   WHERE id = target_user_id;
END;
$function$;

-- 4. RESTORE: вернуть пользователя
CREATE OR REPLACE FUNCTION public.admin_restore_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _deleted_by uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can restore users';
  END IF;

  SELECT deleted_by INTO _deleted_by
  FROM public.profiles
  WHERE id = target_user_id AND deleted_at IS NOT NULL;

  IF _deleted_by IS NULL THEN
    -- Либо не удалён, либо нет такого профиля — выходим
    RETURN;
  END IF;

  -- Право на восстановление: тот, кто удалил, ИЛИ real-admin
  -- (real-admin определяется как admin с выключенной симуляцией админ-режима).
  IF _deleted_by <> auth.uid()
     AND COALESCE((SELECT admin_disabled FROM public.admin_mode_state WHERE user_id = auth.uid()), false) = true
  THEN
     RAISE EXCEPTION 'Only the admin who deleted this user, or a real admin, can restore them';
  END IF;

  INSERT INTO public.profile_audit_log(profile_id, changed_by, field_name, old_value, new_value, action)
  VALUES (target_user_id, auth.uid(), 'deleted_at', 'deleted', NULL, 'restore');

  UPDATE public.profiles
     SET deleted_at = NULL,
         deleted_by = NULL,
         is_approved = true
   WHERE id = target_user_id;
END;
$function$;

-- 5. HARD-delete: оставляем старую логику, переименовываем
CREATE OR REPLACE FUNCTION public.admin_hard_delete_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can delete users';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot delete your own account';
  END IF;

  IF public.has_role(target_user_id, 'admin') THEN
    RAISE EXCEPTION 'Cannot delete another administrator';
  END IF;

  INSERT INTO public.profile_audit_log(profile_id, changed_by, field_name, old_value, new_value, action)
  VALUES (target_user_id, auth.uid(), '__deleted__', 'exists', NULL, 'hard_delete');

  DELETE FROM auth.users WHERE id = target_user_id;
END;
$function$;

-- 6. Совместимость: старая admin_delete_user → теперь soft-delete по умолчанию
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  PERFORM public.admin_soft_delete_user(target_user_id);
END;
$function$;