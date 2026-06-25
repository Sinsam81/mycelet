-- 025: Drop the unused profiles.latitude / profiles.longitude columns.
--
-- Pre-launch audit finding (RLS/data-exposure, MEDIUM): the profiles SELECT
-- policy is "synlige for alle" USING (true), and RLS cannot restrict columns, so
-- with the public anon key anyone can ?select=latitude,longitude from profiles.
-- These columns are NEVER written by any code path (registration/callback write
-- only id/username/display_name; the profile page is read-only), so they are
-- always NULL today — but the day any "set your home area" feature populates
-- them, every user's raw home coordinates become world-readable with zero
-- further code change. They are unused, so drop them to remove the trap.
--
-- If home coordinates are wanted later, do NOT re-add raw columns under the open
-- policy: expose a public view of only non-sensitive profile columns, REVOKE
-- table SELECT from anon, and store coordinates coarsened like findings'
-- display_latitude/longitude.

ALTER TABLE profiles DROP COLUMN IF EXISTS latitude;
ALTER TABLE profiles DROP COLUMN IF EXISTS longitude;
