-- ============================================================
-- Идемпотентный фикс auth.users/auth.identities для self-hosted GoTrue.
--
-- Прогонять после ЛЮБОЙ перезаливки/восстановления данных, если вход
-- перестал работать. Безопасно гонять多жды — все шаги идемпотентны
-- (WHERE ... IS NULL / NOT EXISTS), НЕ трогает existing корректные строки
-- и НЕ трогает пароли.
--
-- Контекст (2026-07-05/06): при миграции с Lovable Cloud на self-hosted
-- Supabase выяснилось, что напрямую вставленные через SQL (минуя GoTrue
-- API) строки auth.users не проходят валидацию GoTrue по нескольким
-- причинам одновременно:
--   1. instance_id NULL вместо zero-UUID -> GoTrue ищет по
--      instance_id = '00000000-0000-0000-0000-000000000000', не находит
--   2. confirmation_token/recovery_token/... NULL вместо '' -> Go's
--      sql.Scan падает при чтении: "converting NULL to string is unsupported"
--   3. aud/role не 'authenticated' -> FindUserByEmailAndAudience не находит
--   4. auth.identities пустая -> GoTrue admin API не видит пользователя
--      (хотя password grant может работать без неё — не тестировалось)
--
-- Скрипт закрывает все 4 причины разом для ВСЕХ пользователей.
-- ============================================================

BEGIN;

-- 1. instance_id -> zero-UUID
UPDATE auth.users
SET instance_id = '00000000-0000-0000-0000-000000000000'
WHERE instance_id IS NULL;

-- 2. Токен-поля: NULL -> '' (Go sql.Scan не принимает NULL в string)
UPDATE auth.users SET
  confirmation_token          = COALESCE(confirmation_token, ''),
  recovery_token               = COALESCE(recovery_token, ''),
  email_change_token_new       = COALESCE(email_change_token_new, ''),
  email_change                 = COALESCE(email_change, ''),
  email_change_token_current   = COALESCE(email_change_token_current, ''),
  phone_change                 = COALESCE(phone_change, ''),
  phone_change_token           = COALESCE(phone_change_token, ''),
  reauthentication_token       = COALESCE(reauthentication_token, '')
WHERE confirmation_token IS NULL
   OR recovery_token IS NULL
   OR email_change_token_new IS NULL
   OR email_change IS NULL
   OR email_change_token_current IS NULL
   OR phone_change IS NULL
   OR phone_change_token IS NULL
   OR reauthentication_token IS NULL;

-- 3. aud/role -> authenticated (кроме заведомо служебных ролей, если появятся)
UPDATE auth.users
SET aud = 'authenticated'
WHERE aud IS NULL OR aud = '';

UPDATE auth.users
SET role = 'authenticated'
WHERE role IS NULL OR role = '';

-- 4. email_confirmed_at: если пусто, но пользователь не забанен/не удалён —
--    подтверждаем (у нас нет реальной email-верификации на этих
--    исторических пользователях, они уже были подтверждены в Lovable)
UPDATE auth.users
SET email_confirmed_at = now()
WHERE email_confirmed_at IS NULL
  AND banned_until IS NULL
  AND deleted_at IS NULL;

-- 5. auth.identities: досоздать provider='email' для всех, у кого нет
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT
  id::text,
  id,
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
  'email',
  created_at,
  created_at,
  created_at
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM auth.identities WHERE provider = 'email');

COMMIT;

-- ============================================================
-- Отчёт (не изменяет данные, только показывает состояние)
-- ============================================================
SELECT
  (SELECT count(*) FROM auth.users) AS users_total,
  (SELECT count(*) FROM auth.identities WHERE provider='email') AS email_identities_total,
  (SELECT count(*) FROM auth.users WHERE instance_id IS NULL) AS still_null_instance,
  (SELECT count(*) FROM auth.users WHERE confirmation_token IS NULL) AS still_null_conf_token,
  (SELECT count(*) FROM auth.users WHERE aud <> 'authenticated' OR role <> 'authenticated') AS still_wrong_aud_role,
  (SELECT count(*) FROM auth.users u WHERE NOT EXISTS (
     SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider='email'
  )) AS still_missing_identity;
