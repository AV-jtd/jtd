CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tg text;
  v_existing_id uuid;
BEGIN
  v_tg := lower(trim(regexp_replace(coalesce(NEW.raw_user_meta_data->>'telegram_username',''), '^@', '')));
  IF v_tg = '' THEN v_tg := NULL; END IF;

  IF v_tg IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.profiles
    WHERE lower(telegram_username) = v_tg
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      RAISE EXCEPTION 'Пользователь с Telegram @% уже зарегистрирован. Войдите под существующим аккаунтом или используйте «Забыли пароль».', v_tg
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, display_name, telegram_username)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    v_tg
  )
  ON CONFLICT (id) DO NOTHING;

  PERFORM public.seed_onboarding_data(NEW.id);
  PERFORM public.seed_system_tag_categories(NEW.id);
  PERFORM public.seed_protocol_templates(NEW.id);

  RETURN NEW;
END;
$function$;