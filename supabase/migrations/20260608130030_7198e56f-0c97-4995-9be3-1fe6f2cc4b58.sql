
-- Ensure the responsible people of a CRM client (manager + record owner) are
-- members of the client's chat room, so the room shows up in their ЭФИР feed
-- and they can read/post messages. Keeps the "only participants" model.
CREATE OR REPLACE FUNCTION public.sync_client_room_members(_group_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
  v_manager uuid;
  v_owner uuid;
BEGIN
  SELECT client_id INTO v_client_id
  FROM task_groups
  WHERE id = _group_id AND project_type = 'crm_client';

  IF v_client_id IS NULL THEN RETURN; END IF;

  SELECT manager_id, user_id INTO v_manager, v_owner
  FROM clients WHERE id = v_client_id;

  IF v_manager IS NOT NULL THEN
    INSERT INTO group_members (group_id, user_id, invited_by, role)
    VALUES (_group_id, v_manager, v_manager, 'participant')
    ON CONFLICT (group_id, user_id) DO NOTHING;
  END IF;

  IF v_owner IS NOT NULL THEN
    INSERT INTO group_members (group_id, user_id, invited_by, role)
    VALUES (_group_id, v_owner, v_owner, 'participant')
    ON CONFLICT (group_id, user_id) DO NOTHING;
  END IF;
END;
$$;

-- Backfill all existing CRM client rooms.
DO $$
DECLARE g record;
BEGIN
  FOR g IN SELECT id FROM task_groups WHERE project_type = 'crm_client' LOOP
    PERFORM public.sync_client_room_members(g.id);
  END LOOP;
END $$;

-- When a CRM client room is created, sync the responsible members.
CREATE OR REPLACE FUNCTION public.trg_sync_client_room_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.project_type = 'crm_client' THEN
    PERFORM public.sync_client_room_members(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_client_room_members_ins ON public.task_groups;
CREATE TRIGGER sync_client_room_members_ins
AFTER INSERT ON public.task_groups
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_client_room_on_insert();

-- When a client's manager/owner changes, add the new responsible to the room.
CREATE OR REPLACE FUNCTION public.trg_sync_client_room_on_client_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_group uuid;
BEGIN
  IF NEW.manager_id IS DISTINCT FROM OLD.manager_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    SELECT id INTO v_group
    FROM task_groups
    WHERE client_id = NEW.id AND project_type = 'crm_client';
    IF v_group IS NOT NULL THEN
      PERFORM public.sync_client_room_members(v_group);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_client_room_members_upd ON public.clients;
CREATE TRIGGER sync_client_room_members_upd
AFTER UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_client_room_on_client_update();
