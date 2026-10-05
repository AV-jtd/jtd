-- Непрочитанное: «мне» отдельно от фона проекта (решение владельца 06.10.2026).
--
-- Счётчик 99+ у всех: в нём каждая ветка проекта, где человек просто участник,
-- и чаты давно закрытых задач. Замер 06.10: у сотрудника 72 из 102
-- непрочитанных веток — где он не автор и не исполнитель. Цифра на значке
-- теперь считает только ветки «мне»; остальное приложение показывает точкой.
--
-- «Мне»:
--   • задача, где я автор, исполнитель или участник (task_participants);
--   • в непрочитанных сообщениях ветки меня упомянули — «@Имя Фамилия» или
--     «@ник_в_telegram» (упоминания хранятся текстом);
--   • ответ на моё сообщение (reply_to).
-- Набор веток и счётчики сообщений — прежние; добавлен только for_me.
--
-- Тип результата меняется, поэтому DROP + CREATE (CREATE OR REPLACE тип
-- возврата не меняет); права — те же, что были.

DROP FUNCTION IF EXISTS public.get_unread_threads();

CREATE FUNCTION public.get_unread_threads()
RETURNS TABLE(thread_id text, last_message_at timestamp with time zone, unread_count integer, for_me boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT auth.uid() AS uid,
           nullif(lower(p.display_name), '') AS name,
           nullif(lower(p.telegram_username), '') AS tg
    FROM (SELECT 1) one
    LEFT JOIN public.profiles p ON p.id = auth.uid()
  )
  SELECT
    'group-' || gm.group_id::text AS thread_id,
    MAX(gm.created_at)            AS last_message_at,
    COUNT(*)::int                 AS unread_count,
    coalesce(bool_or(coalesce(
      (me.name IS NOT NULL AND position('@' || me.name IN lower(gm.content)) > 0)
      OR (me.tg IS NOT NULL AND position('@' || me.tg IN lower(gm.content)) > 0)
      OR EXISTS (SELECT 1 FROM public.group_messages p WHERE p.id = gm.reply_to AND p.user_id = me.uid)
    , false)), false)               AS for_me
  FROM public.group_messages gm
  JOIN me ON true
  LEFT JOIN public.chat_read_status crs
    ON crs.user_id = me.uid
   AND crs.thread_id = 'group-' || gm.group_id::text
  WHERE gm.user_id <> me.uid
    AND (crs.last_read_at IS NULL OR gm.created_at > crs.last_read_at)
    AND (
      public.has_role(me.uid, 'admin'::app_role)
      OR public.is_group_owner(gm.group_id, me.uid)
      OR public.is_group_member(gm.group_id, me.uid)
      OR public.is_message_in_parent_member_group(gm.group_id, me.uid)
    )
  GROUP BY gm.group_id

  UNION ALL

  SELECT
    'task-' || tc.task_id::text   AS thread_id,
    MAX(tc.created_at)            AS last_message_at,
    COUNT(*)::int                 AS unread_count,
    coalesce(bool_or(coalesce(
      t.user_id = me.uid
      OR t.assigned_to = me.uid
      OR EXISTS (SELECT 1 FROM public.task_participants tp WHERE tp.task_id = tc.task_id AND tp.user_id = me.uid)
      OR (me.name IS NOT NULL AND position('@' || me.name IN lower(tc.content)) > 0)
      OR (me.tg IS NOT NULL AND position('@' || me.tg IN lower(tc.content)) > 0)
      OR EXISTS (SELECT 1 FROM public.task_comments p WHERE p.id = tc.reply_to AND p.user_id = me.uid)
    , false)), false)               AS for_me
  FROM public.task_comments tc
  JOIN me ON true
  LEFT JOIN public.tasks t ON t.id = tc.task_id
  LEFT JOIN public.chat_read_status crs
    ON crs.user_id = me.uid
   AND crs.thread_id = 'task-' || tc.task_id::text
  WHERE tc.user_id <> me.uid
    AND COALESCE(tc.kind, 'message') <> 'log'
    AND (crs.last_read_at IS NULL OR tc.created_at > crs.last_read_at)
    AND (
      public.has_role(me.uid, 'admin'::app_role)
      OR public.is_task_owner(tc.task_id, me.uid)
      OR public.is_task_participant(tc.task_id, me.uid)
      OR public.is_task_in_user_group(tc.task_id, me.uid)
      OR public.is_task_in_member_group(tc.task_id, me.uid)
      OR public.is_task_in_parent_member_group(tc.task_id, me.uid)
      OR public.is_task_in_parent_owner_group(tc.task_id, me.uid)
    )
  GROUP BY tc.task_id;
$function$;

REVOKE ALL ON FUNCTION public.get_unread_threads() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_unread_threads() TO anon, authenticated, service_role;
