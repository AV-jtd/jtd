-- Enable realtime for group_members so added users see projects instantly
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_members;