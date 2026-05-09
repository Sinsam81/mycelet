-- ============================================
-- Migration 011: Retention-policy infrastructure
-- ============================================
--
-- Implements the schema changes needed by the locked retention policy
-- (docs/retention-policy.md). Three connected pieces:
--
--   1. account_deletion_warnings table — tracks the 90-day grace period
--      between "user inactive 3 years" and the actual auto-deletion.
--      Cron Edge Function `purge-inactive-accounts` writes/reads this.
--
--   2. findings.user_id — change ON DELETE CASCADE → ON DELETE SET NULL
--      so anonymized negative-observations survive account deletion
--      as training data. /api/me/delete still explicitly deletes the
--      rows that should NOT be anonymized (positive findings, private
--      findings) before letting the FK handle the rest.
--
--   3. forum_posts.user_id and comments.user_id — same SET NULL change
--      so deleted users' threads stay readable. UI must render NULL
--      author as "[slettet bruker]".
--
-- billing_subscriptions FK is intentionally NOT changed in this
-- migration. Bokføringsloven (5 år) is satisfied by Stripe's own
-- retention; copying that responsibility into our DB requires
-- additional schema work (drop UNIQUE, add deleted_at) and isn't
-- on the critical path. See docs/retention-policy.md "Hva som IKKE
-- er i denne policyen" for the expanded plan.

-- ---------------------------------------------------------------
-- 1. account_deletion_warnings
-- ---------------------------------------------------------------
-- One row per user in the warning window. Created by the
-- purge-inactive-accounts cron when last_sign_in_at < NOW() - 3 years.
-- Deleted by either the user (via /api/me/extend-retention) or the
-- cron when scheduled_deletion_at fires.
--
-- The CASCADE FK means that if the user is deleted by any path before
-- the cron fires, the warning row goes too — no dangling pointers.
CREATE TABLE IF NOT EXISTS account_deletion_warnings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  warned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_deletion_at TIMESTAMPTZ NOT NULL,
  warning_email_sent BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_deletion_warnings_scheduled
  ON account_deletion_warnings(scheduled_deletion_at);

ALTER TABLE account_deletion_warnings ENABLE ROW LEVEL SECURITY;

-- The user can read their own warning row (so the UI can show
-- "your account will be deleted on X — click to extend").
DROP POLICY IF EXISTS "Users read own deletion warning" ON account_deletion_warnings;
CREATE POLICY "Users read own deletion warning" ON account_deletion_warnings
  FOR SELECT USING (auth.uid() = user_id);

-- No INSERT/UPDATE policy — only the service role (Edge Functions and
-- /api/me/extend-retention via service role) can write here.
-- DELETE policy: the user can delete their own row (acts as "extend
-- retention" — clears the warning).
DROP POLICY IF EXISTS "Users can clear own deletion warning" ON account_deletion_warnings;
CREATE POLICY "Users can clear own deletion warning" ON account_deletion_warnings
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE account_deletion_warnings IS
  'Tracks 90-day grace period before auto-deletion of inactive accounts (3 years no login). User can extend retention by deleting their own row via /api/me/extend-retention.';

-- ---------------------------------------------------------------
-- 2. findings.user_id — CASCADE → SET NULL
-- ---------------------------------------------------------------
-- Negative public/approximate observations survive as anonymized
-- training data. Positive findings and private findings are deleted
-- explicitly in /api/me/delete BEFORE the user row is removed, so
-- they never reach this trigger.
--
-- The column must allow NULL after this change.
ALTER TABLE findings ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE findings DROP CONSTRAINT IF EXISTS findings_user_id_fkey;
ALTER TABLE findings
  ADD CONSTRAINT findings_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------
-- 3. forum_posts.user_id — CASCADE → SET NULL
-- ---------------------------------------------------------------
ALTER TABLE forum_posts ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE forum_posts DROP CONSTRAINT IF EXISTS forum_posts_user_id_fkey;
ALTER TABLE forum_posts
  ADD CONSTRAINT forum_posts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------
-- 4. comments.user_id — CASCADE → SET NULL
-- ---------------------------------------------------------------
ALTER TABLE comments ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_user_id_fkey;
ALTER TABLE comments
  ADD CONSTRAINT comments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- post_likes, comment_likes, saved_posts, reports keep ON DELETE CASCADE.
-- These are personal interaction signals (your own likes, your own saved
-- list, reports you filed) that have no value once you've left.

-- ---------------------------------------------------------------
-- 5. reports.resolved_at — needed by purge-resolved-reports cron
-- ---------------------------------------------------------------
-- Policy: "Reports filed OM bruker slettes 1 år etter løsning". Without
-- a timestamp for "when did status flip to resolved/dismissed", we'd
-- have to fall back to created_at, which is wrong (a report filed in
-- 2024 and resolved in 2026 should be deleted in 2027, not 2025).
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- Backfill: rows that are already resolved/dismissed but have no
-- timestamp default to created_at (conservative — they may stick
-- around 1 year longer than necessary, but never get deleted early).
UPDATE reports
  SET resolved_at = created_at
  WHERE status IN ('resolved', 'dismissed')
    AND resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_reports_resolved_at
  ON reports(resolved_at)
  WHERE status IN ('resolved', 'dismissed');
