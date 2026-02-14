
-- Add telegram_username to profiles
ALTER TABLE public.profiles ADD COLUMN telegram_username text;

-- Add unique index for telegram lookup
CREATE UNIQUE INDEX idx_profiles_telegram_username ON public.profiles (telegram_username) WHERE telegram_username IS NOT NULL;
