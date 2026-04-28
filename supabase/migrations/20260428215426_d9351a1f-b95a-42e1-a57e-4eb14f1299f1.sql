REVOKE EXECUTE ON FUNCTION public.get_my_auth_meta() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_auth_meta() TO authenticated;