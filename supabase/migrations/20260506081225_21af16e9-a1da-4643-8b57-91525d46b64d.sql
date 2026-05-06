UPDATE auth.users
SET email_confirmed_at = now()
WHERE id = '380c7837-5a23-4509-88a0-020df850fadd' AND email_confirmed_at IS NULL;