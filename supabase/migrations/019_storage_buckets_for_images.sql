-- ============================================
-- Migration 019: Create the image-sharing Storage buckets + RLS
-- ============================================
--
-- BUG: the app uploads user photos to two Supabase Storage buckets —
--   'forum-images'   (forum posts, src/app/forum/new/page.tsx)
--   'finding-images' (map findings, src/components/map/AddFindingSheet.tsx)
-- but neither bucket was ever created (no migration did it, and they are absent
-- in the project). Every photo upload therefore fails with "Bucket not found",
-- so sharing photos is silently broken. Uploads go to a `${user_id}/...` path
-- and the app reads them back via getPublicUrl(), so the buckets must be public.
--
-- This creates both buckets (public, image-only, 10 MB cap) and the storage.objects
-- policies so an authenticated user can upload into their own folder while anyone
-- can view. Idempotent: ON CONFLICT on the buckets, DROP POLICY IF EXISTS first.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('forum-images',   'forum-images',   true, 10485760, ARRAY['image/jpeg','image/png','image/webp']),
  ('finding-images', 'finding-images', true, 10485760, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Anyone may read (these are public, shareable photos; getPublicUrl serves them).
DROP POLICY IF EXISTS "Public read mycelet images" ON storage.objects;
CREATE POLICY "Public read mycelet images" ON storage.objects
  FOR SELECT
  USING (bucket_id IN ('forum-images', 'finding-images'));

-- Authenticated users may upload, but only into a folder named after their own
-- user id — the app uploads to `${user.id}/<file>`. (storage.foldername(name))[1]
-- is that first path segment.
DROP POLICY IF EXISTS "Authenticated upload own mycelet images" ON storage.objects;
CREATE POLICY "Authenticated upload own mycelet images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('forum-images', 'finding-images')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Owners may replace / delete their own uploads.
DROP POLICY IF EXISTS "Owners update own mycelet images" ON storage.objects;
CREATE POLICY "Owners update own mycelet images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id IN ('forum-images', 'finding-images') AND owner = auth.uid())
  WITH CHECK (bucket_id IN ('forum-images', 'finding-images') AND owner = auth.uid());

DROP POLICY IF EXISTS "Owners delete own mycelet images" ON storage.objects;
CREATE POLICY "Owners delete own mycelet images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id IN ('forum-images', 'finding-images') AND owner = auth.uid());
