
-- Add project_type to task_groups
ALTER TABLE public.task_groups ADD COLUMN project_type text NOT NULL DEFAULT 'standard';

-- Create clients table
CREATE TABLE public.clients (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  tag_id uuid REFERENCES public.tags(id) ON DELETE SET NULL,
  group_id uuid REFERENCES public.task_groups(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Policies: owners manage own clients
CREATE POLICY "Users manage own clients"
ON public.clients FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Group members can view clients linked to their groups
CREATE POLICY "Group members can view group clients"
ON public.clients FOR SELECT
USING (group_id IS NOT NULL AND is_group_member(group_id, auth.uid()));

-- Group owners can view clients linked to their groups
CREATE POLICY "Group owners can view group clients"
ON public.clients FOR SELECT
USING (group_id IS NOT NULL AND is_group_owner(group_id, auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_clients_updated_at
BEFORE UPDATE ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
