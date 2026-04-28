UPDATE public.admin_mode_state
SET admin_disabled = false,
    updated_at = now()
WHERE user_id = '5770bc5b-95cc-4166-9e1c-2edeceefd31b';