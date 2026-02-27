
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, display_name, email, telegram_username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NULLIF(TRIM(BOTH FROM LOWER(REPLACE(COALESCE(NEW.raw_user_meta_data->>'telegram_username', ''), '@', ''))), '')
  );
  RETURN NEW;
END;
$function$;
