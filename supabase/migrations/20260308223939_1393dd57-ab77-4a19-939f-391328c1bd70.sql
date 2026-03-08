-- Add manager_id to clients table for CRM manager assignment
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS manager_id uuid;

-- Add city column for manual territory assignment context
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS city text;

-- Add territory_tag_id for direct territory tag linkage
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS territory_tag_id uuid REFERENCES public.tags(id) ON DELETE SET NULL;

-- Add retail_type_tag_id for retail type classification
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS retail_type_tag_id uuid REFERENCES public.tags(id) ON DELETE SET NULL;

-- Add rank_tag_id for client ranking (Top-5, Top-10, etc.)
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS rank_tag_id uuid REFERENCES public.tags(id) ON DELETE SET NULL;