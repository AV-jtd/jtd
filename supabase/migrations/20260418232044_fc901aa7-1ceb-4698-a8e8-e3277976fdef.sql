-- Public bucket for protocol logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('protocol-logos', 'protocol-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Read: anyone (public bucket)
CREATE POLICY "Protocol logos are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'protocol-logos');

-- Insert/Update/Delete: only owner (path begins with user_id/)
CREATE POLICY "Users upload own protocol logos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'protocol-logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users update own protocol logos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'protocol-logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users delete own protocol logos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'protocol-logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );