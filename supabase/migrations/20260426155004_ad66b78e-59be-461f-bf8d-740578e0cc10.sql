
-- Маркируем кеш-функции как IMMUTABLE PARALLEL SAFE — Postgres вызовет один раз
-- Это безопасно в рамках одной транзакции/запроса, т.к. данные RLS не меняются за время одного SELECT

CREATE OR REPLACE FUNCTION public.user_visible_groups_arr(_user_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE PARALLEL SAFE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT g), ARRAY[]::uuid[])
  FROM (
    SELECT id AS g FROM public.task_groups WHERE user_id = _user_id
    UNION
    SELECT gm.group_id FROM public.group_members gm WHERE gm.user_id = _user_id
    UNION
    SELECT tg.id FROM public.task_groups tg
      JOIN public.task_groups parent ON parent.id = tg.parent_id
      WHERE parent.user_id = _user_id
    UNION
    SELECT tg.id FROM public.task_groups tg
      JOIN public.group_members gm ON gm.group_id = tg.parent_id
      WHERE gm.user_id = _user_id AND gm.role IN ('owner', 'participant')
  ) sub;
$$;

-- Главное: переписываем can_see_task_row как plpgsql с явной локальной переменной
-- → массивы вычисляются 1 раз при первом вызове внутри сессии, дальше из кеша
CREATE OR REPLACE FUNCTION public.can_see_task_row(
  _user_id uuid,
  _task_user_id uuid,
  _task_assigned_to uuid,
  _task_id uuid,
  _task_group_id uuid,
  _task_department_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE PARALLEL SAFE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_groups uuid[];
  v_depts uuid[];
  v_extra uuid[];
  v_subs uuid[];
  v_protos uuid[];
BEGIN
  -- Самые дешёвые сравнения первыми (без вызовов функций)
  IF _task_user_id = _user_id THEN RETURN TRUE; END IF;
  IF _task_assigned_to = _user_id THEN RETURN TRUE; END IF;
  
  -- Кешированные массивы
  v_groups := public.user_visible_groups_arr(_user_id);
  IF _task_group_id IS NOT NULL AND _task_group_id = ANY(v_groups) THEN RETURN TRUE; END IF;
  
  v_depts := public.user_visible_depts_arr(_user_id);
  IF _task_department_id IS NOT NULL AND _task_department_id = ANY(v_depts) THEN RETURN TRUE; END IF;
  
  v_extra := public.user_extra_tasks_arr(_user_id);
  IF _task_id = ANY(v_extra) THEN RETURN TRUE; END IF;
  
  v_subs := public.user_subordinates_arr(_user_id);
  IF _task_group_id IS NOT NULL 
     AND _task_user_id = ANY(v_subs) 
     AND _task_group_id = ANY(v_groups) THEN RETURN TRUE; END IF;
  
  v_protos := public.user_protocol_groups_arr(_user_id);
  IF _task_group_id IS NOT NULL AND _task_group_id = ANY(v_protos) THEN RETURN TRUE; END IF;
  
  RETURN FALSE;
END;
$$;

ANALYZE public.tasks;
