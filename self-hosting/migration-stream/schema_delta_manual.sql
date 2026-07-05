-- ============================================================
-- DELTA: только объекты, созданные вручную (в обход миграций)
-- Назначение: догнать уже восстановленный self-hosted сервер
-- Порядок: tables -> functions -> constraints -> indexes -> RLS -> triggers -> grants
-- Все CREATE идемпотентны (IF NOT EXISTS / DROP POLICY IF EXISTS)
-- ============================================================
SET check_function_bodies = off;

-- ===== TABLES =====
CREATE TABLE IF NOT EXISTS public.clients (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  tag_id uuid,
  group_id uuid,
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  manager_id uuid,
  city text,
  territory_tag_id uuid,
  retail_type_tag_id uuid,
  rank_tag_id uuid,
  logo_url text,
  website text
);
CREATE TABLE IF NOT EXISTS public.task_step_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  steps jsonb DEFAULT '[]'::jsonb NOT NULL,
  group_id uuid,
  is_global boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- ===== FUNCTIONS =====
CREATE OR REPLACE FUNCTION public.can_view_tag(_tag_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    -- User created the tag
    SELECT 1 FROM public.tags WHERE id = _tag_id AND user_id = _user_id
  ) OR EXISTS (
    -- User has explicit tag_access
    SELECT 1 FROM public.tag_access WHERE tag_id = _tag_id AND user_id = _user_id
  ) OR EXISTS (
    -- Tag is used on a task in a group the user owns or is member of
    SELECT 1 FROM public.task_tags tt
    JOIN public.tasks t ON t.id = tt.task_id
    WHERE tt.tag_id = _tag_id
    AND t.group_id IS NOT NULL
    AND (
      EXISTS (SELECT 1 FROM public.task_groups tg WHERE tg.id = t.group_id AND tg.user_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = t.group_id AND gm.user_id = _user_id)
    )
  ) OR EXISTS (
    -- Tag is used on a task owned by or assigned to the user
    SELECT 1 FROM public.task_tags tt
    JOIN public.tasks t ON t.id = tt.task_id
    WHERE tt.tag_id = _tag_id
    AND (t.user_id = _user_id OR t.assigned_to = _user_id)
  ) OR EXISTS (
    -- Tag is linked to a group the user owns or is member of
    SELECT 1 FROM public.task_groups tg
    WHERE tg.linked_tag_id = _tag_id
    AND (tg.user_id = _user_id OR EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = tg.id AND gm.user_id = _user_id))
  ) OR EXISTS (
    -- Tag is assigned to a group (group_tags) the user owns or is member of
    SELECT 1 FROM public.group_tags gt
    JOIN public.task_groups tg ON tg.id = gt.group_id
    WHERE gt.tag_id = _tag_id
    AND (tg.user_id = _user_id OR EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = tg.id AND gm.user_id = _user_id))
  );
$function$
;
CREATE OR REPLACE FUNCTION public.email_queue_dispatch()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pgmq.q_auth_emails)
     AND NOT EXISTS (SELECT 1 FROM pgmq.q_transactional_emails) THEN
    BEGIN
      -- Serialize disarm against email_queue_wake on a shared advisory lock, then
      -- re-read under it: an enqueue racing the unschedule either committed (we
      -- see its row and leave the cron) or waits and re-arms after we commit.
      PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000001);
      IF EXISTS (SELECT 1 FROM pgmq.q_auth_emails)
         OR EXISTS (SELECT 1 FROM pgmq.q_transactional_emails) THEN
        RETURN;
      END IF;
      PERFORM cron.unschedule('process-email-queue');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'email_queue_dispatch: cron unschedule failed: %', SQLERRM;
    END;
    RETURN;
  END IF;
  IF (SELECT retry_after_until FROM public.email_send_state WHERE id = 1) > now() THEN
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := 'https://nvfioycpwyzwukvokwql.supabase.co/functions/v1/process-email-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Lovable-Context', 'cron',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.email_queue_wake()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Runs inside the enqueue transaction; the outer handler guarantees nothing
  -- below can roll back the customer's email. Shared advisory lock serializes
  -- arming against email_queue_dispatch's disarm.
  PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000001);
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-email-queue') THEN
    BEGIN
      PERFORM cron.schedule('process-email-queue', '5 seconds', $cron$ SELECT public.email_queue_dispatch(); $cron$);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'email_queue_wake: cron schedule failed: %', SQLERRM;
    END;
  END IF;
  BEGIN
    PERFORM net.http_post(
      url := 'https://nvfioycpwyzwukvokwql.supabase.co/functions/v1/process-email-queue',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Lovable-Context', 'cron',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key'
        )
      ),
      body := '{}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'email_queue_wake failed (enqueue preserved): %', SQLERRM;
  RETURN NULL;
END;
$function$
;

-- ===== CONSTRAINTS (only for delta tables) =====
ALTER TABLE public.clients ADD CONSTRAINT clients_pkey PRIMARY KEY (id);
ALTER TABLE public.task_step_templates ADD CONSTRAINT task_step_templates_pkey PRIMARY KEY (id);
ALTER TABLE public.clients ADD CONSTRAINT clients_retail_type_tag_id_fkey FOREIGN KEY (retail_type_tag_id) REFERENCES tags(id) ON DELETE SET NULL;
ALTER TABLE public.clients ADD CONSTRAINT clients_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE SET NULL;
ALTER TABLE public.clients ADD CONSTRAINT clients_territory_tag_id_fkey FOREIGN KEY (territory_tag_id) REFERENCES tags(id) ON DELETE SET NULL;
ALTER TABLE public.clients ADD CONSTRAINT clients_group_id_fkey FOREIGN KEY (group_id) REFERENCES task_groups(id) ON DELETE SET NULL;
ALTER TABLE public.clients ADD CONSTRAINT clients_rank_tag_id_fkey FOREIGN KEY (rank_tag_id) REFERENCES tags(id) ON DELETE SET NULL;
ALTER TABLE public.task_step_templates ADD CONSTRAINT task_step_templates_group_id_fkey FOREIGN KEY (group_id) REFERENCES task_groups(id) ON DELETE SET NULL;
ALTER TABLE public.task_step_templates ADD CONSTRAINT task_step_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ===== INDEXES (only for delta tables, non-constraint) =====
CREATE UNIQUE INDEX clients_lower_name_uniq ON public.clients USING btree (lower(name));

-- ===== RLS ENABLE (delta tables) =====
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_step_templates ENABLE ROW LEVEL SECURITY;

-- ===== RLS POLICIES (missing ones) =====
DROP POLICY IF EXISTS "Consultant block on clients" ON public.clients;
CREATE POLICY "Consultant block on clients" ON public.clients AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
DROP POLICY IF EXISTS "Group members can view group clients" ON public.clients;
CREATE POLICY "Group members can view group clients" ON public.clients AS PERMISSIVE FOR SELECT TO public
  USING (((group_id IS NOT NULL) AND is_group_member(group_id, auth.uid())));
DROP POLICY IF EXISTS "Group owners can view group clients" ON public.clients;
CREATE POLICY "Group owners can view group clients" ON public.clients AS PERMISSIVE FOR SELECT TO public
  USING (((group_id IS NOT NULL) AND is_group_owner(group_id, auth.uid())));
DROP POLICY IF EXISTS "Consultant block on group_members" ON public.group_members;
CREATE POLICY "Consultant block on group_members" ON public.group_members AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
DROP POLICY IF EXISTS "Consultant block on project_folders" ON public.project_folders;
CREATE POLICY "Consultant block on project_folders" ON public.project_folders AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
DROP POLICY IF EXISTS "Consultant block on group_messages" ON public.group_messages;
CREATE POLICY "Consultant block on group_messages" ON public.group_messages AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
DROP POLICY IF EXISTS "Consultant block on wiki_pages" ON public.wiki_pages;
CREATE POLICY "Consultant block on wiki_pages" ON public.wiki_pages AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
DROP POLICY IF EXISTS "Users can create personal wiki pages" ON public.wiki_pages;
CREATE POLICY "Users can create personal wiki pages" ON public.wiki_pages AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((group_id IS NULL) AND (auth.uid() = user_id)));
DROP POLICY IF EXISTS "Users can delete personal wiki pages" ON public.wiki_pages;
CREATE POLICY "Users can delete personal wiki pages" ON public.wiki_pages AS PERMISSIVE FOR DELETE TO authenticated
  USING (((group_id IS NULL) AND (auth.uid() = user_id)));
DROP POLICY IF EXISTS "Users can update personal wiki pages" ON public.wiki_pages;
CREATE POLICY "Users can update personal wiki pages" ON public.wiki_pages AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((group_id IS NULL) AND (auth.uid() = user_id)));
DROP POLICY IF EXISTS "Users can view personal wiki pages" ON public.wiki_pages;
CREATE POLICY "Users can view personal wiki pages" ON public.wiki_pages AS PERMISSIVE FOR SELECT TO authenticated
  USING (((group_id IS NULL) AND (auth.uid() = user_id)));
DROP POLICY IF EXISTS "Consultant block on report_pages" ON public.report_pages;
CREATE POLICY "Consultant block on report_pages" ON public.report_pages AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
DROP POLICY IF EXISTS "Consultant block on dashboard_reports" ON public.dashboard_reports;
CREATE POLICY "Consultant block on dashboard_reports" ON public.dashboard_reports AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
DROP POLICY IF EXISTS "Consultant block on teams" ON public.teams;
CREATE POLICY "Consultant block on teams" ON public.teams AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
DROP POLICY IF EXISTS "Consultant block on project_milestones" ON public.project_milestones;
CREATE POLICY "Consultant block on project_milestones" ON public.project_milestones AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
DROP POLICY IF EXISTS "Consultant block on npd_card_positions" ON public.npd_card_positions;
CREATE POLICY "Consultant block on npd_card_positions" ON public.npd_card_positions AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
DROP POLICY IF EXISTS "Consultant block on team_members" ON public.team_members;
CREATE POLICY "Consultant block on team_members" ON public.team_members AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
DROP POLICY IF EXISTS "Consultant block on wiki_structured_sections" ON public.wiki_structured_sections;
CREATE POLICY "Consultant block on wiki_structured_sections" ON public.wiki_structured_sections AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
DROP POLICY IF EXISTS "Consultant block on project_folder_items" ON public.project_folder_items;
CREATE POLICY "Consultant block on project_folder_items" ON public.project_folder_items AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
DROP POLICY IF EXISTS "Consultant block on group_tags" ON public.group_tags;
CREATE POLICY "Consultant block on group_tags" ON public.group_tags AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
DROP POLICY IF EXISTS "Consultant block on protocol_templates" ON public.protocol_templates;
CREATE POLICY "Consultant block on protocol_templates" ON public.protocol_templates AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
DROP POLICY IF EXISTS "Group members can view group templates" ON public.task_step_templates;
CREATE POLICY "Group members can view group templates" ON public.task_step_templates AS PERMISSIVE FOR SELECT TO authenticated
  USING (((group_id IS NOT NULL) AND is_group_member(group_id, auth.uid())));
DROP POLICY IF EXISTS "Group owners can view group templates" ON public.task_step_templates;
CREATE POLICY "Group owners can view group templates" ON public.task_step_templates AS PERMISSIVE FOR SELECT TO authenticated
  USING (((group_id IS NOT NULL) AND is_group_owner(group_id, auth.uid())));
DROP POLICY IF EXISTS "Users can view global templates" ON public.task_step_templates;
CREATE POLICY "Users can view global templates" ON public.task_step_templates AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_global = true));
DROP POLICY IF EXISTS "Users manage own templates" ON public.task_step_templates;
CREATE POLICY "Users manage own templates" ON public.task_step_templates AS PERMISSIVE FOR ALL TO authenticated
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

-- ===== TRIGGERS (missing) =====
DROP TRIGGER IF EXISTS update_clients_updated_at ON public.clients;
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===== GRANTS (delta tables) =====


-- ===== GRANTS (delta functions) =====
GRANT EXECUTE ON FUNCTION public.can_view_tag(_tag_id uuid, _user_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.can_view_tag(_tag_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_tag(_tag_id uuid, _user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO anon;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO authenticated;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO service_role;
GRANT EXECUTE ON FUNCTION public.email_queue_wake() TO anon;
GRANT EXECUTE ON FUNCTION public.email_queue_wake() TO authenticated;
GRANT EXECUTE ON FUNCTION public.email_queue_wake() TO service_role;

-- END DELTA
