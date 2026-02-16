
-- Add description to task_groups
ALTER TABLE public.task_groups ADD COLUMN IF NOT EXISTS description text;

-- Add role to group_members
ALTER TABLE public.group_members ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'participant';

-- Add check constraint for role values
ALTER TABLE public.group_members ADD CONSTRAINT group_members_role_check CHECK (role IN ('assignee', 'participant'));
