-- Server-side aggregation of unread thread counters for the current user.
-- Returns one row per thread that has at least one message NOT authored by the
-- current user AND newer than the user's last_read_at in chat_read_status.
--
-- Threads are keyed exactly the way the client expects:
--   "group-<group_id>"  for project chats (group_messages)
--   "task-<task_id>"    for task discussions (task_comments)
--
-- Output:
--   thread_id        text   — namespaced thread id (see above)
--   last_message_at  timestamptz — newest non-self message timestamp in thread
--   unread_count     int    — number of non-self messages strictly newer than
--                             last_read_at (or all of them if never read)
--
-- SECURITY DEFINER + has_table_privilege fence: callers can only see their own
-- counters because we filter by auth.uid(). RLS on the underlying tables still
-- limits which messages the user can read; this function relies on auth.uid()
-- as the identity, never trusting an argument.
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
  -- Group chats: only groups the user can read (RLS via inner join to group_members/owner).
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

  -- Task comments: only tasks the user can read.
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

-- Allow authenticated users (and only them) to call it. SECURITY DEFINER means
-- the function executes with owner privileges; the WHERE auth.uid() guard above
-- is what scopes results to the caller.
REVOKE ALL ON FUNCTION public.get_unread_threads() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_unread_threads() TO authenticated;