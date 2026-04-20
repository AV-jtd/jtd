-- Remove incorrect global unique index on tag_categories.system_key.
-- Each user must be able to have their own system categories (e.g. 'event_topic').
-- The correct per-user uniqueness is already enforced by idx_tag_categories_user_system_key.
DROP INDEX IF EXISTS public.tag_categories_system_key_uniq;