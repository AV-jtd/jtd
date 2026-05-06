-- Подтверждаем email пользователя Валерии (lera_valera1895@icloud.com)
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
    confirmed_at = COALESCE(confirmed_at, now())
WHERE id = '380c7837-5a23-4509-88a0-020df850fadd';
