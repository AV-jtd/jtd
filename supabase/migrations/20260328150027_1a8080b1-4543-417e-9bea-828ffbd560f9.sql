-- Add closure_attachments column to tasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS closure_attachments jsonb DEFAULT '[]'::jsonb;

-- Create storage bucket for task closure attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-attachments', 'task-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: authenticated users can upload
CREATE POLICY "Authenticated users can upload task attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'task-attachments');

-- RLS: anyone can view (public bucket)
CREATE POLICY "Anyone can view task attachments"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'task-attachments');

-- RLS: owners can delete their uploads
CREATE POLICY "Users can delete own task attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'task-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);