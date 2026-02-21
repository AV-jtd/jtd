-- Add telegram_chat_id to profiles so we can send messages back to users
ALTER TABLE public.profiles ADD COLUMN telegram_chat_id bigint;
