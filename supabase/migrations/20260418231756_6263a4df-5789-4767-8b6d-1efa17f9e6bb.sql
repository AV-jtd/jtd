-- 1. Add protocol meta + logo to task_groups
ALTER TABLE public.task_groups
  ADD COLUMN IF NOT EXISTS protocol_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS logo_url text;

COMMENT ON COLUMN public.task_groups.protocol_meta IS 'Protocol header metadata: {meeting_date, format (online/offline/hybrid), external_attendees[{name, organization, role}]}';
COMMENT ON COLUMN public.task_groups.logo_url IS 'Optional partner/network logo URL — overrides icon for protocols.';

-- 2. Add external_assignee + status_meta to tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS external_assignee jsonb,
  ADD COLUMN IF NOT EXISTS status_meta jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.tasks.external_assignee IS 'External responsible party from protocol header: {name, organization}. Used in addition to or instead of internal assigned_to.';
COMMENT ON COLUMN public.tasks.status_meta IS 'Auxiliary status data, e.g. {sent_at: ISO} for protocol status tags.';

-- 3. Seed protocol_status category + tags for ALL existing users (idempotent)
DO $$
DECLARE
  u_id uuid;
  cat_id uuid;
  status_def record;
  status_defs jsonb := '[
    {"name": "🆕 В работе", "color": "#3b82f6"},
    {"name": "📤 Отправлено", "color": "#8b5cf6"},
    {"name": "⏳ Ждём ответ", "color": "#f59e0b"},
    {"name": "✅ Получен ответ", "color": "#10b981"},
    {"name": "🏁 Завершено", "color": "#6b7280"},
    {"name": "❌ Отменено", "color": "#ef4444"}
  ]'::jsonb;
BEGIN
  FOR u_id IN SELECT id FROM auth.users LOOP
    -- Find or create category
    SELECT id INTO cat_id FROM public.tag_categories
      WHERE user_id = u_id AND system_key = 'protocol_status' LIMIT 1;

    IF cat_id IS NULL THEN
      INSERT INTO public.tag_categories (user_id, name, is_system, system_key, icon, color, position)
      VALUES (u_id, 'Статус протокола', true, 'protocol_status', '📋', '#8b5cf6', 100)
      RETURNING id INTO cat_id;
    END IF;

    -- Seed tags
    FOR status_def IN SELECT * FROM jsonb_array_elements(status_defs) LOOP
      INSERT INTO public.tags (user_id, name, color, category_id)
      SELECT u_id, status_def.value->>'name', status_def.value->>'color', cat_id
      WHERE NOT EXISTS (
        SELECT 1 FROM public.tags
        WHERE user_id = u_id AND category_id = cat_id AND name = status_def.value->>'name'
      );
    END LOOP;
  END LOOP;
END $$;

-- 4. Update onboarding trigger to seed protocol_status category for new users
CREATE OR REPLACE FUNCTION public.seed_protocol_status_for_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cat_id uuid;
  status_def record;
  status_defs jsonb := '[
    {"name": "🆕 В работе", "color": "#3b82f6"},
    {"name": "📤 Отправлено", "color": "#8b5cf6"},
    {"name": "⏳ Ждём ответ", "color": "#f59e0b"},
    {"name": "✅ Получен ответ", "color": "#10b981"},
    {"name": "🏁 Завершено", "color": "#6b7280"},
    {"name": "❌ Отменено", "color": "#ef4444"}
  ]'::jsonb;
BEGIN
  SELECT id INTO cat_id FROM public.tag_categories
    WHERE user_id = _user_id AND system_key = 'protocol_status' LIMIT 1;

  IF cat_id IS NULL THEN
    INSERT INTO public.tag_categories (user_id, name, is_system, system_key, icon, color, position)
    VALUES (_user_id, 'Статус протокола', true, 'protocol_status', '📋', '#8b5cf6', 100)
    RETURNING id INTO cat_id;
  END IF;

  FOR status_def IN SELECT * FROM jsonb_array_elements(status_defs) LOOP
    INSERT INTO public.tags (user_id, name, color, category_id)
    SELECT _user_id, status_def.value->>'name', status_def.value->>'color', cat_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.tags
      WHERE user_id = _user_id AND category_id = cat_id AND name = status_def.value->>'name'
    );
  END LOOP;
END $$;

-- 5. Convert existing standalone-published protocols to drafts (only if no tasks were ever published — i.e., still safe)
-- Conservative: only update protocols created in last 30 days that have no completed tasks
UPDATE public.task_groups
SET draft_status = 'draft'
WHERE project_type = 'protocol'
  AND draft_status = 'published'
  AND created_at > now() - interval '30 days'
  AND NOT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.group_id = task_groups.id AND t.is_completed = true
  );