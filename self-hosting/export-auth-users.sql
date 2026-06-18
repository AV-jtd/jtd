-- ============================================================================
--  Экспорт пользователей из облачной auth.users в готовые INSERT-statements
-- ============================================================================
--
--  Когда использовать: если нет доступа к pg_dump (вариант из README, Шаг 5),
--  но есть connection string и psql. Скрипт НИЧЕГО не меняет — он только
--  ПЕЧАТАЕТ строки INSERT, которые потом выполняются на self-hosted сервере.
--
--  Переносимые поля: id, email, encrypted_password (старые пароли работают!),
--  created_at, updated_at, email_confirmed_at, raw_user_meta_data,
--  raw_app_meta_data, а также служебные поля, без которых GoTrue ругается.
--
-- ----------------------------------------------------------------------------
--  ШАГ 1. Снять дамп пользователей в файл (запускать НА МАШИНЕ С ДОСТУПОМ К ОБЛАКУ):
--
--    SRC="postgresql://postgres:[DB_PASSWORD]@db.nvfioycpwyzwukvokwql.supabase.co:5432/postgres"
--    psql "$SRC" -t -A -f self-hosting/export-auth-users.sql > auth-users-insert.sql
--
--  Флаги: -t (без заголовков), -A (без выравнивания) — чтобы на выходе был
--  чистый SQL без рамок.
--
-- ----------------------------------------------------------------------------
--  ШАГ 2. Залить пользователей на self-hosted (ПОСЛЕ запуска стека, Шаг 6 README):
--
--    docker compose -f self-hosting/docker-compose.supabase.yml exec -T db \
--      psql -U postgres postgres < auth-users-insert.sql
--
-- ----------------------------------------------------------------------------
--  ШАГ 3. Перенести привязки логинов (Google / email) — БЕЗ НИХ ВХОД НЕ РАБОТАЕТ.
--  В конце этого файла есть второй генератор для auth.identities. Сними его так:
--
--    psql "$SRC" -t -A -c "$(sed -n '/-- >>> IDENTITIES/,/-- <<< IDENTITIES/p' \
--      self-hosting/export-auth-users.sql)" > auth-identities-insert.sql
--
--  И залей после пользователей.
-- ============================================================================

-- Чтобы пользователи всегда выводились в одинаковом порядке
SET client_min_messages TO WARNING;

-- --- Генератор INSERT для auth.users ---------------------------------------
SELECT format(
  $i$INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at,
    recovery_token, recovery_sent_at, email_change_token_new, email_change,
    email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    is_super_admin, created_at, updated_at, phone, phone_confirmed_at,
    confirmation_token, email_change_token_current, email_change_confirm_status,
    banned_until, is_sso_user, deleted_at
  ) OVERRIDING SYSTEM VALUE VALUES (
    %L, %L, %L, %L, %L, %L,
    %L, %L, %L, %L,
    %L, %L, %L, %L,
    %L, %L, %L::jsonb, %L::jsonb,
    %L, %L, %L, %L, %L,
    %L, %L, %L,
    %L, %L, %L
  ) ON CONFLICT (id) DO NOTHING;$i$,
  u.instance_id, u.id, u.aud, u.role, u.email, u.encrypted_password,
  u.email_confirmed_at, u.invited_at, COALESCE(u.confirmation_token, ''), u.confirmation_sent_at,
  COALESCE(u.recovery_token, ''), u.recovery_sent_at, COALESCE(u.email_change_token_new, ''), COALESCE(u.email_change, ''),
  u.email_change_sent_at, u.last_sign_in_at, u.raw_app_meta_data, u.raw_user_meta_data,
  u.is_super_admin, u.created_at, u.updated_at, u.phone, u.phone_confirmed_at,
  COALESCE(u.confirmation_token, ''), COALESCE(u.email_change_token_current, ''), COALESCE(u.email_change_confirm_status, 0),
  u.banned_until, COALESCE(u.is_sso_user, false), u.deleted_at
)
FROM auth.users u
ORDER BY u.created_at;

-- >>> IDENTITIES (отдельный генератор — снимать командой из ШАГ 3) <<<
-- -- >>> IDENTITIES
-- SELECT format(
--   $i$INSERT INTO auth.identities (
--     provider_id, user_id, identity_data, provider,
--     last_sign_in_at, created_at, updated_at, email, id
--   ) VALUES (
--     %L, %L, %L::jsonb, %L, %L, %L, %L, %L, %L
--   ) ON CONFLICT (provider_id, provider) DO NOTHING;$i$,
--   COALESCE(i.provider_id, i.user_id::text), i.user_id, i.identity_data, i.provider,
--   i.last_sign_in_at, i.created_at, i.updated_at, i.email, i.id
-- )
-- FROM auth.identities i
-- ORDER BY i.created_at;
-- -- <<< IDENTITIES

-- ============================================================================
--  Проверка после заливки (на self-hosted):
--    SELECT count(*) FILTER (WHERE encrypted_password IS NOT NULL) AS with_pw,
--           count(*) FILTER (WHERE email_confirmed_at IS NOT NULL) AS confirmed,
--           count(*) AS total
--    FROM auth.users;
--  Числа должны совпасть с облаком.
-- ============================================================================