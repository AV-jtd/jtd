-- Remove broad public SELECT (listing) policies. Public buckets serve known
-- object URLs through the public CDN regardless of these policies, so display
-- keeps working; what this removes is the ability to LIST/enumerate every file
-- in the bucket via the storage API. Object paths are namespaced by
-- {user_id}/{task_id}/... (double UUID), so they are not guessable.
DROP POLICY IF EXISTS "Anyone can view task attachments" ON storage.objects;
DROP POLICY IF EXISTS "Protocol logos are publicly readable" ON storage.objects;