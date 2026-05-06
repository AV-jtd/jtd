-- Exclude log entries from unread thread aggregation (they aren't real chat messages)
CREATE OR REPLACE FUNCTION public.get_unread_threads()
RETURNS TABLE (
  thread_id text,
  last_message_at timestamptz,
  unread_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (SELECT auth.uid() AS uid)
  SELECT
    'group-' || gm.group_id::text AS thread_id,
    MAX(gm.created_at)            AS last_message_at,
    COUNT(*)::int                 AS unread_count
  FROM public.group_messages gm
  JOIN me ON true
  LEFT JOIN public.chat_read_status crs
    ON crs.user_id = me.uid
   AND crs.thread_id = 'group-' || gm.group_id::text
  WHERE gm.user_id <> me.uid
    AND (crs.last_read_at IS NULL OR gm.created_at > crs.last_read_at)
    AND (
      public.is_group_owner(gm.group_id, me.uid)
      OR public.is_group_member(gm.group_id, me.uid)
      OR public.is_message_in_parent_member_group(gm.group_id, me.uid)
    )
  GROUP BY gm.group_id

  UNION ALL

  SELECT
    'task-' || tc.task_id::text   AS thread_id,
    MAX(tc.created_at)            AS last_message_at,
    COUNT(*)::int                 AS unread_count
  FROM public.task_comments tc
  JOIN me ON true
  LEFT JOIN public.chat_read_status crs
    ON crs.user_id = me.uid
   AND crs.thread_id = 'task-' || tc.task_id::text
  WHERE tc.user_id <> me.uid
    AND COALESCE(tc.kind, 'message') <> 'log'
    AND (crs.last_read_at IS NULL OR tc.created_at > crs.last_read_at)
    AND (
      public.is_task_owner(tc.task_id, me.uid)
      OR public.is_task_participant(tc.task_id, me.uid)
      OR public.is_task_in_user_group(tc.task_id, me.uid)
      OR public.is_task_in_parent_member_group(tc.task_id, me.uid)
      OR public.is_task_in_parent_owner_group(tc.task_id, me.uid)
    )
  GROUP BY tc.task_id;
$$;
